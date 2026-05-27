import { createFileRoute } from "@tanstack/react-router";
import { Calendar, MapPin } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Heatmap } from "@/components/heatmap";
import { VerdictBadge } from "@/components/verdict-badge";
import { mockUser, submissions } from "@/lib/mock-data";

export const Route = createFileRoute("/profile")({
  head: () => ({ meta: [{ title: `${mockUser.username} — CodeArena` }] }),
  component: Profile,
});

function Profile() {
  return (
    <AppShell>
      <div className="mx-auto max-w-6xl space-y-6 p-6">
        <Card className="overflow-hidden border-border/60">
          <div className="h-32 gradient-primary opacity-80" />
          <div className="flex flex-col items-start gap-4 p-6 md:flex-row md:items-end -mt-12">
            <Avatar className="h-24 w-24 ring-4 ring-background">
              <AvatarImage src={mockUser.avatar} /><AvatarFallback>AC</AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <h1 className="text-2xl font-bold">{mockUser.name}</h1>
              <p className="text-sm text-muted-foreground">@{mockUser.username}</p>
              <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {mockUser.country}</span>
                <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" /> Joined {mockUser.joinedAt}</span>
              </div>
            </div>
            <div className="flex gap-4 text-center">
              <div><div className="text-xl font-bold gradient-text">{mockUser.rating}</div><div className="text-xs text-muted-foreground">Rating</div></div>
              <div><div className="text-xl font-bold">#{mockUser.rank}</div><div className="text-xs text-muted-foreground">Rank</div></div>
              <div><div className="text-xl font-bold">{mockUser.solved.total}</div><div className="text-xs text-muted-foreground">Solved</div></div>
            </div>
          </div>
        </Card>

        <div className="grid gap-4 md:grid-cols-3">
          {([
            ["Easy", mockUser.solved.easy, "text-success"],
            ["Medium", mockUser.solved.medium, "text-warning"],
            ["Hard", mockUser.solved.hard, "text-destructive"],
          ] as const).map(([k, v, c]) => (
            <Card key={k} className="border-border/60 p-5">
              <div className="text-xs text-muted-foreground">{k}</div>
              <div className={`mt-1 text-2xl font-bold ${c}`}>{v}</div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full gradient-primary" style={{ width: `${(v / 300) * 100}%` }} />
              </div>
            </Card>
          ))}
        </div>

        <Card className="border-border/60 p-5">
          <h3 className="mb-4 font-semibold">Submission activity</h3>
          <Heatmap />
        </Card>

        <Tabs defaultValue="recent">
          <TabsList><TabsTrigger value="recent">Recent</TabsTrigger><TabsTrigger value="badges">Badges</TabsTrigger></TabsList>
          <TabsContent value="recent" className="pt-4 space-y-2">
            {submissions.slice(0, 8).map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-lg border border-border/60 p-3">
                <div className="text-sm font-medium">{s.problemTitle}</div>
                <VerdictBadge verdict={s.verdict} />
              </div>
            ))}
          </TabsContent>
          <TabsContent value="badges" className="pt-4 flex flex-wrap gap-2">
            {["100 Days Streak", "Top 5% Weekly 411", "First Hard solve", "Editorial author", "Contest finisher"].map((b) => (
              <Badge key={b} variant="secondary" className="px-3 py-1.5">{b}</Badge>
            ))}
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
