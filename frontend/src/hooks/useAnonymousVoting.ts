"use client";

import { useReadContract, useWriteContract, useWatchContractEvent, useChainId, usePublicClient } from "wagmi";
import { useState, useEffect } from "react";
import { getContractAddresses, ANONYMOUS_VOTING_ABI } from "@/lib/contracts";
import type { Proposal, VoteEvent, WhaleEvent } from "@/types";

function useVotingAddress() {
  const chainId = useChainId();
  try {
    return getContractAddresses(chainId).anonymousVoting;
  } catch {
    return undefined;
  }
}

export function useProposalCount() {
  const address = useVotingAddress();
  return useReadContract({
    address,
    abi: ANONYMOUS_VOTING_ABI,
    functionName: "proposalCount",
    query: { enabled: !!address },
  });
}

export function useProposal(proposalId: number) {
  const address = useVotingAddress();
  const { data, ...rest } = useReadContract({
    address,
    abi: ANONYMOUS_VOTING_ABI,
    functionName: "getProposal",
    args: [BigInt(proposalId)],
    query: { enabled: !!address && proposalId >= 0 },
  });

  const proposal: Proposal | undefined = data
    ? {
        id: proposalId,
        description: data.description,
        merkleRoot: data.merkleRoot,
        totalSupply: data.totalSupply,
        whaleThresholdBps: data.whaleThresholdBps,
        snapshotBlock: data.snapshotBlock,
        startTime: data.startTime,
        deadline: data.deadline,
        votesFor: data.votesFor,
        votesAgainst: data.votesAgainst,
        whaleVotesFor: data.whaleVotesFor,
        whaleVotesAgainst: data.whaleVotesAgainst,
        finalized: data.finalized,
        passed: data.passed,
      }
    : undefined;

  return { data: proposal, ...rest };
}

export function useProposals(): { proposals: Proposal[]; isLoading: boolean } {
  const { data: count } = useProposalCount();
  const address = useVotingAddress();
  const [proposals, setProposals] = useState<Proposal[]>([]);

  // Simple approach: fetch individual proposals
  // In production, use event logs for efficiency
  const n = count ? Number(count) : 0;

  useEffect(() => {
    if (!address || n === 0) return;
    setProposals([]);
  }, [address, n]);

  return { proposals, isLoading: false };
}

export function useCreateProposal() {
  const address = useVotingAddress();
  const { writeContractAsync, isPending, error } = useWriteContract();

  const createProposal = async (
    description: string,
    merkleRoot: `0x${string}`,
    totalSupply: bigint,
    whaleThresholdBps: bigint,
    votingDuration: bigint
  ) => {
    if (!address) throw new Error("Contract address not configured");
    return writeContractAsync({
      address,
      abi: ANONYMOUS_VOTING_ABI,
      functionName: "createProposal",
      args: [description, merkleRoot, totalSupply, whaleThresholdBps, votingDuration],
    });
  };

  return { createProposal, isPending, error };
}

export function useCastVote() {
  const address = useVotingAddress();
  const { writeContractAsync, isPending, error } = useWriteContract();

  const castVote = async (
    proposalId: bigint,
    nullifierHash: `0x${string}`,
    voteValue: number,
    isWhale: number,
    a: readonly [bigint, bigint],
    b: readonly [readonly [bigint, bigint], readonly [bigint, bigint]],
    c: readonly [bigint, bigint]
  ) => {
    if (!address) throw new Error("Contract address not configured");
    return writeContractAsync({
      address,
      abi: ANONYMOUS_VOTING_ABI,
      functionName: "castVote",
      args: [proposalId, nullifierHash, voteValue, isWhale, a, b, c],
    });
  };

  return { castVote, isPending, error };
}

export function useFinalizeProposal() {
  const address = useVotingAddress();
  const { writeContractAsync, isPending, error } = useWriteContract();

  const finalizeProposal = async (proposalId: bigint) => {
    if (!address) throw new Error("Contract address not configured");
    return writeContractAsync({
      address,
      abi: ANONYMOUS_VOTING_ABI,
      functionName: "finalizeProposal",
      args: [proposalId],
    });
  };

  return { finalizeProposal, isPending, error };
}

const VOTE_CAST_EVENT = {
  type: "event",
  name: "VoteCast",
  inputs: [
    { name: "proposalId", type: "uint256", indexed: true },
    { name: "voteValue", type: "uint8", indexed: false },
  ],
} as const;

const WHALE_VOTED_EVENT = {
  type: "event",
  name: "WhaleVoted",
  inputs: [
    { name: "proposalId", type: "uint256", indexed: true },
    { name: "voteValue", type: "uint8", indexed: false },
  ],
} as const;

function mapVoteLog(l: { args: { proposalId?: bigint; voteValue?: number }; blockNumber: bigint | null; transactionHash: `0x${string}` | null }) {
  return {
    proposalId: l.args.proposalId ?? 0n,
    voteValue: l.args.voteValue ?? 0,
    blockNumber: l.blockNumber ?? 0n,
    transactionHash: (l.transactionHash ?? "0x") as `0x${string}`,
  };
}

export function useVoteCastEvents(proposalId: number) {
  const address = useVotingAddress();
  const publicClient = usePublicClient();
  const [events, setEvents] = useState<VoteEvent[]>([]);

  useEffect(() => {
    if (!address || !publicClient) return;
    publicClient.getLogs({
      address,
      event: VOTE_CAST_EVENT,
      args: { proposalId: BigInt(proposalId) },
      fromBlock: 0n,
      toBlock: "latest",
    }).then((logs) => setEvents(logs.map(mapVoteLog))).catch(console.error);
  }, [address, publicClient, proposalId]);

  useWatchContractEvent({
    address,
    abi: ANONYMOUS_VOTING_ABI,
    eventName: "VoteCast",
    args: { proposalId: BigInt(proposalId) },
    onLogs: (logs) => {
      const newEvents = logs.map((l) => ({
        proposalId: l.args.proposalId ?? 0n,
        voteValue: l.args.voteValue ?? 0,
        blockNumber: l.blockNumber ?? 0n,
        transactionHash: (l.transactionHash ?? "0x") as `0x${string}`,
      }));
      setEvents((prev) => {
        const hashes = new Set(prev.map((e) => e.transactionHash));
        return [...prev, ...newEvents.filter((e) => !hashes.has(e.transactionHash))];
      });
    },
  });

  return events;
}

export function useWhaleEvents(proposalId: number) {
  const address = useVotingAddress();
  const publicClient = usePublicClient();
  const [events, setEvents] = useState<WhaleEvent[]>([]);

  useEffect(() => {
    if (!address || !publicClient) return;
    publicClient.getLogs({
      address,
      event: WHALE_VOTED_EVENT,
      args: { proposalId: BigInt(proposalId) },
      fromBlock: 0n,
      toBlock: "latest",
    }).then((logs) => setEvents(logs.map(mapVoteLog))).catch(console.error);
  }, [address, publicClient, proposalId]);

  // Watch for new logs
  useWatchContractEvent({
    address,
    abi: ANONYMOUS_VOTING_ABI,
    eventName: "WhaleVoted",
    args: { proposalId: BigInt(proposalId) },
    onLogs: (logs) => {
      const newEvents = logs.map((l) => ({
        proposalId: l.args.proposalId ?? 0n,
        voteValue: l.args.voteValue ?? 0,
        blockNumber: l.blockNumber ?? 0n,
        transactionHash: l.transactionHash ?? "0x" as `0x${string}`,
      }));
      setEvents((prev) => {
        const hashes = new Set(prev.map((e) => e.transactionHash));
        return [...prev, ...newEvents.filter((e) => !hashes.has(e.transactionHash))];
      });
    },
  });

  return events;
}
