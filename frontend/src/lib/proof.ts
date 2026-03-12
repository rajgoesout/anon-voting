import type { ProofResult } from "@/types";

const WASM_PATH = "/circuits/vote.wasm";
const ZKEY_PATH = "/circuits/vote_final.zkey";

async function checkCircuitFilesExist(): Promise<void> {
  const [wasmRes, zkeyRes] = await Promise.all([
    fetch(WASM_PATH, { method: "HEAD" }),
    fetch(ZKEY_PATH, { method: "HEAD" }),
  ]);

  if (!wasmRes.ok || !zkeyRes.ok) {
    throw new Error(
      "Circuit files not found. Run the trusted setup first (see README.md for instructions)."
    );
  }
}

export interface CircuitInputs {
  secret: bigint;
  voterAddress: bigint;
  balance: bigint;
  pathElements: bigint[];
  pathIndices: number[];
  merkleRoot: bigint;
  nullifierHash: bigint;
  proposalId: bigint;
  voteValue: 0 | 1;
  whaleThresholdBps: bigint;
  totalSupply: bigint;
}

export async function generateGroth16Proof(inputs: CircuitInputs): Promise<ProofResult> {
  await checkCircuitFilesExist();

  const snarkjs = await import("snarkjs");

  const circuitInputs = {
    secret: inputs.secret.toString(),
    voterAddress: inputs.voterAddress.toString(),
    balance: inputs.balance.toString(),
    pathElements: inputs.pathElements.map((e) => e.toString()),
    pathIndices: inputs.pathIndices.map(String),
    merkleRoot: inputs.merkleRoot.toString(),
    nullifierHash: inputs.nullifierHash.toString(),
    proposalId: inputs.proposalId.toString(),
    voteValue: inputs.voteValue.toString(),
    whaleThresholdBps: inputs.whaleThresholdBps.toString(),
    totalSupply: inputs.totalSupply.toString(),
  };

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    circuitInputs,
    WASM_PATH,
    ZKEY_PATH
  );

  // publicSignals order: merkleRoot, nullifierHash, proposalId, voteValue,
  //                      whaleThresholdBps, totalSupply, isWhale
  const isWhale = BigInt(publicSignals[6]) === 1n;
  const nullifierHashHex = ("0x" +
    BigInt(publicSignals[1]).toString(16).padStart(64, "0")) as `0x${string}`;

  const a: [bigint, bigint] = [BigInt(proof.pi_a[0]), BigInt(proof.pi_a[1])];
  const b: [[bigint, bigint], [bigint, bigint]] = [
    [BigInt(proof.pi_b[0][1]), BigInt(proof.pi_b[0][0])],
    [BigInt(proof.pi_b[1][1]), BigInt(proof.pi_b[1][0])],
  ];
  const c: [bigint, bigint] = [BigInt(proof.pi_c[0]), BigInt(proof.pi_c[1])];

  return { nullifierHash: nullifierHashHex, isWhale, a, b, c };
}

export function formatProofForCalldata(proof: ProofResult): {
  a: readonly [bigint, bigint];
  b: readonly [readonly [bigint, bigint], readonly [bigint, bigint]];
  c: readonly [bigint, bigint];
} {
  return { a: proof.a, b: proof.b, c: proof.c };
}
