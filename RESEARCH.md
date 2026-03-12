# Voter Address Anonymity in ZK Voting Systems — Research

## The Fundamental Constraint

**On any public EVM chain, the `from` field of a transaction is a consensus-layer requirement — it cannot be suppressed.** There is no finalized EIP that changes this. Every solution is one of two things: (a) architectural indirection where someone else's address appears as `from`, or (b) moving to a different execution model (Aztec L2) where private inputs including sender identity never reach the sequencer.

---

## What Existing Projects Actually Do

### Semaphore (PSE / Privacy & Scaling Explorations)
The reference protocol for ZK group membership. Their docs explicitly state relayers are needed for full anonymity. Worldcoin uses it in production with a staked relayer registry. Relayers are decentralized but still exist.

### MACI (clr.fund, Gitcoin Grants)
Explicitly does **not** hide voter addresses. Voter's wallet calls `publishMessage()` on-chain — fully visible. What it hides is *vote direction* (encrypted), not *who voted*. Different design goal.

### Aztec Network / Noir (NounsDAO private voting)
The only production-deployed system where the voter's address is genuinely hidden at the protocol level. Aztec built private NounsDAO voting using Noir circuits. Votes execute in a Private Execution Environment (PXE) client-side — the voter's address never leaves the device. The sequencer receives only ZK proofs, not the caller's identity. **No relayer needed.** Tradeoff: you're on Aztec L2, not L1.

### PLUME (ERC-7524) — Most elegant L1-compatible approach
PLUME is a deterministic nullifier scheme that works with your *existing* Ethereum ECDSA key — no pre-registration or on-chain identity commitment. You prove eligibility from your real key, derive a ZK nullifier, submit from a fresh address. The key insight: unlike Semaphore, there's no on-chain registration step that links your real wallet to a commitment before voting. Ledger already supports it. Status: EIP draft, experimental.

### EIP-4337 + Paymaster — Practical middle ground
With AA bundlers, the `from` on-chain is the **bundler's address**, not yours. Your smart account address appears in calldata (not ideal), but it decouples your wallet from the transaction. A Paymaster sponsors gas — no gas bootstrapping problem. Not a "relayer" in the traditional sense — bundlers are permissionless and competitive. Semaphore + EIP-4337 is the most practical L1-compatible path today.

### Vocdoni DAVINCI
Votes submitted to decentralized offchain sequencers; voter address not published on-chain. ZK proofs of correct aggregation committed to L1. In production for real elections. Requires the Vocdoni infrastructure rather than a general-purpose EVM contract.

### Tornado Cash pattern
Uses a commitment-nullifier scheme with a ZK-SNARK proving knowledge of a secret behind a Merkle commitment. Withdrawal via a fresh address. Relies on a decentralized staked relayer registry or self-relay (pre-fund fresh address via a prior small withdrawal). Anonymity depends on the size of the anonymity set. Deprecated/OFAC-sanctioned; instructive as a primitive.

---

## Full Comparison Table

| Approach | Vote content private | Voter address hidden on-chain | Requires centralized relayer | Production deployed |
|---|---|---|---|---|
| Semaphore + relayer | Yes | Yes (via relayer) | Yes (can be decentralized) | Yes (Worldcoin) |
| Semaphore + EIP-4337 | Yes | Partially (bundler is `from`) | No (bundler is permissionless) | Experimental |
| MACI | Yes | No — voter address visible | No | Yes (clr.fund, Gitcoin) |
| Aztec / Noir | Yes | Yes — protocol-level | No | Yes (NounsDAO, testnet) |
| Vocdoni DAVINCI | Yes | Not on-chain | No (decentralized sequencers) | Yes (production) |
| Tornado Cash pattern | Yes (for assets) | Yes (if anonymity set large) | Decentralized relayer registry | Deprecated / OFAC |
| PLUME + fresh address | Yes | Yes (if fresh addr not linked) | No (gas via Paymaster) | Experimental |
| Ring signatures | Yes | No — `from` still visible | Still needed for submission | Research / hackathon |
| EIP-5564 alone | No | Partially | No | Experimental |
| EIP-4337 alone | No | Partially (smart acct in calldata) | No | Yes (40M+ accounts) |

---

## Ranked Options for This System

| Option | Voter address on-chain | Relayer needed | Practical today |
|---|---|---|---|
| **Aztec + Noir** | Hidden at protocol level | No | Yes (L2) |
| **Semaphore + EIP-4337 bundler** | Bundler's address, not yours | No (bundler is permissionless) | Yes (L1) |
| **PLUME (ERC-7524) + fresh address** | Fresh addr not linked to you | No (gas via Paymaster) | Experimental |
| **Tornado Cash pattern (decentralized relayer registry)** | Hidden if anonymity set large | Decentralized registry | Deprecated / OFAC |
| **Current system (direct MetaMask tx)** | Fully visible | No | Yes, but no privacy |

---

## Recommendations for This System

### Short term (local / demo)
The current system is fine. The ZK circuit correctly proves whale status, nullifiers prevent double-voting, vote direction is not linkable to an address through the contract or events. The `from` leak only matters in production when the anonymity set is large enough to matter.

### For real deployment — two clear paths

**Path A — Stay on EVM L1, use EIP-4337**

Modify `castVote` to accept EIP-4337 UserOperations. A voter constructs a proof in the browser, wraps it in a UserOp, submits to any bundler (Pimlico, Alchemy, Stackup). A Paymaster sponsors gas. No dedicated relayer service needed. The bundler's address is `from` on-chain, not the voter's wallet.

**Path B — Port to Aztec / Noir**

Rewrite the voting circuit in Noir instead of Circom. Deploy on Aztec L2. The voter's address is architecturally hidden — the sequencer never sees it. Aztec's sandbox is local-dev-friendly. NounsDAO already proved this pattern works at production scale.

---

## Notes on the Vote Secret

The "Vote Secret" in the current UI is random entropy used solely to derive the nullifier:

```
nullifierHash = Poseidon(secret, voterAddress, proposalId)
```

Once the proof is submitted on-chain, the secret serves no further purpose. The proof is self-contained and verifiable by anyone from the on-chain data. The voter does not need to remember the secret, cannot use it to "prove" their vote to others (doing so would also reveal their address), and should never share it — revealing the secret lets any observer recompute the nullifier and link it to the voter's address.

The secret should be auto-generated, never shown to the user, and discarded after the proof is generated.

---

## Sources

- [Semaphore Docs — Private Voting Use Case](https://docs.semaphore.pse.dev/V2/use-cases/private-voting)
- [MACI — maci.pse.dev](https://maci.pse.dev/)
- [Anonymity in MACI — 3327](https://3327.io/anonymity-in-maci/)
- [NounsDAO Private Voting Final Update — Aztec](https://aztec.network/blog/nounsdao-private-voting-final-update)
- [Aztec Transactions Concepts](https://docs.aztec.network/developers/docs/concepts/transactions)
- [ERC-4337: Account Abstraction Using Alt Mempool](https://eips.ethereum.org/EIPS/eip-4337)
- [ERC-5564: Stealth Addresses](https://eips.ethereum.org/EIPS/eip-5564)
- [ERC-7524: PLUME Signature in Wallets](https://eips.ethereum.org/EIPS/eip-7524)
- [PLUME: Unique Pseudonymity with Ethereum — Aayush Gupta](https://blog.aayushg.com/nullifier/)
- [How Tornado Cash Works — RareSkills](https://rareskills.io/post/how-does-tornado-cash-work)
- [DAVINCI Protocol Whitepaper — Vocdoni](https://hackmd.io/@vocdoni/BJY8EXQy1x)
- [EIP-7503: Zero-Knowledge Wormholes](https://eips.ethereum.org/EIPS/eip-7503)
