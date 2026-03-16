"use client";

import dynamic from "next/dynamic";
import { use } from "react";

const VerifyProofsClient = dynamic(
  () => import("./VerifyProofs").then((m) => ({ default: m.VerifyProofs })),
  { ssr: false }
);

export default function VerifyProofsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <VerifyProofsClient id={parseInt(id, 10)} />;
}
