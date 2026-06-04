import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Check, Filter, Lock, Search, Sparkles } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest, type ApiDifficulty, type ApiProblem } from "@/lib/api";
import { difficultyClass } from "@/lib/mock-data";
import { toast } from "sonner";

export const Route = createFileRoute("/problems")({
  head: () => ({ meta: [{ title: "Problems - CodeArena" }] }),
  component: Problems,
});

function Problems() {
  const [q, setQ] = useState("");
  const [diff, setDiff] = useState<ApiDifficulty | "all">("all");
  const [status, setStatus] = useState("all");
  const [problems, setProblems] = useState<ApiProblem[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  useEffect(() => {
    if (pathname !== "/problems") return;
    let cancelled = false;
    setLoading(true);
    apiRequest<{ problems: ApiProblem[] }>("/problems?limit=500")
      .then((data) => {
        if (!cancelled) setProblems(data.problems);
      })
      .catch((error) => {
        if (!cancelled) toast.error(error instanceof Error ? error.message : "Unable to load problems");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  const filtered = useMemo(() => problems.filter((p) =>
    (q === "" || p.title.toLowerCase().includes(q.toLowerCase()) || p.tags.some((t) => t.toLowerCase().includes(q.toLowerCase()))) &&
    (diff === "all" || p.difficulty === diff) &&
    (status === "all" || (status === "solved" ? p.solved : !p.solved))
  ), [q, diff, problems, status]);

  const byDifficulty = (difficulty: ApiDifficulty) => problems.filter((p) => p.difficulty === difficulty);
  const stats = [
    { label: "Solved", value: problems.filter((p) => p.solved).length, total: problems.length, color: "text-success" },
    { label: "Easy", value: byDifficulty("Easy").filter((p) => p.solved).length, total: byDifficulty("Easy").length, color: "text-success" },
    { label: "Medium", value: byDifficulty("Medium").filter((p) => p.solved).length, total: byDifficulty("Medium").length, color: "text-warning" },
    { label: "Hard", value: byDifficulty("Hard").filter((p) => p.solved).length, total: byDifficulty("Hard").length, color: "text-destructive" },
  ];

  if (pathname !== "/problems") {
    return <Outlet />;
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl p-6">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Problemset</h1>
            <p className="text-sm text-muted-foreground">{loading ? "Loading problems..." : `${problems.length} published problems`}</p>
          </div>
          <Button variant="outline" className="hidden md:inline-flex"><Sparkles className="mr-2 h-4 w-4" />Daily problem</Button>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          {stats.map((s) => (
            <Card key={s.label} className="border-border/60 bg-card/60 p-4">
              <div className="text-xs text-muted-foreground">{s.label}</div>
              <div className="mt-1 flex items-baseline gap-1">
                <span className={`text-2xl font-bold ${s.color}`}>{s.value}</span>
                <span className="text-sm text-muted-foreground">/ {s.total}</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full gradient-primary" style={{ width: `${(s.value / Math.max(s.total, 1)) * 100}%` }} />
              </div>
            </Card>
          ))}
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by title or tag..." className="pl-9 bg-card/50" />
          </div>
          <Select value={diff} onValueChange={(value) => setDiff(value as ApiDifficulty | "all")}>
            <SelectTrigger className="w-36 bg-card/50"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All difficulty</SelectItem>
              <SelectItem value="Easy">Easy</SelectItem>
              <SelectItem value="Medium">Medium</SelectItem>
              <SelectItem value="Hard">Hard</SelectItem>
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-36 bg-card/50"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="solved">Solved</SelectItem>
              <SelectItem value="unsolved">Unsolved</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon"><Filter className="h-4 w-4" /></Button>
        </div>

        <Card className="overflow-hidden border-border/60">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 w-12">Status</th>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Tags</th>
                <th className="px-4 py-3">Acceptance</th>
                <th className="px-4 py-3">Difficulty</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr
                  key={p._id}
                  className="border-t border-border/60 cursor-pointer transition hover:bg-accent/30"
                  role="link"
                  tabIndex={0}
                  onClick={(event) => {
                    const target = event.target as HTMLElement;
                    if (target.closest("a,button")) return;
                    navigate({ to: "/problems/$slug", params: { slug: p.slug } });
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    navigate({ to: "/problems/$slug", params: { slug: p.slug } });
                  }}
                >
                  <td className="px-4 py-3">
                    {p.solved ? <Check className="h-4 w-4 text-success" /> : <span className="block h-4 w-4 rounded-full border border-border" />}
                  </td>
                  <td className="px-4 py-3">
                    <Link to="/problems/$slug" params={{ slug: p.slug }} className="font-medium hover:text-primary">
                      {p.problemId}. {p.title}
                    </Link>
                    {p.premium && <Lock className="ml-2 inline h-3.5 w-3.5 text-warning" />}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {p.tags.map((t) => <Badge key={t} variant="secondary" className="font-normal">{t}</Badge>)}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{p.acceptance}%</td>
                  <td className={`px-4 py-3 font-medium ${difficultyClass[p.difficulty]}`}>{p.difficulty}</td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No problems found.</td></tr>
              )}
            </tbody>
          </table>
        </Card>
      </div>
      <Outlet />
    </AppShell>
  );
}
