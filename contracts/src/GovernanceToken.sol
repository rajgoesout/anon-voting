// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract GovernanceToken is ERC20, Ownable {
    constructor(address initialOwner) ERC20("ZK Gov Token", "ZKGOV") Ownable(initialOwner) {
        _mint(initialOwner, 1_000_000 * 10 ** 18);
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    /// @notice Returns current balance. Real snapshotting handled off-chain via event indexing.
    function snapshotBalanceOf(address account, uint256 /*blockNumber*/) external view returns (uint256) {
        return balanceOf(account);
    }
}
