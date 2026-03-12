"use client";

import { useReadContract } from "wagmi";
import { useChainId, useAccount } from "wagmi";
import { getContractAddresses, GOVERNANCE_TOKEN_ABI } from "@/lib/contracts";

export function useGovernanceToken() {
  const chainId = useChainId();
  const { address } = useAccount();

  let contractAddress: `0x${string}` | undefined;
  try {
    contractAddress = getContractAddresses(chainId).governanceToken;
  } catch {
    contractAddress = undefined;
  }

  const { data: balance, isLoading: balanceLoading } = useReadContract({
    address: contractAddress,
    abi: GOVERNANCE_TOKEN_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!contractAddress },
  });

  const { data: totalSupply, isLoading: supplyLoading } = useReadContract({
    address: contractAddress,
    abi: GOVERNANCE_TOKEN_ABI,
    functionName: "totalSupply",
    query: { enabled: !!contractAddress },
  });

  return {
    balance: balance ?? 0n,
    totalSupply: totalSupply ?? 0n,
    isLoading: balanceLoading || supplyLoading,
    contractAddress,
  };
}
