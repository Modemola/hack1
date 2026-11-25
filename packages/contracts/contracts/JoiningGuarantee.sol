// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {PakkaRegistry} from "./PakkaRegistry.sol";

/// @title JoiningGuarantee
/// @notice A job offer with money behind it.
///
/// A verified company locks a guarantee in stablecoins when it makes an offer. Once the candidate
/// accepts:
///  - If joining slips past the promised date plus a grace period, a stipend streams to the
///    candidate every second out of the guarantee. Postponing does not pause it.
///  - If the company revokes the offer, the candidate gets everything left in the guarantee.
///  - When the candidate joins, any stipend earned so far goes to the candidate and the rest
///    returns to the company.
///  - If the candidate backs out, the guarantee returns to the company along with the candidate's
///    optional pledge.
/// Every outcome is written to PakkaRegistry, so it counts toward the company's Promise Score.
contract JoiningGuarantee is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    enum State { NONE, OFFERED, ACCEPTED, JOINED, REVOKED, CANCELLED, WITHDRAWN }

    struct Guarantee {
        address company;
        address candidate;
        IERC20 token;
        State state;
        uint128 amount; // guarantee locked by the company
        uint128 stipendPerMonth; // paid per 30 days of delay
        uint128 pledge; // refundable commitment required from the candidate
        uint128 paid; // stipend already sent to the candidate
        uint64 joinDate; // promised in the offer; the stipend clock is anchored here
        uint64 currentJoinDate; // latest announced date
        uint64 grace; // delay tolerated before the stipend starts
        uint64 createdAt;
        uint64 stoppedAt; // when the stipend stopped (joined / revoked / withdrawn)
        uint64 joinClaimedAt; // company says the candidate joined at this time
        uint64 timeOffset; // demo deployments only: lets a demo fast-forward time per offer
        bool disputed;
        string role;
    }

    uint64 public constant MONTH = 30 days;
    uint64 public constant DISPUTE_WINDOW = 7 days;
    uint64 public constant MAX_WARP = 400 days;

    PakkaRegistry public immutable registry;
    /// @notice When true, participants can fast-forward an offer's clock. Never enable in production.
    bool public immutable demoMode;

    Guarantee[] private _g;
    mapping(address => uint256[]) private _byCompany;
    mapping(address => uint256[]) private _byCandidate;
    mapping(address => uint32) public renegeCount;

    event Created(uint256 indexed id, address indexed company, address indexed candidate, uint256 amount, uint64 joinDate);
    event Cancelled(uint256 indexed id);
    event Accepted(uint256 indexed id, uint256 pledge);
    event Postponed(uint256 indexed id, uint64 newDate);
    event StipendClaimed(uint256 indexed id, uint256 amount);
    event Revoked(uint256 indexed id, uint256 toCandidate);
    event JoinClaimed(uint256 indexed id, uint64 at);
    event JoinDisputed(uint256 indexed id);
    event Joined(uint256 indexed id, uint64 at, uint256 stipendPaid, uint256 refundedToCompany);
    event Withdrawn(uint256 indexed id);
    event Warped(uint256 indexed id, uint64 seconds_, uint64 newNow);

    error NotVerifiedCompany();
    error NotCompany();
    error NotCandidate();
    error NotParty();
    error WrongState();
    error BadParams();
    error NoDemo();
    error NothingToClaim();
    error DisputeWindowOpen();
    error AlreadyDisputed();
    error NoJoinClaim();

    constructor(PakkaRegistry registry_, bool demoMode_) Ownable(msg.sender) {
        registry = registry_;
        demoMode = demoMode_;
    }

    // ---------------------------------------------------------------- views

    function count() external view returns (uint256) {
        return _g.length;
    }

    function get(uint256 id) external view returns (Guarantee memory) {
        return _g[id];
    }

    function idsOfCompany(address company) external view returns (uint256[] memory) {
        return _byCompany[company];
    }

    function idsOfCandidate(address candidate) external view returns (uint256[] memory) {
        return _byCandidate[candidate];
    }

    function offerId(uint256 id) public view returns (bytes32) {
        return keccak256(abi.encode(block.chainid, address(this), id));
    }

    /// @notice The offer's clock: real time, plus any demo fast-forward.
    function nowOf(uint256 id) public view returns (uint64) {
        return uint64(block.timestamp) + _g[id].timeOffset;
    }

    /// @notice When the stipend starts accruing.
    function stipendStart(uint256 id) public view returns (uint64) {
        Guarantee storage g = _g[id];
        return g.joinDate + g.grace;
    }

    /// @notice Total stipend earned so far (paid or not), capped at the guarantee.
    function earned(uint256 id) public view returns (uint256) {
        Guarantee storage g = _g[id];
        if (g.state == State.NONE || g.state == State.OFFERED || g.state == State.CANCELLED) return 0;
        uint64 end = g.stoppedAt != 0 ? g.stoppedAt : nowOf(id);
        if (g.state == State.ACCEPTED && g.joinClaimedAt != 0 && !g.disputed && g.joinClaimedAt < end) {
            end = g.joinClaimedAt; // the stipend pauses while the company's join claim is pending
        }
        uint64 start = stipendStart(id);
        if (end <= start) return 0;
        uint256 e = (uint256(g.stipendPerMonth) * (end - start)) / MONTH;
        return e > g.amount ? g.amount : e;
    }

    function claimable(uint256 id) public view returns (uint256) {
        Guarantee storage g = _g[id];
        if (g.state != State.ACCEPTED) return 0;
        return earned(id) - g.paid;
    }

    // ---------------------------------------------------------------- company actions

    function create(
        address candidate,
        IERC20 token,
        uint128 amount,
        uint128 stipendPerMonth,
        uint64 joinDate,
        uint64 grace,
        uint128 pledge,
        string calldata role
    ) external nonReentrant returns (uint256 id) {
        if (bytes(registry.companyDomain(msg.sender)).length == 0) revert NotVerifiedCompany();
        if (candidate == address(0) || candidate == msg.sender || amount == 0 || stipendPerMonth == 0) revert BadParams();
        if (stipendPerMonth > amount || joinDate <= block.timestamp || grace > 90 days || bytes(role).length > 80) revert BadParams();

        id = _g.length;
        Guarantee storage g = _g.push();
        g.company = msg.sender;
        g.candidate = candidate;
        g.token = token;
        g.state = State.OFFERED;
        g.amount = amount;
        g.stipendPerMonth = stipendPerMonth;
        g.pledge = pledge;
        g.joinDate = joinDate;
        g.currentJoinDate = joinDate;
        g.grace = grace;
        g.createdAt = uint64(block.timestamp);
        g.role = role;
        _byCompany[msg.sender].push(id);
        _byCandidate[candidate].push(id);

        token.safeTransferFrom(msg.sender, address(this), amount);
        emit Created(id, msg.sender, candidate, amount, joinDate);
    }

    /// @notice Withdraw an offer the candidate hasn't accepted yet. No penalty.
    function cancel(uint256 id) external nonReentrant {
        Guarantee storage g = _g[id];
        if (msg.sender != g.company) revert NotCompany();
        if (g.state != State.OFFERED) revert WrongState();
        g.state = State.CANCELLED;
        g.token.safeTransfer(g.company, g.amount);
        emit Cancelled(id);
    }

    /// @notice Announce a later joining date. The stipend stays anchored to the original date.
    function postpone(uint256 id, uint64 newDate) external {
        Guarantee storage g = _g[id];
        if (msg.sender != g.company) revert NotCompany();
        if (g.state != State.ACCEPTED) revert WrongState();
        if (newDate <= g.currentJoinDate) revert BadParams();
        g.currentJoinDate = newDate;
        registry.reportPostponed(offerId(id), newDate);
        emit Postponed(id, newDate);
    }

    /// @notice Revoke an accepted offer. Everything left in the guarantee goes to the candidate.
    function revoke(uint256 id) external nonReentrant {
        Guarantee storage g = _g[id];
        if (msg.sender != g.company) revert NotCompany();
        if (g.state != State.ACCEPTED) revert WrongState();
        g.state = State.REVOKED;
        g.stoppedAt = nowOf(id);
        uint256 toCandidate = uint256(g.amount) - g.paid + g.pledge;
        g.paid = g.amount;
        registry.reportRevoked(offerId(id));
        g.token.safeTransfer(g.candidate, toCandidate);
        emit Revoked(id, toCandidate);
    }

    /// @notice Company states the candidate has joined. Settles after the dispute window unless the
    /// candidate disputes it.
    function claimJoined(uint256 id) external {
        Guarantee storage g = _g[id];
        if (msg.sender != g.company) revert NotCompany();
        if (g.state != State.ACCEPTED) revert WrongState();
        if (g.disputed) revert AlreadyDisputed();
        g.joinClaimedAt = nowOf(id);
        emit JoinClaimed(id, g.joinClaimedAt);
    }

    /// @notice Settle a company's join claim once the dispute window has passed. Anyone can call.
    function finalizeJoined(uint256 id) external nonReentrant {
        Guarantee storage g = _g[id];
        if (g.state != State.ACCEPTED) revert WrongState();
        if (g.joinClaimedAt == 0 || g.disputed) revert NoJoinClaim();
        if (nowOf(id) < g.joinClaimedAt + DISPUTE_WINDOW) revert DisputeWindowOpen();
        _settleJoined(id, g.joinClaimedAt);
    }

    // ---------------------------------------------------------------- candidate actions

    function accept(uint256 id) external nonReentrant {
        Guarantee storage g = _g[id];
        if (msg.sender != g.candidate) revert NotCandidate();
        if (g.state != State.OFFERED) revert WrongState();
        g.state = State.ACCEPTED;
        string memory domain = registry.companyDomain(g.company);
        registry.recordEscrowOffer(offerId(id), g.candidate, domain, g.joinDate, g.createdAt);
        if (g.pledge > 0) g.token.safeTransferFrom(msg.sender, address(this), g.pledge);
        emit Accepted(id, g.pledge);
    }

    function claimStipend(uint256 id) external nonReentrant {
        Guarantee storage g = _g[id];
        if (msg.sender != g.candidate) revert NotCandidate();
        uint256 amount = claimable(id);
        if (amount == 0) revert NothingToClaim();
        g.paid += uint128(amount);
        g.token.safeTransfer(g.candidate, amount);
        emit StipendClaimed(id, amount);
    }

    /// @notice Candidate confirms they've joined. Settles immediately.
    function confirmJoined(uint256 id) external nonReentrant {
        Guarantee storage g = _g[id];
        if (msg.sender != g.candidate) revert NotCandidate();
        if (g.state != State.ACCEPTED) revert WrongState();
        _settleJoined(id, g.joinClaimedAt != 0 && !g.disputed ? g.joinClaimedAt : nowOf(id));
    }

    /// @notice Candidate says the company's join claim is false. The stipend keeps running until the
    /// owner (Pakka's dispute desk) resolves it.
    function disputeJoined(uint256 id) external {
        Guarantee storage g = _g[id];
        if (msg.sender != g.candidate) revert NotCandidate();
        if (g.state != State.ACCEPTED) revert WrongState();
        if (g.joinClaimedAt == 0) revert NoJoinClaim();
        if (g.disputed) revert AlreadyDisputed();
        if (nowOf(id) >= g.joinClaimedAt + DISPUTE_WINDOW) revert WrongState();
        g.disputed = true;
        emit JoinDisputed(id);
    }

    /// @notice Candidate backs out. The guarantee and the pledge go back to the company.
    function withdraw(uint256 id) external nonReentrant {
        Guarantee storage g = _g[id];
        if (msg.sender != g.candidate) revert NotCandidate();
        if (g.state != State.ACCEPTED) revert WrongState();
        g.state = State.WITHDRAWN;
        g.stoppedAt = nowOf(id);
        uint256 toCompany = uint256(g.amount) - g.paid + g.pledge;
        g.paid = g.amount;
        renegeCount[msg.sender]++;
        g.token.safeTransfer(g.company, toCompany);
        emit Withdrawn(id);
    }

    // ---------------------------------------------------------------- disputes

    function resolveDispute(uint256 id, bool joined) external onlyOwner nonReentrant {
        Guarantee storage g = _g[id];
        if (g.state != State.ACCEPTED || !g.disputed) revert WrongState();
        if (joined) {
            uint64 at = g.joinClaimedAt;
            g.disputed = false;
            _settleJoined(id, at);
        } else {
            g.disputed = false;
            g.joinClaimedAt = 0;
        }
    }

    // ---------------------------------------------------------------- demo

    /// @notice Demo deployments only: fast-forward this offer's clock. Either party may call.
    function demoWarp(uint256 id, uint64 seconds_) external {
        if (!demoMode) revert NoDemo();
        Guarantee storage g = _g[id];
        if (msg.sender != g.company && msg.sender != g.candidate) revert NotParty();
        if (seconds_ == 0 || seconds_ > MAX_WARP) revert BadParams();
        g.timeOffset += seconds_;
        emit Warped(id, seconds_, nowOf(id));
    }

    // ---------------------------------------------------------------- internals

    function _settleJoined(uint256 id, uint64 joinedAt) private {
        Guarantee storage g = _g[id];
        // Stop the stipend at the joining time, then pay out what was earned.
        g.stoppedAt = joinedAt;
        g.state = State.JOINED;
        uint256 total = earned(id);
        // During a dispute the stipend kept running, so the candidate may already hold more than
        // was earned up to the joining time. Paid stipend is never clawed back.
        if (total < g.paid) total = g.paid;
        uint256 toCandidate = total - g.paid + g.pledge;
        uint256 toCompany = uint256(g.amount) - total;
        g.paid = uint128(total);
        registry.reportJoined(offerId(id), joinedAt);
        if (toCandidate > 0) g.token.safeTransfer(g.candidate, toCandidate);
        if (toCompany > 0) g.token.safeTransfer(g.company, toCompany);
        emit Joined(id, joinedAt, total, toCompany);
    }
}
