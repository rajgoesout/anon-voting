"use client";

import dynamic from "next/dynamic";
import { use } from "react";

const ProposalDetailClient = dynamic(
  () => import("./ProposalDetail").then((m) => ({ default: m.ProposalDetail })),
  { ssr: false }
);

export default function ProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <ProposalDetailClient id={parseInt(id)} />;
}
