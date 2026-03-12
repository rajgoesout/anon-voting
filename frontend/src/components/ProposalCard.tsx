"use client";

import Link from "next/link";
import type { Proposal } from "@/types";

interface Props {
  proposal: Proposal;
}

export function ProposalCard({ proposal }: Props) {
  const now = Math.floor(Date.now() / 1000);
  const isActive = now >= Number(proposal.startTime) && now <= Number(proposal.deadline);
  const deadlineDate = new Date(Number(proposal.deadline) * 1000).toLocaleDateString();
  const totalVotes = proposal.votesFor + proposal.votesAgainst;
  const forPct = totalVotes > 0n ? Number((proposal.votesFor * 100n) / totalVotes) : 50;

  return (
    <Link href={`/proposal/${proposal.id}`}>
      <div className="rounded-lg border border-gray-200 p-5 hover:border-indigo-300 hover:shadow-sm transition-all cursor-pointer">
        <div className="flex items-start justify-between gap-3 mb-3">
          <h3 className="font-semibold text-gray-900 line-clamp-2">{proposal.description}</h3>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium
              ${proposal.finalized ? (proposal.passed ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700") : isActive ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"}`}
          >
            {proposal.finalized ? (proposal.passed ? "Passed" : "Failed") : isActive ? "Active" : "Ended"}
          </span>
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-xs text-gray-500">
            <span>For: {proposal.votesFor.toString()}</span>
            <span>Against: {proposal.votesAgainst.toString()}</span>
          </div>
          <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-full bg-green-500 transition-all"
              style={{ width: `${forPct}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-400">
            <span>Deadline: {deadlineDate}</span>
            {(proposal.whaleVotesFor + proposal.whaleVotesAgainst) > 0n && (
              <span>🐋 {(proposal.whaleVotesFor + proposal.whaleVotesAgainst).toString()} whale votes</span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
