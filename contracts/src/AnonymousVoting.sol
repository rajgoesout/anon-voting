// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./IVerifier.sol";

contract AnonymousVoting {
    IVerifier public immutable verifier;

    struct Proposal {
        string description;
        bytes32 merkleRoot;
        uint256 totalSupply;
        uint256 whaleThresholdBps;
        uint256 snapshotBlock;
        uint256 startTime;
        uint256 deadline;
        uint256 votesFor;
        uint256 votesAgainst;
        uint256 whaleVotesFor;
        uint256 whaleVotesAgainst;
        bool finalized;
        bool passed;
    }

    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => mapping(bytes32 => bool)) public nullifierUsed;
    uint256 public proposalCount;

    uint256 public constant MIN_VOTING_DURATION = 1 hours;

    event ProposalCreated(
        uint256 indexed proposalId,
        string description,
        bytes32 merkleRoot,
        uint256 whaleThresholdBps,
        uint256 deadline
    );
    event VoteCast(uint256 indexed proposalId, uint8 voteValue);
    event WhaleVoted(uint256 indexed proposalId, uint8 voteValue);
    event ProposalFinalized(
        uint256 indexed proposalId,
        bool passed,
        uint256 votesFor,
        uint256 votesAgainst
    );

    error InvalidMerkleRoot();
    error InvalidWhaleThreshold();
    error VotingDurationTooShort();
    error ProposalNotFound();
    error VotingNotActive();
    error NullifierAlreadyUsed();
    error InvalidVoteValue();
    error InvalidIsWhale();
    error ProofVerificationFailed();
    error VotingStillActive();
    error AlreadyFinalized();
    error InvalidTotalSupply();

    constructor(address _verifier) {
        verifier = IVerifier(_verifier);
    }

    function createProposal(
        string calldata description,
        bytes32 merkleRoot,
        uint256 totalSupply,
        uint256 whaleThresholdBps,
        uint256 votingDuration
    ) external returns (uint256 proposalId) {
        if (merkleRoot == bytes32(0)) revert InvalidMerkleRoot();
        if (whaleThresholdBps == 0 || whaleThresholdBps > 10_000) revert InvalidWhaleThreshold();
        if (votingDuration < MIN_VOTING_DURATION) revert VotingDurationTooShort();
        if (totalSupply == 0) revert InvalidTotalSupply();

        proposalId = proposalCount++;
        Proposal storage p = proposals[proposalId];
        p.description = description;
        p.merkleRoot = merkleRoot;
        p.totalSupply = totalSupply;
        p.whaleThresholdBps = whaleThresholdBps;
        p.snapshotBlock = block.number;
        p.startTime = block.timestamp;
        p.deadline = block.timestamp + votingDuration;

        emit ProposalCreated(proposalId, description, merkleRoot, whaleThresholdBps, p.deadline);
    }

    function castVote(
        uint256 proposalId,
        bytes32 nullifierHash,
        uint8 voteValue,
        uint8 isWhale,
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c
    ) external {
        if (proposalId >= proposalCount) revert ProposalNotFound();
        Proposal storage p = proposals[proposalId];
        if (block.timestamp < p.startTime || block.timestamp > p.deadline) revert VotingNotActive();
        if (nullifierUsed[proposalId][nullifierHash]) revert NullifierAlreadyUsed();
        if (voteValue > 1) revert InvalidVoteValue();
        if (isWhale > 1) revert InvalidIsWhale();

        uint256[7] memory publicSignals = [
            uint256(p.merkleRoot),
            uint256(nullifierHash),
            proposalId,
            uint256(voteValue),
            p.whaleThresholdBps,
            p.totalSupply,
            uint256(isWhale)
        ];

        if (!verifier.verifyProof(a, b, c, publicSignals)) revert ProofVerificationFailed();

        nullifierUsed[proposalId][nullifierHash] = true;

        if (voteValue == 1) {
            p.votesFor++;
        } else {
            p.votesAgainst++;
        }

        if (isWhale == 1) {
            if (voteValue == 1) {
                p.whaleVotesFor++;
            } else {
                p.whaleVotesAgainst++;
            }
        }

        emit VoteCast(proposalId, voteValue);
        if (isWhale == 1) {
            emit WhaleVoted(proposalId, voteValue);
        }
    }

    function finalizeProposal(uint256 proposalId) external {
        if (proposalId >= proposalCount) revert ProposalNotFound();
        Proposal storage p = proposals[proposalId];
        if (block.timestamp <= p.deadline) revert VotingStillActive();
        if (p.finalized) revert AlreadyFinalized();

        p.finalized = true;
        p.passed = p.votesFor > p.votesAgainst;

        emit ProposalFinalized(proposalId, p.passed, p.votesFor, p.votesAgainst);
    }

    function getProposal(uint256 proposalId) external view returns (Proposal memory) {
        return proposals[proposalId];
    }

    function isNullifierUsed(uint256 proposalId, bytes32 nullifier) external view returns (bool) {
        return nullifierUsed[proposalId][nullifier];
    }

    function getVoteCounts(uint256 proposalId)
        external
        view
        returns (uint256 votesFor, uint256 votesAgainst, uint256 whaleFor, uint256 whaleAgainst)
    {
        Proposal storage p = proposals[proposalId];
        return (p.votesFor, p.votesAgainst, p.whaleVotesFor, p.whaleVotesAgainst);
    }
}
