import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Clock, Trophy, Users } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiRequest, type ApiContest, type ApiPagination } from "@/lib/api";
import { toast } from "sonner";

export const Route = createFileRoute("/contests/")({
  head: () => ({ meta: [{ title: "Contests - CodeArena" }] }),
  component: Contests,
});

function Countdown({ to }: { to: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const diff = Math.max(0, new Date(to).getTime() - now);
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff / 3600000) % 24);
  const m = Math.floor((diff / 60000) % 60);
  const s = Math.floor((diff / 1000) % 60);
  return (
    <div className="flex gap-2 font-mono text-sm">
      {[[d, "D"], [h, "H"], [m, "M"], [s, "S"]].map(([value, label]) => (
        <div key={label as string} className="rounded-md border border-border/60 bg-secondary/50 px-2.5 py-1.5">
          <span className="text-lg font-bold">{String(value).padStart(2, "0")}</span>
          <span className="ml-1 text-xs text-muted-foreground">{label}</span>
        </div>
      ))}
    </div>
  );
}

function Contests() {
  const [contests, setContests] = useState<ApiContest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiRequest<{ contests: ApiContest[]; pagination: ApiPagination }>("/contests?limit=100")
      .then((data) => {
        if (!cancelled) setContests(data.contests);
      })
      .catch((error) => {
        if (!cancelled) toast.error(error instanceof Error ? error.message : "Unable to load contests");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const live = contests.filter((contest) => contest.status === "live");
  const upcoming = contests.filter((contest) => contest.status === "upcoming");
  const past = contests.filter((contest) => contest.status === "ended");

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-8 p-6">
        <div>
          <h1 className="text-2xl font-bold">Contests</h1>
          <p className="text-sm text-muted-foreground">{loading ? "Loading contests..." : "Compete live or warm up with past rounds."}</p>
        </div>

        {live.length > 0 && (
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-destructive animate-pulse-glow" /> Live now
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              {live.map((contest) => (
                <Card key={contest._id} className="relative overflow-hidden border-destructive/40 bg-gradient-to-br from-destructive/10 to-transparent p-6">
                  <Badge className="absolute right-4 top-4 bg-destructive/20 text-destructive border-destructive/40">LIVE</Badge>
                  <h3 className="text-lg font-semibold">{contest.name}</h3>
                  <p className="text-sm text-muted-foreground">{contest.difficulty} / {contest.duration} minutes</p>
                  <div className="mt-4 flex items-center justify-between">
                    <div className="text-xs text-muted-foreground inline-flex items-center gap-1"><Users className="h-3 w-3" /> {contest.registeredCount.toLocaleString()} participants</div>
                    <Button asChild className="gradient-primary text-primary-foreground"><Link to="/contests/$id" params={{ id: String(contest.contestId) }}>Join now</Link></Button>
                  </div>
                </Card>
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Upcoming</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {upcoming.map((contest) => (
              <Card key={contest._id} className="border-border/60 p-6 transition hover:border-primary/40">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-semibold">{contest.name}</h3>
                    <p className="text-sm text-muted-foreground">{contest.difficulty} / {contest.duration} minutes</p>
                  </div>
                  <Trophy className="h-5 w-5 text-warning" />
                </div>
                <div className="mt-4"><Countdown to={contest.startsAt} /></div>
                <div className="mt-4 flex items-center justify-between">
                  <div className="text-xs text-muted-foreground inline-flex items-center gap-1"><Users className="h-3 w-3" /> {contest.registeredCount.toLocaleString()} registered</div>
                  <Button asChild variant="outline"><Link to="/contests/$id" params={{ id: String(contest.contestId) }}>Register</Link></Button>
                </div>
              </Card>
            ))}
            {!loading && upcoming.length === 0 && <p className="text-sm text-muted-foreground">No upcoming contests.</p>}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Past</h2>
          <Card className="border-border/60 divide-y divide-border/60">
            {past.map((contest) => (
              <div key={contest._id} className="flex items-center justify-between p-4">
                <div>
                  <div className="font-medium">{contest.name}</div>
                  <div className="text-xs text-muted-foreground inline-flex items-center gap-3 mt-1">
                    <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {contest.duration} min</span>
                    <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" /> {contest.registeredCount.toLocaleString()}</span>
                  </div>
                </div>
                <Button variant="ghost" asChild><Link to="/contests/$id" params={{ id: String(contest.contestId) }}>View</Link></Button>
              </div>
            ))}
            {!loading && past.length === 0 && <div className="p-4 text-sm text-muted-foreground">No past contests.</div>}
          </Card>
        </section>
      </div>
    </AppShell>
  );
}
