"use client";

import { useProposalCount, useProposal } from "@/hooks/useAnonymousVoting";
import { ProposalCard } from "./ProposalCard";

function ProposalItem({ id }: { id: number }) {
  const { data: proposal, isLoading } = useProposal(id);
  if (isLoading) return <div className="h-24 rounded-lg bg-gray-100 animate-pulse" />;
  if (!proposal) return null;
  return <ProposalCard proposal={proposal} />;
}

export function ProposalList() {
  const { data: count, isLoading } = useProposalCount();

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-lg bg-gray-100 animate-pulse" />
        ))}
      </div>
    );
  }

  const n = count ? Number(count) : 0;

  if (n === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        No proposals yet. Create the first one!
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {Array.from({ length: n }, (_, i) => (
        <ProposalItem key={i} id={i} />
      ))}
    </div>
  );
}
