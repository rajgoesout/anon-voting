"use client";

import { useState, useCallback } from "react";
import { usePublicClient, useChainId } from "wagmi";
import { poseidonHash } from "@/lib/poseidon";
import { generateGroth16Proof } from "@/lib/proof";
import { buildSnapshotTree, reconstructBalances } from "@/lib/merkle";
import { getContractAddresses } from "@/lib/contracts";
import { initPoseidon, poseidonHashSync } from "@/lib/poseidon";
import { fetchTransferLogsChunked, getDefaultTransferStartBlock } from "@/lib/transfers";
import type { ProofInputs, ProofResult, ProofStep } from "@/types";

export function useZKProof() {
  const [step, setStep] = useState<ProofStep>("idle");
  const [error, setError] = useState<string | null>(null);

  const publicClient = usePublicClient();
  const chainId = useChainId();

  const generateProof = useCallback(
    async (inputs: ProofInputs): Promise<ProofResult | null> => {
      setError(null);
      setStep("snapshot");

      try {
        if (!publicClient) throw new Error("No RPC client available");

        let tokenAddress: `0x${string}`;
        try {
          tokenAddress = getContractAddresses(chainId).governanceToken;
        } catch {
          throw new Error("Contract addresses not configured for this network");
        }

        // Step 1: Fetch all Transfer events up to the snapshot block
        const snapshotBlock = inputs.proposal.snapshotBlock;
        const transferStartBlock = getDefaultTransferStartBlock(chainId);

        const transfers = await fetchTransferLogsChunked(publicClient, tokenAddress, snapshotBlock, {
          fromBlock: transferStartBlock,
          onChunkStart: (fromBlock, toBlock) => {
            setStep("snapshot");
            setError(`Fetching transfer events ${fromBlock.toString()}-${toBlock.toString()}...`);
          },
        });
        setError(null);

        // Step 2: Build Merkle tree
        setStep("merkle");

        const { tree } = await buildSnapshotTree(transfers);

        // Look up the voter's balance from the reconstructed balances
        const balances = reconstructBalances(transfers);
        const voterNorm = inputs.address.toLowerCase();
        const balance = balances.get(voterNorm) ?? 0n;

        if (balance === 0n) {
          throw new Error(
            "Your address has no token balance in the snapshot — you cannot vote on this proposal"
          );
        }

        // Get Merkle proof for this voter
        const idx = tree.addresses.indexOf(voterNorm);
        if (idx === -1) {
          throw new Error("Your address is not in the snapshot Merkle tree");
        }

        const { MerkleTree } = await import("fixed-merkle-tree");
        await initPoseidon();
        const merkleTree = new MerkleTree(20, tree.leaves, {
          hashFunction: (left: bigint, right: bigint) => poseidonHashSync(left, right),
          zeroElement: 0n,
        });

        const { pathElements, pathIndices } = merkleTree.proof(tree.leaves[idx]);
        const realPathElements = (pathElements as (bigint | string)[]).map((e) => BigInt(e));
        const realPathIndices = pathIndices as number[];

        // Step 3: Compute nullifier
        setStep("witness");

        const addressBigInt = BigInt(inputs.address);
        const secretBigInt = BigInt("0x" + inputs.secret);
        const proposalIdBigInt = BigInt(inputs.proposalId);

        const nullifierHashBigInt = await poseidonHash(
          secretBigInt,
          addressBigInt,
          proposalIdBigInt
        );

        const merkleRootBigInt = BigInt(inputs.proposal.merkleRoot);

        // Step 4: Generate Groth16 proof
        setStep("proving");

        const result = await generateGroth16Proof({
          secret: secretBigInt,
          voterAddress: addressBigInt,
          balance,
          pathElements: realPathElements,
          pathIndices: realPathIndices,
          merkleRoot: merkleRootBigInt,
          nullifierHash: nullifierHashBigInt,
          proposalId: proposalIdBigInt,
          voteValue: inputs.voteValue,
          whaleThresholdBps: inputs.proposal.whaleThresholdBps,
          totalSupply: inputs.proposal.totalSupply,
        });

        // Step 5: Formatted by generateGroth16Proof
        setStep("formatting");
        setStep("done");
        return result;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        setStep("error");
        return null;
      }
    },
    [publicClient, chainId]
  );

  const reset = useCallback(() => {
    setStep("idle");
    setError(null);
  }, []);

  return { generateProof, step, error, reset };
}
