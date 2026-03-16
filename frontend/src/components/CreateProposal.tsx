"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCreateProposal } from "@/hooks/useAnonymousVoting";
import { getContractAddresses, GOVERNANCE_TOKEN_ABI } from "@/lib/contracts";
import { buildSnapshotTree } from "@/lib/merkle";
import { fetchTransferLogsChunked, getDefaultTransferStartBlock } from "@/lib/transfers";
import { usePublicClient, useChainId } from "wagmi";

export function CreateProposal() {
  const [description, setDescription] = useState("");
  const [thresholdPct, setThresholdPct] = useState("10");
  const [durationHours, setDurationHours] = useState("60");
  const [snapshotData, setSnapshotData] = useState<{
    merkleRoot: `0x${string}`;
    snapshotBlock: bigint;
    totalSupply: bigint;
  } | null>(null);
  const [computing, setComputing] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [status, setStatus] = useState("");

  const { createProposal, isPending } = useCreateProposal();
  const publicClient = usePublicClient();
  const chainId = useChainId();
  const queryClient = useQueryClient();

  const computeMerkleRoot = async () => {
    if (!publicClient) return;
    setComputing(true);
    setStatus("Fetching transfer events…");

    try {
      let tokenAddress: `0x${string}`;
      try {
        tokenAddress = getContractAddresses(chainId).governanceToken;
      } catch {
        setStatus("Contract address not configured for this network.");
        setComputing(false);
        return;
      }

      const snapshotBlock = await publicClient.getBlockNumber();
      const transferStartBlock = getDefaultTransferStartBlock(chainId);

      setStatus(`Using snapshot block ${snapshotBlock.toString()}…`);

      const totalSupply = await publicClient.readContract({
        address: tokenAddress,
        abi: GOVERNANCE_TOKEN_ABI,
        functionName: "totalSupply",
        blockNumber: snapshotBlock,
      });

      const transfers = await fetchTransferLogsChunked(publicClient, tokenAddress, snapshotBlock, {
        fromBlock: transferStartBlock,
        onChunkStart: (fromBlock, toBlock) => {
          setStatus(`Fetching transfer events ${fromBlock.toString()}-${toBlock.toString()}...`);
        },
      });

      setStatus("Building Merkle tree…");
      const { root } = await buildSnapshotTree(transfers);
      setSnapshotData({ merkleRoot: root, snapshotBlock, totalSupply });
      setStatus(
        `Snapshot locked at block ${snapshotBlock.toString()} with root ${root.slice(0, 18)}…`
      );
    } catch (e) {
      setStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setComputing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!snapshotData) return;

    const bps = BigInt(Math.round(parseFloat(thresholdPct) * 100));
    const duration = BigInt(Math.round(parseFloat(durationHours) * 60));

    try {
      const hash = await createProposal(
        description,
        snapshotData.merkleRoot,
        snapshotData.totalSupply,
        bps,
        snapshotData.snapshotBlock,
        duration
      );

      if (!publicClient) {
        throw new Error("No RPC client available");
      }

      setIsConfirming(true);
      setStatus(`Transaction submitted: ${hash.slice(0, 10)}... Waiting for confirmation...`);

      await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });

      await queryClient.invalidateQueries();

      setDescription("");
      setSnapshotData(null);
      setStatus("Proposal created and confirmed onchain.");
    } catch (e) {
      setStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-gray-200 p-6">
      <h2 className="text-lg font-semibold">Create Proposal</h2>

      <div>
        <label className="block text-sm font-medium mb-1">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          placeholder="Describe the proposal…"
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1">Whale Threshold (%)</label>
          <input
            type="number"
            value={thresholdPct}
            onChange={(e) => setThresholdPct(e.target.value)}
            min="0.01"
            max="100"
            step="0.01"
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Duration (minutes)</label>
          <input
            type="number"
            value={durationHours}
            onChange={(e) => setDurationHours(e.target.value)}
            min="1"
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div>
        <button
          type="button"
          onClick={computeMerkleRoot}
          disabled={computing}
          className="rounded border border-indigo-300 px-4 py-2 text-sm text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
        >
          {computing ? "Computing…" : "Compute Snapshot Merkle Root"}
        </button>
        {snapshotData && (
          <>
            <p className="mt-2 text-xs text-gray-600">
              Snapshot block: {snapshotData.snapshotBlock.toString()}
            </p>
            <p className="mt-1 text-xs text-gray-600">
              Snapshot total supply: {snapshotData.totalSupply.toString()}
            </p>
            <p className="mt-1 text-xs font-mono text-gray-600 break-all">
              Root: {snapshotData.merkleRoot}
            </p>
          </>
        )}
        {status && <p className="mt-1 text-xs text-gray-500">{status}</p>}
      </div>

      <button
        type="submit"
        disabled={!snapshotData || !description || isPending || isConfirming}
        className="w-full rounded-lg bg-indigo-600 py-2 text-white font-semibold hover:bg-indigo-700 disabled:opacity-50"
      >
        {isPending ? "Submitting…" : isConfirming ? "Waiting for confirmation…" : "Create Proposal"}
      </button>
    </form>
  );
}
