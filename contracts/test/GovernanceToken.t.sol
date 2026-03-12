// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/GovernanceToken.sol";

contract GovernanceTokenTest is Test {
    GovernanceToken token;
    address owner = address(1);
    address alice = address(2);

    function setUp() public {
        token = new GovernanceToken(owner);
    }

    function test_InitialSupply() public view {
        assertEq(token.totalSupply(), 1_000_000 * 10 ** 18);
        assertEq(token.balanceOf(owner), 1_000_000 * 10 ** 18);
    }

    function test_Mint() public {
        vm.prank(owner);
        token.mint(alice, 500 * 10 ** 18);
        assertEq(token.balanceOf(alice), 500 * 10 ** 18);
        assertEq(token.totalSupply(), 1_000_500 * 10 ** 18);
    }

    function test_MintOnlyOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        token.mint(alice, 100 * 10 ** 18);
    }

    function test_Transfer() public {
        vm.prank(owner);
        token.transfer(alice, 100 * 10 ** 18);
        assertEq(token.balanceOf(alice), 100 * 10 ** 18);
        assertEq(token.balanceOf(owner), (1_000_000 - 100) * 10 ** 18);
    }

    function test_SnapshotBalanceOf() public view {
        assertEq(token.snapshotBalanceOf(owner, block.number), 1_000_000 * 10 ** 18);
    }
}
