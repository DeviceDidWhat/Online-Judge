import { createFileRoute, Link } from "@tanstack/react-router";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  Activity, CheckCircle2, Cpu, FileCode2, Flame, Loader2,
  Plus, Server, Trash2, Trophy, Users, XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  apiRequest,
  type ApiContest,
  type ApiDifficulty,
  type ApiJudgeJob,
  type ApiJudgeWorker,
  type ApiLanguage,
  type ApiProblem,
  type ApiProblemStatus,
  type ApiProblemVisibility,
  type ApiUser,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { difficultyClass } from "@/lib/mock-data";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin - CodeArena" }] }),
  component: Admin,
});

// ─── Problem form types ───────────────────────────────────────────────────────
type ExampleRow = { input: string; output: string; explanation: string };
type TestCaseRow = { input: string; expectedOutput: string; hidden: boolean };

type ProblemForm = {
  problemId: string;
  slug: string;
  title: string;
  difficulty: ApiDifficulty;
  status: ApiProblemStatus;
  visibility: ApiProblemVisibility;
  tags: string;
  premium: boolean;
  description: string;
  constraints: string;
  examples: ExampleRow[];
  testCases: TestCaseRow[];
  hints: string;
  timeLimitMs: string;
  memoryLimitMb: string;
};

const emptyForm: ProblemForm = {
  problemId: "",
  slug: "",
  title: "",
  difficulty: "Easy",
  status: "draft",
  visibility: "public",
  tags: "",
  premium: false,
  description: "",
  constraints: "",
  examples: [{ input: "", output: "", explanation: "" }],
  testCases: [{ input: "", expectedOutput: "", hidden: true }],
  hints: "",
  timeLimitMs: "1000",
  memoryLimitMb: "256",
};

const slugify = (value: string) => value
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "");

const splitLines = (value: string) => value
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean);

const buildPayload = (form: ProblemForm) => {
  if (!form.title.trim()) throw new Error("Title is required");
  if (!form.description.trim()) throw new Error("Description is required");
  if (form.examples.length === 0 || form.examples.some((e) => !e.input.trim() || !e.output.trim())) {
    throw new Error("Each example must have non-empty input and output");
  }
  if (form.testCases.length === 0 || form.testCases.some((t) => !t.input.trim() || !t.expectedOutput.trim())) {
    throw new Error("Each test case must have non-empty input and expected output");
  }

  return {
    ...(form.problemId ? { problemId: Number(form.problemId) } : {}),
    ...(form.slug ? { slug: slugify(form.slug) } : {}),
    title: form.title.trim(),
    difficulty: form.difficulty,
    status: form.status,
    visibility: form.visibility,
    premium: form.premium,
    tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
    description: form.description.trim(),
    constraints: splitLines(form.constraints),
    examples: form.examples.map(({ input, output, explanation }) => ({
      input: input.trim(),
      output: output.trim(),
      ...(explanation.trim() ? { explanation: explanation.trim() } : {}),
    })),
    testCases: form.testCases.map(({ input, expectedOutput, hidden }, index) => ({
      input: input.trim(),
      expectedOutput: expectedOutput.trim(),
      hidden,
      order: index + 1,
    })),
    hints: splitLines(form.hints),
    starterCode: {},
    timeLimitMs: Number(form.timeLimitMs) || 1000,
    memoryLimitMb: Number(form.memoryLimitMb) || 256,
  };
};

// ─── Contest form types ───────────────────────────────────────────────────────
type ContestProblemRow = {
  problemId: string; // MongoDB _id
  label: string;
  points: string;
  order: string;
};

type ContestForm = {
  contestId: string;
  name: string;
  description: string;
  startsAt: string;
  duration: string;
  difficulty: string;
  problems: ContestProblemRow[];
};

const emptyContestForm: ContestForm = {
  contestId: "",
  name: "",
  description: "",
  startsAt: "",
  duration: "120",
  difficulty: "Mixed",
  problems: [],
};

// ─── Main Admin component ─────────────────────────────────────────────────────
function Admin() {
  const { user } = useAuth();
  const [problems, setProblems] = useState<ApiProblem[]>([]);
  const [contests, setContests] = useState<ApiContest[]>([]);
  const [loadingProblems, setLoadingProblems] = useState(true);
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [jobs, setJobs] = useState<ApiJudgeJob[]>([]);
  const [workers, setWorkers] = useState<ApiJudgeWorker[]>([]);
  const [languages, setLanguages] = useState<ApiLanguage[]>([]);

  // Problem dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<ProblemForm>(emptyForm);

  // Contest dialog
  const [contestDialogOpen, setContestDialogOpen] = useState(false);
  const [savingContest, setSavingContest] = useState(false);
  const [contestForm, setContestForm] = useState<ContestForm>(emptyContestForm);
  const [finalizingId, setFinalizingId] = useState<string | null>(null);

  const nextProblemId = useMemo(() => (
    problems.length ? Math.max(...problems.map((problem) => problem.problemId)) + 1 : 1
  ), [problems]);

  const nextContestId = useMemo(() => (
    contests.length ? Math.max(...contests.map((c) => c.contestId)) + 1 : 1
  ), [contests]);

  const queue = useMemo(() => {
    const counts = new Map<string, number>();
    jobs.forEach((job) => {
      const hour = new Date(job.queuedAt).getHours();
      const label = `${hour}:00`;
      counts.set(label, (counts.get(label) ?? 0) + 1);
    });
    return Array.from({ length: 12 }, (_, index) => {
      const hour = `${index * 2}:00`;
      return { hour, jobs: counts.get(hour) ?? 0 };
    });
  }, [jobs]);

  useEffect(() => {
    if (user?.role !== "admin") return;
    let cancelled = false;
    setLoadingProblems(true);
    Promise.all([
      apiRequest<{ problems: ApiProblem[] }>("/problems?limit=100"),
      apiRequest<{ contests: ApiContest[] }>("/contests?limit=100"),
      apiRequest<{ users: ApiUser[] }>("/users?limit=20"),
      apiRequest<{ jobs: ApiJudgeJob[] }>("/judge/jobs?limit=30"),
      apiRequest<{ workers: ApiJudgeWorker[] }>("/judge/workers"),
      apiRequest<{ languages: ApiLanguage[] }>("/languages?all=true"),
    ])
      .then(([problemData, contestData, userData, jobData, workerData, languageData]) => {
        if (!cancelled) {
          setProblems(problemData.problems);
          setContests(contestData.contests);
          setUsers(userData.users);
          setJobs(jobData.jobs);
          setWorkers(workerData.workers);
          setLanguages(languageData.languages);
        }
      })
      .catch((error) => {
        if (!cancelled) toast.error(error instanceof Error ? error.message : "Unable to load admin data");
      })
      .finally(() => {
        if (!cancelled) setLoadingProblems(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.role]);

  // ── Problem dialog ──
  const openCreateDialog = () => {
    setForm({ ...emptyForm, problemId: String(nextProblemId) });
    setDialogOpen(true);
  };

  const setField = <K extends keyof ProblemForm>(key: K, value: ProblemForm[K]) => {
    setForm((current) => ({
      ...current,
      [key]: value,
      ...(key === "title" && !current.slug ? { slug: slugify(String(value)) } : {}),
    }));
  };

  const createProblem = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = buildPayload(form);
      const data = await apiRequest<{ problem: ApiProblem }>("/problems", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setProblems((current) => [...current, data.problem].sort((a, b) => a.problemId - b.problemId));
      setDialogOpen(false);
      toast.success("Problem added to database");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to create problem");
    } finally {
      setSaving(false);
    }
  };

  // ── Contest dialog ──
  const openContestDialog = () => {
    setContestForm({ ...emptyContestForm, contestId: String(nextContestId) });
    setContestDialogOpen(true);
  };

  const setContestField = <K extends keyof ContestForm>(key: K, value: ContestForm[K]) => {
    setContestForm((c) => ({ ...c, [key]: value }));
  };

  const addContestProblem = () => {
    setContestForm((c) => ({
      ...c,
      problems: [...c.problems, {
        problemId: "",
        label: String.fromCharCode(65 + c.problems.length), // A, B, C ...
        points: "1",
        order: String(c.problems.length),
      }],
    }));
  };

  const updateContestProblemRow = (index: number, key: keyof ContestProblemRow, value: string) => {
    setContestForm((c) => {
      const updated = [...c.problems];
      updated[index] = { ...updated[index], [key]: value };
      return { ...c, problems: updated };
    });
  };

  const removeContestProblem = (index: number) => {
    setContestForm((c) => ({ ...c, problems: c.problems.filter((_, i) => i !== index) }));
  };

  const createContest = async (event: FormEvent) => {
    event.preventDefault();
    setSavingContest(true);
    try {
      if (!contestForm.name.trim()) throw new Error("Contest name is required");
      if (!contestForm.startsAt) throw new Error("Start time is required");
      if (!contestForm.duration || Number(contestForm.duration) < 1) throw new Error("Duration must be at least 1 minute");

      const payload = {
        contestId: Number(contestForm.contestId),
        name: contestForm.name.trim(),
        description: contestForm.description.trim(),
        startsAt: new Date(contestForm.startsAt).toISOString(),
        duration: Number(contestForm.duration),
        difficulty: contestForm.difficulty || "Mixed",
        problems: contestForm.problems
          .filter((p) => p.problemId)
          .map((p) => ({
            problem: p.problemId,
            label: p.label.toUpperCase(),
            points: Number(p.points) || 1,
            order: Number(p.order) || 0,
          })),
      };

      const data = await apiRequest<{ contest: ApiContest }>("/contests", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setContests((current) => [data.contest, ...current]);
      setContestDialogOpen(false);
      toast.success("Contest created successfully");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to create contest");
    } finally {
      setSavingContest(false);
    }
  };

  const finalizeContest = async (contestId: string) => {
    setFinalizingId(contestId);
    try {
      const data = await apiRequest<{ message: string; processed: boolean }>(`/contests/${contestId}/finalize`, {
        method: "POST",
      });
      toast.success(data.message);
      // Refresh contests
      const updated = await apiRequest<{ contests: ApiContest[] }>("/contests?limit=100");
      setContests(updated.contests);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Finalization failed");
    } finally {
      setFinalizingId(null);
    }
  };

  const statusColor: Record<string, string> = {
    live: "border-red-500/40 text-red-400",
    upcoming: "border-yellow-500/40 text-yellow-400",
    ended: "border-border text-muted-foreground",
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-6 p-6">
        <div>
          <h1 className="text-2xl font-bold">Admin Console</h1>
          <p className="text-sm text-muted-foreground">Manage problems, contests, users, and platform infrastructure.</p>
        </div>

        {user?.role !== "admin" ? (
          <Card className="border-border/60 p-6">
            <h2 className="font-semibold">Access denied</h2>
            <p className="mt-1 text-sm text-muted-foreground">Only admins can manage platform data.</p>
          </Card>
        ) : (
          <>
            {/* Stats row */}
            <div className="grid gap-4 md:grid-cols-4">
              {[
                { l: "Total users", v: loadingProblems ? "..." : String(users.length), i: Users, c: "text-info" },
                { l: "Problems", v: loadingProblems ? "..." : String(problems.length), i: FileCode2, c: "text-primary" },
                { l: "Contests", v: loadingProblems ? "..." : String(contests.length), i: Trophy, c: "text-warning" },
                { l: "Workers online", v: `${workers.filter((w) => w.status === "online").length} / ${workers.length}`, i: Server, c: "text-success" },
              ].map((s) => (
                <Card key={s.l} className="border-border/60 p-5">
                  <div className="flex items-center justify-between"><span className="text-xs uppercase text-muted-foreground">{s.l}</span><s.i className="h-4 w-4 text-muted-foreground" /></div>
                  <div className={`mt-2 text-2xl font-bold ${s.c}`}>{s.v}</div>
                </Card>
              ))}
            </div>

            <Tabs defaultValue="problems" className="space-y-4">
              <TabsList className="flex-wrap h-auto gap-1 p-1">
                <TabsTrigger value="problems">Problems</TabsTrigger>
                <TabsTrigger value="contests">Contests</TabsTrigger>
                <TabsTrigger value="infrastructure">Infrastructure</TabsTrigger>
                <TabsTrigger value="users">Users</TabsTrigger>
              </TabsList>

              {/* ── Problems tab ── */}
              <TabsContent value="problems" className="space-y-4">
                {/* Queue chart */}
                <div className="grid gap-4 lg:grid-cols-3">
                  <Card className="border-border/60 p-5 lg:col-span-2">
                    <h3 className="mb-4 font-semibold">Judge queue throughput</h3>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={queue}>
                        <CartesianGrid stroke="oklch(0.28 0.014 250)" strokeDasharray="3 3" />
                        <XAxis dataKey="hour" stroke="oklch(0.65 0.012 250)" fontSize={11} />
                        <YAxis stroke="oklch(0.65 0.012 250)" fontSize={11} />
                        <Tooltip contentStyle={{ background: "oklch(0.20 0.014 250)", border: "1px solid oklch(0.28 0.014 250)", borderRadius: 8 }} />
                        <Bar dataKey="jobs" fill="oklch(0.72 0.18 145)" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </Card>
                  <Card className="border-border/60 p-5">
                    <h3 className="mb-4 font-semibold">Worker nodes</h3>
                    <div className="space-y-2 text-sm">
                      {workers.map((w) => (
                        <div key={w._id} className="rounded-lg border border-border/60 p-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Cpu className="h-4 w-4 text-muted-foreground" />
                              <span className="font-mono text-xs">{w.workerId}</span>
                            </div>
                            <Badge variant="outline" className={w.status === "online" ? "border-success/40 text-success" : "border-warning/40 text-warning"}>
                              <span className={`mr-1.5 h-1.5 w-1.5 rounded-full ${w.status === "online" ? "bg-success animate-pulse-glow" : "bg-warning"}`} />
                              {w.status}
                            </Badge>
                          </div>
                          <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                            <span>{w.region}</span><span>{w.load}% load</span>
                          </div>
                          <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
                            <div className={`h-full ${w.load > 80 ? "bg-destructive" : "gradient-primary"}`} style={{ width: `${w.load}%` }} />
                          </div>
                        </div>
                      ))}
                      {!loadingProblems && workers.length === 0 && <p className="text-sm text-muted-foreground">No workers registered.</p>}
                    </div>
                  </Card>
                </div>

                <Card className="border-border/60">
                  <div className="flex items-center justify-between p-5">
                    <h3 className="font-semibold">Problems</h3>
                    <Button size="sm" className="gradient-primary text-primary-foreground" onClick={openCreateDialog}>
                      <Plus className="mr-1.5 h-4 w-4" />New problem
                    </Button>
                  </div>
                  <table className="w-full text-sm">
                    <thead className="bg-secondary/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <tr><th className="px-4 py-3">ID</th><th className="px-4 py-3">Title</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Visibility</th><th className="px-4 py-3">Difficulty</th><th className="px-4 py-3">Acceptance</th><th className="px-4 py-3">Tests</th></tr>
                    </thead>
                    <tbody>
                      {problems.map((p) => (
                        <tr key={p._id} className="border-t border-border/60 hover:bg-accent/30">
                          <td className="px-4 py-3 font-mono text-xs">{p.problemId}</td>
                          <td className="px-4 py-3">
                            <div className="font-medium">{p.title}</div>
                            <div className="font-mono text-[10px] text-muted-foreground">{p.slug}</div>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{p.status}</td>
                          <td className="px-4 py-3 text-muted-foreground">{p.visibility ?? "public"}</td>
                          <td className={`px-4 py-3 font-medium ${difficultyClass[p.difficulty]}`}>{p.difficulty}</td>
                          <td className="px-4 py-3 text-muted-foreground">{p.acceptance}%</td>
                          <td className="px-4 py-3 text-muted-foreground">{p.testCases?.length ?? 0}</td>
                        </tr>
                      ))}
                      {!loadingProblems && problems.length === 0 && (
                        <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No problems in database.</td></tr>
                      )}
                    </tbody>
                  </table>
                </Card>
              </TabsContent>

              {/* ── Contests tab ── */}
              <TabsContent value="contests" className="space-y-4">
                <Card className="border-border/60">
                  <div className="flex items-center justify-between p-5">
                    <h3 className="font-semibold">Contests</h3>
                    <Button size="sm" className="gradient-primary text-primary-foreground" onClick={openContestDialog}>
                      <Plus className="mr-1.5 h-4 w-4" />New contest
                    </Button>
                  </div>
                  <table className="w-full text-sm">
                    <thead className="bg-secondary/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3">ID</th>
                        <th className="px-4 py-3">Name</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Start</th>
                        <th className="px-4 py-3">Duration</th>
                        <th className="px-4 py-3">Registered</th>
                        <th className="px-4 py-3">Problems</th>
                        <th className="px-4 py-3">Rated</th>
                        <th className="px-4 py-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contests.map((c) => (
                        <tr key={c._id} className="border-t border-border/60 hover:bg-accent/30">
                          <td className="px-4 py-3 font-mono text-xs">{c.contestId}</td>
                          <td className="px-4 py-3">
                            <Link to="/contests/$id" params={{ id: String(c.contestId) }} className="font-medium hover:text-primary transition">
                              {c.name}
                            </Link>
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant="outline" className={`text-xs ${statusColor[c.status] ?? ""}`}>
                              {c.status === "live" && <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse inline-block" />}
                              {c.status.toUpperCase()}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            {new Date(c.startsAt).toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{c.duration}m</td>
                          <td className="px-4 py-3 text-muted-foreground">{c.registeredCount}</td>
                          <td className="px-4 py-3 text-muted-foreground">{c.problems.length}</td>
                          <td className="px-4 py-3">
                            {c.ratingProcessed
                              ? <CheckCircle2 className="h-4 w-4 text-green-400" />
                              : <XCircle className="h-4 w-4 text-muted-foreground/40" />}
                          </td>
                          <td className="px-4 py-3">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs gap-1"
                              disabled={finalizingId === c._id || c.ratingProcessed}
                              onClick={() => finalizeContest(c._id)}
                            >
                              {finalizingId === c._id
                                ? <Loader2 className="h-3 w-3 animate-spin" />
                                : <Flame className="h-3 w-3" />}
                              {c.ratingProcessed ? "Finalized" : "Finalize"}
                            </Button>
                          </td>
                        </tr>
                      ))}
                      {!loadingProblems && contests.length === 0 && (
                        <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">No contests yet.</td></tr>
                      )}
                    </tbody>
                  </table>
                </Card>
              </TabsContent>

              {/* ── Infrastructure tab ── */}
              <TabsContent value="infrastructure" className="space-y-4">
                <div className="grid gap-4 lg:grid-cols-2">
                  <Card className="border-border/60">
                    <div className="p-5"><h3 className="font-semibold">Recent judge jobs</h3></div>
                    <table className="w-full text-sm">
                      <thead className="bg-secondary/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <tr><th className="px-4 py-3">Status</th><th className="px-4 py-3">Submission</th><th className="px-4 py-3">Worker</th><th className="px-4 py-3">Attempts</th></tr>
                      </thead>
                      <tbody>
                        {jobs.map((job) => (
                          <tr key={job._id} className="border-t border-border/60">
                            <td className="px-4 py-3">{job.status}</td>
                            <td className="px-4 py-3 text-xs text-muted-foreground">{job.submission?.submissionId ?? "-"}</td>
                            <td className="px-4 py-3 text-xs text-muted-foreground">{job.worker?.workerId ?? "-"}</td>
                            <td className="px-4 py-3 font-mono text-xs">{job.attempts}</td>
                          </tr>
                        ))}
                        {!loadingProblems && jobs.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No judge jobs.</td></tr>}
                      </tbody>
                    </table>
                  </Card>

                  <Card className="border-border/60">
                    <div className="p-5"><h3 className="font-semibold">Languages</h3></div>
                    <table className="w-full text-sm">
                      <thead className="bg-secondary/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <tr><th className="px-4 py-3">ID</th><th className="px-4 py-3">Label</th><th className="px-4 py-3">Version</th><th className="px-4 py-3">Enabled</th></tr>
                      </thead>
                      <tbody>
                        {languages.map((language) => (
                          <tr key={language.languageId} className="border-t border-border/60">
                            <td className="px-4 py-3 font-mono text-xs">{language.languageId}</td>
                            <td className="px-4 py-3">{language.label}</td>
                            <td className="px-4 py-3 text-muted-foreground">{language.version ?? "-"}</td>
                            <td className="px-4 py-3 text-muted-foreground">{language.enabled === false ? "No" : "Yes"}</td>
                          </tr>
                        ))}
                        {!loadingProblems && languages.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No languages configured.</td></tr>}
                      </tbody>
                    </table>
                  </Card>
                </div>
              </TabsContent>

              {/* ── Users tab ── */}
              <TabsContent value="users">
                <Card className="border-border/60">
                  <div className="p-5"><h3 className="font-semibold">Users</h3></div>
                  <table className="w-full text-sm">
                    <thead className="bg-secondary/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <tr><th className="px-4 py-3">Username</th><th className="px-4 py-3">Email</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Rating</th><th className="px-4 py-3">Solved</th></tr>
                    </thead>
                    <tbody>
                      {users.map((row) => (
                        <tr key={row._id} className="border-t border-border/60">
                          <td className="px-4 py-3 font-medium">{row.username}</td>
                          <td className="px-4 py-3 text-muted-foreground">{row.email}</td>
                          <td className="px-4 py-3 text-muted-foreground">{row.role}</td>
                          <td className="px-4 py-3 font-mono text-xs">{row.rating ?? 0}</td>
                          <td className="px-4 py-3 font-mono text-xs">{row.solved?.total ?? 0}</td>
                        </tr>
                      ))}
                      {!loadingProblems && users.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No users found.</td></tr>}
                    </tbody>
                  </table>
                </Card>
              </TabsContent>
            </Tabs>

            {/* ── Problem create dialog ── */}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
                <DialogHeader>
                  <DialogTitle>Add problem</DialogTitle>
                  <DialogDescription>Create a stdin/stdout problem and store it in MongoDB.</DialogDescription>
                </DialogHeader>

                <form className="space-y-5" onSubmit={createProblem}>
                  <div className="grid gap-3 md:grid-cols-5">
                    <Field label="ID"><Input value={form.problemId} onChange={(e) => setField("problemId", e.target.value)} inputMode="numeric" /></Field>
                    <Field label="Difficulty">
                      <Select value={form.difficulty} onValueChange={(value) => setField("difficulty", value as ApiDifficulty)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Easy">Easy</SelectItem>
                          <SelectItem value="Medium">Medium</SelectItem>
                          <SelectItem value="Hard">Hard</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Status">
                      <Select value={form.status} onValueChange={(value) => setField("status", value as ApiProblemStatus)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="draft">Draft</SelectItem>
                          <SelectItem value="published">Published</SelectItem>
                          <SelectItem value="archived">Archived</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Visibility">
                      <Select value={form.visibility} onValueChange={(value) => setField("visibility", value as ApiProblemVisibility)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="public">Public</SelectItem>
                          <SelectItem value="contest_only">Contest Only</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Premium">
                      <div className="flex h-10 items-center"><Switch checked={form.premium} onCheckedChange={(value) => setField("premium", value)} /></div>
                    </Field>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <Field label="Title"><Input value={form.title} onChange={(e) => setField("title", e.target.value)} required /></Field>
                    <Field label="Slug"><Input value={form.slug} onChange={(e) => setField("slug", e.target.value)} /></Field>
                  </div>

                  <Field label="Tags"><Input value={form.tags} onChange={(e) => setField("tags", e.target.value)} placeholder="Array, Hash Table, DP" /></Field>
                  <Field label="Description"><Textarea value={form.description} onChange={(e) => setField("description", e.target.value)} className="min-h-32" required /></Field>

                  <div className="grid gap-3 md:grid-cols-2">
                    <Field label="Constraints"><Textarea value={form.constraints} onChange={(e) => setField("constraints", e.target.value)} placeholder="One constraint per line" /></Field>
                    <Field label="Hints"><Textarea value={form.hints} onChange={(e) => setField("hints", e.target.value)} placeholder="One hint per line" /></Field>
                  </div>

                  <ExamplesEditor
                    examples={form.examples}
                    onChange={(rows) => setField("examples", rows)}
                  />
                  <TestCasesEditor
                    testCases={form.testCases}
                    onChange={(rows) => setField("testCases", rows)}
                  />

                  <div className="grid gap-3 md:grid-cols-2">
                    <Field label="Time limit ms"><Input value={form.timeLimitMs} onChange={(e) => setField("timeLimitMs", e.target.value)} inputMode="numeric" /></Field>
                    <Field label="Memory limit MB"><Input value={form.memoryLimitMb} onChange={(e) => setField("memoryLimitMb", e.target.value)} inputMode="numeric" /></Field>
                  </div>

                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
                    <Button type="submit" className="gradient-primary text-primary-foreground" disabled={saving}>{saving ? "Saving..." : "Add problem"}</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>

            {/* ── Contest create dialog ── */}
            <Dialog open={contestDialogOpen} onOpenChange={setContestDialogOpen}>
              <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
                <DialogHeader>
                  <DialogTitle>Create contest</DialogTitle>
                  <DialogDescription>Set up a new rated contest with problems from the problem bank.</DialogDescription>
                </DialogHeader>

                <form className="space-y-5" onSubmit={createContest}>
                  <div className="grid gap-3 md:grid-cols-3">
                    <Field label="Contest ID"><Input value={contestForm.contestId} onChange={(e) => setContestField("contestId", e.target.value)} inputMode="numeric" /></Field>
                    <Field label="Duration (minutes)"><Input value={contestForm.duration} onChange={(e) => setContestField("duration", e.target.value)} inputMode="numeric" /></Field>
                    <Field label="Difficulty">
                      <Select value={contestForm.difficulty} onValueChange={(v) => setContestField("difficulty", v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Mixed">Mixed</SelectItem>
                          <SelectItem value="Easy">Easy</SelectItem>
                          <SelectItem value="Medium">Medium</SelectItem>
                          <SelectItem value="Hard">Hard</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                  </div>

                  <Field label="Contest Name"><Input value={contestForm.name} onChange={(e) => setContestField("name", e.target.value)} placeholder="e.g. CodeArena Round #1" required /></Field>
                  <Field label="Description"><Textarea value={contestForm.description} onChange={(e) => setContestField("description", e.target.value)} placeholder="Short description visible to participants" className="min-h-20" /></Field>

                  <Field label="Start Date & Time">
                    <Input type="datetime-local" value={contestForm.startsAt} onChange={(e) => setContestField("startsAt", e.target.value)} required />
                  </Field>

                  {/* Problem picker */}
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">Problems</span>
                      <Button type="button" size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={addContestProblem}>
                        <Plus className="h-3 w-3" />Add problem
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {contestForm.problems.map((row, i) => (
                        <div key={i} className="flex items-center gap-2 rounded-lg border border-border/60 p-2">
                          <Input
                            placeholder="Label (A, B, C…)"
                            value={row.label}
                            onChange={(e) => updateContestProblemRow(i, "label", e.target.value)}
                            className="h-8 w-20 text-xs"
                          />
                          <Select value={row.problemId} onValueChange={(v) => updateContestProblemRow(i, "problemId", v)}>
                            <SelectTrigger className="h-8 flex-1 text-xs"><SelectValue placeholder="Select problem…" /></SelectTrigger>
                            <SelectContent>
                              {problems.map((p) => (
                                <SelectItem key={p._id} value={p._id}>
                                  [{p.problemId}] {p.title} ({p.difficulty})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            placeholder="Pts"
                            value={row.points}
                            onChange={(e) => updateContestProblemRow(i, "points", e.target.value)}
                            inputMode="numeric"
                            className="h-8 w-14 text-xs"
                          />
                          <Button type="button" size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive" onClick={() => removeContestProblem(i)}>✕</Button>
                        </div>
                      ))}
                      {contestForm.problems.length === 0 && (
                        <p className="py-3 text-center text-xs text-muted-foreground">No problems added. Click "Add problem" to include problems.</p>
                      )}
                    </div>
                  </div>

                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setContestDialogOpen(false)} disabled={savingContest}>Cancel</Button>
                    <Button type="submit" className="gradient-primary text-primary-foreground" disabled={savingContest}>
                      {savingContest ? "Creating..." : "Create contest"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </>
        )}
      </div>
    </AppShell>
  );
}

function ExamplesEditor({
  examples,
  onChange,
}: {
  examples: ExampleRow[];
  onChange: (rows: ExampleRow[]) => void;
}) {
  const add = () => onChange([...examples, { input: "", output: "", explanation: "" }]);
  const remove = (i: number) => onChange(examples.filter((_, idx) => idx !== i));
  const update = (i: number, key: keyof ExampleRow, value: string) =>
    onChange(examples.map((e, idx) => (idx === i ? { ...e, [key]: value } : e)));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          Examples <span className="text-destructive">*</span>
        </span>
        <Button type="button" size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={add}>
          <Plus className="h-3 w-3" />Add example
        </Button>
      </div>
      {examples.length === 0 && (
        <p className="py-3 text-center text-xs text-muted-foreground rounded-lg border border-dashed border-border/60">
          No examples yet. Click "Add example".
        </p>
      )}
      {examples.map((ex, i) => (
        <div key={i} className="rounded-lg border border-border/60 bg-card/40 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">Example {i + 1}</span>
            <Button
              type="button" size="sm" variant="ghost"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
              onClick={() => remove(i)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <div className="space-y-1">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Input</span>
              <Textarea
                value={ex.input}
                onChange={(e) => update(i, "input", e.target.value)}
                className="min-h-18 font-mono text-xs resize-y"
                placeholder="stdin…"
              />
            </div>
            <div className="space-y-1">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Output</span>
              <Textarea
                value={ex.output}
                onChange={(e) => update(i, "output", e.target.value)}
                className="min-h-18 font-mono text-xs resize-y"
                placeholder="stdout…"
              />
            </div>
          </div>
          <div className="space-y-1">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Explanation (optional)</span>
            <Input
              value={ex.explanation}
              onChange={(e) => update(i, "explanation", e.target.value)}
              className="text-xs"
              placeholder="Brief note shown to the user below this example"
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function TestCasesEditor({
  testCases,
  onChange,
}: {
  testCases: TestCaseRow[];
  onChange: (rows: TestCaseRow[]) => void;
}) {
  const add = () => onChange([...testCases, { input: "", expectedOutput: "", hidden: true }]);
  const remove = (i: number) => onChange(testCases.filter((_, idx) => idx !== i));
  const update = (i: number, key: keyof TestCaseRow, value: string | boolean) =>
    onChange(testCases.map((t, idx) => (idx === i ? { ...t, [key]: value } : t)));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          Test Cases <span className="text-destructive">*</span>
        </span>
        <Button type="button" size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={add}>
          <Plus className="h-3 w-3" />Add test case
        </Button>
      </div>
      {testCases.length === 0 && (
        <p className="py-3 text-center text-xs text-muted-foreground rounded-lg border border-dashed border-border/60">
          No test cases yet. Click "Add test case".
        </p>
      )}
      {testCases.map((tc, i) => (
        <div key={i} className="rounded-lg border border-border/60 bg-card/40 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">Test Case {i + 1}</span>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <Switch
                  checked={tc.hidden}
                  onCheckedChange={(v) => update(i, "hidden", v)}
                />
                <span className="text-xs text-muted-foreground">Hidden</span>
              </label>
              <Button
                type="button" size="sm" variant="ghost"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                onClick={() => remove(i)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <div className="space-y-1">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Input</span>
              <Textarea
                value={tc.input}
                onChange={(e) => update(i, "input", e.target.value)}
                className="min-h-18 font-mono text-xs resize-y"
                placeholder="stdin…"
              />
            </div>
            <div className="space-y-1">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Expected Output</span>
              <Textarea
                value={tc.expectedOutput}
                onChange={(e) => update(i, "expectedOutput", e.target.value)}
                className="min-h-18 font-mono text-xs resize-y"
                placeholder="expected stdout…"
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
