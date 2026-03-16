import "dotenv/config";
import express from "express";
import cors from "cors";
import { createWalletClient, createPublicClient, http, parseAbi, defineChain } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { anvil, sepolia } from "viem/chains";

// ── Config ────────────────────────────────────────────────────────────────────

const PORT = Number(process.env.PORT ?? 3001);
const RPC_URL = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? "http://localhost:3000";
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS as `0x${string}`;
const RELAYER_PRIVATE_KEY = process.env.RELAYER_PRIVATE_KEY as `0x${string}`;
const CHAIN_ID = Number(process.env.CHAIN_ID ?? 31337);

if (!CONTRACT_ADDRESS) throw new Error("CONTRACT_ADDRESS not set in .env");
if (!RELAYER_PRIVATE_KEY) throw new Error("RELAYER_PRIVATE_KEY not set in .env");

const ABI = parseAbi([
  "function castVote(uint256 proposalId, bytes32 nullifierHash, uint8 voteValue, uint8 isWhale, uint256[2] a, uint256[2][2] b, uint256[2] c) external",
]);

const account = privateKeyToAccount(RELAYER_PRIVATE_KEY);

const BASE_CHAIN = CHAIN_ID === 11155111 ? sepolia : anvil;
const chain = defineChain({
  ...BASE_CHAIN,
  rpcUrls: { default: { http: [RPC_URL] } },
});

const publicClient = createPublicClient({ chain, transport: http(RPC_URL) });
const walletClient = createWalletClient({ account, chain, transport: http(RPC_URL) });

console.log(`Relayer wallet: ${account.address}`);

// ── Express ───────────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());
app.use(cors({ origin: CORS_ORIGIN }));

// Health check
app.get("/health", async (_req, res) => {
  const balance = await publicClient.getBalance({ address: account.address });
  res.json({
    status: "ok",
    relayer: account.address,
    balanceEth: (Number(balance) / 1e18).toFixed(4),
    contract: CONTRACT_ADDRESS,
  });
});

// Relay a castVote call
app.post("/relay", async (req, res) => {
  try {
    const { proposalId, nullifierHash, voteValue, isWhale, a, b, c } = req.body;

    // Basic input validation
    if (
      proposalId === undefined ||
      !nullifierHash ||
      voteValue === undefined ||
      isWhale === undefined ||
      !a || !b || !c
    ) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }

    if (voteValue !== 0 && voteValue !== 1) {
      res.status(400).json({ error: "voteValue must be 0 or 1" });
      return;
    }

    if (isWhale !== 0 && isWhale !== 1) {
      res.status(400).json({ error: "isWhale must be 0 or 1" });
      return;
    }

    console.log(`Relaying vote: proposalId=${proposalId} voteValue=${voteValue} isWhale=${isWhale} nullifier=${nullifierHash}`);

    const hash = await walletClient.writeContract({
      address: CONTRACT_ADDRESS,
      abi: ABI,
      functionName: "castVote",
      args: [
        BigInt(proposalId),
        nullifierHash as `0x${string}`,
        voteValue,
        isWhale,
        [BigInt(a[0]), BigInt(a[1])] as [bigint, bigint],
        [
          [BigInt(b[0][0]), BigInt(b[0][1])],
          [BigInt(b[1][0]), BigInt(b[1][1])],
        ] as [[bigint, bigint], [bigint, bigint]],
        [BigInt(c[0]), BigInt(c[1])] as [bigint, bigint],
      ],
    });

    console.log(`  ✓ tx submitted: ${hash}`);

    // Wait for receipt so frontend gets confirmation
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log(`  ✓ confirmed in block ${receipt.blockNumber}`);

    res.json({ txHash: hash, blockNumber: receipt.blockNumber.toString() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Relay error:", msg);
    res.status(500).json({ error: msg });
  }
});

app.listen(PORT, () => {
  console.log(`\nZK Vote Relayer running on http://localhost:${PORT}`);
  console.log(`  Contract : ${CONTRACT_ADDRESS}`);
  console.log(`  RPC      : ${RPC_URL}`);
  console.log(`  CORS     : ${CORS_ORIGIN}\n`);
});
