"use client";

import dynamic from "next/dynamic";

const ConnectButtonDynamic = dynamic(
  () => import("@/components/ConnectButton").then((m) => ({ default: m.ConnectButton })),
  { ssr: false }
);

export function NavBar() {
  return (
    <nav className="border-b border-gray-200 bg-white px-6 py-3 flex items-center justify-between">
      <span className="font-bold text-indigo-700">ZK Vote</span>
      <div>
        <ConnectButtonDynamic />
      </div>
    </nav>
  );
}
