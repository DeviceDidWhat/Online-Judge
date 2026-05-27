import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Clock, Trophy } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { contests, leaderboard, problems } from "@/lib/mock-data";

export const Route = createFileRoute("/contests/$id")({
  loader: ({ params }) => {
    const c = contests.find((x) => x.id === Number(params.id));
    if (!c) throw notFound();
    return c;
  },
  component: ContestDetail,
});

function ContestDetail() {
  const c = Route.useLoaderData();
  const [tick, setTick] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setTick(Date.now()), 1000); return () => clearInterval(id); }, []);
  const remaining = Math.max(0, c.startsAt + c.duration * 60000 - tick);
  const mins = Math.floor(remaining / 60000);
  const secs = Math.floor((remaining / 1000) % 60);
  const contestProblems = problems.slice(0, 5);
  const ranks = leaderboard.slice(0, 12);

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-6 p-6">
        <Button variant="ghost" size="sm" asChild><Link to="/contests"><ArrowLeft className="mr-1 h-4 w-4" />Contests</Link></Button>

        <Card className="border-border/60 p-6 bg-gradient-to-br from-primary/10 to-transparent">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <Badge variant="outline" className={c.status === "live" ? "border-destructive/40 text-destructive" : "border-border"}>
                {c.status === "live" ? "LIVE" : c.status.toUpperCase()}
              </Badge>
              <h1 className="mt-2 text-3xl font-bold">{c.name}</h1>
              <p className="text-sm text-muted-foreground inline-flex items-center gap-3">
                <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {c.duration} min</span>
                <span className="inline-flex items-center gap-1"><Trophy className="h-3 w-3" /> {c.difficulty}</span>
              </p>
            </div>
            <div className="rounded-xl border border-border/60 glass p-4 text-center">
              <div className="text-xs text-muted-foreground uppercase">Time remaining</div>
              <div className="text-4xl font-bold font-mono gradient-text">{String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}</div>
            </div>
          </div>
        </Card>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="border-border/60 p-5 lg:col-span-2">
            <h3 className="mb-4 font-semibold">Problems</h3>
            <div className="space-y-2">
              {contestProblems.map((p, i) => (
                <Link key={p.id} to="/problems/$slug" params={{ slug: p.slug }}
                  className="flex items-center justify-between rounded-lg border border-border/60 p-3 transition hover:border-primary/40 hover:bg-accent/30">
                  <div className="flex items-center gap-3">
                    <span className="grid h-7 w-7 place-items-center rounded-md gradient-primary text-xs font-bold text-primary-foreground">{String.fromCharCode(65 + i)}</span>
                    <div>
                      <div className="font-medium">{p.title}</div>
                      <div className="text-xs text-muted-foreground">{(i + 1) * 500} points</div>
                    </div>
                  </div>
                  {p.solved && <Badge className="bg-success/15 text-success border-success/30" variant="outline">Solved</Badge>}
                </Link>
              ))}
            </div>
          </Card>

          <Card className="border-border/60 p-5">
            <h3 className="mb-4 font-semibold">Live standings</h3>
            <div className="space-y-2 text-sm">
              {ranks.map((u) => (
                <div key={u.username} className="flex items-center justify-between rounded-md p-2 hover:bg-accent/30">
                  <div className="flex items-center gap-2">
                    <span className="w-6 text-muted-foreground font-mono text-xs">#{u.rank}</span>
                    <span className="font-medium">{u.username}</span>
                  </div>
                  <span className="font-mono text-xs gradient-text font-bold">{u.rating}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
