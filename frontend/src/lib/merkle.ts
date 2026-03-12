import { poseidonHash } from "./poseidon";
import type { Transfer, MerkleProofData } from "@/types";

const TREE_DEPTH = 20;

export function parseTransferEvents(
  events: Array<{ args: { from: string; to: string; value: bigint }; blockNumber: bigint }>
): Transfer[] {
  return events.map((e) => ({
    from: e.args.from,
    to: e.args.to,
    value: e.args.value,
    blockNumber: e.blockNumber,
  }));
}

export function reconstructBalances(transfers: Transfer[]): Map<string, bigint> {
  const balances = new Map<string, bigint>();

  const sorted = [...transfers].sort((a, b) =>
    a.blockNumber < b.blockNumber ? -1 : a.blockNumber > b.blockNumber ? 1 : 0
  );

  for (const t of sorted) {
    const fromNorm = t.from.toLowerCase();
    const toNorm = t.to.toLowerCase();

    // Mint (from = 0x000...0)
    if (fromNorm === "0x0000000000000000000000000000000000000000") {
      balances.set(toNorm, (balances.get(toNorm) ?? 0n) + t.value);
    } else {
      balances.set(fromNorm, (balances.get(fromNorm) ?? 0n) - t.value);
      balances.set(toNorm, (balances.get(toNorm) ?? 0n) + t.value);
    }
  }

  return balances;
}

export async function buildSnapshotTree(transfers: Transfer[]): Promise<{
  tree: { root: string; leaves: bigint[]; addresses: string[] };
  root: `0x${string}`;
}> {
  const { MerkleTree } = await import("fixed-merkle-tree");

  const balances = reconstructBalances(transfers);

  // Keep only positive balances
  const holders: Array<{ address: string; balance: bigint }> = [];
  for (const [addr, bal] of balances.entries()) {
    if (bal > 0n) holders.push({ address: addr, balance: bal });
  }

  // Sort deterministically
  holders.sort((a, b) => a.address.localeCompare(b.address));

  const addresses = holders.map((h) => h.address);
  const leaves: bigint[] = [];

  for (const h of holders) {
    const leaf = await poseidonHash(BigInt(h.address), h.balance);
    leaves.push(leaf);
  }

  const tree = new MerkleTree(TREE_DEPTH, leaves, {
    hashFunction: (left: bigint, right: bigint) => poseidonHash(left, right),
    zeroElement: 0n,
  });

  const root = ("0x" + BigInt(tree.root as string | bigint).toString(16).padStart(64, "0")) as `0x${string}`;

  return { tree: { root, leaves, addresses }, root };
}

export async function getMerkleProof(
  treeData: { leaves: bigint[]; addresses: string[] },
  targetAddress: string
): Promise<MerkleProofData & { balance: bigint; balances: Map<string, bigint> }> {
  const { MerkleTree } = await import("fixed-merkle-tree");

  const balances = new Map<string, bigint>();
  // We need to reconstruct — pass balances separately in practice
  // For now return mock path — in production wire the transfers through
  const normalized = targetAddress.toLowerCase();
  const idx = treeData.addresses.indexOf(normalized);

  if (idx === -1) {
    throw new Error(`Address ${targetAddress} not found in snapshot`);
  }

  const tree = new MerkleTree(TREE_DEPTH, treeData.leaves, {
    hashFunction: (left: bigint, right: bigint) => poseidonHash(left, right),
    zeroElement: 0n,
  });

  const { pathElements, pathIndices } = tree.proof(treeData.leaves[idx]);

  return {
    pathElements: (pathElements as (bigint | string)[]).map((e) => BigInt(e)),
    pathIndices: (pathIndices as number[]),
    balance: 0n, // caller should look up from reconstructed balances
    balances,
  };
}
