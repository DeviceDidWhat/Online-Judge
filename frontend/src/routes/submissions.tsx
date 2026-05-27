import { createFileRoute } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { VerdictBadge } from "@/components/verdict-badge";
import { submissions } from "@/lib/mock-data";
import { useState } from "react";

export const Route = createFileRoute("/submissions")({
  head: () => ({ meta: [{ title: "Submissions — CodeArena" }] }),
  component: Submissions,
});

function Submissions() {
  const [q, setQ] = useState("");
  const filtered = submissions.filter((s) => s.problemTitle.toLowerCase().includes(q.toLowerCase()));
  return (
    <AppShell>
      <div className="mx-auto max-w-7xl p-6">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Submissions</h1>
            <p className="text-sm text-muted-foreground">All your past attempts and their verdicts.</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-success animate-pulse-glow" /> Live · Judge queue OK
          </div>
        </div>
        <Input placeholder="Filter by problem…" value={q} onChange={(e) => setQ(e.target.value)} className="mb-4 max-w-sm bg-card/50" />
        <Card className="overflow-hidden border-border/60">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr><th className="px-4 py-3">ID</th><th className="px-4 py-3">Problem</th><th className="px-4 py-3">Verdict</th><th className="px-4 py-3">Language</th><th className="px-4 py-3">Runtime</th><th className="px-4 py-3">Memory</th><th className="px-4 py-3">When</th></tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id} className="border-t border-border/60 hover:bg-accent/30">
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{s.id}</td>
                  <td className="px-4 py-3 font-medium">{s.problemTitle}</td>
                  <td className="px-4 py-3"><VerdictBadge verdict={s.verdict} /></td>
                  <td className="px-4 py-3 text-muted-foreground">{s.language}</td>
                  <td className="px-4 py-3 font-mono text-xs">{s.runtime} ms</td>
                  <td className="px-4 py-3 font-mono text-xs">{s.memory} MB</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{formatDistanceToNow(new Date(s.timestamp))} ago</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </AppShell>
  );
}
