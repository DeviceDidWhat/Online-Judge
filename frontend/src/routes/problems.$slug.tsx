import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import Editor from "@monaco-editor/react";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowLeft, Bookmark, ChevronLeft, ChevronRight, History, Lightbulb,
  Maximize2, Play, RotateCcw, Send, Settings2, Share2, Terminal, ThumbsUp,
} from "lucide-react";
import { Navbar } from "@/components/navbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { VerdictBadge } from "@/components/verdict-badge";
import {
  difficultyClass, languages, problems, submissions as allSubs,
  type Problem, type Verdict,
} from "@/lib/mock-data";
import { toast } from "sonner";
import { useRequireAuth } from "@/lib/auth";

export const Route = createFileRoute("/problems/$slug")({
  loader: ({ params }): Problem => {
    const p = problems.find((x) => x.slug === params.slug);
    if (!p) throw notFound();
    return p;
  },
  component: ProblemDetail,
});

type LocalSub = {
  id: string;
  verdict: Verdict;
  language: string;
  runtime: number;
  memory: number;
  timestamp: string;
};

function ProblemDetail() {
  const { isLoading, user } = useRequireAuth();
  const p = Route.useLoaderData() as Problem;
  const [lang, setLang] = useState("cpp");
  const [code, setCode] = useState(p.starterCode[lang] || "// start coding…");
  const [fontSize, setFontSize] = useState(14);
  const [running, setRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [output, setOutput] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [customInput, setCustomInput] = useState(p.examples[0]?.input ?? "");
  const [bottomTab, setBottomTab] = useState("testcase");
  const [resultId, setResultId] = useState("0000");
  const [localSubs, setLocalSubs] = useState<LocalSub[]>(
    allSubs.slice(0, 6).map((s) => ({
      id: s.id, verdict: s.verdict, language: s.language,
      runtime: s.runtime, memory: s.memory, timestamp: s.timestamp,
    })),
  );

  const neighbors = useMemo(() => {
    const i = problems.findIndex((x) => x.slug === p.slug);
    return { prev: problems[i - 1], next: problems[i + 1] };
  }, [p.slug]);

  const onRun = () => {
    setRunning(true); setOutput(null); setBottomTab("output");
    setTimeout(() => {
      setRunning(false);
      setOutput(
        `▸ Compiling ${languages.find((l) => l.id === lang)?.label}…\n` +
        `▸ Dispatched to judge node #7\n\n` +
        `stdout:\n${p.examples[0]?.output ?? "[]"}\n\n` +
        `Runtime: 12 ms · Memory: 6.4 MB · Exit code 0`,
      );
    }, 900);
  };

  const onSubmit = () => {
    setSubmitting(true);
    setTimeout(() => {
      const pool: Verdict[] = ["Accepted", "Accepted", "Accepted", "Wrong Answer", "TLE", "MLE", "Runtime Error"];
      const v = pool[Math.floor(Math.random() * pool.length)];
      const newId = String(Math.floor(Math.random() * 9000 + 1000));
      setResultId(newId);
      setVerdict(v); setShowResult(true); setSubmitting(false);
      setLocalSubs((s) => [{
        id: `sub_${Math.floor(Math.random() * 9000 + 1000)}`,
        verdict: v,
        language: languages.find((l) => l.id === lang)?.label ?? lang,
        runtime: Math.floor(Math.random() * 200) + 8,
        memory: Math.floor(Math.random() * 20) + 6,
        timestamp: new Date().toISOString(),
      }, ...s]);
      if (v === "Accepted") toast.success("Accepted — all 87 testcases passed 🎉");
      else toast.error(`Verdict: ${v}`);
    }, 1200);
  };

  if (isLoading || !user) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <div className="h-10 w-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <Navbar />

      {/* Sticky toolbar */}
      <div className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border/60 bg-background/80 px-4 py-2 backdrop-blur-md">
        <div className="flex items-center gap-2 min-w-0">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/problems"><ArrowLeft className="mr-1 h-4 w-4" />Problems</Link>
          </Button>
          <div className="h-5 w-px bg-border" />
          <div className="flex items-center gap-1">
            {neighbors.prev && (
              <Button variant="ghost" size="icon" asChild className="h-7 w-7">
                <Link to="/problems/$slug" params={{ slug: neighbors.prev.slug }}><ChevronLeft className="h-4 w-4" /></Link>
              </Button>
            )}
            {neighbors.next && (
              <Button variant="ghost" size="icon" asChild className="h-7 w-7">
                <Link to="/problems/$slug" params={{ slug: neighbors.next.slug }}><ChevronRight className="h-4 w-4" /></Link>
              </Button>
            )}
          </div>
          <h1 className="ml-1 truncate font-semibold">{p.id}. {p.title}</h1>
          <span className={`text-sm font-medium ${difficultyClass[p.difficulty]}`}>{p.difficulty}</span>
        </div>
        <div className="flex items-center gap-2">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1.5">
                <History className="h-3.5 w-3.5" /> History
                <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">{localSubs.length}</Badge>
              </Button>
            </SheetTrigger>
            <SheetContent className="w-[420px] sm:max-w-md">
              <SheetHeader>
                <SheetTitle>Submission History</SheetTitle>
                <SheetDescription>Recent attempts for {p.title}</SheetDescription>
              </SheetHeader>
              <div className="mt-4 space-y-2 overflow-y-auto pr-1">
                <AnimatePresence initial={false}>
                  {localSubs.map((s) => (
                    <motion.div key={s.id}
                      initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                      className="rounded-lg border border-border/60 bg-card/40 p-3 transition-colors hover:bg-card/70">
                      <div className="flex items-center justify-between">
                        <VerdictBadge verdict={s.verdict} />
                        <span className="text-[10px] text-muted-foreground font-mono">#{s.id}</span>
                      </div>
                      <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                        <div><div className="text-muted-foreground">Lang</div><div className="font-mono">{s.language}</div></div>
                        <div><div className="text-muted-foreground">Runtime</div><div className="font-mono">{s.runtime} ms</div></div>
                        <div><div className="text-muted-foreground">Memory</div><div className="font-mono">{s.memory} MB</div></div>
                      </div>
                      <div className="mt-1 text-[10px] text-muted-foreground font-mono">{s.timestamp.replace("T", " ").slice(0, 16)}</div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </SheetContent>
          </Sheet>
          <Button variant="ghost" size="icon" className="h-8 w-8"><Bookmark className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" className="h-8 w-8"><Share2 className="h-4 w-4" /></Button>
          <div className="h-5 w-px bg-border" />
          <Button variant="outline" size="sm" onClick={onRun} disabled={running || submitting}>
            <Play className="mr-1.5 h-3.5 w-3.5" /> Run
          </Button>
          <Button size="sm" className="gradient-primary text-primary-foreground" onClick={onSubmit} disabled={running || submitting}>
            <Send className="mr-1.5 h-3.5 w-3.5" /> {submitting ? "Judging…" : "Submit"}
          </Button>
        </div>
      </div>

      {/* Resizable split */}
      <ResizablePanelGroup orientation="horizontal" className="flex-1 min-h-0">
        {/* LEFT */}
        <ResizablePanel defaultSize={45} minSize={28} className="overflow-hidden">
          <div className="h-full overflow-y-auto">
            <Tabs defaultValue="problem" className="p-4">
              <TabsList className="bg-secondary/60">
                <TabsTrigger value="problem">Description</TabsTrigger>
                <TabsTrigger value="hints">Hints</TabsTrigger>
                <TabsTrigger value="editorial">Editorial</TabsTrigger>
                <TabsTrigger value="discuss">Discussions</TabsTrigger>
                <TabsTrigger value="submissions">Submissions</TabsTrigger>
              </TabsList>

              <TabsContent value="problem" className="space-y-6 pt-4 text-sm leading-relaxed">
                <div className="flex flex-wrap gap-1.5">
                  {p.tags.map((t) => <Badge key={t} variant="secondary">{t}</Badge>)}
                  <Badge variant="outline" className="text-success border-success/40">Acceptance {p.acceptance}%</Badge>
                </div>
                <p className="whitespace-pre-line">{p.description}</p>

                <div>
                  <h3 className="mb-2 font-semibold">Examples</h3>
                  <div className="space-y-3">
                    {p.examples.map((ex, i) => (
                      <motion.div key={i}
                        initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                        className="rounded-lg border border-border/60 bg-secondary/40 p-3 font-mono text-xs">
                        <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Example {i + 1}</div>
                        <div><span className="text-muted-foreground">Input: </span>{ex.input}</div>
                        <div><span className="text-muted-foreground">Output: </span>{ex.output}</div>
                        {ex.explanation && <div className="mt-1 text-muted-foreground">Explanation: {ex.explanation}</div>}
                      </motion.div>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="mb-2 font-semibold">Constraints</h3>
                  <ul className="space-y-1 text-muted-foreground">
                    {p.constraints.map((c, i) => <li key={i} className="font-mono text-xs">• {c}</li>)}
                  </ul>
                </div>
              </TabsContent>

              <TabsContent value="hints" className="space-y-3 pt-4">
                {p.hints.map((h, i) => (
                  <motion.div key={i}
                    initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                    className="flex gap-3 rounded-lg border border-border/60 bg-warning/5 p-3">
                    <Lightbulb className="h-4 w-4 shrink-0 text-warning" />
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Hint {i + 1}</div>
                      <p className="text-sm">{h}</p>
                    </div>
                  </motion.div>
                ))}
              </TabsContent>

              <TabsContent value="editorial" className="pt-4 text-sm space-y-3">
                <h3 className="font-semibold">Approach 1 — Hash Map (Optimal)</h3>
                <p className="text-muted-foreground">
                  Iterate through the array once. For each element, check whether the complement
                  (<code className="font-mono text-foreground">target - nums[i]</code>) has been seen before.
                  A hash map gives O(1) average lookup, so total time complexity is O(n).
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-md border border-border/60 p-2"><div className="text-muted-foreground">Time</div><div className="font-mono">O(n)</div></div>
                  <div className="rounded-md border border-border/60 p-2"><div className="text-muted-foreground">Space</div><div className="font-mono">O(n)</div></div>
                </div>
              </TabsContent>

              <TabsContent value="discuss" className="space-y-3 pt-4">
                {[1,2,3].map((i) => (
                  <div key={i} className="rounded-lg border border-border/60 p-3 transition-colors hover:bg-secondary/30">
                    <div className="text-sm font-medium">Clean {i === 1 ? "C++" : i === 2 ? "Python" : "Java"} solution beats 99%</div>
                    <div className="mt-1 text-xs text-muted-foreground">by tourist · 2h ago</div>
                    <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1"><ThumbsUp className="h-3 w-3" /> {248 - i * 30}</span>
                    </div>
                  </div>
                ))}
              </TabsContent>

              <TabsContent value="submissions" className="space-y-2 pt-4">
                {localSubs.map((s) => (
                  <div key={s.id} className="flex items-center justify-between rounded-lg border border-border/60 p-3">
                    <div className="flex items-center gap-3">
                      <VerdictBadge verdict={s.verdict} />
                      <span className="text-xs text-muted-foreground font-mono">{s.language}</span>
                    </div>
                    <div className="text-xs text-muted-foreground font-mono">{s.runtime}ms · {s.memory}MB</div>
                  </div>
                ))}
              </TabsContent>
            </Tabs>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* RIGHT */}
        <ResizablePanel defaultSize={55} minSize={30} className="overflow-hidden">
          <ResizablePanelGroup orientation="vertical" className="h-full">
            {/* Editor */}
            <ResizablePanel defaultSize={65} minSize={25} className="flex flex-col">
              <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border/60 bg-card/40 px-3 py-1.5 backdrop-blur">
                <Select value={lang} onValueChange={(v) => { setLang(v); setCode(p.starterCode[v] || "// start coding…"); }}>
                  <SelectTrigger className="h-7 w-36 bg-card/50 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {languages.map((l) => <SelectItem key={l.id} value={l.id}>{l.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7"
                    onClick={() => { setCode(p.starterCode[lang] || ""); toast.success("Code reset"); }}>
                    <RotateCcw className="h-3.5 w-3.5" />
                  </Button>
                  <Select value={String(fontSize)} onValueChange={(v) => setFontSize(Number(v))}>
                    <SelectTrigger className="h-7 w-18 bg-card/50 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[12, 13, 14, 15, 16, 18].map((s) => <SelectItem key={s} value={String(s)}>{s}px</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button variant="ghost" size="icon" className="h-7 w-7"><Settings2 className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7"><Maximize2 className="h-3.5 w-3.5" /></Button>
                  <span className="ml-1 text-[10px] text-muted-foreground font-mono">Auto-saved</span>
                </div>
              </div>
              <div className="flex-1 min-h-0">
                <Editor
                  theme="vs-dark"
                  language={languages.find((l) => l.id === lang)?.monaco || "plaintext"}
                  value={code}
                  onChange={(v) => setCode(v ?? "")}
                  options={{
                    fontFamily: "JetBrains Mono, monospace",
                    fontSize,
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    smoothScrolling: true,
                    cursorBlinking: "smooth",
                    padding: { top: 12 },
                  }}
                />
              </div>
            </ResizablePanel>

            <ResizableHandle withHandle />

            {/* Console */}
            <ResizablePanel defaultSize={35} minSize={12} className="overflow-hidden">
              <Tabs value={bottomTab} onValueChange={setBottomTab} className="h-full p-3 flex flex-col">
                <TabsList className="bg-secondary/60 self-start">
                  <TabsTrigger value="testcase">Testcase</TabsTrigger>
                  <TabsTrigger value="output"><Terminal className="mr-1.5 h-3.5 w-3.5" />Output</TabsTrigger>
                </TabsList>
                <TabsContent value="testcase" className="flex-1 min-h-0 pt-3">
                  <div className="flex gap-2 mb-2">
                    {p.examples.map((_, i) => (
                      <Button key={i} variant="secondary" size="sm" className="h-7 text-xs"
                        onClick={() => setCustomInput(p.examples[i].input)}>
                        Case {i + 1}
                      </Button>
                    ))}
                  </div>
                  <Textarea value={customInput} onChange={(e) => setCustomInput(e.target.value)}
                    placeholder="Custom input…"
                    className="h-[calc(100%-2.75rem)] font-mono text-xs bg-secondary/40 resize-none" />
                </TabsContent>
                <TabsContent value="output" className="flex-1 min-h-0 pt-3">
                  <pre className="h-full overflow-auto rounded-md border border-border/60 bg-background p-3 font-mono text-xs whitespace-pre-wrap">
                    {running ? <span className="text-warning animate-pulse">▸ Executing on judge node #7…</span> :
                     output ?? <span className="text-muted-foreground">Run your code to see output here.</span>}
                  </pre>
                </TabsContent>
              </Tabs>
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
      </ResizablePanelGroup>

      {/* Verdict modal */}
      <Dialog open={showResult} onOpenChange={setShowResult}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              {verdict && <VerdictBadge verdict={verdict} />}
              <span>Submission Result</span>
            </DialogTitle>
            <DialogDescription>Submission #SUB-{resultId}</DialogDescription>
          </DialogHeader>
          {verdict === "Accepted" ? (
            <motion.div initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border border-border/60 p-3">
                  <div className="text-xs text-muted-foreground">Runtime</div>
                  <div className="text-lg font-semibold text-success">8 ms</div>
                  <div className="text-xs text-muted-foreground">Beats 96.2%</div>
                </div>
                <div className="rounded-lg border border-border/60 p-3">
                  <div className="text-xs text-muted-foreground">Memory</div>
                  <div className="text-lg font-semibold text-success">6.4 MB</div>
                  <div className="text-xs text-muted-foreground">Beats 87.1%</div>
                </div>
              </div>
              <div className="text-xs text-muted-foreground">All 87 / 87 testcases passed.</div>
            </motion.div>
          ) : (
            <div className="text-sm text-muted-foreground space-y-2">
              <div>
                {verdict === "TLE" && "Your solution exceeded the time limit on testcase 47 / 87."}
                {verdict === "MLE" && "Your solution exceeded the memory limit (256 MB) on testcase 63 / 87."}
                {verdict === "Runtime Error" && "Runtime error on testcase 12 / 87 — SIGSEGV (segmentation fault)."}
                {verdict === "Wrong Answer" && "Testcase 14 / 87 failed."}
              </div>
              <pre className="rounded-md bg-secondary/60 p-3 font-mono text-xs">
{`Input:    [3,2,4,0]
Expected: [1,2]
Got:      [0,2]`}
              </pre>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
