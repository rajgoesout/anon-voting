"use client";

import { useProposalCount, useProposal } from "@/hooks/useAnonymousVoting";
import { ProposalCard } from "./ProposalCard";

const HIDDEN_PROPOSAL_IDS = new Set([0, 1, 2, 3, 4, 5, 6, 7, 9]);

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
      {Array.from({ length: n }, (_, i) => i).filter((id) => !HIDDEN_PROPOSAL_IDS.has(id)).map((id) => (
        <ProposalItem key={id} id={id} />
      ))}
    </div>
  );
}
