"use client";

import { useState, useCallback } from "react";
import { poseidonHash } from "@/lib/poseidon";
import { generateGroth16Proof } from "@/lib/proof";
import type { ProofInputs, ProofResult, ProofStep } from "@/types";

export function useZKProof() {
  const [step, setStep] = useState<ProofStep>("idle");
  const [error, setError] = useState<string | null>(null);

  const generateProof = useCallback(
    async (inputs: ProofInputs): Promise<ProofResult | null> => {
      setError(null);
      setStep("snapshot");

      try {
        // Step 1: Fetch token holder snapshot
        // In production: query Transfer events from the blockchain
        // For demo, we use a minimal mock path
        setStep("merkle");

        // Step 2: Build Merkle tree and get proof path
        // In production: use buildSnapshotTree + getMerkleProof from lib/merkle.ts
        // For demo: generate dummy path (won't pass real circuit verification)
        const dummyPathElements = Array(20).fill(0n);
        const dummyPathIndices = Array(20).fill(0);
        const dummyBalance = 1000n * 10n ** 18n; // demo balance

        setStep("witness");

        // Step 3: Compute witness / nullifier
        const addressBigInt = BigInt(inputs.address);
        const secretBigInt = BigInt("0x" + inputs.secret);
        const proposalIdBigInt = BigInt(inputs.proposalId);

        const nullifierHashBigInt = await poseidonHash(
          secretBigInt,
          addressBigInt,
          proposalIdBigInt
        );

        const nullifierHashHex = ("0x" +
          nullifierHashBigInt.toString(16).padStart(64, "0")) as `0x${string}`;

        // Compute leaf to get merkle root for demo
        const leafHash = await poseidonHash(addressBigInt, dummyBalance);
        const merkleRootBigInt = BigInt(inputs.proposal.merkleRoot);

        setStep("proving");

        // Step 4: Generate Groth16 proof
        const result = await generateGroth16Proof({
          secret: secretBigInt,
          voterAddress: addressBigInt,
          balance: dummyBalance,
          pathElements: dummyPathElements,
          pathIndices: dummyPathIndices,
          merkleRoot: merkleRootBigInt,
          nullifierHash: nullifierHashBigInt,
          proposalId: proposalIdBigInt,
          voteValue: inputs.voteValue,
          whaleThresholdBps: inputs.proposal.whaleThresholdBps,
          totalSupply: inputs.proposal.totalSupply,
        });

        setStep("formatting");

        // Step 5: Already formatted by generateGroth16Proof
        setStep("done");
        return result;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        setStep("error");
        return null;
      }
    },
    []
  );

  const reset = useCallback(() => {
    setStep("idle");
    setError(null);
  }, []);

  return { generateProof, step, error, reset };
}
