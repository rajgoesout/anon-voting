// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "./MockVerifier.sol";
import "../src/GovernanceToken.sol";
import "../src/AnonymousVoting.sol";

contract AnonymousVotingTest is Test {
    MockVerifier verifier;
    GovernanceToken token;
    AnonymousVoting voting;

    address deployer = address(1);

    bytes32 constant MERKLE_ROOT = bytes32(uint256(0xdeadbeef));
    uint256 constant TOTAL_SUPPLY = 1_000_000 * 10 ** 18;
    uint256 constant WHALE_BPS = 1000; // 10%
    uint256 constant DURATION = 7 days;

    uint256[2] dummyA = [uint256(1), uint256(2)];
    uint256[2][2] dummyB = [[uint256(3), uint256(4)], [uint256(5), uint256(6)]];
    uint256[2] dummyC = [uint256(7), uint256(8)];

    function setUp() public {
        vm.startPrank(deployer);
        verifier = new MockVerifier();
        token = new GovernanceToken(deployer);
        voting = new AnonymousVoting(address(verifier));
        vm.stopPrank();
    }

    function _createProposal() internal returns (uint256) {
        return voting.createProposal("Test proposal", MERKLE_ROOT, TOTAL_SUPPLY, WHALE_BPS, DURATION);
    }

    // --- createProposal ---

    function test_CreateProposal_Valid() public {
        vm.expectEmit(true, false, false, true);
        emit AnonymousVoting.ProposalCreated(0, "Test proposal", MERKLE_ROOT, WHALE_BPS, block.timestamp + DURATION);
        uint256 id = _createProposal();
        assertEq(id, 0);
        assertEq(voting.proposalCount(), 1);

        AnonymousVoting.Proposal memory p = voting.getProposal(0);
        assertEq(p.description, "Test proposal");
        assertEq(p.merkleRoot, MERKLE_ROOT);
        assertEq(p.whaleThresholdBps, WHALE_BPS);
        assertFalse(p.finalized);
    }

    function test_CreateProposal_InvalidMerkleRoot() public {
        vm.expectRevert(AnonymousVoting.InvalidMerkleRoot.selector);
        voting.createProposal("Test", bytes32(0), TOTAL_SUPPLY, WHALE_BPS, DURATION);
    }

    function test_CreateProposal_InvalidWhaleThreshold_Zero() public {
        vm.expectRevert(AnonymousVoting.InvalidWhaleThreshold.selector);
        voting.createProposal("Test", MERKLE_ROOT, TOTAL_SUPPLY, 0, DURATION);
    }

    function test_CreateProposal_InvalidWhaleThreshold_TooHigh() public {
        vm.expectRevert(AnonymousVoting.InvalidWhaleThreshold.selector);
        voting.createProposal("Test", MERKLE_ROOT, TOTAL_SUPPLY, 10_001, DURATION);
    }

    function test_CreateProposal_DurationTooShort() public {
        vm.expectRevert(AnonymousVoting.VotingDurationTooShort.selector);
        voting.createProposal("Test", MERKLE_ROOT, TOTAL_SUPPLY, WHALE_BPS, 30 seconds);
    }

    function test_CreateProposal_InvalidTotalSupply() public {
        vm.expectRevert(AnonymousVoting.InvalidTotalSupply.selector);
        voting.createProposal("Test", MERKLE_ROOT, 0, WHALE_BPS, DURATION);
    }

    // --- castVote ---

    function test_CastVote_HappyPath_For() public {
        _createProposal();
        bytes32 nullifier = keccak256("nullifier1");

        vm.expectEmit(true, false, false, true);
        emit AnonymousVoting.VoteCast(0, 1);

        voting.castVote(0, nullifier, 1, 0, dummyA, dummyB, dummyC);

        (uint256 vFor, uint256 vAgainst,,) = voting.getVoteCounts(0);
        assertEq(vFor, 1);
        assertEq(vAgainst, 0);
    }

    function test_CastVote_HappyPath_Against() public {
        _createProposal();
        bytes32 nullifier = keccak256("nullifier2");

        voting.castVote(0, nullifier, 0, 0, dummyA, dummyB, dummyC);

        (uint256 vFor, uint256 vAgainst,,) = voting.getVoteCounts(0);
        assertEq(vFor, 0);
        assertEq(vAgainst, 1);
    }

    function test_CastVote_WhaleVotedEvent_Emitted() public {
        _createProposal();
        bytes32 nullifier = keccak256("whale1");

        vm.expectEmit(true, false, false, true);
        emit AnonymousVoting.VoteCast(0, 1);
        vm.expectEmit(true, false, false, true);
        emit AnonymousVoting.WhaleVoted(0, 1);

        voting.castVote(0, nullifier, 1, 1, dummyA, dummyB, dummyC);

        (,, uint256 whaleFor, uint256 whaleAgainst) = voting.getVoteCounts(0);
        assertEq(whaleFor, 1);
        assertEq(whaleAgainst, 0);
    }

    function test_CastVote_WhaleEvent_NotEmitted_WhenNotWhale() public {
        _createProposal();
        bytes32 nullifier = keccak256("nonwhale1");

        // Capture logs to verify WhaleVoted is NOT emitted
        vm.recordLogs();
        voting.castVote(0, nullifier, 1, 0, dummyA, dummyB, dummyC);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        // Only VoteCast should be emitted (1 event)
        assertEq(logs.length, 1);
        assertEq(logs[0].topics[0], keccak256("VoteCast(uint256,uint8)"));

        (,, uint256 whaleFor,) = voting.getVoteCounts(0);
        assertEq(whaleFor, 0);
    }

    function test_CastVote_NullifierReuse_Reverts() public {
        _createProposal();
        bytes32 nullifier = keccak256("reuse");

        voting.castVote(0, nullifier, 1, 0, dummyA, dummyB, dummyC);

        vm.expectRevert(AnonymousVoting.NullifierAlreadyUsed.selector);
        voting.castVote(0, nullifier, 0, 0, dummyA, dummyB, dummyC);
    }

    function test_CastVote_AfterDeadline_Reverts() public {
        _createProposal();
        vm.warp(block.timestamp + DURATION + 1);
        vm.expectRevert(AnonymousVoting.VotingNotActive.selector);
        voting.castVote(0, keccak256("late"), 1, 0, dummyA, dummyB, dummyC);
    }

    function test_CastVote_InvalidVoteValue_Reverts() public {
        _createProposal();
        vm.expectRevert(AnonymousVoting.InvalidVoteValue.selector);
        voting.castVote(0, keccak256("bad"), 2, 0, dummyA, dummyB, dummyC);
    }

    // --- finalizeProposal ---

    function test_FinalizeProposal_BeforeDeadline_Reverts() public {
        _createProposal();
        vm.expectRevert(AnonymousVoting.VotingStillActive.selector);
        voting.finalizeProposal(0);
    }

    function test_FinalizeProposal_AfterDeadline_Passes() public {
        _createProposal();
        voting.castVote(0, keccak256("v1"), 1, 0, dummyA, dummyB, dummyC);
        voting.castVote(0, keccak256("v2"), 1, 0, dummyA, dummyB, dummyC);
        voting.castVote(0, keccak256("v3"), 0, 0, dummyA, dummyB, dummyC);

        vm.warp(block.timestamp + DURATION + 1);

        vm.expectEmit(true, false, false, true);
        emit AnonymousVoting.ProposalFinalized(0, true, 2, 1);

        voting.finalizeProposal(0);

        AnonymousVoting.Proposal memory p = voting.getProposal(0);
        assertTrue(p.finalized);
        assertTrue(p.passed);
    }

    function test_FinalizeProposal_DoubleFinalize_Reverts() public {
        _createProposal();
        vm.warp(block.timestamp + DURATION + 1);
        voting.finalizeProposal(0);
        vm.expectRevert(AnonymousVoting.AlreadyFinalized.selector);
        voting.finalizeProposal(0);
    }

    // --- getVoteCounts ---

    function test_GetVoteCounts_Correct() public {
        _createProposal();
        voting.castVote(0, keccak256("a"), 1, 1, dummyA, dummyB, dummyC);
        voting.castVote(0, keccak256("b"), 0, 0, dummyA, dummyB, dummyC);
        voting.castVote(0, keccak256("c"), 1, 0, dummyA, dummyB, dummyC);

        (uint256 vFor, uint256 vAgainst, uint256 wFor, uint256 wAgainst) = voting.getVoteCounts(0);
        assertEq(vFor, 2);
        assertEq(vAgainst, 1);
        assertEq(wFor, 1);
        assertEq(wAgainst, 0);
    }

    function test_IsNullifierUsed() public {
        _createProposal();
        bytes32 n = keccak256("check");
        assertFalse(voting.isNullifierUsed(0, n));
        voting.castVote(0, n, 1, 0, dummyA, dummyB, dummyC);
        assertTrue(voting.isNullifierUsed(0, n));
    }
}
