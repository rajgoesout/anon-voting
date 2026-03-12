export interface Proposal {
  id: number;
  description: string;
  merkleRoot: `0x${string}`;
  totalSupply: bigint;
  whaleThresholdBps: bigint;
  snapshotBlock: bigint;
  startTime: bigint;
  deadline: bigint;
  votesFor: bigint;
  votesAgainst: bigint;
  whaleVotesFor: bigint;
  whaleVotesAgainst: bigint;
  finalized: boolean;
  passed: boolean;
}

export interface ProofInputs {
  address: string;
  secret: string;
  proposalId: number;
  voteValue: 0 | 1;
  proposal: Proposal;
}

export interface ProofResult {
  nullifierHash: `0x${string}`;
  isWhale: boolean;
  a: [bigint, bigint];
  b: [[bigint, bigint], [bigint, bigint]];
  c: [bigint, bigint];
}

export interface MerkleProofData {
  pathElements: bigint[];
  pathIndices: number[];
}

export interface VoteEvent {
  proposalId: bigint;
  voteValue: number;
  blockNumber: bigint;
  transactionHash: `0x${string}`;
}

export interface WhaleEvent {
  proposalId: bigint;
  voteValue: number;
  blockNumber: bigint;
  transactionHash: `0x${string}`;
}

export interface Transfer {
  from: string;
  to: string;
  value: bigint;
  blockNumber: bigint;
}

export type ProofStep =
  | "idle"
  | "snapshot"
  | "merkle"
  | "witness"
  | "proving"
  | "formatting"
  | "done"
  | "error";
