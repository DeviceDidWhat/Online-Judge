import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Clock, Trophy } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiRequest, type ApiContest, type ApiContestRegistration } from "@/lib/api";
import { toast } from "sonner";

export const Route = createFileRoute("/contests/$id")({
  component: ContestDetail,
});

function ContestDetail() {
  const { id } = Route.useParams();
  const [contest, setContest] = useState<ApiContest | null>(null);
  const [registration, setRegistration] = useState<ApiContestRegistration | null>(null);
  const [leaderboard, setLeaderboard] = useState<ApiContestRegistration[]>([]);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [tick, setTick] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      apiRequest<{ contest: ApiContest; registration: ApiContestRegistration | null }>(`/contests/${id}`),
      apiRequest<{ leaderboard: ApiContestRegistration[] }>(`/contests/${id}/leaderboard`),
    ])
      .then(([contestData, leaderboardData]) => {
        if (cancelled) return;
        setContest(contestData.contest);
        setRegistration(contestData.registration);
        setLeaderboard(leaderboardData.leaderboard);
      })
      .catch((error) => {
        if (!cancelled) toast.error(error instanceof Error ? error.message : "Unable to load contest");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const register = async () => {
    setRegistering(true);
    try {
      const data = await apiRequest<{ registration: ApiContestRegistration }>(`/contests/${id}/register`, { method: "POST" });
      setRegistration(data.registration);
      setContest((current) => current ? { ...current, registeredCount: current.registeredCount + (registration ? 0 : 1) } : current);
      toast.success("Registered for contest");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to register");
    } finally {
      setRegistering(false);
    }
  };

  if (loading || !contest) {
    return (
      <AppShell>
        <div className="grid min-h-[60vh] place-items-center text-sm text-muted-foreground">Loading contest...</div>
      </AppShell>
    );
  }

  const endAt = new Date(contest.startsAt).getTime() + contest.duration * 60000;
  const remaining = Math.max(0, endAt - tick);
  const mins = Math.floor(remaining / 60000);
  const secs = Math.floor((remaining / 1000) % 60);

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-6 p-6">
        <Button variant="ghost" size="sm" asChild><Link to="/contests"><ArrowLeft className="mr-1 h-4 w-4" />Contests</Link></Button>

        <Card className="border-border/60 p-6 bg-gradient-to-br from-primary/10 to-transparent">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <Badge variant="outline" className={contest.status === "live" ? "border-destructive/40 text-destructive" : "border-border"}>
                {contest.status === "live" ? "LIVE" : contest.status.toUpperCase()}
              </Badge>
              <h1 className="mt-2 text-3xl font-bold">{contest.name}</h1>
              <p className="text-sm text-muted-foreground inline-flex items-center gap-3">
                <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {contest.duration} min</span>
                <span className="inline-flex items-center gap-1"><Trophy className="h-3 w-3" /> {contest.difficulty}</span>
              </p>
            </div>
            <div className="flex flex-col items-end gap-3">
              <div className="rounded-xl border border-border/60 glass p-4 text-center">
                <div className="text-xs text-muted-foreground uppercase">Time remaining</div>
                <div className="text-4xl font-bold font-mono gradient-text">{String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}</div>
              </div>
              <Button onClick={register} disabled={registering || Boolean(registration)} className="gradient-primary text-primary-foreground">
                {registration ? "Registered" : registering ? "Registering..." : "Register"}
              </Button>
            </div>
          </div>
        </Card>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="border-border/60 p-5 lg:col-span-2">
            <h3 className="mb-4 font-semibold">Problems</h3>
            <div className="space-y-2">
              {[...contest.problems].sort((a, b) => a.order - b.order).map((item) => (
                <Link key={`${item.label}-${item.problem._id}`} to="/problems/$slug" params={{ slug: item.problem.slug }}
                  className="flex items-center justify-between rounded-lg border border-border/60 p-3 transition hover:border-primary/40 hover:bg-accent/30">
                  <div className="flex items-center gap-3">
                    <span className="grid h-7 w-7 place-items-center rounded-md gradient-primary text-xs font-bold text-primary-foreground">{item.label}</span>
                    <div>
                      <div className="font-medium">{item.problem.title}</div>
                      <div className="text-xs text-muted-foreground">{item.points} points / {item.problem.difficulty}</div>
                    </div>
                  </div>
                </Link>
              ))}
              {contest.problems.length === 0 && <p className="text-sm text-muted-foreground">No problems assigned.</p>}
            </div>
          </Card>

          <Card className="border-border/60 p-5">
            <h3 className="mb-4 font-semibold">Standings</h3>
            <div className="space-y-2 text-sm">
              {leaderboard.map((row, index) => (
                <div key={row._id} className="flex items-center justify-between rounded-md p-2 hover:bg-accent/30">
                  <div className="flex items-center gap-2">
                    <span className="w-6 text-muted-foreground font-mono text-xs">#{row.rank ?? index + 1}</span>
                    <span className="font-medium">{row.user?.username ?? "unknown"}</span>
                  </div>
                  <span className="font-mono text-xs gradient-text font-bold">{row.score}</span>
                </div>
              ))}
              {leaderboard.length === 0 && <p className="text-sm text-muted-foreground">No standings yet.</p>}
            </div>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
