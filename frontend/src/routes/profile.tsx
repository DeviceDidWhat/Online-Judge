import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { Calendar, MapPin, TrendingUp, TrendingDown } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Heatmap } from "@/components/heatmap";
import { VerdictBadge } from "@/components/verdict-badge";
import { apiRequest, type ApiActivity, type ApiRatingHistory, type ApiSubmission, type ApiUser } from "@/lib/api";
import { toast } from "sonner";

export const Route = createFileRoute("/profile")({
  head: () => ({ meta: [{ title: "Profile - CodeArena" }] }),
  component: Profile,
});

// ─── Rating tier helper ───────────────────────────────────────────────────────
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

// ─── SVG Rating Chart ─────────────────────────────────────────────────────────
function RatingChart({ history }: { history: ApiRatingHistory[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  // Must be declared before any early return to satisfy Rules of Hooks
  const [tooltip, setTooltip] = useState<{ x: number; y: number; point: { rating: number; change?: number; contestName?: string } } | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      setWidth(entries[0].contentRect.width);
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  if (history.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        No rating history yet. Compete in a contest to get your first rating!
      </div>
    );
  }

  const height = 220;
  const padL = 56, padR = 20, padT = 20, padB = 36;
  const chartW = width - padL - padR;
  const chartH = height - padT - padB;

  // Include a "start" point at 1200 (typed to satisfy ApiRatingHistory union)
  const startPoint: ApiRatingHistory = { _id: "start", rating: 1200, contestName: "Start", createdAt: "", change: 0 };
  const points = [startPoint, ...history];

  const ratings = points.map((p) => p.rating);
  const minR = Math.max(0, Math.min(...ratings) - 100);
  const maxR = Math.max(...ratings) + 100;

  const toX = (i: number) => padL + (i / (points.length - 1)) * chartW;
  const toY = (r: number) => padT + (1 - (r - minR) / (maxR - minR)) * chartH;

  const polyline = points.map((p, i) => `${toX(i)},${toY(p.rating)}`).join(" ");
  // Filled area path
  const areaPath = [
    `M ${toX(0)} ${toY(points[0].rating)}`,
    ...points.slice(1).map((p, i) => `L ${toX(i + 1)} ${toY(p.rating)}`),
    `L ${toX(points.length - 1)} ${padT + chartH}`,
    `L ${toX(0)} ${padT + chartH}`,
    "Z",
  ].join(" ");

  const yTicks = 5;

  // tooltip state is declared above (before early return) — see top of function

  return (
    <div ref={containerRef} className="relative">
      <svg width={width} height={height} className="overflow-visible">
        <defs>
          <linearGradient id="ratingFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="oklch(0.72 0.18 145)" stopOpacity="0.3" />
            <stop offset="100%" stopColor="oklch(0.72 0.18 145)" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Y grid + labels */}
        {Array.from({ length: yTicks + 1 }, (_, i) => {
          const r = minR + ((maxR - minR) * i) / yTicks;
          const y = toY(r);
          return (
            <g key={i}>
              <line x1={padL} y1={y} x2={padL + chartW} y2={y} stroke="oklch(0.28 0.014 250)" strokeDasharray="3 3" />
              <text x={padL - 6} y={y + 4} fontSize={10} fill="oklch(0.55 0.012 250)" textAnchor="end">
                {Math.round(r)}
              </text>
            </g>
          );
        })}

        {/* Filled area */}
        <path d={areaPath} fill="url(#ratingFill)" />

        {/* Line */}
        <polyline
          points={polyline}
          fill="none"
          stroke="oklch(0.72 0.18 145)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Data points */}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={toX(i)}
            cy={toY(p.rating)}
            r={i === 0 ? 3 : 5}
            fill={i === 0 ? "oklch(0.28 0.014 250)" : "oklch(0.72 0.18 145)"}
            stroke="oklch(0.15 0.014 250)"
            strokeWidth={2}
            className="cursor-pointer transition hover:r-7"
            onMouseEnter={() => setTooltip({ x: toX(i), y: toY(p.rating), point: p })}
            onMouseLeave={() => setTooltip(null)}
          />
        ))}

        {/* Tooltip */}
        {tooltip && (
          <g transform={`translate(${Math.min(tooltip.x + 8, width - 150)},${Math.max(tooltip.y - 56, padT)})`}>
            <rect rx={6} width={140} height={52} fill="oklch(0.20 0.014 250)" stroke="oklch(0.35 0.014 250)" />
            <text x={8} y={18} fontSize={11} fontWeight={600} fill="oklch(0.72 0.18 145)">
              {tooltip.point.rating}
            </text>
            {tooltip.point.change !== undefined && tooltip.point.change !== 0 && (
              <text x={8} y={32} fontSize={10} fill={tooltip.point.change > 0 ? "oklch(0.75 0.2 145)" : "oklch(0.65 0.2 25)"}>
                {tooltip.point.change > 0 ? "+" : ""}{tooltip.point.change}
              </text>
            )}
            <text x={8} y={46} fontSize={9} fill="oklch(0.55 0.012 250)">
              {tooltip.point.contestName ?? "Start"}
            </text>
          </g>
        )}

        {/* X-axis: show contest name for last few */}
        {points.slice(-5).map((p, i) => {
          const idx = points.length - 5 + i;
          if (idx <= 0) return null;
          return (
            <text
              key={idx}
              x={toX(idx)}
              y={padT + chartH + 18}
              fontSize={9}
              fill="oklch(0.45 0.012 250)"
              textAnchor="middle"
            >
              {p.contestName?.slice(0, 10)}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

// ─── Main Profile ─────────────────────────────────────────────────────────────
function Profile() {
  const [user, setUser] = useState<ApiUser | null>(null);
  const [activity, setActivity] = useState<ApiActivity[]>([]);
  const [submissions, setSubmissions] = useState<ApiSubmission[]>([]);
  const [ratingHistory, setRatingHistory] = useState<ApiRatingHistory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      apiRequest<{ user: ApiUser }>("/users/me"),
      apiRequest<{ activity: ApiActivity[] }>("/users/me/activity?days=365"),
      apiRequest<{ submissions: ApiSubmission[] }>("/submissions?limit=8"),
      apiRequest<{ history: ApiRatingHistory[] }>("/ratings/me"),
    ])
      .then(([userData, activityData, submissionData, ratingData]) => {
        if (cancelled) return;
        setUser(userData.user);
        setActivity(activityData.activity);
        setSubmissions(submissionData.submissions);
        setRatingHistory(ratingData.history);
      })
      .catch((error) => {
        if (!cancelled) toast.error(error instanceof Error ? error.message : "Unable to load profile");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const name = user?.name || user?.username || "Coder";
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
        {/* Profile header */}
        <Card className="overflow-hidden border-border/60">
          <div className="h-32 gradient-primary opacity-80" />
          <div className="flex flex-col items-start gap-4 p-6 md:flex-row md:items-end -mt-12">
            <Avatar className="h-24 w-24 ring-4 ring-background">
              <AvatarImage src={user?.avatar} />
              <AvatarFallback>{name.slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold">{name}</h1>
              <p className="text-sm text-muted-foreground">@{user?.username ?? "loading"}</p>
              {tier && <p className={`text-xs font-medium mt-1 ${tier.color}`}>{tier.label}</p>}
              <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {user?.country ?? "-"}</span>
                <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" /> Joined {joined}</span>
              </div>
            </div>
            <div className="flex gap-6 text-center">
              <div>
                <div className="text-xl font-bold gradient-text">{user?.rating ?? 1200}</div>
                <div className="text-xs text-muted-foreground">Rating</div>
                {ratingDelta !== 0 && (
                  <div className={`text-xs font-medium flex items-center justify-center gap-0.5 mt-0.5 ${ratingDelta > 0 ? "text-green-400" : "text-red-400"}`}>
                    {ratingDelta > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {ratingDelta > 0 ? "+" : ""}{ratingDelta}
                  </div>
                )}
              </div>
              <div>
                <div className="text-xl font-bold">{user?.rank ? `#${user.rank}` : "-"}</div>
                <div className="text-xs text-muted-foreground">Rank</div>
              </div>
              <div>
                <div className="text-xl font-bold">{user?.solved?.total ?? 0}</div>
                <div className="text-xs text-muted-foreground">Solved</div>
              </div>
              <div>
                <div className="text-xl font-bold">{ratingHistory.length}</div>
                <div className="text-xs text-muted-foreground">Contests</div>
              </div>
            </div>
          </div>
        </Card>

        {/* Stats row */}
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

        {/* Activity heatmap */}
        <Card className="border-border/60 p-5">
          <h3 className="mb-4 font-semibold">Submission activity</h3>
          <Heatmap days={activity} />
        </Card>

        {/* Tabs */}
        <Tabs defaultValue="rating">
          <TabsList>
            <TabsTrigger value="rating">Rating History</TabsTrigger>
            <TabsTrigger value="recent">Recent Submissions</TabsTrigger>
            <TabsTrigger value="badges">Badges</TabsTrigger>
          </TabsList>

          {/* Rating history */}
          <TabsContent value="rating" className="pt-4">
            <Card className="border-border/60 p-5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-semibold">Rating over time</h3>
                <span className="text-xs text-muted-foreground">{ratingHistory.length} contest{ratingHistory.length !== 1 ? "s" : ""}</span>
              </div>
              <RatingChart history={ratingHistory} />

              {/* Contest history table */}
              {ratingHistory.length > 0 && (
                <div className="mt-4 space-y-1 border-t border-border/60 pt-4">
                  <div className="grid grid-cols-4 text-xs text-muted-foreground uppercase tracking-wide font-medium px-2 pb-1">
                    <span>Contest</span>
                    <span className="text-center">Rank</span>
                    <span className="text-right">Rating</span>
                    <span className="text-right">Change</span>
                  </div>
                  {[...ratingHistory].reverse().map((entry) => (
                    <div key={entry._id} className="grid grid-cols-4 items-center rounded-lg px-2 py-2 text-sm hover:bg-accent/30 transition">
                      <span className="truncate font-medium text-xs">{entry.contestName}</span>
                      <span className="text-center text-xs text-muted-foreground">#{entry.rank ?? "—"}</span>
                      <span className="text-right font-mono font-bold">{entry.rating}</span>
                      <span className={`text-right font-mono text-xs font-bold ${entry.change > 0 ? "text-green-400" : entry.change < 0 ? "text-red-400" : "text-muted-foreground"}`}>
                        {entry.change > 0 ? "+" : ""}{entry.change}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </TabsContent>

          {/* Recent submissions */}
          <TabsContent value="recent" className="pt-4 space-y-2">
            {submissions.map((submission) => (
              <div key={submission.submissionId} className="flex items-center justify-between rounded-lg border border-border/60 p-3">
                <div className="text-sm font-medium">{submission.problemTitle}</div>
                <VerdictBadge verdict={submission.verdict} />
              </div>
            ))}
            {!loading && submissions.length === 0 && <p className="text-sm text-muted-foreground">No submissions yet.</p>}
          </TabsContent>

          {/* Badges */}
          <TabsContent value="badges" className="pt-4 flex flex-wrap gap-2">
            {(user?.badges ?? []).map((badge) => (
              <Badge key={badge} variant="secondary" className="px-3 py-1.5">{badge}</Badge>
            ))}
            {!loading && (user?.badges ?? []).length === 0 && <p className="text-sm text-muted-foreground">No badges yet.</p>}
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
