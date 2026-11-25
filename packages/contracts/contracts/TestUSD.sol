// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Testnet-only dollar token with an open faucet, so anyone can try Pakka without
/// hunting for testnet USDC. It has no value.
contract TestUSD is ERC20 {
    uint256 public constant FAUCET_AMOUNT = 10_000e6;

    constructor() ERC20("Pakka Test USD", "pUSD") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function faucet() external {
        _mint(msg.sender, FAUCET_AMOUNT);
    }
}
