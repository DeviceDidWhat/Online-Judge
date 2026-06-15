import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Editor from "@monaco-editor/react";
import { ArrowLeft, Bookmark, History, Lightbulb, Play, RotateCcw, Send, Terminal, MessageCircle, Plus, ThumbsUp, HelpCircle } from "lucide-react";
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
import { apiRequest, type ApiLanguage, type ApiProblem, type ApiProblemProgress, type ApiSubmission, type ApiVerdict, type ApiDiscussion } from "@/lib/api";
import { difficultyClass } from "@/lib/mock-data";
import { toast } from "sonner";
import { useRequireAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatDistanceToNow } from "date-fns";
import { useSubmissionStatus } from "@/hooks/use-submission-status";

const availableTags = ["Tutorial", "Question", "Editorial", "Help", "Discussion"];

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
  // The submission ID we are currently waiting for a verdict on (drives the socket listener).
  const [watchingSubmissionId, setWatchingSubmissionId] = useState<string | null>(null);
  // Keep a stable ref so reconnect callbacks can read the current ID without a dep.
  const watchingIdRef = useRef<string | null>(null);
  watchingIdRef.current = watchingSubmissionId;
  // A ref to the 90-second safety timeout so we can clear it if the socket delivers early.
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Discussion Integration States
  const [problemDiscussions, setProblemDiscussions] = useState<ApiDiscussion[]>([]);
  const [loadingDiscussions, setLoadingDiscussions] = useState(false);
  const [discussDialogOpen, setDiscussDialogOpen] = useState(false);
  const [newDiscussTitle, setNewDiscussTitle] = useState("");
  const [newDiscussBody, setNewDiscussBody] = useState("");
  const [newDiscussTag, setNewDiscussTag] = useState("Question");
  const [creatingDiscuss, setCreatingDiscuss] = useState(false);

  // Fetch discussions when problem is loaded
  useEffect(() => {
    if (!problem?._id) return;
    let cancelled = false;
    setLoadingDiscussions(true);
    apiRequest<{ discussions: ApiDiscussion[] }>(`/discussions?problem=${problem._id}&limit=50`)
      .then((data) => {
        if (!cancelled) setProblemDiscussions(data.discussions);
      })
      .catch((err) => {
        console.error("Failed to load problem discussions:", err);
      })
      .finally(() => {
        if (!cancelled) setLoadingDiscussions(false);
      });
    return () => {
      cancelled = true;
    };
  }, [problem?._id]);

  const handleCreateProblemDiscussion = async (e: FormEvent) => {
    e.preventDefault();
    if (!newDiscussTitle.trim() || !newDiscussBody.trim() || !problem) return;
    setCreatingDiscuss(true);
    try {
      const data = await apiRequest<{ discussion: ApiDiscussion }>("/discussions", {
        method: "POST",
        body: JSON.stringify({
          title: newDiscussTitle.trim(),
          body: newDiscussBody.trim(),
          tags: [newDiscussTag],
          problem: problem._id,
        }),
      });
      setProblemDiscussions((curr) => [data.discussion, ...curr]);
      setDiscussDialogOpen(false);
      setNewDiscussTitle("");
      setNewDiscussBody("");
      setNewDiscussTag("Question");
      toast.success("Discussion posted successfully!");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to post discussion");
    } finally {
      setCreatingDiscuss(false);
    }
  };

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

  // ── WebSocket: receive submission verdict ───────────────────────────────────
  useSubmissionStatus(
    watchingSubmissionId,
    (payload) => {
      // Clear the safety fallback timer — we got the result via socket.
      if (fallbackTimerRef.current) {
        clearTimeout(fallbackTimerRef.current);
        fallbackTimerRef.current = null;
      }
      setWatchingSubmissionId(null);

      const latest = payload as ApiSubmission;
      setOutput(resultText(latest));
      setVerdict(latest.verdict);
      setResultSubmission(latest);
      setShowResult(true);
      setSubmissions((current) => [
        latest,
        ...current.filter((item) => item.submissionId !== latest.submissionId),
      ]);
      setSubmitting(false);

      if (latest.verdict === "Accepted")
        toast.success(`Accepted — all ${latest.totalTestcases ?? 0} testcases passed`);
      else if (latest.verdict === "Pending")
        toast.warning("Still pending. Check submissions later.");
      else toast.error(`Verdict: ${latest.verdict}`);
    },
    // Socket reconnected while waiting — the verdict may have been emitted
    // during the brief disconnect.  Do an immediate HTTP poll to recover
    // instead of waiting for the 90-second fallback timer.
    () => {
      const id = watchingIdRef.current;
      if (!id) return;
      if (fallbackTimerRef.current) {
        clearTimeout(fallbackTimerRef.current);
        fallbackTimerRef.current = null;
      }
      apiRequest<{ submission: ApiSubmission }>(`/submissions/${id}`)
        .then((data) => {
          const s = data.submission;
          if (s.verdict === "Pending") {
            // Still pending — restart the fallback timer for another 30 s.
            fallbackTimerRef.current = setTimeout(async () => {
              setWatchingSubmissionId(null);
              try {
                const retry = await apiRequest<{ submission: ApiSubmission }>(`/submissions/${id}`);
                const rs = retry.submission;
                setOutput(resultText(rs));
                setVerdict(rs.verdict);
                setResultSubmission(rs);
                setShowResult(true);
                setSubmissions((cur) => [rs, ...cur.filter((i) => i.submissionId !== rs.submissionId)]);
                if (rs.verdict === "Pending") toast.warning("Still pending. Check submissions later.");
                else toast.error(`Verdict: ${rs.verdict}`);
              } catch { toast.error("Could not fetch submission result."); }
              finally { setSubmitting(false); }
            }, 30_000);
            return;
          }
          // Verdict arrived — apply it immediately.
          if (fallbackTimerRef.current) { clearTimeout(fallbackTimerRef.current); fallbackTimerRef.current = null; }
          setWatchingSubmissionId(null);
          setOutput(resultText(s));
          setVerdict(s.verdict);
          setResultSubmission(s);
          setShowResult(true);
          setSubmissions((cur) => [s, ...cur.filter((i) => i.submissionId !== s.submissionId)]);
          setSubmitting(false);
          if (s.verdict === "Accepted") toast.success(`Accepted — all ${s.totalTestcases ?? 0} testcases passed`);
          else toast.error(`Verdict: ${s.verdict}`);
        })
        .catch(() => { /* original 90s timer already running */ });
    },
  );

  const onRun = () => {
    setBottomTab("output");
    setOutput("Running...");
    (async () => {
      try {
        const data = await apiRequest<{ result: any }>(`/problems/${slug}/run`, {
          method: "POST",
          body: JSON.stringify({ language: lang, sourceCode: code, input: customInput }),
        });
        const res = data.result;
        if (!res) {
          setOutput("No result returned");
          return;
        }

        if (res.compileError) {
          setOutput(`Compilation failed:\n${res.stderr || res.stdout}`);
          return;
        }

        let text = '';
        if (res.timedOut) text += 'Timed out\n\n';
        if (typeof res.exitCode !== 'undefined' && res.exitCode !== 0) text += `Exit code: ${res.exitCode}\n\n`;
        if (res.stdout) text += `Output:\n${res.stdout}\n`;
        if (res.stderr) text += `\nStderr:\n${res.stderr}\n`;
        text += `\nRuntime: ${res.runtimeMs ?? 0} ms\nMemory: ${res.memoryMb ?? 0} MB`;
        setOutput(text.trim());
      } catch (err) {
        setOutput(err instanceof Error ? err.message : 'Run failed');
      }
    })();
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

      const latest = created.submission;
      setOutput(`Submission ${latest.submissionId} queued. Waiting for judge...`);

      // Start watching for the socket push. The useSubmissionStatus hook will
      // handle the result and clear submitting state when the verdict arrives.
      setWatchingSubmissionId(latest.submissionId);

      // Safety fallback: if the socket doesn't deliver within 90 s, stop spinning
      // and do a single HTTP fetch to show whatever the judge has.
      fallbackTimerRef.current = setTimeout(async () => {
        setWatchingSubmissionId(null);
        try {
          const data = await apiRequest<{ submission: ApiSubmission }>(
            `/submissions/${latest.submissionId}`
          );
          const s = data.submission;
          setOutput(resultText(s));
          setVerdict(s.verdict);
          setResultSubmission(s);
          setShowResult(true);
          setSubmissions((current) => [
            s,
            ...current.filter((item) => item.submissionId !== s.submissionId),
          ]);
          if (s.verdict === "Pending") toast.warning("Still pending. Check submissions later.");
          else toast.error(`Verdict: ${s.verdict}`);
        } catch {
          toast.error("Could not fetch submission result.");
        } finally {
          setSubmitting(false);
        }
      }, 90_000);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Submission failed";
      setOutput(message);
      toast.error(message);
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
                    <div className="mt-1 text-[10px] text-muted-foreground font-mono">{submission.submittedAt?.replace("T", " ").slice(0, 16) ?? "—"}</div>
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
                <TabsTrigger value="discussions">Discussions</TabsTrigger>
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

              <TabsContent value="discussions" className="pt-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm">Community Discussions</h3>
                  <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => setDiscussDialogOpen(true)}>
                    <Plus className="h-3.5 w-3.5" /> Ask a Question
                  </Button>
                </div>

                <div className="space-y-3">
                  {loadingDiscussions ? (
                    <div className="text-center py-8 text-xs text-muted-foreground">Loading discussions...</div>
                  ) : problemDiscussions.length === 0 ? (
                    <div className="text-center py-12 border border-dashed border-border/60 rounded-lg space-y-2">
                      <HelpCircle className="h-8 w-8 text-muted-foreground/40 mx-auto" />
                      <p className="text-sm font-semibold text-muted-foreground">No discussions yet</p>
                      <p className="text-xs text-muted-foreground">Have a question or solution to share? Start the discussion!</p>
                    </div>
                  ) : (
                    problemDiscussions.map((d) => {
                      const authorName = d.author?.username ?? d.authorUsername ?? "anonymous";
                      return (
                        <div key={d._id} className="p-3 border border-border/50 rounded-lg hover:bg-accent/10 transition flex items-start gap-3">
                          <Avatar className="h-8 w-8 border border-border/60">
                            <AvatarImage src={d.author?.avatar} />
                            <AvatarFallback>{authorName[0]?.toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <Link to="/discuss/$id" params={{ id: d._id }} className="text-sm font-semibold hover:text-primary transition-colors block truncate">
                              {d.title}
                            </Link>
                            <div className="text-[10px] text-muted-foreground flex items-center gap-1.5 mt-1">
                              <span>by {authorName}</span>
                              <span>•</span>
                              <span>{formatDistanceToNow(new Date(d.createdAt))} ago</span>
                            </div>
                            <div className="flex gap-1 mt-2">
                              {d.tags.map(t => <Badge key={t} variant="secondary" className="text-[9px] font-normal px-1.5 py-0">{t}</Badge>)}
                            </div>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground self-center">
                            <span className="flex items-center gap-1"><ThumbsUp className="h-3.5 w-3.5" /> {d.upvotes - d.downvotes}</span>
                            <span className="flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5" /> {d.comments?.length ?? 0}</span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
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

      <Dialog open={discussDialogOpen} onOpenChange={setDiscussDialogOpen}>
        <DialogContent className="sm:max-w-xl bg-card border-border/60">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">New discussion for {problem.title}</DialogTitle>
            <DialogDescription>
              Ask a question or post a solution/editorial for this problem.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4 pt-2" onSubmit={handleCreateProblemDiscussion}>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase">Title</label>
              <Input value={newDiscussTitle} onChange={(e) => setNewDiscussTitle(e.target.value)} placeholder="Topic title" required className="bg-card" />
            </div>
            
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase">Content</label>
              <Textarea value={newDiscussBody} onChange={(e) => setNewDiscussBody(e.target.value)} placeholder="Explain your question or approach..." className="min-h-36 resize-none font-sans bg-card" required />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase">Category Tag</label>
              <Select value={newDiscussTag} onValueChange={setNewDiscussTag}>
                <SelectTrigger className="w-full bg-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableTags.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setDiscussDialogOpen(false)} disabled={creatingDiscuss}>Cancel</Button>
              <Button type="submit" className="gradient-primary text-primary-foreground font-semibold" disabled={creatingDiscuss}>
                {creatingDiscuss ? "Posting..." : "Create Post"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
