// Contract addresses per chainId
// Fill in testnet/mainnet addresses after deployment
const ADDRESSES: Record<number, { anonymousVoting: `0x${string}`; governanceToken: `0x${string}` }> = {
  31337: {
    anonymousVoting: "0x610178dA211FEF7D417bC0e6FeD39F05609AD788",
    governanceToken: "0x8A791620dd6260079BF849Dc5567aDC3F2FdC318",
  },
  11155111: {
    // Sepolia — fill after deployment
    anonymousVoting: "0x0000000000000000000000000000000000000000",
    governanceToken: "0x0000000000000000000000000000000000000000",
  },
};

export function getContractAddresses(chainId: number) {
  const addrs = ADDRESSES[chainId];
  if (!addrs) throw new Error(`No contract addresses configured for chainId ${chainId}`);
  return addrs;
}

export const ANONYMOUS_VOTING_ABI = [
  {
    type: "constructor",
    inputs: [{ name: "_verifier", type: "address" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "createProposal",
    inputs: [
      { name: "description", type: "string" },
      { name: "merkleRoot", type: "bytes32" },
      { name: "totalSupply", type: "uint256" },
      { name: "whaleThresholdBps", type: "uint256" },
      { name: "snapshotBlock", type: "uint256" },
      { name: "votingDuration", type: "uint256" },
    ],
    outputs: [{ name: "proposalId", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "castVote",
    inputs: [
      { name: "proposalId", type: "uint256" },
      { name: "nullifierHash", type: "bytes32" },
      { name: "voteValue", type: "uint8" },
      { name: "isWhale", type: "uint8" },
      { name: "a", type: "uint256[2]" },
      { name: "b", type: "uint256[2][2]" },
      { name: "c", type: "uint256[2]" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "finalizeProposal",
    inputs: [{ name: "proposalId", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "getProposal",
    inputs: [{ name: "proposalId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "description", type: "string" },
          { name: "merkleRoot", type: "bytes32" },
          { name: "totalSupply", type: "uint256" },
          { name: "whaleThresholdBps", type: "uint256" },
          { name: "snapshotBlock", type: "uint256" },
          { name: "startTime", type: "uint256" },
          { name: "deadline", type: "uint256" },
          { name: "votesFor", type: "uint256" },
          { name: "votesAgainst", type: "uint256" },
          { name: "whaleVotesFor", type: "uint256" },
          { name: "whaleVotesAgainst", type: "uint256" },
          { name: "finalized", type: "bool" },
          { name: "passed", type: "bool" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getVoteCounts",
    inputs: [{ name: "proposalId", type: "uint256" }],
    outputs: [
      { name: "votesFor", type: "uint256" },
      { name: "votesAgainst", type: "uint256" },
      { name: "whaleFor", type: "uint256" },
      { name: "whaleAgainst", type: "uint256" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "isNullifierUsed",
    inputs: [
      { name: "proposalId", type: "uint256" },
      { name: "nullifier", type: "bytes32" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "proposalCount",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "ProposalCreated",
    inputs: [
      { name: "proposalId", type: "uint256", indexed: true },
      { name: "description", type: "string", indexed: false },
      { name: "merkleRoot", type: "bytes32", indexed: false },
      { name: "whaleThresholdBps", type: "uint256", indexed: false },
      { name: "deadline", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "VoteCast",
    inputs: [
      { name: "proposalId", type: "uint256", indexed: true },
      { name: "voteValue", type: "uint8", indexed: false },
    ],
  },
  {
    type: "event",
    name: "WhaleVoted",
    inputs: [
      { name: "proposalId", type: "uint256", indexed: true },
      { name: "voteValue", type: "uint8", indexed: false },
    ],
  },
  {
    type: "event",
    name: "ProposalFinalized",
    inputs: [
      { name: "proposalId", type: "uint256", indexed: true },
      { name: "passed", type: "bool", indexed: false },
      { name: "votesFor", type: "uint256", indexed: false },
      { name: "votesAgainst", type: "uint256", indexed: false },
    ],
  },
] as const;

export const GOVERNANCE_TOKEN_ABI = [
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "totalSupply",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "decimals",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "name",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "symbol",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "transfer",
    inputs: [
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "value", type: "uint256", indexed: false },
    ],
  },
] as const;
