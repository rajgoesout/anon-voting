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

export async function poseidonHash(...inputs: bigint[]): Promise<bigint> {
  const fn = await getPoseidon();
  return fn(inputs);
}
