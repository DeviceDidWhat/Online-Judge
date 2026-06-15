import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft, CheckCircle2, ChevronRight, Clock, Code2,
  Flame, Loader2, Lock, RefreshCw, Send, Trophy, Users, XCircle, TrendingUp,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  apiRequest,
  type ApiContest,
  type ApiContestRegistration,
  type ApiLanguage,
  type ApiSubmission,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { VerdictBadge } from "@/components/verdict-badge";
import { useContestLeaderboard } from "@/hooks/use-contest-leaderboard";
import { useSubmissionStatus } from "@/hooks/use-submission-status";
import { getSocket } from "@/lib/socket";

export const Route = createFileRoute("/contests/$id")({
  component: ContestDetail,
});

const fallbackLanguages: ApiLanguage[] = [
  { languageId: "cpp", label: "C++ 17", monaco: "cpp" },
  { languageId: "c", label: "C", monaco: "c" },
  { languageId: "python", label: "Python 3.11", monaco: "python" },
  { languageId: "javascript", label: "JavaScript", monaco: "javascript" },
  { languageId: "java", label: "Java 17", monaco: "java" },
];

// ─── Countdown helpers ────────────────────────────────────────────────────────
function formatDuration(ms: number) {
  if (ms <= 0) return "00:00:00";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
}

function Countdown({ to }: { to: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const diff = Math.max(0, new Date(to).getTime() - now);
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff / 3600000) % 24);
  const m = Math.floor((diff / 60000) % 60);
  const s = Math.floor((diff / 1000) % 60);
  return (
    <div className="flex gap-2 font-mono">
      {([[d, "D"], [h, "H"], [m, "M"], [s, "S"]] as const).map(([value, label]) => (
        <div key={label} className="rounded-lg border border-border/60 bg-secondary/50 px-3 py-2 text-center">
          <div className="text-2xl font-bold leading-none">{String(value).padStart(2, "0")}</div>
          <div className="mt-0.5 text-[10px] uppercase text-muted-foreground">{label}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Rating change display ────────────────────────────────────────────────────
function RatingDelta({ delta }: { delta?: number }) {
  if (delta === undefined || delta === null) return <span className="text-muted-foreground">—</span>;
  if (delta === 0) return <span className="text-muted-foreground font-mono">±0</span>;
  return (
    <span className={`font-mono font-bold ${delta > 0 ? "text-green-400" : "text-red-400"}`}>
      {delta > 0 ? "+" : ""}{delta}
    </span>
  );
}

// ─── Problem status indicator ─────────────────────────────────────────────────
function ProblemStatusDot({ solved }: { solved: boolean | undefined }) {
  if (solved === undefined) return <div className="h-3 w-3 rounded-full bg-muted" />;
  return solved
    ? <CheckCircle2 className="h-4 w-4 text-green-400" />
    : <XCircle className="h-4 w-4 text-red-400/60" />;
}

// ─── Inline Code Editor ───────────────────────────────────────────────────────
function ContestEditor({
  contestId,
  problems,
  languages,
  onSubmitted,
}: {
  contestId: string;
  problems: ApiContest["problems"];
  languages: ApiLanguage[];
  onSubmitted: (submission: ApiSubmission) => void;
}) {
  const [label, setLabel] = useState(problems[0]?.label ?? "");
  // Initialize to undefined so the placeholder shows until languages load.
  // A hardcoded fallback like "cpp" would be a controlled value with no
  // matching <SelectItem>, which causes Radix Select to lock up.
  const [lang, setLang] = useState<string | undefined>(undefined);
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync lang to the first enabled language whenever the languages list loads
  // or changes. Only update if lang is unset or no longer in the list.
  useEffect(() => {
    const enabled = languages.filter((l) => l.enabled !== false);
    if (enabled.length === 0) return;
    setLang((prev) => {
      if (prev && enabled.some((l) => l.languageId === prev)) return prev;
      return enabled[0].languageId;
    });
  }, [languages]);

  const submit = async () => {
    if (!code.trim()) return toast.error("Write some code first");
    if (!lang) return toast.error("Select a language first");
    setSubmitting(true);
    try {
      const created = await apiRequest<{ submission: ApiSubmission }>(`/contests/${contestId}/submit`, {
        method: "POST",
        body: JSON.stringify({ problemLabel: label, language: lang, sourceCode: code }),
      });
      toast.success(`Submission queued for Problem ${label}`);
      onSubmitted(created.submission);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  // Tab key inserts spaces instead of losing focus
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const el = e.currentTarget;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const newVal = code.substring(0, start) + "  " + code.substring(end);
      setCode(newVal);
      requestAnimationFrame(() => {
        el.selectionStart = el.selectionEnd = start + 2;
      });
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-card/50 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-sm font-semibold text-muted-foreground">Submit Solution</div>
        <div className="ml-auto flex items-center gap-2">
          <Select value={label} onValueChange={setLabel}>
            <SelectTrigger className="h-8 w-28 text-xs">
              <SelectValue placeholder="Problem" />
            </SelectTrigger>
            <SelectContent>
              {[...problems].sort((a, b) => a.order - b.order).map((p) => (
                <SelectItem key={p.label} value={p.label}>
                  {p.label} — {p.problem.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={lang ?? ""} onValueChange={setLang}>
            <SelectTrigger className="h-8 w-32 text-xs">
              <SelectValue placeholder="Language" />
            </SelectTrigger>
            <SelectContent>
              {languages.filter((l) => l.enabled !== false).map((l) => (
                <SelectItem key={l.languageId} value={l.languageId}>
                  {l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            className="gradient-primary text-primary-foreground h-8 gap-1.5"
            onClick={submit}
            disabled={submitting}
          >
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            {submitting ? "Submitting..." : "Submit"}
          </Button>
        </div>
      </div>
      <textarea
        ref={textareaRef}
        value={code}
        onChange={(e) => setCode(e.target.value)}
        onKeyDown={handleKeyDown}
        className="min-h-[280px] w-full resize-y rounded-lg border border-border/60 bg-background/70 p-4 font-mono text-sm leading-relaxed text-foreground outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/30"
        placeholder={`// Problem ${label}\n// Write your solution here...`}
        spellCheck={false}
      />
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
function ContestDetail() {
  const { id } = Route.useParams();
  const { user, isLoading: authLoading } = useAuth();

  const [contest, setContest] = useState<ApiContest | null>(null);
  const [registration, setRegistration] = useState<ApiContestRegistration | null>(null);
  const [leaderboard, setLeaderboard] = useState<ApiContestRegistration[]>([]);
  const [mySubmissions, setMySubmissions] = useState<ApiSubmission[]>([]);
  const [languages, setLanguages] = useState<ApiLanguage[]>(fallbackLanguages);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [refreshingLeaderboard, setRefreshingLeaderboard] = useState(false);
  const [tick, setTick] = useState(Date.now());
  // Controlled tab — persists user's choice, auto-switches when contest goes live.
  const [activeTab, setActiveTab] = useState("");
  // Submission we're currently waiting for a verdict on (drives socket listener).
  const [watchingSubmissionId, setWatchingSubmissionId] = useState<string | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Instantly flip to live / ended when the client clock crosses the boundary,
  // without waiting for the socket event (which may lag by a second or two).
  const hasTriggeredLiveRef = useRef(false);
  const hasTriggeredEndedRef = useRef(false);
  useEffect(() => {
    if (!contest) return;
    const startsAtMs = new Date(contest.startsAt).getTime();
    const endMs = startsAtMs + contest.duration * 60000;

    if (!hasTriggeredLiveRef.current && contest.status === "upcoming" && tick >= startsAtMs) {
      hasTriggeredLiveRef.current = true;
      setContest((c) => (c ? { ...c, status: "live" } : c));
    }

    if (!hasTriggeredEndedRef.current && contest.status === "live" && tick >= endMs) {
      hasTriggeredEndedRef.current = true;
      setContest((c) => (c ? { ...c, status: "ended" } : c));
    }
  }, [tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [contestData, leaderboardData, langData] = await Promise.all([
        apiRequest<{ contest: ApiContest; registration: ApiContestRegistration | null }>(`/contests/${id}`),
        apiRequest<{ leaderboard: ApiContestRegistration[] }>(`/contests/${id}/leaderboard`),
        apiRequest<{ languages: ApiLanguage[] }>("/languages"),
      ]);
      setContest(contestData.contest);
      setRegistration(contestData.registration);
      setLeaderboard(leaderboardData.leaderboard);
      setLanguages(langData.languages.length > 0 ? langData.languages : fallbackLanguages);

      if (user && contestData.registration) {
        const mySubData = await apiRequest<{ submissions: ApiSubmission[] }>(`/contests/${id}/my-submissions`);
        setMySubmissions(mySubData.submissions);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to load contest");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const refreshLeaderboard = async () => {
    setRefreshingLeaderboard(true);
    try {
      const data = await apiRequest<{ leaderboard: ApiContestRegistration[] }>(`/contests/${id}/leaderboard`);
      setLeaderboard(data.leaderboard);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to refresh standings");
    } finally {
      setRefreshingLeaderboard(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    loadData();
    // Poll every 60s as a lightweight fallback for anything the socket misses.
    // Primary updates (leaderboard, status) come via WebSocket below.
    const pollId = setInterval(() => {
      if (!cancelled) loadData(true);
    }, 60000);
    return () => {
      cancelled = true;
      clearInterval(pollId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user, authLoading]);

  // ── WebSocket: real-time leaderboard updates (via submission change stream) ──
  // id is available immediately from route params — don't wait for contest to load.
  useContestLeaderboard(
    id,
    (freshLeaderboard) => setLeaderboard(freshLeaderboard),
  );

  // ── WebSocket: real-time verdict for the user's contest submission ─────────
  // When the judge finishes, update the My Submissions list without a refresh.
  useSubmissionStatus(watchingSubmissionId, (payload) => {
    setWatchingSubmissionId(null);

    const updated = payload as ApiSubmission;

    // Merge verdict into the optimistic Pending entry added on submit.
    setMySubmissions((current) => {
      const exists = current.some((s) => s.submissionId === updated.submissionId);
      if (exists) {
        return current.map((s) =>
          s.submissionId === updated.submissionId ? { ...s, ...updated } : s
        );
      }
      return [updated, ...current];
    });

    // Reload once the judge is done — DB is guaranteed to have the final
    // verdict at this point, so there's no race with the optimistic entry.
    loadData(true);

    if (updated.verdict === "Accepted") {
      toast.success("Accepted! Your solution passed all test cases.");
    } else if (updated.verdict && updated.verdict !== "Pending") {
      toast.error(`Verdict: ${updated.verdict}`);
    }
  });

  // ── Auto-switch tab when contest status changes ────────────────────────────
  // When the contest first loads (or transitions upcoming→live→ended), pick
  // the right default tab.  If the user has already navigated to a different
  // tab we leave it alone — except when coming off "info" (upcoming-only tab).
  useEffect(() => {
    if (!contest) return;
    setActiveTab((prev) => {
      const isLive = contest.status === 'live';
      const isUpcoming = contest.status === 'upcoming';
      const canSub = isLive && Boolean(registration) && Boolean(user);
      const ideal = isUpcoming ? 'info' : (canSub ? 'arena' : 'problems');
      if (!prev) return ideal;                         // first load
      if (prev === 'info' && !isUpcoming) return ideal; // contest went live
      return prev;                                     // keep user's choice
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contest?.status, !!registration, !!user]);

  // ── WebSocket: real-time contest status transitions & finalization ─────────
  useEffect(() => {
    const socket = getSocket();
    if (!socket.connected) socket.connect();

    const handleStatusChange = (payload: { contestId: string; status: string; ratingProcessed?: boolean }) => {
      if (payload.contestId !== id) return;
      // Reload full contest data so status, tabs, ratings, and UI update correctly.
      loadData(true);
    };

    // Real-time participant count: fires whenever any user registers
    const handleParticipantUpdate = (payload: { contestId: string; registeredCount: number }) => {
      if (payload.contestId !== id) return;
      setContest((c) => (c ? { ...c, registeredCount: payload.registeredCount } : c));
    };

    socket.on('contest:statusChange', handleStatusChange);
    socket.on('contest:participantUpdate', handleParticipantUpdate);
    return () => {
      socket.off('contest:statusChange', handleStatusChange);
      socket.off('contest:participantUpdate', handleParticipantUpdate);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const register = async () => {
    setRegistering(true);
    try {
      const data = await apiRequest<{ registration: ApiContestRegistration }>(`/contests/${id}/register`, { method: "POST" });
      setRegistration(data.registration);
      setContest((c) => c ? { ...c, registeredCount: c.registeredCount + 1 } : c);
      toast.success("You're registered! Good luck 🚀");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to register");
    } finally {
      setRegistering(false);
    }
  };

  if (loading || !contest) {
    return (
      <AppShell>
        <div className="grid min-h-[60vh] place-items-center">
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="text-sm">Loading contest...</span>
          </div>
        </div>
      </AppShell>
    );
  }

  const startMs = new Date(contest.startsAt).getTime();
  const endMs = startMs + contest.duration * 60000;
  const remaining = Math.max(0, endMs - tick);
  const isLive = contest.status === "live";
  const isUpcoming = contest.status === "upcoming";
  const isEnded = contest.status === "ended";
  const isRegistered = Boolean(registration);
  const canSubmit = isLive && isRegistered && Boolean(user);

  // Build a quick lookup: which problems has the current user solved?
  const solvedSet = new Set((registration?.solvedProblems ?? []).map((sp) => sp.problem));

  const statusColor = {
    live: "border-red-500/40 text-red-400",
    upcoming: "border-yellow-500/40 text-yellow-400",
    ended: "border-border text-muted-foreground",
  }[contest.status];

  const statusLabel = {
    live: "● LIVE",
    upcoming: "UPCOMING",
    ended: "ENDED",
  }[contest.status];

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-6 p-6">
        {/* Back */}
        <Button variant="ghost" size="sm" asChild>
          <Link to="/contests"><ArrowLeft className="mr-1 h-4 w-4" />Contests</Link>
        </Button>

        {/* Hero card */}
        <Card className="overflow-hidden border-border/60 bg-gradient-to-br from-primary/10 via-card to-card p-6">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex-1 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={statusColor}>{statusLabel}</Badge>
                <Badge variant="outline" className="border-border/60 text-muted-foreground">
                  <Trophy className="mr-1 h-3 w-3" />{contest.difficulty}
                </Badge>
                <Badge variant="outline" className="border-border/60 text-muted-foreground">
                  <Clock className="mr-1 h-3 w-3" />{contest.duration} min
                </Badge>
                <Badge variant="outline" className="border-border/60 text-muted-foreground">
                  <Users className="mr-1 h-3 w-3" />{contest.registeredCount.toLocaleString()} registered
                </Badge>
              </div>
              <h1 className="text-3xl font-bold">{contest.name}</h1>
              {contest.description && (
                <p className="max-w-xl text-sm text-muted-foreground leading-relaxed">{contest.description}</p>
              )}
              <div className="text-xs text-muted-foreground">
                {isLive && <>Ends at {new Date(endMs).toLocaleTimeString()}</>}
                {isUpcoming && <>Starts {new Date(contest.startsAt).toLocaleString()}</>}
                {isEnded && <>Ended {new Date(endMs).toLocaleString()}</>}
              </div>
            </div>

            <div className="flex flex-col items-end gap-4">
              {isLive && (
                <div className="rounded-xl border border-border/60 bg-card/80 p-4 text-center">
                  <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1 justify-center">
                    <Flame className="h-3 w-3 text-orange-400" /> Time remaining
                  </div>
                  <div className="text-4xl font-bold font-mono gradient-text">{formatDuration(remaining)}</div>
                </div>
              )}
              {isUpcoming && (
                <div className="space-y-1 text-center">
                  <div className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Starts in</div>
                  <Countdown to={contest.startsAt} />
                </div>
              )}
              {!isEnded && (
                authLoading ? (
                  // Auth is still resolving — show a neutral disabled button
                  // to prevent the incorrect "Login to register" flash
                  <Button disabled className="min-w-32" variant="outline">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading...
                  </Button>
                ) : user ? (
                  <Button
                    onClick={register}
                    disabled={registering || isRegistered}
                    className="gradient-primary text-primary-foreground min-w-32"
                  >
                    {isRegistered
                      ? "✓ Registered"
                      : registering
                        ? "Registering..."
                        : "Register"}
                  </Button>
                ) : (
                  <Button asChild variant="outline">
                    <Link to="/login">Login to register</Link>
                  </Button>
                )
              )}
            </div>
          </div>
        </Card>

        {/* Tabs — problems/standings only visible once contest is live or ended */}
        <Tabs value={activeTab || (isUpcoming ? "info" : "problems")} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="flex-wrap h-auto gap-1 p-1">
            {isUpcoming && (
              <TabsTrigger value="info" className="gap-1.5">
                <Clock className="h-3.5 w-3.5" />Info
              </TabsTrigger>
            )}
            {!isUpcoming && (
              <TabsTrigger value="problems" className="gap-1.5">
                <Code2 className="h-3.5 w-3.5" />Problems
                <span className="ml-1 text-xs text-muted-foreground">({contest.problems.length})</span>
              </TabsTrigger>
            )}
            {canSubmit && (
              <TabsTrigger value="arena" className="gap-1.5">
                <Send className="h-3.5 w-3.5" />Submit
              </TabsTrigger>
            )}
            {!isUpcoming && (
              <TabsTrigger value="standings" className="gap-1.5">
                <Trophy className="h-3.5 w-3.5" />Standings
                <span className="ml-1 text-xs text-muted-foreground">({leaderboard.length})</span>
              </TabsTrigger>
            )}
            {user && isRegistered && !isUpcoming && (
              <TabsTrigger value="my-submissions" className="gap-1.5">
                <Loader2 className="h-3.5 w-3.5" />My Submissions
                <span className="ml-1 text-xs text-muted-foreground">({mySubmissions.length})</span>
              </TabsTrigger>
            )}
          </TabsList>


          {/* ── Info tab (upcoming only) ── */}
          {isUpcoming && (
            <TabsContent value="info">
              <Card className="border-border/60 p-10 text-center space-y-3">
                <Lock className="mx-auto h-10 w-10 text-muted-foreground/40" />
                <div className="font-semibold text-lg">Contest hasn't started yet</div>
                <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                  Problems and standings will be revealed when the contest goes live.
                  {!isRegistered && " Register now to participate!"}
                </p>
                <div className="pt-2 text-xs text-muted-foreground">
                  {contest.problems.length} problem{contest.problems.length !== 1 ? "s" : ""} · {contest.duration} min
                </div>
              </Card>
            </TabsContent>
          )}

          {/* ── Problems tab (live / ended only) ── */}
          {!isUpcoming && (
            <TabsContent value="problems">
              <div className="space-y-2">
                {[...contest.problems].sort((a, b) => a.order - b.order).map((item) => {
                  const solved = solvedSet.has(item.problem._id);
                  return (
                    <div
                      key={item.label}
                      className={`flex items-center gap-4 rounded-xl border p-4 transition hover:border-primary/40 hover:bg-accent/20 ${solved ? "border-green-500/30 bg-green-500/5" : "border-border/60"
                        }`}
                    >
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg gradient-primary text-sm font-bold text-primary-foreground">
                        {item.label}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">{item.problem.title}</span>
                          {solved && <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" />}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {item.problem.difficulty} · {item.points} {item.points === 1 ? "point" : "points"}
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" asChild>
                        <Link to="/problems/$slug" params={{ slug: item.problem.slug }}>
                          View <ChevronRight className="ml-1 h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    </div>
                  );
                })}
                {contest.problems.length === 0 && (
                  <Card className="border-border/60 p-8 text-center text-sm text-muted-foreground">
                    No problems assigned to this contest yet.
                  </Card>
                )}
              </div>
            </TabsContent>
          )}

          {/* ── Arena (submit) tab ── */}
          {canSubmit && (
            <TabsContent value="arena">
              <ContestEditor
                contestId={id}
                problems={contest.problems}
                languages={languages}
                onSubmitted={(submission) => {
                  // Optimistically add the Pending entry — no loadData() here.
                  // loadData() after this point would race with the socket verdict
                  // and could overwrite "Accepted" back to "Pending" if the judge
                  // is faster than the HTTP round-trip.
                  setMySubmissions((current) => [
                    submission,
                    ...current.filter((s) => s.submissionId !== submission.submissionId),
                  ]);
                  setWatchingSubmissionId(submission.submissionId);
                }}
              />
            </TabsContent>
          )}

          {/* ── Standings tab (live / ended only) ── */}
          {!isUpcoming && <TabsContent value="standings">
            <Card className="overflow-hidden border-border/60">
              <div className="flex items-center justify-between px-4 py-2 border-b border-border/60">
                <span className="text-xs text-muted-foreground">
                  {leaderboard.length} participant{leaderboard.length !== 1 ? "s" : ""}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 text-xs"
                  onClick={refreshLeaderboard}
                  disabled={refreshingLeaderboard}
                >
                  <RefreshCw className={`h-3 w-3 ${refreshingLeaderboard ? "animate-spin" : ""}`} />
                  {refreshingLeaderboard ? "Refreshing…" : "Refresh"}
                </Button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-secondary/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 w-12">#</th>
                      <th className="px-4 py-3">User</th>
                      {[...contest.problems].sort((a, b) => a.order - b.order).map((p) => (
                        <th key={p.label} className="px-3 py-3 text-center w-12">{p.label}</th>
                      ))}
                      <th className="px-4 py-3 text-right">Score</th>
                      <th className="px-4 py-3 text-right">Penalty</th>
                      {isEnded && <th className="px-4 py-3 text-right">Rating Δ</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboard.map((row, index) => {
                      const rowSolvedSet = new Set(row.solvedProblems?.map((sp) => sp.problem) ?? []);
                      const isMe = row.user?.username === user?.username;
                      return (
                        <tr
                          key={row._id}
                          className={`border-t border-border/60 transition hover:bg-accent/20 ${isMe ? "bg-primary/5" : ""
                            }`}
                        >
                          <td className="px-4 py-3 font-mono text-muted-foreground text-xs">
                            #{row.rank ?? index + 1}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="font-medium">
                                {row.user?.username ?? "—"}
                                {isMe && <span className="ml-1.5 text-xs text-primary">(you)</span>}
                              </div>
                            </div>
                          </td>
                          {[...contest.problems].sort((a, b) => a.order - b.order).map((p) => {
                            const solved = rowSolvedSet.has(p.problem._id);
                            const sp = row.solvedProblems?.find((s) => s.problem === p.problem._id);
                            return (
                              <td key={p.label} className="px-3 py-3 text-center">
                                {solved ? (
                                  <div title={sp ? `+${sp.wrongAttempts} WA, ${sp.timePenaltyMinutes}m` : "Solved"}>
                                    <CheckCircle2 className="mx-auto h-4 w-4 text-green-400" />
                                  </div>
                                ) : (
                                  <div className="mx-auto h-4 w-4 rounded-full bg-muted/40" />
                                )}
                              </td>
                            );
                          })}
                          <td className="px-4 py-3 text-right font-bold gradient-text">{row.score}</td>
                          <td className="px-4 py-3 text-right font-mono text-xs text-muted-foreground">{row.penalty}</td>
                          {isEnded && (
                            <td className="px-4 py-3 text-right">
                              <RatingDelta delta={row.ratingChange} />
                            </td>
                          )}
                        </tr>
                      );
                    })}
                    {leaderboard.length === 0 && (
                      <tr>
                        <td colSpan={4 + contest.problems.length + (isEnded ? 1 : 0)} className="px-4 py-10 text-center text-muted-foreground">
                          No participants yet. Be the first to register!
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </TabsContent>}

          {/* ── My Submissions tab (live / ended only) ── */}
          {user && isRegistered && !isUpcoming && (
            <TabsContent value="my-submissions">
              <div className="space-y-2">
                {mySubmissions.map((sub) => (
                  <div
                    key={sub.submissionId}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 p-4 hover:border-primary/30 hover:bg-accent/10 transition"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="shrink-0">
                        {sub.verdict === "Accepted"
                          ? <CheckCircle2 className="h-5 w-5 text-green-400" />
                          : sub.verdict === "Pending"
                            ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                            : <XCircle className="h-5 w-5 text-red-400" />}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium truncate">{sub.problem?.title ?? sub.problemTitle}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {sub.language} · {new Date(sub.submittedAt).toLocaleTimeString()}
                          {sub.runtime !== undefined && ` · ${sub.runtime}ms`}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <VerdictBadge verdict={sub.verdict} />
                    </div>
                  </div>
                ))}
                {mySubmissions.length === 0 && (
                  <Card className="border-border/60 p-8 text-center text-sm text-muted-foreground">
                    No submissions yet. Head to the Submit tab to solve problems!
                  </Card>
                )}
              </div>
            </TabsContent>
          )}
        </Tabs>

        {/* Ended: rating info banner */}
        {isEnded && contest.ratingProcessed && registration && (
          <Card className="border-border/60 p-5 bg-gradient-to-r from-primary/10 to-transparent flex items-center gap-4">
            <TrendingUp className="h-8 w-8 text-primary shrink-0" />
            <div>
              <div className="font-semibold">Contest finalized</div>
              <div className="text-sm text-muted-foreground">
                Your rating changed by <RatingDelta delta={registration.ratingChange} />
                {registration.rank && <> · You finished at rank <strong>#{registration.rank}</strong></>}
              </div>
            </div>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
