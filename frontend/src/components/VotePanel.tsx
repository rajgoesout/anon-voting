"use client";

import { useState, useCallback } from "react";
import { useAccount } from "wagmi";
import { useZKProof } from "@/hooks/useZKProof";
import { useGovernanceToken } from "@/hooks/useGovernanceToken";
import { useCastVote } from "@/hooks/useAnonymousVoting";
import { ProofProgress } from "./ProofProgress";
import type { Proposal } from "@/types";

function randomHex(bytes = 32): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

interface Props {
  proposal: Proposal;
}

export function VotePanel({ proposal }: Props) {
  const { address } = useAccount();
  const { balance, totalSupply } = useGovernanceToken();
  const { generateProof, step, error, reset } = useZKProof();
  const { castVote, isPending } = useCastVote();

  const [secret, setSecret] = useState(() => randomHex());
  const [voteValue, setVoteValue] = useState<0 | 1 | null>(null);
  const [result, setResult] = useState<{
    txHash: string;
    nullifierHash: string;
    isWhale: boolean;
  } | null>(null);

  const isGenerating = step !== "idle" && step !== "done" && step !== "error";

  const balancePct =
    totalSupply > 0n ? Number((balance * 10000n) / totalSupply) / 100 : 0;
  const isWhaleLocal =
    totalSupply > 0n &&
    balance * 10000n >= proposal.whaleThresholdBps * totalSupply;

  const now = Math.floor(Date.now() / 1000);
  const isActive = now >= Number(proposal.startTime) && now <= Number(proposal.deadline);

  const handleVote = useCallback(async () => {
    if (!address || voteValue === null) return;
    reset();

    const proofResult = await generateProof({
      address,
      secret,
      proposalId: proposal.id,
      voteValue,
      proposal,
    });

    if (!proofResult) return;

    try {
      const txHash = await castVote(
        BigInt(proposal.id),
        proofResult.nullifierHash,
        voteValue,
        proofResult.isWhale ? 1 : 0,
        proofResult.a,
        proofResult.b,
        proofResult.c
      );
      setResult({
        txHash: txHash as string,
        nullifierHash: proofResult.nullifierHash,
        isWhale: proofResult.isWhale,
      });
    } catch (e) {
      console.error("castVote failed", e);
    }
  }, [address, voteValue, secret, proposal, generateProof, castVote, reset]);

  if (!address) {
    return (
      <div className="rounded-lg border border-gray-200 p-6 text-center text-gray-500">
        Connect your wallet to vote.
      </div>
    );
  }

  if (!isActive) {
    return (
      <div className="rounded-lg border border-gray-200 p-6 text-center text-gray-500">
        {now < Number(proposal.startTime) ? "Voting has not started yet." : "Voting has ended."}
      </div>
    );
  }

  if (result) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-6 space-y-3">
        <h3 className="font-semibold text-green-800">Vote submitted!</h3>
        {result.isWhale && (
          <div className="rounded bg-blue-100 p-3 text-blue-800 font-medium">
            🐋 Whale vote recorded — identity hidden
          </div>
        )}
        <div className="text-sm text-gray-600">
          <div><span className="font-medium">Tx:</span> {result.txHash}</div>
          <div><span className="font-medium">Nullifier:</span> {result.nullifierHash.slice(0, 18)}...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 p-6 space-y-5">
      <div>
        <h2 className="font-semibold text-lg">Cast Your Vote</h2>
        <p className="text-sm text-gray-500 mt-1">
          Wallet: {address.slice(0, 6)}…{address.slice(-4)}
        </p>
        <p className="text-sm text-gray-500">
          Balance: {(Number(balance) / 1e18).toFixed(2)} ZKGOV ({balancePct.toFixed(2)}% of supply)
          {isWhaleLocal && <span className="ml-2 text-blue-600 font-medium">🐋 Whale</span>}
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Vote Secret{" "}
          <span className="text-gray-400 font-normal text-xs">
            (nullifier = Poseidon(secret, address, proposalId))
          </span>
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm font-mono"
          />
          <button
            onClick={() => setSecret(randomHex())}
            className="rounded border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
          >
            ↺
          </button>
        </div>
        <p className="text-xs text-amber-600 mt-1">
          ⚠ Save this secret — you need it to prove your vote if challenged.
        </p>
      </div>

      <div className="flex gap-3">
        <button
          onClick={() => setVoteValue(1)}
          className={`flex-1 rounded-lg py-3 font-semibold transition-colors
            ${voteValue === 1 ? "bg-green-600 text-white" : "border border-green-300 text-green-700 hover:bg-green-50"}`}
        >
          FOR
        </button>
        <button
          onClick={() => setVoteValue(0)}
          className={`flex-1 rounded-lg py-3 font-semibold transition-colors
            ${voteValue === 0 ? "bg-red-600 text-white" : "border border-red-300 text-red-700 hover:bg-red-50"}`}
        >
          AGAINST
        </button>
      </div>

      <button
        onClick={handleVote}
        disabled={voteValue === null || !secret || isGenerating || isPending}
        className="w-full rounded-lg bg-indigo-600 py-3 text-white font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isGenerating ? "Generating proof…" : isPending ? "Submitting…" : "Generate Proof & Vote"}
      </button>

      <ProofProgress step={step} error={error} />
    </div>
  );
}
