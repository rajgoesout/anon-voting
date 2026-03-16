"use client";

import { useWhaleEvents } from "@/hooks/useAnonymousVoting";
import type { WhaleEvent } from "@/types";

interface Props {
  proposalId: number;
}

export function WhaleActivity({ proposalId }: Props) {
  const events = useWhaleEvents(proposalId);

  if (events.length === 0) {
    return (
      <div className="text-sm text-gray-400 italic">No whale activity yet for this proposal.</div>
    );
  }

  return (
      <div className="space-y-2">
      <h3 className="text-sm font-semibold text-gray-600">Whale Activity</h3>
      {events.map((e: WhaleEvent, i: number) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded border border-blue-100 bg-blue-50 p-2 text-sm"
        >
          <span className="text-lg">🐋</span>
          <div>
            <span className="font-medium">{e.voteValue === 1 ? "FOR" : "AGAINST"}</span>
            <span className="ml-2 text-gray-500 text-xs">
              Block {e.blockNumber.toString()} · Tx {e.transactionHash.slice(0, 10)}...
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
