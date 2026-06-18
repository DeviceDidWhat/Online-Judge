import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import {
  ArrowRight, Code2, Cpu, Github, Sparkles, Trophy, Users, Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Navbar } from "@/components/navbar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { apiRequest, ApiProblem, ApiContest, ApiPagination } from "@/lib/api";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CodeArena — Master Coding. Compete. Win." },
      { name: "description", content: "Practice 3,000+ algorithm problems, compete in weekly contests, and climb the global leaderboard on CodeArena." },
    ],
  }),
  component: Landing,
});

interface StatsData {
  totalUsers: number;
  problemCount: number;
  submissionCount: number;
  contestCount: number;
}

interface LeaderboardResponse {
  users: any[];
  pagination: ApiPagination;
}

interface SubmissionsResponse {
  submissions: any[];
  pagination: ApiPagination;
}

function Landing() {
  const { user } = useAuth();
  const [stats, setStats] = useState<StatsData>({
    totalUsers: 0,
    problemCount: 0,
    submissionCount: 0,
    contestCount: 0,
  });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const problemsResponse = await apiRequest<{ problems: ApiProblem[]; pagination: ApiPagination }>("/problems");
        const contestsResponse = await apiRequest<{ contests: ApiContest[]; pagination: ApiPagination }>("/contests");
        const leaderboardResponse = await apiRequest<LeaderboardResponse>("/users/leaderboard");

        let submissionCount = 0;
        if (user) {
          try {
            const submissionsResponse = await apiRequest<SubmissionsResponse>("/submissions?all=true");
            submissionCount = submissionsResponse.pagination?.total || 0;
          } catch {
            // If we can't fetch submissions (not admin), just use 0
            submissionCount = 0;
          }
        }

        setStats({
          totalUsers: leaderboardResponse.pagination?.total || 0,
          problemCount: problemsResponse.pagination?.total || 0,
          submissionCount,
          contestCount: contestsResponse.pagination?.total || 0,
        });
      } catch (error) {
        console.error("Failed to fetch stats:", error);
      }
    };

    fetchStats();
  }, [user]);

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="absolute inset-0 grid-bg [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_70%)]" />
      <div className="absolute inset-0 gradient-hero" />
      <div className="relative">
        {user && <Navbar />}

        {/* Hero */}
        <section className="mx-auto max-w-7xl px-6 pt-20 pb-28 text-center">
          <motion.h1
            initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.05 }}
            className="mx-auto max-w-4xl text-5xl font-bold tracking-tight md:text-7xl"
          >
            Master coding.{" "}
            <span className="gradient-text">Compete worldwide.</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.15 }}
            className="mx-auto mt-6 max-w-2xl text-balance text-lg text-muted-foreground"
          >
            A modern online judge with 3,000+ curated problems, weekly contests, and a real-time leaderboard.
            Built for engineers who want to ship — and win.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.25 }}
            className="mt-10 flex flex-wrap items-center justify-center gap-3"
          >
            <Button asChild size="lg" className="gradient-primary shadow-glow text-primary-foreground">
              <Link to={user ? "/problems" : "/login"}>
                Start solving <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="glass">
              <Link to={user ? "/dashboard" : "/register"}>
                {user ? "Open dashboard" : "Create free account"}
              </Link>
            </Button>
          </motion.div>

          {/* Code preview */}
          <motion.div
            initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.4 }}
            className="mx-auto mt-20 max-w-5xl"
          >
            <div className="overflow-hidden rounded-2xl border border-border/60 glass shadow-elegant">
              <div className="flex items-center gap-2 border-b border-border/60 bg-background/40 px-4 py-2.5">
                <div className="flex gap-1.5">
                  <span className="h-3 w-3 rounded-full bg-destructive/70" />
                  <span className="h-3 w-3 rounded-full bg-warning/70" />
                  <span className="h-3 w-3 rounded-full bg-success/70" />
                </div>
                <span className="ml-2 text-xs text-muted-foreground font-mono">two-sum.cpp</span>
                <span className="ml-auto text-xs text-success font-mono">● Accepted · 4ms · 6.2MB</span>
              </div>
              <pre className="overflow-x-auto p-6 text-left text-sm leading-relaxed font-mono">
                <span className="text-[oklch(0.68_0.20_300)]">class</span> <span className="text-[oklch(0.78_0.16_75)]">Solution</span> {"{"}
                {"\n"}<span className="text-muted-foreground">public:</span>
                {"\n    "}<span className="text-[oklch(0.70_0.16_230)]">vector</span>&lt;<span className="text-[oklch(0.70_0.16_230)]">int</span>&gt; <span className="text-primary">twoSum</span>(<span className="text-[oklch(0.70_0.16_230)]">vector</span>&lt;<span className="text-[oklch(0.70_0.16_230)]">int</span>&gt;& nums, <span className="text-[oklch(0.70_0.16_230)]">int</span> target) {"{"}
                {"\n        "}<span className="text-[oklch(0.68_0.20_300)]">unordered_map</span>&lt;<span className="text-[oklch(0.70_0.16_230)]">int</span>, <span className="text-[oklch(0.70_0.16_230)]">int</span>&gt; seen;
                {"\n        "}<span className="text-[oklch(0.68_0.20_300)]">for</span> (<span className="text-[oklch(0.70_0.16_230)]">int</span> i = <span className="text-warning">0</span>; i &lt; nums.size(); ++i) {"{"}
                {"\n            "}<span className="text-[oklch(0.68_0.20_300)]">if</span> (seen.count(target - nums[i])) {"\n                "}<span className="text-[oklch(0.68_0.20_300)]">return</span> {"{seen[target - nums[i]], i}"};
                {"\n            "}seen[nums[i]] = i;
                {"\n        "}{"}"}
                {"\n        "}<span className="text-[oklch(0.68_0.20_300)]">return</span> {"{}"};
                {"\n    "}{"}"}
                {"\n"}{"}"};
              </pre>
            </div>
          </motion.div>
        </section>

        {/* Stats */}
        <section className="mx-auto max-w-7xl px-6 pb-20">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {[
              { label: "Total users", value: stats.totalUsers },
              { label: "Problems", value: stats.problemCount },
              { label: "Total submissions", value: stats.submissionCount },
              { label: "Contests run", value: stats.contestCount },
            ].map((s) => (
              <div key={s.label} className="rounded-2xl border border-border/60 glass p-6">
                <div className="text-3xl font-bold gradient-text">{s.value}</div>
                <div className="mt-1 text-sm text-muted-foreground">{s.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto max-w-7xl px-6 pb-32">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-bold md:text-4xl">Everything you need to <span className="gradient-text">level up</span></h2>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              { icon: Code2, title: "Monaco-powered editor", body: "First-class editing for 5+ languages with syntax highlighting and Vim/Emacs modes." },
              { icon: Zap, title: "Real-time judging", body: "Submissions are evaluated in under a second with detailed per-testcase verdicts." },
              { icon: Trophy, title: "Weekly contests", body: "Compete head-to-head with thousands of programmers and track your live ranking." },
              { icon: Cpu, title: "Powerful sandbox", body: "Containerized workers with tight CPU and memory accounting — no flaky verdicts." },
              { icon: Users, title: "Active community", body: "Editorials, discussions, and peer code reviews from a vibrant global community." },
              { icon: Github, title: "Open ecosystem", body: "Public APIs, CLI submission tools, and webhooks for your own integrations." },
            ].map((f) => (
              <div key={f.title} className="group relative overflow-hidden rounded-2xl border border-border/60 glass p-6 transition hover:border-primary/40 hover:shadow-glow">
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg gradient-primary">
                  <f.icon className="h-5 w-5 text-primary-foreground" />
                </div>
                <h3 className="font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        <footer className="border-t border-border/60 py-10">
          <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 text-sm text-muted-foreground md:flex-row">
            <div className="flex items-center gap-2">
              <Code2 className="h-4 w-4 text-primary" />
              <span>© 2026 CodeArena. Built for coders, by coders.</span>
            </div>
            <div className="flex gap-6">
              <Link to={user ? "/problems" : "/login"}>Problems</Link>
              <Link to={user ? "/contests" : "/login"}>Contests</Link>
              <Link to={user ? "/discuss" : "/login"}>Discuss</Link>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
