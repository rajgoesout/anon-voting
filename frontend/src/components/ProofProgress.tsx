"use client";

import type { ProofStep } from "@/types";

const STEPS: { key: ProofStep; label: string }[] = [
  { key: "snapshot", label: "Fetching token holder snapshot" },
  { key: "merkle", label: "Building Merkle tree" },
  { key: "witness", label: "Computing witness" },
  { key: "proving", label: "Generating Groth16 proof" },
  { key: "formatting", label: "Formatting calldata" },
];

const ORDER: ProofStep[] = ["snapshot", "merkle", "witness", "proving", "formatting", "done"];

function stepIndex(step: ProofStep) {
  return ORDER.indexOf(step);
}

interface Props {
  step: ProofStep;
  error: string | null;
}

export function ProofProgress({ step, error }: Props) {
  if (step === "idle") return null;

  const currentIdx = stepIndex(step);

  return (
    <div className="mt-4 rounded-lg border border-gray-200 p-4">
      <h3 className="mb-3 text-sm font-semibold text-gray-700">Proof Generation</h3>
      <div className="space-y-2">
        {STEPS.map((s, i) => {
          const done = step === "done" || (step !== "error" && currentIdx > i + 1);
          const active = ORDER[currentIdx] === s.key;
          const failed = step === "error" && active;

          return (
            <div key={s.key} className="flex items-center gap-3">
              <div
                className={`h-5 w-5 rounded-full flex items-center justify-center text-xs font-bold
                  ${done ? "bg-green-500 text-white" : ""}
                  ${active && !failed ? "bg-blue-500 text-white animate-pulse" : ""}
                  ${failed ? "bg-red-500 text-white" : ""}
                  ${!done && !active ? "bg-gray-200 text-gray-500" : ""}
                `}
              >
                {done ? "✓" : i + 1}
              </div>
              <span
                className={`text-sm ${done ? "text-green-700" : active ? "text-blue-700 font-medium" : "text-gray-400"}`}
              >
                {s.label}
              </span>
            </div>
          );
        })}
      </div>
      {error && (
        <div className="mt-3 rounded bg-red-50 p-3 text-sm text-red-700">
          <strong>Error:</strong> {error}
        </div>
      )}
    </div>
  );
}
