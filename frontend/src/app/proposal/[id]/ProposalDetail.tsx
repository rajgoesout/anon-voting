"use client";

import { useProposal, useFinalizeProposal } from "@/hooks/useAnonymousVoting";
import { VotePanel } from "@/components/VotePanel";
import { WhaleActivity } from "@/components/WhaleActivity";

interface Props {
  id: number;
}

export function ProposalDetail({ id }: Props) {
  const { data: proposal, isLoading } = useProposal(id);
  const { finalizeProposal, isPending } = useFinalizeProposal();

  if (isLoading) return <div className="animate-pulse h-48 bg-gray-100 rounded-lg" />;
  if (!proposal) return <div className="text-center py-12 text-gray-500">Proposal not found.</div>;

  const now = Math.floor(Date.now() / 1000);
  const canFinalize = !proposal.finalized && now > Number(proposal.deadline);
  const deadlineDate = new Date(Number(proposal.deadline) * 1000).toLocaleString();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2 space-y-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-bold">{proposal.description}</h1>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium
              ${proposal.finalized ? (proposal.passed ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700") : "bg-blue-100 text-blue-700"}`}
            >
              {proposal.finalized ? (proposal.passed ? "Passed" : "Failed") : "Active"}
            </span>
          </div>
          <p className="text-sm text-gray-500">Deadline: {deadlineDate}</p>
          <p className="text-sm text-gray-500">
            Whale threshold: {(Number(proposal.whaleThresholdBps) / 100).toFixed(2)}%
          </p>
          <p className="text-xs text-gray-400 font-mono break-all mt-1">
            Merkle root: {proposal.merkleRoot}
          </p>
        </div>

        <div className="rounded-lg border border-gray-200 p-5">
          <h2 className="font-semibold mb-3">Vote Tally</h2>
          <div className="grid grid-cols-2 gap-4 text-center">
            <div className="rounded bg-green-50 p-3">
              <div className="text-2xl font-bold text-green-700">{proposal.votesFor.toString()}</div>
              <div className="text-sm text-green-600">For</div>
              <div className="text-xs text-gray-400">({proposal.whaleVotesFor.toString()} 🐋)</div>
            </div>
            <div className="rounded bg-red-50 p-3">
              <div className="text-2xl font-bold text-red-700">{proposal.votesAgainst.toString()}</div>
              <div className="text-sm text-red-600">Against</div>
              <div className="text-xs text-gray-400">({proposal.whaleVotesAgainst.toString()} 🐋)</div>
            </div>
          </div>
          {canFinalize && (
            <button
              onClick={() => finalizeProposal(BigInt(id))}
              disabled={isPending}
              className="mt-4 w-full rounded bg-gray-800 py-2 text-white text-sm hover:bg-gray-700 disabled:opacity-50"
            >
              {isPending ? "Finalizing…" : "Finalize Proposal"}
            </button>
          )}
        </div>

        <div className="rounded-lg border border-gray-200 p-5">
          <WhaleActivity proposalId={id} />
        </div>
      </div>

      <div>
        <VotePanel proposal={proposal} />
      </div>
    </div>
  );
}
