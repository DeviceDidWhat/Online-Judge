import { createFileRoute } from "@tanstack/react-router";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, Cpu, FileCode2, Plus, Server, Users } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest, type ApiDifficulty, type ApiProblem, type ApiProblemStatus } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { difficultyClass } from "@/lib/mock-data";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin - CodeArena" }] }),
  component: Admin,
});

const queue = Array.from({ length: 12 }, (_, i) => ({ hour: `${i * 2}:00`, jobs: Math.floor(Math.random() * 400) + 80 }));
const workers = Array.from({ length: 8 }, (_, i) => ({
  id: `worker-${i + 1}`,
  region: ["us-east", "eu-west", "ap-south"][i % 3],
  load: Math.floor(Math.random() * 100),
  status: Math.random() > 0.1 ? "online" : "degraded",
}));

type ProblemForm = {
  problemId: string;
  slug: string;
  title: string;
  difficulty: ApiDifficulty;
  status: ApiProblemStatus;
  tags: string;
  premium: boolean;
  description: string;
  constraints: string;
  examples: string;
  testCases: string;
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
  tags: "",
  premium: false,
  description: "",
  constraints: "",
  examples: "input => output",
  testCases: "input => expected output",
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

const parsePairs = (value: string, outputKey: "output" | "expectedOutput") => {
  const blocks = value
    .split(/\r?\n---\r?\n/)
    .map((block) => block.trim())
    .filter(Boolean);

  return blocks.map((block, index) => {
    const separator = block.includes("=>") ? "=>" : "|";
    const separatorIndex = block.indexOf(separator);
    const input = separatorIndex >= 0 ? block.slice(0, separatorIndex) : "";
    const output = separatorIndex >= 0 ? block.slice(separatorIndex + separator.length) : "";
    return {
      input: input.trim(),
      [outputKey]: output.trim(),
      ...(outputKey === "expectedOutput" ? { hidden: true, order: index + 1 } : {}),
    };
  });
};

const buildPayload = (form: ProblemForm) => {
  const examples = parsePairs(form.examples, "output");
  const testCases = parsePairs(form.testCases, "expectedOutput");
  if (!form.title.trim()) throw new Error("Title is required");
  if (!form.description.trim()) throw new Error("Description is required");
  if (examples.length === 0 || examples.some((item) => !item.input || !("output" in item) || !item.output)) {
    throw new Error("Add at least one example as input => output");
  }
  if (testCases.length === 0 || testCases.some((item) => !item.input || !("expectedOutput" in item) || !item.expectedOutput)) {
    throw new Error("Add at least one testcase as input => expected output");
  }

  return {
    ...(form.problemId ? { problemId: Number(form.problemId) } : {}),
    ...(form.slug ? { slug: slugify(form.slug) } : {}),
    title: form.title.trim(),
    difficulty: form.difficulty,
    status: form.status,
    premium: form.premium,
    tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
    description: form.description.trim(),
    constraints: splitLines(form.constraints),
    examples,
    testCases,
    hints: splitLines(form.hints),
    starterCode: {},
    timeLimitMs: Number(form.timeLimitMs) || 1000,
    memoryLimitMb: Number(form.memoryLimitMb) || 256,
  };
};

function Admin() {
  const { user } = useAuth();
  const [problems, setProblems] = useState<ApiProblem[]>([]);
  const [loadingProblems, setLoadingProblems] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<ProblemForm>(emptyForm);

  const nextProblemId = useMemo(() => (
    problems.length ? Math.max(...problems.map((problem) => problem.problemId)) + 1 : 1
  ), [problems]);

  useEffect(() => {
    if (user?.role !== "admin") return;
    let cancelled = false;
    setLoadingProblems(true);
    apiRequest<{ problems: ApiProblem[] }>("/problems?limit=100")
      .then((data) => {
        if (!cancelled) setProblems(data.problems);
      })
      .catch((error) => {
        if (!cancelled) toast.error(error instanceof Error ? error.message : "Unable to load problems");
      })
      .finally(() => {
        if (!cancelled) setLoadingProblems(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.role]);

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

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-6 p-6">
        <div>
          <h1 className="text-2xl font-bold">Admin Console</h1>
          <p className="text-sm text-muted-foreground">Manage problems, users, and platform infrastructure.</p>
        </div>

        {user?.role !== "admin" ? (
          <Card className="border-border/60 p-6">
            <h2 className="font-semibold">Access denied</h2>
            <p className="mt-1 text-sm text-muted-foreground">Only admins can manage platform data.</p>
          </Card>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-4">
              {[
                { l: "Total users", v: "243,184", i: Users, c: "text-info" },
                { l: "Problems", v: loadingProblems ? "..." : String(problems.length), i: FileCode2, c: "text-primary" },
                { l: "Jobs in queue", v: "84", i: Activity, c: "text-warning" },
                { l: "Workers online", v: "7 / 8", i: Server, c: "text-success" },
              ].map((s) => (
                <Card key={s.l} className="border-border/60 p-5">
                  <div className="flex items-center justify-between"><span className="text-xs uppercase text-muted-foreground">{s.l}</span><s.i className="h-4 w-4 text-muted-foreground" /></div>
                  <div className={`mt-2 text-2xl font-bold ${s.c}`}>{s.v}</div>
                </Card>
              ))}
            </div>

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
                    <div key={w.id} className="rounded-lg border border-border/60 p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Cpu className="h-4 w-4 text-muted-foreground" />
                          <span className="font-mono text-xs">{w.id}</span>
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
                  <tr><th className="px-4 py-3">ID</th><th className="px-4 py-3">Title</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Difficulty</th><th className="px-4 py-3">Acceptance</th><th className="px-4 py-3">Tests</th></tr>
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

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
                <DialogHeader>
                  <DialogTitle>Add problem</DialogTitle>
                  <DialogDescription>Create a stdin/stdout problem and store it in MongoDB.</DialogDescription>
                </DialogHeader>

                <form className="space-y-5" onSubmit={createProblem}>
                  <div className="grid gap-3 md:grid-cols-4">
                    <Field label="ID">
                      <Input value={form.problemId} onChange={(e) => setField("problemId", e.target.value)} inputMode="numeric" />
                    </Field>
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

                  <div className="grid gap-3 md:grid-cols-2">
                    <Field label="Examples"><Textarea value={form.examples} onChange={(e) => setField("examples", e.target.value)} className="min-h-40 font-mono" placeholder={"input\n=>\noutput\n---\ninput\n=>\noutput"} /></Field>
                    <Field label="Testcases"><Textarea value={form.testCases} onChange={(e) => setField("testCases", e.target.value)} className="min-h-40 font-mono" placeholder={"input\n=>\nexpected output\n---\ninput\n=>\nexpected output"} /></Field>
                  </div>

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
          </>
        )}
      </div>
    </AppShell>
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
