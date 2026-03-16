"use client";

import { useReadContract, useWriteContract, useWatchContractEvent, useChainId, usePublicClient } from "wagmi";
import { useEffect, useState } from "react";
import { getContractAddresses, ANONYMOUS_VOTING_ABI } from "@/lib/contracts";
import { getDefaultTransferStartBlock } from "@/lib/transfers";
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
  return { proposals: [], isLoading: !count };
}

export function useCreateProposal() {
  const address = useVotingAddress();
  const { writeContractAsync, isPending, error } = useWriteContract();

  const createProposal = async (
    description: string,
    merkleRoot: `0x${string}`,
    totalSupply: bigint,
    whaleThresholdBps: bigint,
    snapshotBlock: bigint,
    votingDuration: bigint
  ) => {
    if (!address) throw new Error("Contract address not configured");
    return writeContractAsync({
      address,
      abi: ANONYMOUS_VOTING_ABI,
      functionName: "createProposal",
      args: [description, merkleRoot, totalSupply, whaleThresholdBps, snapshotBlock, votingDuration],
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
  const chainId = useChainId();
  const [events, setEvents] = useState<VoteEvent[]>([]);

  useEffect(() => {
    if (!address || !publicClient) return;
    let cancelled = false;

    const fetchLogs = async () => {
      try {
        const latestBlock = await publicClient.getBlockNumber();
        const startBlock = getDefaultTransferStartBlock(chainId);
        const logs = [];

        for (let fromBlock = startBlock; fromBlock <= latestBlock; fromBlock += 45_000n) {
          const toBlock = fromBlock + 44_999n > latestBlock ? latestBlock : fromBlock + 44_999n;
          const chunk = await publicClient.getLogs({
            address,
            event: VOTE_CAST_EVENT,
            args: { proposalId: BigInt(proposalId) },
            fromBlock,
            toBlock,
          });
          logs.push(...chunk);
        }

        if (!cancelled) {
          setEvents(logs.map(mapVoteLog));
        }
      } catch (error) {
        console.error(error);
      }
    };

    void fetchLogs();

    return () => {
      cancelled = true;
    };
  }, [address, publicClient, proposalId, chainId]);

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
      setEvents((prev: VoteEvent[]) => {
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
  const chainId = useChainId();
  const [events, setEvents] = useState<WhaleEvent[]>([]);

  useEffect(() => {
    if (!address || !publicClient) return;
    let cancelled = false;

    const fetchLogs = async () => {
      try {
        const latestBlock = await publicClient.getBlockNumber();
        const startBlock = getDefaultTransferStartBlock(chainId);
        const logs = [];

        for (let fromBlock = startBlock; fromBlock <= latestBlock; fromBlock += 45_000n) {
          const toBlock = fromBlock + 44_999n > latestBlock ? latestBlock : fromBlock + 44_999n;
          const chunk = await publicClient.getLogs({
            address,
            event: WHALE_VOTED_EVENT,
            args: { proposalId: BigInt(proposalId) },
            fromBlock,
            toBlock,
          });
          logs.push(...chunk);
        }

        if (!cancelled) {
          setEvents(logs.map(mapVoteLog));
        }
      } catch (error) {
        console.error(error);
      }
    };

    void fetchLogs();

    return () => {
      cancelled = true;
    };
  }, [address, publicClient, proposalId, chainId]);

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
      setEvents((prev: WhaleEvent[]) => {
        const hashes = new Set(prev.map((e) => e.transactionHash));
        return [...prev, ...newEvents.filter((e) => !hashes.has(e.transactionHash))];
      });
    },
  });

  return events;
}
