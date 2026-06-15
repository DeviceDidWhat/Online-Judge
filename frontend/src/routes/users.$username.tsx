import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { format } from "date-fns";
import { ArrowLeft, Calendar, Lock, MapPin, TrendingDown, TrendingUp } from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip as ChartTooltip, ResponsiveContainer,
} from "recharts";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Heatmap } from "@/components/heatmap";
import { VerdictBadge } from "@/components/verdict-badge";
import { apiRequest, type ApiActivity, type ApiRatingHistory, type ApiSubmission, type ApiUser } from "@/lib/api";
import { toast } from "sonner";

export const Route = createFileRoute("/users/$username")({
  head: ({ params }) => ({ meta: [{ title: `${params.username} - CodeArena` }] }),
  component: UserProfile,
});

function getRatingTier(rating: number): { label: string; color: string } {
  if (rating >= 3000) return { label: "Legendary", color: "text-red-300" };
  if (rating >= 2600) return { label: "International Grandmaster", color: "text-red-400" };
  if (rating >= 2400) return { label: "Grandmaster", color: "text-red-500" };
  if (rating >= 2200) return { label: "International Master", color: "text-orange-400" };
  if (rating >= 2000) return { label: "Master", color: "text-orange-500" };
  if (rating >= 1800) return { label: "Candidate Master", color: "text-violet-400" };
  if (rating >= 1600) return { label: "Expert", color: "text-blue-400" };
  if (rating >= 1400) return { label: "Specialist", color: "text-cyan-400" };
  if (rating >= 1200) return { label: "Pupil", color: "text-green-400" };
  return { label: "Newbie", color: "text-muted-foreground" };
}

type ChartPoint = { label: string; rating: number; change: number; rank?: number };

function RatingTooltip({ active, payload }: { active?: boolean; payload?: { payload: ChartPoint }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  if (p.label === "Start") return null;
  return (
    <div className="rounded-lg border border-border/60 bg-background px-3 py-2 shadow-lg text-xs">
      <p className="font-semibold mb-1 max-w-40 truncate">{p.label}</p>
      <p className="font-mono font-bold text-sm">{p.rating}</p>
      {p.change !== 0 && (
        <p className={`font-medium ${p.change > 0 ? "text-green-400" : "text-red-400"}`}>
          {p.change > 0 ? "+" : ""}{p.change}
        </p>
      )}
      {p.rank != null && <p className="text-muted-foreground mt-0.5">Rank #{p.rank}</p>}
    </div>
  );
}

function RatingChart({ history }: { history: ApiRatingHistory[] }) {
  if (history.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        No rating history yet.
      </div>
    );
  }

  const data: ChartPoint[] = [
    { label: "Start", rating: 1200, change: 0 },
    ...history.map((h) => ({ label: h.contestName, rating: h.rating, change: h.change, rank: h.rank })),
  ];

  const ratings = data.map((d) => d.rating);
  const rawMin = Math.min(...ratings);
  const rawMax = Math.max(...ratings);
  const minY = Math.max(0, Math.floor((rawMin - 100) / 200) * 200);
  const maxY = Math.ceil((rawMax + 100) / 200) * 200;
  const tickCount = Math.round((maxY - minY) / 200) + 1;

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="ratingGradPublic" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="oklch(0.72 0.18 145)" stopOpacity={0.3} />
            <stop offset="95%" stopColor="oklch(0.72 0.18 145)" stopOpacity={0.03} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.26 0.014 250)" vertical={false} />
        <XAxis dataKey="label" hide />
        <YAxis
          domain={[minY, maxY]}
          tickCount={tickCount}
          tick={{ fontSize: 10, fill: "oklch(0.50 0.012 250)" }}
          tickLine={false}
          axisLine={false}
          width={40}
        />
        <ChartTooltip
          content={<RatingTooltip />}
          cursor={{ stroke: "oklch(0.45 0.012 250)", strokeWidth: 1, strokeDasharray: "4 4" }}
        />
        <Area
          type="monotone"
          dataKey="rating"
          stroke="oklch(0.72 0.18 145)"
          strokeWidth={2}
          fill="url(#ratingGradPublic)"
          dot={{ r: 3, fill: "oklch(0.72 0.18 145)", stroke: "oklch(0.15 0.014 250)", strokeWidth: 2 }}
          activeDot={{ r: 5, fill: "oklch(0.72 0.18 145)", stroke: "oklch(0.15 0.014 250)", strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function UserProfile() {
  const { username } = Route.useParams();
  const [user, setUser] = useState<ApiUser | null>(null);
  const [submissions, setSubmissions] = useState<ApiSubmission[]>([]);
  const [ratingHistory, setRatingHistory] = useState<ApiRatingHistory[]>([]);
  const [activity, setActivity] = useState<ApiActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPrivate, setIsPrivate] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setIsPrivate(false);
    setNotFound(false);

    const encoded = encodeURIComponent(username);
    Promise.all([
      apiRequest<{ user: ApiUser; recentSubmissions: ApiSubmission[]; ratingHistory: ApiRatingHistory[] }>(
        `/users/${encoded}`
      ),
      apiRequest<{ activity: ApiActivity[] }>(`/users/${encoded}/activity?days=365`).catch(() => ({ activity: [] })),
    ])
      .then(([profileData, activityData]) => {
        if (cancelled) return;
        setUser(profileData.user);
        setSubmissions(profileData.recentSubmissions ?? []);
        setRatingHistory(profileData.ratingHistory ?? []);
        setActivity(activityData.activity ?? []);
      })
      .catch((error) => {
        if (cancelled) return;
        const msg = error instanceof Error ? error.message : "";
        if (msg === "This profile is private") {
          setIsPrivate(true);
        } else if (msg === "User not found") {
          setNotFound(true);
        } else {
          toast.error(msg || "Unable to load profile");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [username]);

  if (loading) {
    return (
      <AppShell>
        <div className="flex min-h-64 items-center justify-center">
          <div className="text-sm text-muted-foreground">Loading profile…</div>
        </div>
      </AppShell>
    );
  }

  if (notFound) {
    return (
      <AppShell>
        <div className="mx-auto max-w-xl p-6 text-center space-y-4 pt-20">
          <p className="text-4xl font-bold text-muted-foreground">404</p>
          <p className="text-lg font-semibold">User not found</p>
          <p className="text-sm text-muted-foreground">No user with the username <span className="font-mono font-medium">@{username}</span> exists.</p>
          <Button asChild variant="outline" size="sm">
            <Link to="/leaderboard"><ArrowLeft className="mr-2 h-4 w-4" />Back to Leaderboard</Link>
          </Button>
        </div>
      </AppShell>
    );
  }

  if (isPrivate) {
    return (
      <AppShell>
        <div className="mx-auto max-w-xl p-6 text-center space-y-4 pt-20">
          <Lock className="mx-auto h-12 w-12 text-muted-foreground" />
          <p className="text-lg font-semibold">This profile is private</p>
          <p className="text-sm text-muted-foreground">
            <span className="font-mono font-medium">@{username}</span> has chosen to keep their profile private.
          </p>
          <Button asChild variant="outline" size="sm">
            <Link to="/leaderboard"><ArrowLeft className="mr-2 h-4 w-4" />Back to Leaderboard</Link>
          </Button>
        </div>
      </AppShell>
    );
  }

  const name = user?.name || user?.username || username;
  const joined = user?.joinedAt ? format(new Date(user.joinedAt), "MMM d, yyyy") : "-";
  const tier = user?.rating !== undefined ? getRatingTier(user.rating) : null;

  const ratingDelta = ratingHistory.length >= 2
    ? ratingHistory[ratingHistory.length - 1].rating - ratingHistory[ratingHistory.length - 2].rating
    : ratingHistory.length === 1
    ? ratingHistory[0].change
    : 0;

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl space-y-6 p-6">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/leaderboard"><ArrowLeft className="mr-2 h-4 w-4" />Leaderboard</Link>
        </Button>

        <Card className="overflow-hidden border-border/60">
          <div className="h-36 gradient-primary opacity-80" />
          <div className="px-6 pb-6">
            <div className="flex items-end gap-4 -mt-14 mb-4">
              <Avatar className="h-28 w-28 shrink-0 ring-4 ring-background">
                <AvatarImage src={user?.avatar} />
                <AvatarFallback className="text-2xl">{name.slice(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1 pb-1">
                <h1 className="relative truncate z-500 text-2xl font-bold leading-tight">{name}</h1>
                <p className="truncate text-sm text-muted-foreground">@{user?.username ?? username}</p>
                {tier && <p className={`text-xs font-medium mt-0.5 ${tier.color}`}>{tier.label}</p>}
              </div>
            </div>

            <div className="mb-5 flex flex-wrap gap-4 text-xs text-muted-foreground">
              {user?.country && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" />{user.country}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />Joined {joined}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl bg-muted/40 p-4 text-center">
                <div className="text-xl font-bold gradient-text">{user?.rating ?? 1200}</div>
                <div className="text-xs text-muted-foreground mt-0.5">Rating</div>
                {ratingDelta !== 0 && (
                  <div className={`mt-1 flex items-center justify-center gap-0.5 text-xs font-medium ${ratingDelta > 0 ? "text-green-400" : "text-red-400"}`}>
                    {ratingDelta > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {ratingDelta > 0 ? "+" : ""}{ratingDelta}
                  </div>
                )}
              </div>
              <div className="rounded-xl bg-muted/40 p-4 text-center">
                <div className="text-xl font-bold">{user?.rank ? `#${user.rank}` : "—"}</div>
                <div className="text-xs text-muted-foreground mt-0.5">Rank</div>
              </div>
              <div className="rounded-xl bg-muted/40 p-4 text-center">
                <div className="text-xl font-bold">{user?.solved?.total ?? 0}</div>
                <div className="text-xs text-muted-foreground mt-0.5">Solved</div>
              </div>
              <div className="rounded-xl bg-muted/40 p-4 text-center">
                <div className="text-xl font-bold">{ratingHistory.length}</div>
                <div className="text-xs text-muted-foreground mt-0.5">Contests</div>
              </div>
            </div>
          </div>
        </Card>

        <div className="grid gap-4 md:grid-cols-3">
          {([
            ["Easy", user?.solved?.easy ?? 0, "text-success"],
            ["Medium", user?.solved?.medium ?? 0, "text-warning"],
            ["Hard", user?.solved?.hard ?? 0, "text-destructive"],
          ] as const).map(([label, value, color]) => (
            <Card key={label} className="border-border/60 p-5">
              <div className="text-xs text-muted-foreground">{label}</div>
              <div className={`mt-1 text-2xl font-bold ${color}`}>{value}</div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full gradient-primary" style={{ width: `${Math.min((value / Math.max(user?.solved?.total ?? 1, 1)) * 100, 100)}%` }} />
              </div>
            </Card>
          ))}
        </div>

        <Card className="border-border/60 p-5">
          <h3 className="mb-4 font-semibold">Submission activity</h3>
          <Heatmap days={activity} />
        </Card>

        <Tabs defaultValue="rating">
          <TabsList>
            <TabsTrigger value="rating">Rating History</TabsTrigger>
            <TabsTrigger value="recent">Recent Submissions</TabsTrigger>
            <TabsTrigger value="badges">Badges</TabsTrigger>
          </TabsList>

          <TabsContent value="rating" className="pt-4">
            <Card className="border-border/60 p-5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-semibold">Rating over time</h3>
                <span className="text-xs text-muted-foreground">{ratingHistory.length} contest{ratingHistory.length !== 1 ? "s" : ""}</span>
              </div>
              <RatingChart history={ratingHistory} />
            </Card>
          </TabsContent>

          <TabsContent value="recent" className="pt-4 space-y-2">
            {submissions.map((submission) => (
              <div key={submission.submissionId} className="flex items-center justify-between rounded-lg border border-border/60 p-3">
                <div className="text-sm font-medium">{submission.problemTitle ?? submission.problem?.title}</div>
                <VerdictBadge verdict={submission.verdict} />
              </div>
            ))}
            {submissions.length === 0 && <p className="text-sm text-muted-foreground">No submissions yet.</p>}
          </TabsContent>

          <TabsContent value="badges" className="pt-4 flex flex-wrap gap-2">
            {(user?.badges ?? []).map((badge) => (
              <Badge key={badge} variant="secondary" className="px-3 py-1.5">{badge}</Badge>
            ))}
            {(user?.badges ?? []).length === 0 && <p className="text-sm text-muted-foreground">No badges yet.</p>}
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
