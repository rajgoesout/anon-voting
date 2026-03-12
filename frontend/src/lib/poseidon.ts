// Poseidon hash singleton — expensive to build, cache at module level
let poseidonFn: ((inputs: bigint[]) => bigint) | null = null;

async function getPoseidon(): Promise<(inputs: bigint[]) => bigint> {
  if (poseidonFn) return poseidonFn;

  const { buildPoseidon } = await import("circomlibjs");
  const poseidon = await buildPoseidon();

  poseidonFn = (inputs: bigint[]): bigint => {
    const result = poseidon(inputs);
    return poseidon.F.toObject(result) as bigint;
  };

  return poseidonFn;
}

/** Async version — use when you can await (hooks, event handlers). */
export async function poseidonHash(...inputs: bigint[]): Promise<bigint> {
  const fn = await getPoseidon();
  return fn(inputs);
}

/**
 * Sync version — only safe to call AFTER awaiting initPoseidon() once.
 * Throws if the singleton hasn't been initialised yet.
 */
export function poseidonHashSync(...inputs: bigint[]): bigint {
  if (!poseidonFn) throw new Error("Poseidon not initialised — await initPoseidon() first");
  return poseidonFn(inputs);
}

/** Pre-warm the singleton. Call this before constructing a MerkleTree. */
export async function initPoseidon(): Promise<void> {
  await getPoseidon();
}
