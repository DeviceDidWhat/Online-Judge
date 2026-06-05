import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Flame, Target, TrendingUp, Trophy } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Heatmap } from "@/components/heatmap";
import { VerdictBadge } from "@/components/verdict-badge";
import { apiRequest, type ApiActivity, type ApiRatingHistory, type ApiSubmission, type ApiUser, type ApiVerdict } from "@/lib/api";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard - CodeArena" }] }),
  component: Dashboard,
});

type DashboardData = {
  user: ApiUser;
  recentSubmissions: ApiSubmission[];
  activity: ApiActivity[];
  ratingHistory: ApiRatingHistory[];
  verdictStats: Array<{ name: ApiVerdict; value: number }>;
};

const verdictColorMap: Record<string, string> = {
  "Accepted": "oklch(0.72 0.18 145)",
  "Wrong Answer": "oklch(0.62 0.22 25)",
  "TLE": "oklch(0.78 0.16 75)",
  "MLE": "oklch(0.68 0.20 300)",
  "Runtime Error": "oklch(0.70 0.16 230)",
  "Compilation Error": "oklch(0.65 0.012 250)",
};

function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiRequest<DashboardData>("/dashboard")
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch((error) => {
        if (!cancelled) toast.error(error instanceof Error ? error.message : "Unable to load dashboard");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const user = data?.user;
  const verdictStats = data?.verdictStats ?? [];
  const accepted = verdictStats.find((item) => item.name === "Accepted")?.value ?? 0;
  const totalVerdicts = verdictStats.reduce((sum, item) => sum + item.value, 0);
  const accuracy = totalVerdicts > 0 ? Math.round((accepted / totalVerdicts) * 100) : 0;
  const ratingData = useMemo(() => (data?.ratingHistory ?? []).map((item) => ({
    contest: item.contest?.name ?? item.contestName,
    rating: item.rating,
  })), [data?.ratingHistory]);

  const stats = [
    { label: "Current rating", value: user?.rating ?? 0, icon: TrendingUp, hint: "from profile", color: "text-success" },
    { label: "Solved", value: user?.solved?.total ?? 0, icon: Target, hint: "total accepted problems", color: "text-info" },
    { label: "Streak", value: `${user?.streak ?? 0}d`, icon: Flame, hint: "current activity streak", color: "text-warning" },
    { label: "Global rank", value: user?.rank ? `#${user.rank}` : "-", icon: Trophy, hint: "leaderboard position", color: "gradient-text" },
  ];

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-6 p-6">
        <div>
          <h1 className="text-2xl font-bold">Welcome back, {(user?.name || user?.username || "coder").split(" ")[0]}</h1>
          <p className="text-sm text-muted-foreground">{loading ? "Loading your competitive coding pulse..." : "Here's your competitive coding pulse."}</p>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          {stats.map((stat) => (
            <Card key={stat.label} className="border-border/60 p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">{stat.label}</span>
                <stat.icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className={`mt-2 text-3xl font-bold ${stat.color}`}>{stat.value}</div>
              <div className="mt-1 text-xs text-muted-foreground">{stat.hint}</div>
            </Card>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="border-border/60 p-5 lg:col-span-2">
            <div className="mb-4 flex items-center justify-between">
              <div><h3 className="font-semibold">Rating progression</h3><p className="text-xs text-muted-foreground">{ratingData.length} recorded updates</p></div>
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={ratingData}>
                <defs>
                  <linearGradient id="ratingGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.72 0.18 145)" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="oklch(0.72 0.18 145)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="oklch(0.28 0.014 250)" strokeDasharray="3 3" />
                <XAxis dataKey="contest" stroke="oklch(0.65 0.012 250)" fontSize={11} />
                <YAxis stroke="oklch(0.65 0.012 250)" fontSize={11} />
                <Tooltip contentStyle={{ background: "oklch(0.20 0.014 250)", border: "1px solid oklch(0.28 0.014 250)", borderRadius: 8 }} />
                <Area dataKey="rating" stroke="oklch(0.72 0.18 145)" strokeWidth={2} fill="url(#ratingGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </Card>

          <Card className="border-border/60 p-5">
            <h3 className="font-semibold">Submissions</h3>
            <p className="text-xs text-muted-foreground">All-time verdicts</p>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={verdictStats} dataKey="value" innerRadius={50} outerRadius={75} paddingAngle={3}>
                  {verdictStats.map((entry) => (
                    <Cell
                      key={entry.name}
                      fill={verdictColorMap[entry.name] ?? "oklch(0.65 0.012 250)"}
                    />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: "oklch(0.20 0.014 250)", border: "1px solid oklch(0.28 0.014 250)", borderRadius: 8, color: "white" }} itemStyle={{ color: "white" }} labelStyle={{ color: "white" }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="text-center"><div className="text-2xl font-bold gradient-text">{accuracy}%</div><div className="text-xs text-muted-foreground">Accuracy</div></div>
          </Card>
        </div>

        <Card className="border-border/60 p-5">
          <div className="mb-4 flex items-center justify-between">
            <div><h3 className="font-semibold">Activity heatmap</h3><p className="text-xs text-muted-foreground">{user?.solved?.total ?? 0} solved / {user?.streak ?? 0}-day streak</p></div>
          </div>
          <Heatmap days={data?.activity ?? []} />
        </Card>

        <Card className="border-border/60 p-5">
          <h3 className="mb-4 font-semibold">Recent submissions</h3>
          <div className="space-y-2">
            {(data?.recentSubmissions ?? []).map((submission) => (
              <div key={submission.submissionId} className="flex items-center justify-between rounded-lg border border-border/60 p-3 hover:bg-accent/30">
                <div><div className="font-medium text-sm">{submission.problemTitle}</div><div className="text-xs text-muted-foreground">{submission.language} / {submission.runtime ?? 0}ms</div></div>
                <VerdictBadge verdict={submission.verdict} />
              </div>
            ))}
            {!loading && (data?.recentSubmissions ?? []).length === 0 && <p className="text-sm text-muted-foreground">No submissions yet.</p>}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
