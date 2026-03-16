"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { decodeFunctionData } from "viem";
import { useChainId, usePublicClient } from "wagmi";
import { useProposal, useVoteCastEvents } from "@/hooks/useAnonymousVoting";
import { ANONYMOUS_VOTING_ABI, VERIFIER_ABI, getContractAddresses } from "@/lib/contracts";

interface Props {
  id: number;
}

type VerificationEntry = {
  txHash: `0x${string}`;
  blockNumber: bigint;
  voteValue: number;
  nullifierHash?: `0x${string}`;
  valid?: boolean;
  isWhale?: boolean;
  error?: string;
};

export function VerifyProofs({ id }: Props) {
  const { data: proposal, isLoading } = useProposal(id);
  const voteEvents = useVoteCastEvents(id);
  const publicClient = usePublicClient();
  const chainId = useChainId();
  const [results, setResults] = useState<VerificationEntry[]>([]);
  const [isVerifying, setIsVerifying] = useState(false);
  const voteEventsRef = useRef(voteEvents);
  const explorerBase = chainId === 11155111 ? "https://sepolia.etherscan.io/tx/" : null;
  const proposalMerkleRoot = proposal?.merkleRoot;
  const proposalWhaleThresholdBps = proposal?.whaleThresholdBps;
  const proposalTotalSupply = proposal?.totalSupply;
  const voteEventsKey = voteEvents
    .map((event) => `${event.transactionHash}:${event.blockNumber.toString()}:${event.voteValue}`)
    .join("|");

  voteEventsRef.current = voteEvents;

  useEffect(() => {
    if (
      !proposalMerkleRoot ||
      proposalWhaleThresholdBps === undefined ||
      proposalTotalSupply === undefined ||
      !publicClient
    ) {
      return;
    }

    let cancelled = false;

    const verifyVotes = async () => {
      setIsVerifying(true);

      try {
        const votingAddress = getContractAddresses(chainId).anonymousVoting;
        const verifierAddress = await publicClient.readContract({
          address: votingAddress,
          abi: ANONYMOUS_VOTING_ABI,
          functionName: "verifier",
        });

        const orderedEvents = [...voteEventsRef.current].sort((a, b) =>
          a.blockNumber > b.blockNumber ? -1 : a.blockNumber < b.blockNumber ? 1 : 0
        );

        const nextResults = await Promise.all(
          orderedEvents.map(async (event) => {
            try {
              const tx = await publicClient.getTransaction({ hash: event.transactionHash });
              const decoded = decodeFunctionData({
                abi: ANONYMOUS_VOTING_ABI,
                data: tx.input,
              });

              if (decoded.functionName !== "castVote" || !decoded.args) {
                throw new Error("Transaction does not call castVote");
              }

              const [
                proposalId,
                nullifierHash,
                voteValue,
                isWhale,
                a,
                b,
                c,
              ] = decoded.args as readonly [
                bigint,
                `0x${string}`,
                number,
                number,
                readonly [bigint, bigint],
                readonly [readonly [bigint, bigint], readonly [bigint, bigint]],
                readonly [bigint, bigint],
              ];

              const publicSignals = [
                BigInt(isWhale),
                BigInt(proposalMerkleRoot),
                BigInt(nullifierHash),
                proposalId,
                BigInt(voteValue),
                proposalWhaleThresholdBps,
                proposalTotalSupply,
              ] as const;

              const valid = await publicClient.readContract({
                address: verifierAddress,
                abi: VERIFIER_ABI,
                functionName: "verifyProof",
                args: [a, b, c, publicSignals],
              });

              return {
                txHash: event.transactionHash,
                blockNumber: event.blockNumber,
                voteValue: Number(voteValue),
                nullifierHash,
                valid,
                isWhale: Number(isWhale) === 1,
              } satisfies VerificationEntry;
            } catch (error) {
              return {
                txHash: event.transactionHash,
                blockNumber: event.blockNumber,
                voteValue: event.voteValue,
                error: error instanceof Error ? error.message : String(error),
              } satisfies VerificationEntry;
            }
          })
        );

        if (!cancelled) {
          setResults(nextResults);
        }
      } finally {
        if (!cancelled) {
          setIsVerifying(false);
        }
      }
    };

    void verifyVotes();

    return () => {
      cancelled = true;
    };
  }, [
    publicClient,
    chainId,
    proposalMerkleRoot,
    proposalWhaleThresholdBps,
    proposalTotalSupply,
    voteEventsKey,
  ]);

  if (isLoading) return <div className="h-48 animate-pulse rounded-lg bg-gray-100" />;

  if (!proposal) {
    return <div className="py-12 text-center text-gray-500">Proposal not found.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-gray-500">Proposal {id}</p>
          <h1 className="text-2xl font-bold">Proof Verification</h1>
          <p className="mt-1 text-sm text-gray-500">
            Each entry is reconstructed from the vote transaction calldata and checked against the
            deployed verifier.
          </p>
        </div>
        <Link
          href={`/proposal/${id}`}
          className="rounded border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
        >
          Back to Proposal
        </Link>
      </div>

      <div className="rounded-lg border border-gray-200 p-5">
        <div className="grid gap-2 text-sm text-gray-600 md:grid-cols-2">
          <p>Snapshot block: {proposal.snapshotBlock.toString()}</p>
          <p>Total supply: {proposal.totalSupply.toString()}</p>
          <p>Whale threshold: {(Number(proposal.whaleThresholdBps) / 100).toFixed(2)}%</p>
          <p className="font-mono break-all">Merkle root: {proposal.merkleRoot}</p>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 p-5">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="font-semibold">Submitted Votes</h2>
          <span className="text-sm text-gray-500">
            {isVerifying ? "Verifying proofs..." : `${results.length} vote(s) checked`}
          </span>
        </div>

        {voteEvents.length === 0 && (
          <div className="text-sm italic text-gray-400">No votes have been cast for this proposal.</div>
        )}

        <div className="space-y-3">
          {results.map((result) => {
            const label = result.valid
              ? result.isWhale
                ? "Valid - Whale"
                : "Valid - Not Whale"
              : result.error
                ? "Verification Failed"
                : "Invalid";

            const tone = result.valid
              ? result.isWhale
                ? "border-blue-200 bg-blue-50 text-blue-800"
                : "border-green-200 bg-green-50 text-green-800"
              : "border-red-200 bg-red-50 text-red-800";

            return (
              <div key={result.txHash} className={`rounded-lg border p-4 ${tone}`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">{label}</p>
                    <p className="text-sm">
                      Vote: {result.voteValue === 1 ? "FOR" : "AGAINST"} · Block{" "}
                      {result.blockNumber.toString()}
                    </p>
                  </div>
                  {explorerBase ? (
                    <a
                      href={`${explorerBase}${result.txHash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm underline underline-offset-2"
                    >
                      {result.txHash.slice(0, 10)}...{result.txHash.slice(-8)}
                    </a>
                  ) : (
                    <span className="font-mono text-sm">
                      {result.txHash.slice(0, 10)}...{result.txHash.slice(-8)}
                    </span>
                  )}
                </div>

                {result.nullifierHash && (
                  <p className="mt-2 break-all font-mono text-xs">
                    Nullifier: {result.nullifierHash}
                  </p>
                )}

                {result.error && <p className="mt-2 text-sm">{result.error}</p>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
