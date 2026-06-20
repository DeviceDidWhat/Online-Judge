import { createFileRoute } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { VerdictBadge } from "@/components/verdict-badge";
import { ViewCodeButton } from "@/components/view-code-button";
import { apiRequest, type ApiSubmission } from "@/lib/api";
import { useRequireAuth } from "@/lib/auth";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/submissions")({
  head: () => ({ meta: [{ title: "Submissions - CodeArena" }] }),
  component: Submissions,
});

function Submissions() {
  const { isLoading, user } = useRequireAuth();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<ApiSubmission[]>([]);
  const [loadingRows, setLoadingRows] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLoadingRows(true);
    apiRequest<{ submissions: ApiSubmission[] }>("/submissions")
      .then((data) => {
        if (!cancelled) setRows(data.submissions);
      })
      .catch((error) => {
        if (!cancelled) {
          setRows([]);
          toast.error(error instanceof Error ? error.message : "Unable to load submissions");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingRows(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (isLoading || !user) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <div className="h-10 w-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  const filtered = rows.filter((s) => (s.problemTitle ?? "").toLowerCase().includes(q.toLowerCase()));

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl p-6">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Submissions</h1>
            <p className="text-sm text-muted-foreground">{loadingRows ? "Loading judge results..." : "All your past attempts and their verdicts."}</p>
          </div>
        </div>
        <Input placeholder="Filter by problem..." value={q} onChange={(e) => setQ(e.target.value)} className="mb-4 max-w-sm bg-card/50" />
        <Card className="overflow-hidden border-border/60">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr><th className="px-4 py-3">Problem</th><th className="px-4 py-3">Verdict</th><th className="px-4 py-3">Language</th><th className="px-4 py-3">Runtime</th><th className="px-4 py-3">Memory</th><th className="px-4 py-3">When</th><th className="px-4 py-3 text-right">Code</th></tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.submissionId} className="border-t border-border/60 hover:bg-accent/30">
                  <td className="px-4 py-3 font-medium">{s.problemTitle}</td>
                  <td className="px-4 py-3"><VerdictBadge verdict={s.verdict} /></td>
                  <td className="px-4 py-3 text-muted-foreground">{s.language}</td>
                  <td className="px-4 py-3 font-mono text-xs">{s.runtime ?? 0} ms</td>
                  <td className="px-4 py-3 font-mono text-xs">{s.memory ?? 0} MB</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{formatDistanceToNow(new Date(s.submittedAt))} ago</td>
                  <td className="px-4 py-3 text-right">
                    <ViewCodeButton submissionId={s.submissionId} language={s.language} problemTitle={s.problemTitle} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </AppShell>
  );
}
