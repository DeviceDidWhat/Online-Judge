import { createFileRoute } from "@tanstack/react-router";
import {
  Area, AreaChart, CartesianGrid, Cell, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Flame, Target, TrendingUp, Trophy } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Heatmap } from "@/components/heatmap";
import { VerdictBadge } from "@/components/verdict-badge";
import { mockUser, ratingHistory, submissions, submissionStats } from "@/lib/mock-data";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — CodeArena" }] }),
  component: Dashboard,
});

function Dashboard() {
  const acc = Math.round((submissionStats[0].value / submissionStats.reduce((a, b) => a + b.value, 0)) * 100);
  const stats = [
    { label: "Current rating", value: mockUser.rating, icon: TrendingUp, hint: "+24 last contest", color: "text-success" },
    { label: "Solved", value: mockUser.solved.total, icon: Target, hint: "of 3,142", color: "text-info" },
    { label: "Streak", value: `${mockUser.streak}d`, icon: Flame, hint: "Personal best!", color: "text-warning" },
    { label: "Global rank", value: `#${mockUser.rank}`, icon: Trophy, hint: "Top 1.8%", color: "gradient-text" },
  ];
  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-6 p-6">
        <div>
          <h1 className="text-2xl font-bold">Welcome back, {mockUser.name.split(" ")[0]} 👋</h1>
          <p className="text-sm text-muted-foreground">Here's your competitive coding pulse.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          {stats.map((s) => (
            <Card key={s.label} className="border-border/60 p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">{s.label}</span>
                <s.icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className={`mt-2 text-3xl font-bold ${s.color}`}>{s.value}</div>
              <div className="mt-1 text-xs text-muted-foreground">{s.hint}</div>
            </Card>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="border-border/60 p-5 lg:col-span-2">
            <div className="mb-4 flex items-center justify-between">
              <div><h3 className="font-semibold">Rating progression</h3><p className="text-xs text-muted-foreground">Last 24 contests</p></div>
              <span className="text-sm text-success">+412 all-time</span>
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={ratingHistory}>
                <defs>
                  <linearGradient id="grad1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.72 0.18 145)" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="oklch(0.72 0.18 145)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="oklch(0.28 0.014 250)" strokeDasharray="3 3" />
                <XAxis dataKey="contest" stroke="oklch(0.65 0.012 250)" fontSize={11} />
                <YAxis stroke="oklch(0.65 0.012 250)" fontSize={11} />
                <Tooltip contentStyle={{ background: "oklch(0.20 0.014 250)", border: "1px solid oklch(0.28 0.014 250)", borderRadius: 8 }} />
                <Area dataKey="rating" stroke="oklch(0.72 0.18 145)" strokeWidth={2} fill="url(#grad1)" />
              </AreaChart>
            </ResponsiveContainer>
          </Card>

          <Card className="border-border/60 p-5">
            <h3 className="font-semibold">Submissions</h3>
            <p className="text-xs text-muted-foreground">All-time verdicts</p>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={submissionStats} dataKey="value" innerRadius={50} outerRadius={75} paddingAngle={3}>
                  {submissionStats.map((s, i) => <Cell key={i} fill={["oklch(0.72 0.18 145)", "oklch(0.62 0.22 25)", "oklch(0.78 0.16 75)", "oklch(0.70 0.16 230)"][i]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "oklch(0.20 0.014 250)", border: "1px solid oklch(0.28 0.014 250)", borderRadius: 8, color: "white" }} itemStyle={{ color: "white" }} labelStyle={{ color: "white" }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="text-center"><div className="text-2xl font-bold gradient-text">{acc}%</div><div className="text-xs text-muted-foreground">Accuracy</div></div>
          </Card>
        </div>

        <Card className="border-border/60 p-5">
          <div className="mb-4 flex items-center justify-between">
            <div><h3 className="font-semibold">Activity heatmap</h3><p className="text-xs text-muted-foreground">{mockUser.solved.total} problems · {mockUser.streak}-day streak</p></div>
          </div>
          <Heatmap />
        </Card>

        <Card className="border-border/60 p-5">
          <h3 className="mb-4 font-semibold">Recent submissions</h3>
          <div className="space-y-2">
            {submissions.slice(0, 6).map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-lg border border-border/60 p-3 hover:bg-accent/30">
                <div><div className="font-medium text-sm">{s.problemTitle}</div><div className="text-xs text-muted-foreground">{s.language} · {s.runtime}ms</div></div>
                <VerdictBadge verdict={s.verdict} />
              </div>
            ))}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}