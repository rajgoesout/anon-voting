import type { PublicClient } from "viem";
import type { Transfer } from "@/types";

const TRANSFER_EVENT = {
  type: "event",
  name: "Transfer",
  inputs: [
    { name: "from", type: "address", indexed: true },
    { name: "to", type: "address", indexed: true },
    { name: "value", type: "uint256", indexed: false },
  ],
} as const;

const DEFAULT_BLOCK_RANGE = 45_000n;
const SEPOLIA_TRANSFER_START_BLOCK = 10_456_250n;

export function getDefaultTransferStartBlock(chainId: number): bigint {
  if (chainId === 11155111) return SEPOLIA_TRANSFER_START_BLOCK;
  return 0n;
}

export async function fetchTransferLogsChunked(
  publicClient: PublicClient,
  tokenAddress: `0x${string}`,
  toBlock: bigint,
  options?: {
    fromBlock?: bigint;
    maxBlockRange?: bigint;
    onChunkStart?: (fromBlock: bigint, toBlock: bigint) => void;
  }
): Promise<Transfer[]> {
  const fromBlock = options?.fromBlock ?? 0n;
  const maxBlockRange = options?.maxBlockRange ?? DEFAULT_BLOCK_RANGE;
  const transfers: Transfer[] = [];

  for (let start = fromBlock; start <= toBlock; start += maxBlockRange) {
    const end = start + maxBlockRange - 1n > toBlock ? toBlock : start + maxBlockRange - 1n;

    options?.onChunkStart?.(start, end);

    const logs = await publicClient.getLogs({
      address: tokenAddress,
      event: TRANSFER_EVENT,
      fromBlock: start,
      toBlock: end,
    });

    transfers.push(
      ...logs.map((log) => ({
        from: log.args.from as string,
        to: log.args.to as string,
        value: log.args.value as bigint,
        blockNumber: log.blockNumber ?? 0n,
      }))
    );
  }

  return transfers;
}
