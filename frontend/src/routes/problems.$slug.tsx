import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import Editor from "@monaco-editor/react";
import { ArrowLeft, Bookmark, History, Lightbulb, Play, RotateCcw, Send, Terminal } from "lucide-react";
import { Navbar } from "@/components/navbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { VerdictBadge } from "@/components/verdict-badge";
import { apiRequest, type ApiLanguage, type ApiProblem, type ApiProblemProgress, type ApiSubmission, type ApiVerdict } from "@/lib/api";
import { difficultyClass } from "@/lib/mock-data";
import { toast } from "sonner";
import { useRequireAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";

export const Route = createFileRoute("/problems/$slug")({
  head: () => ({ meta: [{ title: "Problem - CodeArena" }] }),
  component: ProblemDetail,
});

const fallbackLanguages: ApiLanguage[] = [
  { languageId: "cpp", label: "C++ 17", monaco: "cpp" },
  { languageId: "c", label: "C", monaco: "c" },
  { languageId: "python", label: "Python 3.11", monaco: "python" },
  { languageId: "javascript", label: "JavaScript", monaco: "javascript" },
  { languageId: "java", label: "Java 17", monaco: "java" },
];

const formatLanguage = (languages: ApiLanguage[], languageId: string) =>
  languages.find((item) => item.languageId === languageId)?.label ?? languageId;

const resultText = (submission: ApiSubmission) => {
  const lines = [
    `Verdict: ${submission.verdict}`,
    `Passed: ${submission.testcasesPassed ?? 0}/${submission.totalTestcases ?? 0}`,
    `Runtime: ${submission.runtime ?? 0} ms`,
    `Memory: ${submission.memory ?? 0} MB`,
  ];
  if (submission.compileOutput) lines.push("", "Compile output:", submission.compileOutput);
  if (submission.stderr) lines.push("", "stderr:", submission.stderr);
  if (submission.failedTestcase) {
    lines.push(
      "",
      `Failed testcase ${submission.failedTestcase.index ?? ""}`,
      "Input:",
      submission.failedTestcase.input ?? "",
      "Expected:",
      submission.failedTestcase.expectedOutput ?? "",
      "Got:",
      submission.failedTestcase.actualOutput ?? "",
    );
  }
  return lines.join("\n");
};

function ProblemDetail() {
  const { isLoading, user } = useRequireAuth();
  const { theme } = useTheme();
  const { slug } = Route.useParams();
  const [problem, setProblem] = useState<ApiProblem | null>(null);
  const [progress, setProgress] = useState<ApiProblemProgress | null>(null);
  const [languages, setLanguages] = useState<ApiLanguage[]>(fallbackLanguages);
  const [lang, setLang] = useState(fallbackLanguages[0].languageId);
  const [code, setCode] = useState("");
  const [fontSize, setFontSize] = useState(14);
  const [loadingProblem, setLoadingProblem] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [savingCode, setSavingCode] = useState(false);
  const [output, setOutput] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<ApiVerdict | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [customInput, setCustomInput] = useState("");
  const [bottomTab, setBottomTab] = useState("testcase");
  const [resultSubmission, setResultSubmission] = useState<ApiSubmission | null>(null);
  const [submissions, setSubmissions] = useState<ApiSubmission[]>([]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLoadingProblem(true);
    Promise.all([
      apiRequest<{ problem: ApiProblem }>(`/problems/${slug}`),
      apiRequest<{ languages: ApiLanguage[] }>("/languages"),
      apiRequest<{ progress: ApiProblemProgress }>(`/problems/${slug}/progress`),
      apiRequest<{ submissions: ApiSubmission[] }>(`/submissions?problem=${slug}&limit=20`),
    ])
      .then(([problemData, languageData, progressData, submissionData]) => {
        if (cancelled) return;
        const nextLanguages = languageData.languages.length > 0 ? languageData.languages : fallbackLanguages;
        const firstLanguage = nextLanguages[0]?.languageId ?? "cpp";
        const saved = progressData.progress.savedCode?.find((item) => item.language === firstLanguage);
        setProblem(problemData.problem);
        setLanguages(nextLanguages);
        setProgress(progressData.progress);
        setSubmissions(submissionData.submissions);
        setLang(firstLanguage);
        setCode(saved?.code ?? "");
        setCustomInput(problemData.problem.examples[0]?.input ?? "");
      })
      .catch((error) => {
        if (!cancelled) toast.error(error instanceof Error ? error.message : "Unable to load problem");
      })
      .finally(() => {
        if (!cancelled) setLoadingProblem(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug, user]);

  const savedCodeByLanguage = useMemo(() => new Map(
    progress?.savedCode?.map((item) => [item.language, item.code]) ?? [],
  ), [progress?.savedCode]);

  const selectLanguage = (value: string) => {
    setLang(value);
    setCode(savedCodeByLanguage.get(value) ?? "");
  };

  const saveCurrentCode = async () => {
    setSavingCode(true);
    try {
      const data = await apiRequest<{ progress: ApiProblemProgress }>(`/problems/${slug}/saved-code`, {
        method: "PUT",
        body: JSON.stringify({ language: lang, code }),
      });
      setProgress(data.progress);
      toast.success("Code saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save code");
    } finally {
      setSavingCode(false);
    }
  };

  const toggleBookmark = async () => {
    try {
      const data = await apiRequest<{ progress: ApiProblemProgress }>(`/problems/${slug}/bookmark`, {
        method: "POST",
        body: JSON.stringify({ bookmarked: !progress?.bookmarked }),
      });
      setProgress(data.progress);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update bookmark");
    }
  };

  const onRun = () => {
    setBottomTab("output");
    setOutput("Custom run is not available from the current backend API. Use Submit to judge against the official testcases.");
  };

  const onSubmit = async () => {
    if (!code.trim()) {
      toast.error("Write code before submitting");
      return;
    }

    setSubmitting(true);
    setBottomTab("output");
    setOutput("Queued for judging...");
    try {
      await apiRequest<{ progress: ApiProblemProgress }>(`/problems/${slug}/saved-code`, {
        method: "PUT",
        body: JSON.stringify({ language: lang, code }),
      }).catch(() => undefined);

      const created = await apiRequest<{ submission: ApiSubmission }>("/submissions", {
        method: "POST",
        body: JSON.stringify({ problemSlug: slug, language: lang, sourceCode: code }),
      });

      let latest = created.submission;
      setOutput(`Submission ${latest.submissionId} queued. Waiting for judge...`);

      for (let attempt = 0; attempt < 90; attempt += 1) {
        await new Promise((resolve) => { setTimeout(resolve, 1000); });
        const data = await apiRequest<{ submission: ApiSubmission }>(`/submissions/${created.submission.submissionId}`);
        latest = data.submission;
        setOutput(resultText(latest));
        if (latest.verdict !== "Pending") break;
      }

      setVerdict(latest.verdict);
      setResultSubmission(latest);
      setShowResult(true);
      setSubmissions((current) => [latest, ...current.filter((item) => item.submissionId !== latest.submissionId)]);
      if (latest.verdict === "Accepted") toast.success(`Accepted - all ${latest.totalTestcases ?? 0} testcases passed`);
      else if (latest.verdict === "Pending") toast.warning("Still pending. Check submissions later.");
      else toast.error(`Verdict: ${latest.verdict}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Submission failed";
      setOutput(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading || !user || loadingProblem) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <div className="h-10 w-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!problem) {
    return (
      <div className="grid min-h-screen place-items-center bg-background text-sm text-muted-foreground">
        Problem not found.
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <Navbar />

      <div className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border/60 bg-background/80 px-4 py-2 backdrop-blur-md">
        <div className="flex min-w-0 items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/problems"><ArrowLeft className="mr-1 h-4 w-4" />Problems</Link>
          </Button>
          <div className="h-5 w-px bg-border" />
          <h1 className="ml-1 truncate font-semibold">{problem.problemId}. {problem.title}</h1>
          <span className={`text-sm font-medium ${difficultyClass[problem.difficulty]}`}>{problem.difficulty}</span>
        </div>
        <div className="flex items-center gap-2">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1.5">
                <History className="h-3.5 w-3.5" /> History
                <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">{submissions.length}</Badge>
              </Button>
            </SheetTrigger>
            <SheetContent className="flex h-full w-105 flex-col sm:max-w-md">
              <SheetHeader className="shrink-0">
                <SheetTitle>Submission History</SheetTitle>
                <SheetDescription>Recent attempts for {problem.title}</SheetDescription>
              </SheetHeader>
              <div className="scrollbar-none mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                {submissions.map((submission) => (
                  <div key={submission.submissionId} className="rounded-lg border border-border/60 bg-card/40 p-3">
                    <div className="flex items-center justify-between">
                      <VerdictBadge verdict={submission.verdict} />
                      <span className="text-[10px] text-muted-foreground font-mono">#{submission.submissionId}</span>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                      <div><div className="text-muted-foreground">Lang</div><div className="font-mono">{formatLanguage(languages, submission.language)}</div></div>
                      <div><div className="text-muted-foreground">Runtime</div><div className="font-mono">{submission.runtime ?? 0} ms</div></div>
                      <div><div className="text-muted-foreground">Memory</div><div className="font-mono">{submission.memory ?? 0} MB</div></div>
                    </div>
                    <div className="mt-1 text-[10px] text-muted-foreground font-mono">{submission.submittedAt.replace("T", " ").slice(0, 16)}</div>
                  </div>
                ))}
              </div>
            </SheetContent>
          </Sheet>
          <Button variant={progress?.bookmarked ? "secondary" : "ghost"} size="icon" className="h-8 w-8" onClick={toggleBookmark}>
            <Bookmark className="h-4 w-4" />
          </Button>
          <div className="h-5 w-px bg-border" />
          <Button variant="outline" size="sm" onClick={onRun} disabled={submitting}>
            <Play className="mr-1.5 h-3.5 w-3.5" /> Run
          </Button>
          <Button size="sm" className="gradient-primary text-primary-foreground" onClick={onSubmit} disabled={submitting}>
            <Send className="mr-1.5 h-3.5 w-3.5" /> {submitting ? "Judging..." : "Submit"}
          </Button>
        </div>
      </div>

      <ResizablePanelGroup orientation="horizontal" className="flex-1 min-h-0">
        <ResizablePanel defaultSize={45} minSize={28} className="overflow-hidden">
          <div className="h-full overflow-y-auto">
            <Tabs defaultValue="problem" className="p-4">
              <TabsList className="bg-secondary/60">
                <TabsTrigger value="problem">Description</TabsTrigger>
                <TabsTrigger value="hints">Hints</TabsTrigger>
                <TabsTrigger value="submissions">Submissions</TabsTrigger>
              </TabsList>

              <TabsContent value="problem" className="space-y-6 pt-4 text-sm leading-relaxed">
                <div className="flex flex-wrap gap-1.5">
                  {problem.tags.map((tag) => <Badge key={tag} variant="secondary">{tag}</Badge>)}
                  <Badge variant="outline" className="text-success border-success/40">Acceptance {problem.acceptance}%</Badge>
                </div>
                <p className="whitespace-pre-line">{problem.description}</p>

                <div>
                  <h3 className="mb-2 font-semibold">Examples</h3>
                  <div className="space-y-3">
                    {problem.examples.map((example, index) => (
                      <div key={index} className="rounded-lg border border-border/60 bg-secondary/40 p-3 font-mono text-xs">
                        <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Example {index + 1}</div>
                        <div className="whitespace-pre-wrap"><span className="text-muted-foreground">Input:</span> {example.input}</div>
                        <div className="whitespace-pre-wrap"><span className="text-muted-foreground">Output:</span> {example.output}</div>
                        {example.explanation && <div className="mt-1 whitespace-pre-wrap text-muted-foreground">Explanation: {example.explanation}</div>}
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="mb-2 font-semibold">Constraints</h3>
                  <ul className="space-y-1 text-muted-foreground">
                    {problem.constraints.map((constraint, index) => <li key={index} className="font-mono text-xs">- {constraint}</li>)}
                  </ul>
                </div>
              </TabsContent>

              <TabsContent value="hints" className="space-y-3 pt-4">
                {problem.hints.length === 0 && <p className="text-sm text-muted-foreground">No hints provided.</p>}
                {problem.hints.map((hint, index) => (
                  <div key={index} className="flex gap-3 rounded-lg border border-border/60 bg-warning/5 p-3">
                    <Lightbulb className="h-4 w-4 shrink-0 text-warning" />
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Hint {index + 1}</div>
                      <p className="text-sm">{hint}</p>
                    </div>
                  </div>
                ))}
              </TabsContent>

              <TabsContent value="submissions" className="space-y-2 pt-4">
                {submissions.map((submission) => (
                  <div key={submission.submissionId} className="flex items-center justify-between rounded-lg border border-border/60 p-3">
                    <div className="flex items-center gap-3">
                      <VerdictBadge verdict={submission.verdict} />
                      <span className="text-xs text-muted-foreground font-mono">{formatLanguage(languages, submission.language)}</span>
                    </div>
                    <div className="text-xs text-muted-foreground font-mono">{submission.runtime ?? 0}ms / {submission.memory ?? 0}MB</div>
                  </div>
                ))}
                {submissions.length === 0 && <p className="text-sm text-muted-foreground">No submissions yet.</p>}
              </TabsContent>
            </Tabs>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        <ResizablePanel defaultSize={55} minSize={30} className="overflow-hidden">
          <ResizablePanelGroup orientation="vertical" className="h-full">
            <ResizablePanel defaultSize={65} minSize={25} className="flex flex-col">
              <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border/60 bg-card/40 px-3 py-1.5 backdrop-blur">
                <Select value={lang} onValueChange={selectLanguage}>
                  <SelectTrigger className="h-7 w-40 bg-card/50 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {languages.map((language) => <SelectItem key={language.languageId} value={language.languageId}>{language.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" className="h-7" onClick={saveCurrentCode} disabled={savingCode}>
                    {savingCode ? "Saving..." : "Save"}
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCode("")}>
                    <RotateCcw className="h-3.5 w-3.5" />
                  </Button>
                  <Select value={String(fontSize)} onValueChange={(value) => setFontSize(Number(value))}>
                    <SelectTrigger className="h-7 w-18 bg-card/50 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[12, 13, 14, 15, 16, 18].map((size) => <SelectItem key={size} value={String(size)}>{size}px</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex-1 min-h-0">
                <Editor
                  theme={theme === "dark" ? "vs-dark" : "vs"}
                  language={languages.find((language) => language.languageId === lang)?.monaco || "plaintext"}
                  value={code}
                  onChange={(value) => setCode(value ?? "")}
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

            <ResizablePanel defaultSize={35} minSize={12} className="overflow-hidden">
              <Tabs value={bottomTab} onValueChange={setBottomTab} className="h-full p-3 flex flex-col">
                <TabsList className="bg-secondary/60 self-start">
                  <TabsTrigger value="testcase">Testcase</TabsTrigger>
                  <TabsTrigger value="output"><Terminal className="mr-1.5 h-3.5 w-3.5" />Output</TabsTrigger>
                </TabsList>
                <TabsContent value="testcase" className="flex-1 min-h-0 pt-3">
                  <div className="flex gap-2 mb-2">
                    {problem.examples.map((_, index) => (
                      <Button key={index} variant="secondary" size="sm" className="h-7 text-xs" onClick={() => setCustomInput(problem.examples[index].input)}>
                        Case {index + 1}
                      </Button>
                    ))}
                  </div>
                  <Textarea
                    value={customInput}
                    onChange={(event) => setCustomInput(event.target.value)}
                    placeholder="Custom input"
                    className="h-[calc(100%-2.75rem)] font-mono text-xs bg-secondary/40 resize-none"
                  />
                </TabsContent>
                <TabsContent value="output" className="flex-1 min-h-0 pt-3">
                  <pre className="h-full overflow-auto rounded-md border border-border/60 bg-background p-3 font-mono text-xs whitespace-pre-wrap">
                    {output ?? <span className="text-muted-foreground">Submit your code to see the judge verdict here.</span>}
                  </pre>
                </TabsContent>
              </Tabs>
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
      </ResizablePanelGroup>

      <Dialog open={showResult} onOpenChange={setShowResult}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              {verdict && <VerdictBadge verdict={verdict} />}
              <span>Submission Result</span>
            </DialogTitle>
            <DialogDescription>{resultSubmission?.submissionId}</DialogDescription>
          </DialogHeader>
          <pre className="max-h-80 overflow-auto rounded-md bg-secondary/60 p-3 font-mono text-xs whitespace-pre-wrap">
            {resultSubmission ? resultText(resultSubmission) : ""}
          </pre>
        </DialogContent>
      </Dialog>
    </div>
  );
}
