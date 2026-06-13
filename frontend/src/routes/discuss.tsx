import { createFileRoute, Link } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { MessageCircle, Plus, ThumbsUp, ThumbsDown, Pin, Lock, Search, Code, Trophy, HelpCircle } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest, type ApiDiscussion, type ApiPagination, type ApiProblem, type ApiContest } from "@/lib/api";
import { toast } from "sonner";

export const Route = createFileRoute("/discuss")({
  head: () => ({ meta: [{ title: "Discuss - CodeArena" }] }),
  component: Discuss,
});

const availableTags = ["Tutorial", "Question", "Editorial", "Help", "Discussion"];

function Discuss() {
  const [q, setQ] = useState("");
  const [tag, setTag] = useState("All");
  const [sortBy, setSortBy] = useState("latest");
  const [discussions, setDiscussions] = useState<ApiDiscussion[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [selectedTag, setSelectedTag] = useState("Discussion");
  const [selectedProblem, setSelectedProblem] = useState<string>("none");
  const [selectedContest, setSelectedContest] = useState<string>("none");
  
  const [problems, setProblems] = useState<ApiProblem[]>([]);
  const [contests, setContests] = useState<ApiContest[]>([]);
  const [saving, setSaving] = useState(false);

  // Fetch discussions when q, tag, or sortBy changes
  useEffect(() => {
    let cancelled = false;
    const delayId = setTimeout(() => {
      setLoading(true);
      const params = new URLSearchParams({ limit: "50" });
      if (q.trim()) params.set("q", q.trim());
      if (tag !== "All") params.set("tag", tag);
      if (sortBy !== "latest") params.set("sortBy", sortBy);
      
      apiRequest<{ discussions: ApiDiscussion[]; pagination: ApiPagination }>(`/discussions?${params.toString()}`)
        .then((data) => {
          if (!cancelled) setDiscussions(data.discussions);
        })
        .catch((error) => {
          if (!cancelled) toast.error(error instanceof Error ? error.message : "Unable to load discussions");
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(delayId);
    };
  }, [q, tag, sortBy]);

  // Load problems and contests once or when dialog opens
  useEffect(() => {
    if (!dialogOpen) return;
    Promise.all([
      apiRequest<{ problems: ApiProblem[] }>("/problems?limit=200").catch(() => ({ problems: [] })),
      apiRequest<{ contests: ApiContest[] }>("/contests?limit=100").catch(() => ({ contests: [] })),
    ]).then(([problemsData, contestsData]) => {
      setProblems(problemsData.problems || []);
      setContests(contestsData.contests || []);
    });
  }, [dialogOpen]);

  const handleCreateDiscussion = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !body.trim()) {
      toast.error("Title and body are required");
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, any> = {
        title: title.trim(),
        body: body.trim(),
        tags: [selectedTag],
      };
      if (selectedProblem && selectedProblem !== "none") payload.problem = selectedProblem;
      if (selectedContest && selectedContest !== "none") payload.contest = selectedContest;

      const data = await apiRequest<{ discussion: ApiDiscussion }>("/discussions", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      setDiscussions((current) => [data.discussion, ...current]);
      setDialogOpen(false);
      setTitle("");
      setBody("");
      setSelectedTag("Discussion");
      setSelectedProblem("none");
      setSelectedContest("none");
      toast.success("Discussion posted successfully!");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to create discussion");
    } finally {
      setSaving(false);
    }
  };

  const handleVote = async (discussion: ApiDiscussion, voteType: "up" | "down") => {
    try {
      const currentVote = discussion.userVote;
      const targetVote = currentVote === voteType ? "none" : voteType;
      
      const data = await apiRequest<{ discussion: ApiDiscussion }>(`/discussions/${discussion._id}/vote`, {
        method: "POST",
        body: JSON.stringify({ vote: targetVote }),
      });

      setDiscussions((current) =>
        current.map((item) =>
          item._id === discussion._id
            ? {
                ...item,
                upvotes: data.discussion.upvotes,
                downvotes: data.discussion.downvotes,
                userVote: data.discussion.userVote,
              }
            : item
        )
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to vote");
    }
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-6 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">Discussions</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Ask questions, share solutions, write editorials, and engage with the CodeArena community.
            </p>
          </div>
          <Button className="gradient-primary text-primary-foreground font-medium shadow-lg hover:shadow-primary/20 transition-all duration-300" onClick={() => setDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> New post
          </Button>
        </div>

        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative flex-1 min-w-[280px]">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search discussions by title, body, or tags..." className="pl-9 bg-card/45 border-border/60 focus-visible:ring-primary/40 focus-visible:border-primary/40" />
          </div>
          <div className="flex items-center gap-3">
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-[180px] bg-card/45 border-border/60">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="latest">Latest Posts</SelectItem>
                <SelectItem value="top">Top Voted</SelectItem>
                <SelectItem value="comments">Most Commented</SelectItem>
                <SelectItem value="active">Recently Active</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pb-2">
          {["All", ...availableTags].map((item) => (
            <Badge
              key={item}
              variant={tag === item ? "default" : "outline"}
              className="cursor-pointer px-4 py-1.5 rounded-full text-xs font-semibold select-none transition-all"
              onClick={() => setTag(item)}
            >
              {item}
            </Badge>
          ))}
        </div>

        <Card className="divide-y divide-border/40 border-border/40 overflow-hidden shadow-xl shadow-black/5 bg-card/40 backdrop-blur-md">
          {discussions.map((discussion) => {
            const author = discussion.author?.username ?? discussion.authorUsername ?? "anonymous";
            const isUpvoted = discussion.userVote === "up";
            const isDownvoted = discussion.userVote === "down";

            return (
              <div key={discussion._id} className="flex items-start gap-4 p-5 hover:bg-accent/10 transition-colors duration-200">
                <Avatar className="h-10 w-10 border border-border/60">
                  <AvatarImage src={discussion.author?.avatar} />
                  <AvatarFallback className="bg-secondary text-secondary-foreground font-bold">{author[0]?.toUpperCase()}</AvatarFallback>
                </Avatar>
                
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {discussion.isPinned && (
                      <Badge variant="secondary" className="gap-1 bg-amber-500/10 text-amber-500 border-amber-500/20 text-[10px] uppercase font-bold py-0.5 px-2">
                        <Pin className="h-3 w-3 fill-amber-500" /> Pinned
                      </Badge>
                    )}
                    {discussion.isLocked && (
                      <Badge variant="secondary" className="gap-1 bg-muted text-muted-foreground border-border text-[10px] uppercase font-bold py-0.5 px-2">
                        <Lock className="h-3 w-3" /> Locked
                      </Badge>
                    )}
                    <Link to="/discuss/$id" params={{ id: discussion._id }} className="font-bold text-base hover:text-primary transition-colors line-clamp-1">
                      {discussion.title}
                    </Link>
                  </div>
                  
                  <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span>by <span className="font-semibold text-foreground/80">{author}</span></span>
                    <span>•</span>
                    <span>{formatDistanceToNow(new Date(discussion.createdAt))} ago</span>
                    {discussion.problem && (
                      <>
                        <span>•</span>
                        <Link to="/problems/$slug" params={{ slug: discussion.problem.slug }} className="inline-flex items-center gap-1 text-primary hover:underline font-medium">
                          <Code className="h-3 w-3" /> {discussion.problem.title}
                        </Link>
                      </>
                    )}
                    {discussion.contest && (
                      <>
                        <span>•</span>
                        <Link to="/contests/$id" params={{ id: String(discussion.contest.contestId) }} className="inline-flex items-center gap-1 text-amber-500 hover:underline font-medium">
                          <Trophy className="h-3 w-3" /> {discussion.contest.name}
                        </Link>
                      </>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {discussion.tags.map((item) => (
                      <Badge key={item} variant="secondary" className="font-medium text-[11px] rounded-md px-2 py-0.5 bg-accent/30 border border-border/20">
                        {item}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 self-center">
                  <div className="flex flex-col items-center">
                    <Button
                      variant="ghost"
                      size="icon"
                      className={`h-8 w-8 rounded-full transition-all ${isUpvoted ? "text-success bg-success/10" : "text-muted-foreground hover:text-success"}`}
                      onClick={() => handleVote(discussion, "up")}
                    >
                      <ThumbsUp className={`h-4 w-4 ${isUpvoted ? "fill-success" : ""}`} />
                    </Button>
                    <span className="text-xs font-bold font-mono">
                      {discussion.upvotes - discussion.downvotes}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={`h-8 w-8 rounded-full transition-all ${isDownvoted ? "text-destructive bg-destructive/10" : "text-muted-foreground hover:text-destructive"}`}
                      onClick={() => handleVote(discussion, "down")}
                    >
                      <ThumbsDown className={`h-4 w-4 ${isDownvoted ? "fill-destructive" : ""}`} />
                    </Button>
                  </div>
                  <div className="h-8 w-px bg-border/40 mx-1" />
                  <Link
                    to="/discuss/$id"
                    params={{ id: discussion._id }}
                    className="flex flex-col items-center justify-center p-2 text-muted-foreground hover:text-primary transition-colors"
                  >
                    <MessageCircle className="h-4 w-4" />
                    <span className="text-[10px] font-bold font-mono mt-0.5">{discussion.comments?.length ?? 0}</span>
                  </Link>
                </div>
              </div>
            );
          })}

          {!loading && discussions.length === 0 && (
            <div className="p-12 text-center space-y-2">
              <HelpCircle className="h-10 w-10 text-muted-foreground mx-auto opacity-50" />
              <p className="text-base font-semibold text-muted-foreground">No discussions found</p>
              <p className="text-xs text-muted-foreground">Be the first to start a discussion thread!</p>
            </div>
          )}
        </Card>

        {/* Create Discussion Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-xl bg-card border-border/60">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold">Create new discussion</DialogTitle>
              <DialogDescription>
                Share ideas, ask questions, or link to a problem/contest.
              </DialogDescription>
            </DialogHeader>
            <form className="space-y-4 pt-2" onSubmit={handleCreateDiscussion}>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase">Title</label>
                <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What is the topic of your post?" required className="bg-card" />
              </div>
              
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase">Content</label>
                <Textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="Write the main body of your discussion..." className="min-h-40 bg-card font-sans leading-relaxed" required />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase">Category Tag</label>
                  <Select value={selectedTag} onValueChange={setSelectedTag}>
                    <SelectTrigger className="w-full bg-card">
                      <SelectValue placeholder="Select Tag" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableTags.map(t => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase">Link Problem (Optional)</label>
                  <Select value={selectedProblem} onValueChange={setSelectedProblem}>
                    <SelectTrigger className="w-full bg-card">
                      <SelectValue placeholder="Select Problem" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {problems.map(p => (
                        <SelectItem key={p._id} value={p._id}>{p.problemId}. {p.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase">Link Contest (Optional)</label>
                  <Select value={selectedContest} onValueChange={setSelectedContest}>
                    <SelectTrigger className="w-full bg-card">
                      <SelectValue placeholder="Select Contest" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {contests.map(c => (
                        <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <DialogFooter className="pt-2">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
                <Button type="submit" className="gradient-primary text-primary-foreground font-semibold" disabled={saving}>
                  {saving ? "Posting..." : "Create Post"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}
