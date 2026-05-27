import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Clock, Trophy, Users } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { contests } from "@/lib/mock-data";

export const Route = createFileRoute("/contests")({
  head: () => ({ meta: [{ title: "Contests — CodeArena" }] }),
  component: Contests,
});

function Countdown({ to }: { to: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  const diff = Math.max(0, to - now);
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff / 3600000) % 24);
  const m = Math.floor((diff / 60000) % 60);
  const s = Math.floor((diff / 1000) % 60);
  return (
    <div className="flex gap-2 font-mono text-sm">
      {[[d, "D"], [h, "H"], [m, "M"], [s, "S"]].map(([v, l]) => (
        <div key={l as string} className="rounded-md border border-border/60 bg-secondary/50 px-2.5 py-1.5">
          <span className="text-lg font-bold">{String(v).padStart(2, "0")}</span>
          <span className="ml-1 text-xs text-muted-foreground">{l}</span>
        </div>
      ))}
    </div>
  );
}

function Contests() {
  const live = contests.filter((c) => c.status === "live");
  const upcoming = contests.filter((c) => c.status === "upcoming");
  const past = contests.filter((c) => c.status === "ended");
  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-8 p-6">
        <div>
          <h1 className="text-2xl font-bold">Contests</h1>
          <p className="text-sm text-muted-foreground">Compete live or warm up with past rounds.</p>
        </div>

        {live.length > 0 && (
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-destructive animate-pulse-glow" /> Live now
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              {live.map((c) => (
                <Card key={c.id} className="relative overflow-hidden border-destructive/40 bg-gradient-to-br from-destructive/10 to-transparent p-6">
                  <Badge className="absolute right-4 top-4 bg-destructive/20 text-destructive border-destructive/40">LIVE</Badge>
                  <h3 className="text-lg font-semibold">{c.name}</h3>
                  <p className="text-sm text-muted-foreground">{c.difficulty} · {c.duration} minutes</p>
                  <div className="mt-4 flex items-center justify-between">
                    <div className="text-xs text-muted-foreground inline-flex items-center gap-1"><Users className="h-3 w-3" /> {c.registered.toLocaleString()} participants</div>
                    <Button asChild className="gradient-primary text-primary-foreground"><Link to="/contests/$id" params={{ id: String(c.id) }}>Join now</Link></Button>
                  </div>
                </Card>
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Upcoming</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {upcoming.map((c) => (
              <Card key={c.id} className="border-border/60 p-6 transition hover:border-primary/40">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-semibold">{c.name}</h3>
                    <p className="text-sm text-muted-foreground">{c.difficulty} · {c.duration} minutes</p>
                  </div>
                  <Trophy className="h-5 w-5 text-warning" />
                </div>
                <div className="mt-4"><Countdown to={c.startsAt} /></div>
                <div className="mt-4 flex items-center justify-between">
                  <div className="text-xs text-muted-foreground inline-flex items-center gap-1"><Users className="h-3 w-3" /> {c.registered.toLocaleString()} registered</div>
                  <Button asChild variant="outline"><Link to="/contests/$id" params={{ id: String(c.id) }}>Register</Link></Button>
                </div>
              </Card>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Past</h2>
          <Card className="border-border/60 divide-y divide-border/60">
            {past.map((c) => (
              <div key={c.id} className="flex items-center justify-between p-4">
                <div>
                  <div className="font-medium">{c.name}</div>
                  <div className="text-xs text-muted-foreground inline-flex items-center gap-3 mt-1">
                    <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {c.duration} min</span>
                    <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" /> {c.registered.toLocaleString()}</span>
                  </div>
                </div>
                <Button variant="ghost" asChild><Link to="/contests/$id" params={{ id: String(c.id) }}>View</Link></Button>
              </div>
            ))}
          </Card>
        </section>
      </div>
    </AppShell>
  );
}
