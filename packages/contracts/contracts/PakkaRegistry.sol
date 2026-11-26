// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title PakkaRegistry
/// @notice Public, append-only record of job offers and what happened to them.
///
/// Every entry is backed by proof:
///  - Candidate-reported entries carry an attestation that the company's own mail server signed
///    the email (DKIM), checked by the Pakka verifier and signed with EIP-712.
///  - Escrowed offers are reported by the JoiningGuarantee contract itself.
///
/// From those entries it keeps a per-company Promise Score that the company cannot edit or delete.
contract PakkaRegistry is EIP712, Ownable {
    using ECDSA for bytes32;

    enum Kind { NONE, OFFER, POSTPONED, REVOKED, JOINED, COMPANY }
    enum Status { NONE, ACTIVE, DELAYED, REVOKED, JOINED_ON_TIME, JOINED_LATE }

    struct Attestation {
        uint8 kind;
        address subject;
        bytes32 emailId;
        bytes32 offerId;
        string domain;
        uint64 date;
        uint64 emailTime;
        uint64 deadline;
    }

    struct Offer {
        address candidate;
        uint64 promisedDate; // join date in the original offer (0 = not stated)
        uint64 currentDate; // latest announced join date (0 = to be confirmed)
        uint64 issuedAt;
        uint8 postponements;
        Status status;
        bool escrowed;
        bool selfReportedDelay;
        string domain;
    }

    struct Stats {
        uint32 offers;
        uint32 delayed;
        uint32 revoked;
        uint32 joinedOnTime;
        uint32 joinedLate;
        uint64 totalDelayDays;
    }

    bytes32 public constant ATTESTATION_TYPEHASH = keccak256(
        "Attestation(uint8 kind,address subject,bytes32 emailId,bytes32 offerId,string domain,uint64 date,uint64 emailTime,uint64 deadline)"
    );

    /// @notice Joining up to this long after the promised date still counts as on time.
    uint64 public constant ON_TIME_GRACE = 7 days;

    address public verifier;
    mapping(address => bool) public isReporter;

    mapping(bytes32 => Offer) private _offers;
    mapping(bytes32 => bool) public emailUsed;
    mapping(bytes32 => Stats) private _stats; // keyed by keccak256(domain)
    mapping(bytes32 => bool) private _domainKnown;
    string[] private _domains;
    mapping(address => bytes32[]) private _offersOf;
    mapping(bytes32 => bytes32[]) private _offersOfDomain;

    mapping(address => string) public companyDomain; // verified company wallet => domain

    event VerifierChanged(address verifier);
    event ReporterSet(address reporter, bool allowed);
    event CompanyVerified(address indexed wallet, string domain);
    event OfferRecorded(bytes32 indexed offerId, address indexed candidate, string domain, uint64 promisedDate, bool escrowed);
    event OfferPostponed(bytes32 indexed offerId, uint64 newDate, bool selfReported);
    event OfferRevoked(bytes32 indexed offerId);
    event OfferJoined(bytes32 indexed offerId, uint64 joinedAt, bool onTime);

    error BadSignature();
    error Expired();
    error EmailAlreadyUsed();
    error NotSubject();
    error UnknownOffer();
    error OfferExists();
    error WrongCompany();
    error OfferClosed();
    error BadKind();
    error TooEarly();
    error NotReporter();
    error EventBeforeOffer();

    constructor(address verifier_) EIP712("Pakka", "1") Ownable(msg.sender) {
        verifier = verifier_;
        emit VerifierChanged(verifier_);
    }

    // ---------------------------------------------------------------- admin

    function setVerifier(address verifier_) external onlyOwner {
        verifier = verifier_;
        emit VerifierChanged(verifier_);
    }

    function setReporter(address reporter, bool allowed) external onlyOwner {
        isReporter[reporter] = allowed;
        emit ReporterSet(reporter, allowed);
    }

    // ---------------------------------------------------------------- attested submissions

    function hashAttestation(Attestation calldata a) public view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    ATTESTATION_TYPEHASH,
                    a.kind,
                    a.subject,
                    a.emailId,
                    a.offerId,
                    keccak256(bytes(a.domain)),
                    a.date,
                    a.emailTime,
                    a.deadline
                )
            )
        );
    }

    /// @notice Record a verified email. The caller must be the attestation's subject:
    /// the candidate for offer events, the company wallet for COMPANY.
    function submit(Attestation calldata a, bytes calldata signature) external {
        if (block.timestamp > a.deadline) revert Expired();
        if (hashAttestation(a).recover(signature) != verifier) revert BadSignature();
        if (msg.sender != a.subject) revert NotSubject();
        if (emailUsed[a.emailId]) revert EmailAlreadyUsed();
        emailUsed[a.emailId] = true;

        Kind kind = Kind(a.kind);
        if (kind == Kind.COMPANY) {
            companyDomain[a.subject] = a.domain;
            emit CompanyVerified(a.subject, a.domain);
        } else if (kind == Kind.OFFER) {
            if (a.offerId != a.emailId) revert BadKind();
            _recordOffer(a.offerId, a.subject, a.domain, a.date, a.emailTime, false);
        } else if (kind == Kind.POSTPONED || kind == Kind.REVOKED || kind == Kind.JOINED) {
            Offer storage o = _offers[a.offerId];
            if (o.candidate == address(0)) revert UnknownOffer();
            if (o.candidate != msg.sender) revert NotSubject();
            if (keccak256(bytes(o.domain)) != keccak256(bytes(a.domain))) revert WrongCompany();
            if (a.emailTime < o.issuedAt) revert EventBeforeOffer();
            if (kind == Kind.POSTPONED) _postpone(a.offerId, a.date, false);
            else if (kind == Kind.REVOKED) _revoke(a.offerId);
            else _join(a.offerId, a.emailTime);
        } else {
            revert BadKind();
        }
    }

    /// @notice Companies often go silent instead of sending a postponement email. Once the promised
    /// date plus grace has passed with no joining recorded, the candidate can mark the offer delayed.
    function reportSilentDelay(bytes32 offerId) external {
        Offer storage o = _offers[offerId];
        if (o.candidate == address(0)) revert UnknownOffer();
        if (o.candidate != msg.sender) revert NotSubject();
        if (o.escrowed) revert BadKind(); // escrowed offers are tracked by the escrow contract
        if (o.status != Status.ACTIVE) revert OfferClosed();
        if (o.promisedDate == 0 || block.timestamp <= o.promisedDate + ON_TIME_GRACE) revert TooEarly();
        _postpone(offerId, 0, true);
    }

    // ---------------------------------------------------------------- escrow reporters

    modifier onlyReporter() {
        if (!isReporter[msg.sender]) revert NotReporter();
        _;
    }

    function recordEscrowOffer(bytes32 offerId, address candidate, string calldata domain, uint64 promisedDate, uint64 issuedAt)
        external
        onlyReporter
    {
        _recordOffer(offerId, candidate, domain, promisedDate, issuedAt, true);
    }

    function reportPostponed(bytes32 offerId, uint64 newDate) external onlyReporter {
        _requireEscrowed(offerId);
        _postpone(offerId, newDate, false);
    }

    function reportRevoked(bytes32 offerId) external onlyReporter {
        _requireEscrowed(offerId);
        _revoke(offerId);
    }

    function reportJoined(bytes32 offerId, uint64 joinedAt) external onlyReporter {
        _requireEscrowed(offerId);
        _join(offerId, joinedAt);
    }

    // ---------------------------------------------------------------- views

    function getOffer(bytes32 offerId) external view returns (Offer memory) {
        return _offers[offerId];
    }

    function offersOf(address candidate) external view returns (bytes32[] memory) {
        return _offersOf[candidate];
    }

    function offersOfDomain(string calldata domain) external view returns (bytes32[] memory) {
        return _offersOfDomain[keccak256(bytes(domain))];
    }

    function statsOf(string calldata domain) external view returns (Stats memory) {
        return _stats[keccak256(bytes(domain))];
    }

    function domainCount() external view returns (uint256) {
        return _domains.length;
    }

    function domainAt(uint256 i) external view returns (string memory) {
        return _domains[i];
    }

    function allDomains() external view returns (string[] memory) {
        return _domains;
    }

    /// @notice Promise Score, 0-100. Each judged offer earns: joined on time = 1, joined late or
    /// currently delayed = 0.5, revoked = 0. Offers still before their join date aren't judged yet.
    /// @return score The score, or 0 when `judged` is 0.
    /// @return judged How many offers the score is based on.
    function promiseScore(string calldata domain) public view returns (uint256 score, uint256 judged) {
        Stats memory s = _stats[keccak256(bytes(domain))];
        judged = uint256(s.delayed) + s.revoked + s.joinedOnTime + s.joinedLate;
        if (judged == 0) return (0, 0);
        uint256 halfPoints = 2 * uint256(s.joinedOnTime) + s.joinedLate + s.delayed;
        score = (halfPoints * 50 + judged / 2) / judged;
    }

    // ---------------------------------------------------------------- internals

    function _requireEscrowed(bytes32 offerId) private view {
        if (!_offers[offerId].escrowed) revert UnknownOffer();
    }

    function _statsFor(string memory domain) private returns (Stats storage) {
        bytes32 key = keccak256(bytes(domain));
        if (!_domainKnown[key]) {
            _domainKnown[key] = true;
            _domains.push(domain);
        }
        return _stats[key];
    }

    function _recordOffer(bytes32 offerId, address candidate, string memory domain, uint64 promisedDate, uint64 issuedAt, bool escrowed)
        private
    {
        if (_offers[offerId].candidate != address(0)) revert OfferExists();
        _offers[offerId] = Offer({
            candidate: candidate,
            promisedDate: promisedDate,
            currentDate: promisedDate,
            issuedAt: issuedAt,
            postponements: 0,
            status: Status.ACTIVE,
            escrowed: escrowed,
            selfReportedDelay: false,
            domain: domain
        });
        _offersOf[candidate].push(offerId);
        _offersOfDomain[keccak256(bytes(domain))].push(offerId);
        _statsFor(domain).offers++;
        emit OfferRecorded(offerId, candidate, domain, promisedDate, escrowed);
    }

    function _postpone(bytes32 offerId, uint64 newDate, bool selfReported) private {
        Offer storage o = _offers[offerId];
        if (o.status != Status.ACTIVE && o.status != Status.DELAYED) revert OfferClosed();
        if (o.status == Status.ACTIVE) {
            o.status = Status.DELAYED;
            _statsFor(o.domain).delayed++;
        }
        if (o.postponements < type(uint8).max) o.postponements++;
        if (selfReported) o.selfReportedDelay = true;
        o.currentDate = newDate; // 0 = "to be confirmed"
        emit OfferPostponed(offerId, newDate, selfReported);
    }

    function _revoke(bytes32 offerId) private {
        Offer storage o = _offers[offerId];
        Stats storage s = _statsFor(o.domain);
        if (o.status == Status.DELAYED) s.delayed--;
        else if (o.status != Status.ACTIVE) revert OfferClosed();
        o.status = Status.REVOKED;
        s.revoked++;
        emit OfferRevoked(offerId);
    }

    function _join(bytes32 offerId, uint64 joinedAt) private {
        Offer storage o = _offers[offerId];
        Stats storage s = _statsFor(o.domain);
        bool wasDelayed = o.status == Status.DELAYED;
        if (wasDelayed) s.delayed--;
        else if (o.status != Status.ACTIVE) revert OfferClosed();

        bool late = wasDelayed || (o.promisedDate != 0 && joinedAt > o.promisedDate + ON_TIME_GRACE);
        if (late) {
            o.status = Status.JOINED_LATE;
            s.joinedLate++;
            if (o.promisedDate != 0 && joinedAt > o.promisedDate) {
                s.totalDelayDays += (joinedAt - o.promisedDate) / 1 days;
            }
        } else {
            o.status = Status.JOINED_ON_TIME;
            s.joinedOnTime++;
        }
        emit OfferJoined(offerId, joinedAt, !late);
    }
}
