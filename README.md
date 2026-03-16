# ZK Anonymous Voting

Privacy-preserving on-chain governance using Groth16 zero-knowledge proofs on Ethereum.

## Architecture

```
 Off-chain                          ZK Circuit                    On-chain
 ─────────                          ──────────                    ────────
  Transfer
  events  ──→ Reconstruct   ──→  Merkle inclusion ──→  AnonymousVoting.castVote()
              balances           proof (private)         │
                                      │                  │  Verifier.verifyProof()
              Poseidon leaf ──→  Nullifier hash   ──→    │  nullifierUsed[id][hash]
              Poseidon hash       (public)               │
                                      │                  ├─ VoteCast event
              Whale check   ──→  isWhale output   ──→    └─ WhaleVoted event (if whale)
              (balance ≥ bps%)   (constrained)
```

## Privacy Model

| Signal          | Visibility  | Notes                        |
| --------------- | ----------- | ---------------------------- |
| Voter address   | **Private** | Never sent on-chain          |
| Token balance   | **Private** | Used only in circuit         |
| Vote direction  | **Public**  | FOR or AGAINST in event      |
| Nullifier hash  | **Public**  | Prevents double voting       |
| Is whale        | **Public**  | Binary — no balance revealed |
| Whale direction | **Public**  | WhaleVoted event if whale    |

**What stays private:** Your identity, your exact balance, your position among all holders.

**What is public:** That _someone_ voted, which direction the vote went, and whether a whale voted. The whale's identity remains hidden — only the direction is revealed.

**Nullifier scheme:** `nullifierHash = Poseidon(secret, voterAddress, proposalId)`. Your secret is never sent on-chain. The nullifier prevents double-voting without revealing who voted.

**Whale detection without doxing:** The circuit proves `balance × 10000 ≥ whaleThresholdBps × totalSupply` using a `GreaterEqThan(120)` comparator. Only the boolean result is a public output.

---

## Prerequisites

Install these before anything else.

```bash
# Node.js ≥ 18 (check with: node --version)
# pnpm
npm install -g pnpm

# Foundry (forge, anvil, cast)
curl -L https://foundry.paradigm.xyz | bash
foundryup

# Rust (needed to build circom from source)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"

# circom 2.x
cargo install --git https://github.com/iden3/circom

# snarkjs
pnpm add -g snarkjs
```

Verify:

```bash
node --version       # ≥ 18
forge --version
circom --version     # ≥ 2.0
snarkjs --version
```

---

## Part 1 — Contracts

### 1.1 Install dependencies

```bash
# From repo root
pnpm install

# Foundry libraries (OpenZeppelin)
cd contracts
forge install
cd ..
```

### 1.2 Compile contracts

```bash
cd contracts
forge build
```

Expected output: `Compiler run successful!` with no errors.

### 1.3 Run unit tests (MockVerifier, no circuits needed)

```bash
cd contracts
forge test -vvv
```

All 23 tests should pass. These use `MockVerifier` which always returns `true`, so no ZK proof is needed at this stage.

---

## Part 2 — Circuit

> The circuit must be compiled and the trusted setup run **before** the frontend can generate real proofs, and before the real `Verifier.sol` can be generated.

### 2.1 Install circomlib

The circuit imports circomlib. Install it inside `contracts/`:

```bash
cd contracts
npm init -y          # creates a package.json if not present
npm install circomlibjs circomlib
```

> circomlib is a Node package that ships the `.circom` source files. The `--include` path circom uses is `node_modules/circomlib/circuits/`.

### 2.2 Compile the circuit

```bash
cd contracts
mkdir -p circuits/build

circom circuits/vote.circom --r1cs --wasm --sym -l ../node_modules -o circuits/build/
```

This produces:

- `circuits/build/vote.r1cs` — the rank-1 constraint system
- `circuits/build/vote_js/vote.wasm` — the witness generator (used by the frontend)
- `circuits/build/vote.sym` — symbol file for debugging

> The circuit has ~12k constraints (Merkle depth 20 × Poseidon). Compilation takes 1–3 minutes.

### 2.3 Trusted setup — Phase 1 (Powers of Tau)

The circuit has ~12k constraints, so you need a ptau file supporting at least 2^15 = 32,768 constraints.

**Option A — Download Hermez ceremony file (recommended, ~100 MB):**

```bash
cd contracts/circuits/build

curl -O https://hermez.s3-eu-west-1.amazonaws.com/powersOfTau28_hez_final_15.ptau
```

This file already has hundreds of contributors and is production-grade. Skip to step 2.4 after this.

**Option B — Generate your own (development only, ~5 min):**

```bash
cd contracts

# Generate initial ptau — power 15 supports up to 2^15 = 32,768 constraints
snarkjs powersoftau new bn128 15 circuits/build/pot15_0000.ptau -v

# Contribute randomness (type any random text when prompted)
snarkjs powersoftau contribute \
  circuits/build/pot15_0000.ptau \
  circuits/build/pot15_0001.ptau \
  --name="local-dev" -v

# Prepare for phase 2
snarkjs powersoftau prepare phase2 \
  circuits/build/pot15_0001.ptau \
  circuits/build/powersOfTau28_hez_final_15.ptau -v
```

### 2.4 Trusted setup — Phase 2 (circuit-specific)

```bash
cd contracts

# Groth16 setup — binds the ptau to the circuit
snarkjs groth16 setup \
  circuits/build/vote.r1cs \
  circuits/build/powersOfTau28_hez_final_15.ptau \
  circuits/build/vote_0000.zkey

# Add your contribution (type random text when prompted)
snarkjs zkey contribute \
  circuits/build/vote_0000.zkey \
  circuits/build/vote_final.zkey \
  --name="local-dev" -v
```

### 2.5 Export the verification key and Solidity verifier

```bash
cd contracts

# Export JSON verification key (used by snarkjs to verify proofs off-chain)
snarkjs zkey export verificationkey \
  circuits/build/vote_final.zkey \
  circuits/build/verification_key.json

# Generate the real Verifier.sol — this REPLACES the stub
snarkjs zkey export solidityverifier \
  circuits/build/vote_final.zkey \
  src/Verifier.sol
```

After this step, `src/Verifier.sol` contains the real Groth16 verifier contract. Recompile:

```bash
cd contracts
forge build
```

### 2.6 Verify a test proof (optional sanity check)

```bash
cd contracts

# Generate a dummy input file
cat > circuits/build/input.json << 'EOF'
{
  "secret": "1234567890",
  "voterAddress": "123456789",
  "balance": "1000000000000000000000",
  "pathElements": ["0","0","0","0","0","0","0","0","0","0","0","0","0","0","0","0","0","0","0","0"],
  "pathIndices":  ["0","0","0","0","0","0","0","0","0","0","0","0","0","0","0","0","0","0","0","0"],
  "merkleRoot": "0",
  "nullifierHash": "0",
  "proposalId": "0",
  "voteValue": "1",
  "whaleThresholdBps": "1000",
  "totalSupply": "1000000000000000000000000"
}
EOF

# Generate witness
node circuits/build/vote_js/generate_witness.js \
  circuits/build/vote_js/vote.wasm \
  circuits/build/input.json \
  circuits/build/witness.wtns

# Generate proof
snarkjs groth16 prove \
  circuits/build/vote_final.zkey \
  circuits/build/witness.wtns \
  circuits/build/proof.json \
  circuits/build/public.json

# Verify proof locally
snarkjs groth16 verify \
  circuits/build/verification_key.json \
  circuits/build/public.json \
  circuits/build/proof.json
```

Expected: `OK!`

> Note: the dummy input above will fail the nullifier constraint (nullifierHash won't match). Use correct computed values when testing end-to-end.

---

## Part 3 — Local Deployment (Anvil Mainnet Fork)

Using a mainnet fork lets you interact with real ERC-20 token holders and Transfer event history without deploying to mainnet.

### 3.1 Start anvil with a mainnet fork

You need an RPC URL. Get a free one from Alchemy or Infura.

```bash
# In a dedicated terminal — keep it running
anvil \
  --fork-url https://eth-mainnet.g.alchemy.com/v2/<YOUR_ALCHEMY_KEY> \
  --fork-block-number 21000000 \
  --chain-id 31337 \
  --port 8545
```

Flags:

- `--fork-block-number` — pins the fork to a specific block so results are reproducible. Pick a recent block number.
- `--chain-id 31337` — anvil's default; MetaMask/RainbowKit will recognise it as "Localhost".
- Remove `--fork-url` for a plain local chain (no real token history).

Anvil prints 10 funded accounts with their private keys. The first one is the default deployer:

```
Private Key: 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
Address:     0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
```

### 3.2 Create a `.env` file in `contracts/`

```bash
cat > contracts/.env << 'EOF'
PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
MAINNET_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/<YOUR_ALCHEMY_KEY>
EOF
```

### 3.3 Deploy contracts

```bash
cd contracts
source .env

forge script script/Deploy.s.sol \
  --rpc-url http://127.0.0.1:8545 \
  --private-key $PRIVATE_KEY \
  --broadcast \
  -vvv
```

The script deploys in order: `MockVerifier` → `GovernanceToken` → `AnonymousVoting`. It prints all three addresses:

```
MockVerifier deployed at:   0x5FbDB2315678afecb367f032d93F642f64180aa3
GovernanceToken deployed at: 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
AnonymousVoting deployed at: 0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
```

Save these — you need them in the next step.

> If you've already run the real Verifier.sol setup (Part 2), replace `MockVerifier` in `Deploy.s.sol` with the real verifier contract name before broadcasting.

### 3.4 Run integration tests against the fork

```bash
cd contracts

# Run all tests against the forked chain
forge test \
  --fork-url http://127.0.0.1:8545 \
  -vvv
```

This runs the same 23 unit tests but against the live forked state. The MockVerifier means ZK proofs are bypassed — all vote tests pass immediately.

### 3.5 Manual cast commands (optional)

Use `cast` to interact with deployed contracts directly:

```bash
# Check proposal count
cast call <ANONYMOUS_VOTING_ADDR> "proposalCount()(uint256)" \
  --rpc-url http://127.0.0.1:8545

# Check ZKGOV balance of deployer
cast call <GOVERNANCE_TOKEN_ADDR> \
  "balanceOf(address)(uint256)" \
  0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 \
  --rpc-url http://127.0.0.1:8545

# Create a test proposal (bytes32 merkleRoot as 0x000...001)
cast send <ANONYMOUS_VOTING_ADDR> \
  "createProposal(string,bytes32,uint256,uint256,uint256)" \
  "Test proposal" \
  "0x0000000000000000000000000000000000000000000000000000000000000001" \
  "1000000000000000000000000" \
  "1000" \
  "604800" \
  --rpc-url http://127.0.0.1:8545 \
  --private-key $PRIVATE_KEY
```

---

## Part 4 — Frontend

### 4.1 Update contract addresses

Edit `frontend/src/lib/contracts.ts` and fill in the addresses from the deployment output:

```typescript
const ADDRESSES = {
  31337: {
    anonymousVoting: "0x610178dA211FEF7D417bC0e6FeD39F05609AD788", // ← your address
    governanceToken: "0x8A791620dd6260079BF849Dc5567aDC3F2FdC318", // ← your address
  },
  // ...
};
```

### 4.2 Copy circuit files

After completing Part 2:

```bash
mkdir -p frontend/public/circuits
cp contracts/circuits/build/vote_js/vote.wasm frontend/public/circuits/vote.wasm
cp contracts/circuits/build/vote_final.zkey   frontend/public/circuits/vote_final.zkey
```

> If you skip this step, the frontend still runs but the "Generate Proof & Vote" button shows: _"Circuit files not found. Run the trusted setup first."_

### 4.3 Create a `.env.local` in `frontend/`

```bash
cat > frontend/.env.local << 'EOF'
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_project_id_from_walletconnect_cloud
NEXT_PUBLIC_MAINNET_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/<YOUR_KEY>
NEXT_PUBLIC_SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/<YOUR_KEY>
EOF
```

`NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` is required by RainbowKit. Get a free one at [cloud.walletconnect.com](https://cloud.walletconnect.com). Without it, wallet connection still works in dev mode with a warning.

### 4.4 Start the frontend

```bash
# From repo root
pnpm dev

# Or directly
cd frontend
pnpm dev
```

Opens at `http://localhost:3000`.

### 4.5 Connect MetaMask to local anvil

1. Open MetaMask → Settings → Networks → Add Network:
   - Network name: `Anvil Local`
   - RPC URL: `http://127.0.0.1:8545`
   - Chain ID: `31337`
   - Currency symbol: `ETH`
2. Import a test account: In MetaMask → Import Account → paste one of anvil's private keys (e.g. `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`)
3. The account will have 10000 ETH (anvil default) and 1,000,000 ZKGOV (minted on deploy).

---

## Part 4b — Sepolia Deployment

### 4b.1 Set your RPC URL and deployer key

Fill in your real Alchemy/Infura key and a wallet private key that has Sepolia ETH:

```bash
# contracts/.env
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/<YOUR_KEY>
PRIVATE_KEY=0x<your_sepolia_deployer_private_key>
```

Get Sepolia ETH from [sepoliafaucet.com](https://sepoliafaucet.com).

### 4b.2 Deploy to Sepolia

```bash
cd contracts
source .env

forge script script/Deploy.s.sol \
  --rpc-url sepolia \
  --private-key $PRIVATE_KEY \
  --broadcast \
  --verify \
  -vvv
```

`--verify` submits source code to Etherscan automatically (requires `ETHERSCAN_API_KEY` in `.env` if you want verification). Leave it out if not needed.

Note the three deployed addresses from the output.

### 4b.3 Update frontend contract addresses

Edit `frontend/src/lib/contracts.ts`:

```typescript
11155111: {
  anonymousVoting: "0x<your_deployed_address>",
  governanceToken: "0x<your_deployed_address>",
},
```

### 4b.4 Update frontend RPC

```bash
# frontend/.env.local
NEXT_PUBLIC_SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/<YOUR_KEY>
```

### 4b.5 Update relayer for Sepolia

```bash
# relayer/.env
CHAIN_ID=11155111
RPC_URL=https://eth-sepolia.g.alchemy.com/v2/<YOUR_KEY>
CONTRACT_ADDRESS=0x<your_sepolia_anonymousvoting_address>
RELAYER_PRIVATE_KEY=0x<a_funded_sepolia_wallet_private_key>
```

The relayer wallet needs Sepolia ETH to pay gas for `castVote` transactions.

---

## Part 5 — Relayer (Voter Identity Privacy)

Without the relayer, the voter's wallet submits the `castVote` transaction directly, making the voter's address (`from`) visible on-chain. The ZK proof hides the vote direction and balance, but the sender identity leaks.

The relayer solves this: the voter's browser generates the proof, then POSTs it to a local relayer server. The relayer submits the transaction from **its own address** — the voter's address never appears on-chain.

> The contract does not use `msg.sender` in `castVote`, so this requires no contract changes.

### 5.1 Create the relayer `.env`

```bash
cp relayer/.env.example relayer/.env
```

The `.env.example` already contains the correct values for a local anvil setup:

- `RELAYER_PRIVATE_KEY` — anvil account[1] (different from the deployer)
- `CONTRACT_ADDRESS` — must match the deployed `AnonymousVoting` address
- `PORT=3001`
- `CORS_ORIGIN=http://localhost:3000`

Update `CONTRACT_ADDRESS` if you redeployed.

### 5.2 Start the relayer

```bash
# In a dedicated terminal
pnpm relay:dev
```

Or directly:

```bash
cd relayer
pnpm dev
```

Output:

```
Relayer wallet: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8
ZK Vote Relayer running on http://localhost:3001
  Contract : 0x610178dA211FEF7D417bC0e6FeD39F05609AD788
  RPC      : http://127.0.0.1:8545
  CORS     : http://localhost:3000
```

### 5.3 Health check

```bash
curl http://localhost:3001/health
# {"status":"ok","relayer":"0x70997970...","balanceEth":"10000.0000","contract":"0x6101..."}
```

The relayer needs ETH to pay gas. The default anvil account[1] has 10,000 ETH, so this is not a concern for local dev.

---

## Part 6 — Full End-to-End Flow

This section describes the complete sequence from contract deployment to casting an anonymous vote.

### Step 1 — Create a proposal (frontend or cast)

In the frontend, connect your wallet, fill in the "Create Proposal" form, click **Compute Snapshot Merkle Root** (this queries Transfer events from the local chain), then submit. The Merkle root is computed from the current holder snapshot.

### Step 2 — Prepare proof inputs (browser)

In the frontend, navigate to the proposal → `VotePanel`:

1. Save the auto-generated **secret** (hex string) somewhere safe — you need it to prove your vote.
2. Select **FOR** or **AGAINST**.
3. Click **Generate Proof & Vote**.

The browser:

1. Queries Transfer events from the contract's `snapshotBlock` to reconstruct balances.
2. Builds a Poseidon Merkle tree of all holders.
3. Computes your Merkle path.
4. Computes `nullifierHash = Poseidon(secret, address, proposalId)`.
5. Calls `snarkjs.groth16.fullProve()` with `vote.wasm` + `vote_final.zkey`.
6. Formats `a, b, c` proof arrays for Solidity calldata.
7. POSTs `{proposalId, nullifierHash, voteValue, isWhale, a, b, c}` to the relayer at `http://localhost:3001/relay`.
8. The relayer submits `AnonymousVoting.castVote()` from its own wallet — the voter's address never appears on-chain.

> Proof generation takes 5–30 seconds in the browser depending on hardware.

### Step 3 — Verify the vote landed

```bash
# Check vote counts
cast call <ANONYMOUS_VOTING_ADDR> \
  "getVoteCounts(uint256)(uint256,uint256,uint256,uint256)" 0 \
  --rpc-url http://127.0.0.1:8545
```

### Step 4 — Finalize (after deadline)

```bash
# Fast-forward time past the proposal deadline
cast rpc anvil_increaseTime 604801 --rpc-url http://127.0.0.1:8545
cast rpc anvil_mine --rpc-url http://127.0.0.1:8545

# Finalize
cast send <ANONYMOUS_VOTING_ADDR> \
  "finalizeProposal(uint256)" 0 \
  --rpc-url http://127.0.0.1:8545 \
  --private-key $PRIVATE_KEY
```

Or click **Finalize Proposal** in the frontend after advancing time.

---

## Deployment Summary

| Step             | Command                                                                              | Directory    |
| ---------------- | ------------------------------------------------------------------------------------ | ------------ |
| Start anvil fork | `anvil --fork-url <RPC> --fork-block-number <N>`                                     | any          |
| Deploy contracts | `forge script script/Deploy.s.sol --rpc-url localhost --broadcast`                   | `contracts/` |
| Compile circuit  | `circom circuits/vote.circom --r1cs --wasm --sym -l node_modules -o circuits/build/` | `contracts/` |
| Trusted setup    | see Part 2.3–2.5                                                                     | `contracts/` |
| Copy artifacts   | `cp circuits/build/vote_js/vote.wasm ../frontend/public/circuits/`                   | `contracts/` |
| Update addresses | edit `frontend/src/lib/contracts.ts`                                                 | `frontend/`  |
| Start relayer    | `pnpm relay:dev`                                                                     | root         |
| Start frontend   | `pnpm dev`                                                                           | root         |

---

## Public Signals Layout

| Index | Name                | Visibility      | Description                                                                              |
| ----- | ------------------- | --------------- | ---------------------------------------------------------------------------------------- |
| 0     | `isWhale`           | Public (output) | 1 if `balance × 10000 ≥ whaleThresholdBps × totalSupply` — outputs come first in snarkjs |
| 1     | `merkleRoot`        | Public          | Poseidon root of (address, balance) snapshot tree                                        |
| 2     | `nullifierHash`     | Public          | `Poseidon(secret, voterAddress, proposalId)`                                             |
| 3     | `proposalId`        | Public          | Links proof to specific proposal                                                         |
| 4     | `voteValue`         | Public          | 0 = Against, 1 = For                                                                     |
| 5     | `whaleThresholdBps` | Public          | e.g., 1000 = 10%                                                                         |
| 6     | `totalSupply`       | Public          | Token supply at snapshot block                                                           |

---

## Security Notes

- **MockVerifier is for testing only.** `MockVerifier.sol` always returns `true`. Replace it by running the trusted setup (Part 2) and re-deploying with the generated `Verifier.sol`.
- **Nullifier linkability.** `Poseidon(secret, address, proposalId)` binds your secret to a specific proposal. Reusing the same secret across proposals lets an observer link those nullifiers to the same voter. Generate a fresh secret per vote.
- **Merkle snapshot integrity.** The `merkleRoot` is computed from Transfer events up to `snapshotBlock`. Anyone can independently verify it by replaying the same events. The contract stores the root at proposal creation time and it is immutable thereafter.
- **Trusted setup.** Groth16 requires a trusted setup. For production: use the Hermez ceremony ptau (Option B above) for Phase 1, and run Phase 2 with multiple independent contributors. The security guarantee is "at least one contributor destroyed their randomness."
- **Whale threshold bounds.** Enforced on-chain to be in [1, 10000] bps. The circuit enforces the same arithmetic via a public signal — the two must agree or `verifyProof` reverts.
- **Field arithmetic.** Balance values must fit within BN254's scalar field (< 2^254). Since balanceBits=96 and totalSupply is a standard ERC-20, products stay well within this bound.
