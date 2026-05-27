import { verdictMeta, type Verdict } from "@/lib/mock-data";

export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  const meta = verdictMeta[verdict];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium ${meta.className}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {meta.label}
    </span>
  );
}
