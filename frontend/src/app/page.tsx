"use client";

import dynamic from "next/dynamic";

const ProposalList = dynamic(
  () => import("@/components/ProposalList").then((m) => ({ default: m.ProposalList })),
  { ssr: false }
);

const CreateProposal = dynamic(
  () => import("@/components/CreateProposal").then((m) => ({ default: m.CreateProposal })),
  { ssr: false }
);

export default function HomePage() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2">
        <h1 className="text-2xl font-bold mb-6">Governance Proposals</h1>
        <ProposalList />
      </div>
      <div>
        <CreateProposal />
      </div>
    </div>
  );
}
