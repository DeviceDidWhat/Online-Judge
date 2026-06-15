import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import {
  ArrowLeft,
  ThumbsUp,
  ThumbsDown,
  Lock,
  Edit,
  Trash,
  Send,
  Check,
  X,
  ShieldAlert,
  MessageCircle,
  Code,
  Trophy,
  AlertCircle
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest, type ApiDiscussion, type ApiProblem, type ApiContest } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/discuss/$id")({
  head: () => ({ meta: [{ title: "Discussion Details - CodeArena" }] }),
  component: DiscussionDetail,
});

const availableTags = ["Tutorial", "Question", "Editorial", "Help", "Discussion"];

function DiscussionDetail() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [discussion, setDiscussion] = useState<ApiDiscussion | null>(null);
  const [loading, setLoading] = useState(true);
  const [commentBody, setCommentBody] = useState("");
  const [postingComment, setPostingComment] = useState(false);

  // Edit Mode States
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editTag, setEditTag] = useState("");
  const [editProblem, setEditProblem] = useState<string>("none");
  const [editContest, setEditContest] = useState<string>("none");
  const [savingEdit, setSavingEdit] = useState(false);

  // Lists for Edit Selectors
  const [problems, setProblems] = useState<ApiProblem[]>([]);
  const [contests, setContests] = useState<ApiContest[]>([]);

  // Comment Editing States
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editCommentBody, setEditCommentBody] = useState("");
  const [savingCommentEdit, setSavingCommentEdit] = useState(false);

  // Load discussion
  const loadDiscussion = async () => {
    try {
      setLoading(true);
      const data = await apiRequest<{ discussion: ApiDiscussion }>(`/discussions/${id}`);
      setDiscussion(data.discussion);
      
      // Initialize edit fields
      setEditTitle(data.discussion.title);
      setEditBody(data.discussion.body || "");
      setEditTag(data.discussion.tags[0] || "Discussion");
      setEditProblem(data.discussion.problem?._id || "none");
      setEditContest(data.discussion.contest?._id || "none");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load discussion");
      navigate({ to: "/discuss" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDiscussion();
  }, [id]);

  // Load problems and contests for the edit form if it's opened
  useEffect(() => {
    if (!isEditing) return;
    Promise.all([
      apiRequest<{ problems: ApiProblem[] }>("/problems?limit=200").catch(() => ({ problems: [] })),
      apiRequest<{ contests: ApiContest[] }>("/contests?limit=100").catch(() => ({ contests: [] })),
    ]).then(([problemsData, contestsData]) => {
      setProblems(problemsData.problems || []);
      setContests(contestsData.contests || []);
    });
  }, [isEditing]);

  const handleVote = async (voteType: "up" | "down") => {
    if (!user) {
      toast.error("Please login to vote");
      return;
    }
    if (!discussion) return;

    try {
      const currentVote = discussion.userVote;
      const targetVote = currentVote === voteType ? "none" : voteType;

      const data = await apiRequest<{ discussion: ApiDiscussion }>(`/discussions/${discussion._id}/vote`, {
        method: "POST",
        body: JSON.stringify({ vote: targetVote }),
      });
      setDiscussion(data.discussion);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to vote");
    }
  };

  const handleCommentVote = async (commentId: string, currentVote: "up" | null) => {
    if (!user) {
      toast.error("Please login to vote");
      return;
    }
    if (!discussion) return;

    try {
      const targetVote = currentVote === "up" ? "none" : "up";
      const data = await apiRequest<{ discussion: ApiDiscussion }>(`/discussions/${discussion._id}/comments/${commentId}/vote`, {
        method: "POST",
        body: JSON.stringify({ vote: targetVote }),
      });
      setDiscussion(data.discussion);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to vote on comment");
    }
  };

  const handleAddComment = async (event: FormEvent) => {
    event.preventDefault();
    if (!user) {
      toast.error("Please login to comment");
      return;
    }
    if (!commentBody.trim() || !discussion) return;

    setPostingComment(true);
    try {
      const data = await apiRequest<{ discussion: ApiDiscussion }>(`/discussions/${discussion._id}/comments`, {
        method: "POST",
        body: JSON.stringify({ body: commentBody.trim() }),
      });
      setDiscussion(data.discussion);
      setCommentBody("");
      toast.success("Comment posted!");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to post comment");
    } finally {
      setPostingComment(false);
    }
  };

  const handleUpdateComment = async (commentId: string) => {
    if (!editCommentBody.trim() || !discussion) return;
    setSavingCommentEdit(true);
    try {
      const data = await apiRequest<{ discussion: ApiDiscussion }>(`/discussions/${discussion._id}/comments/${commentId}`, {
        method: "PUT",
        body: JSON.stringify({ body: editCommentBody.trim() }),
      });
      setDiscussion(data.discussion);
      setEditingCommentId(null);
      setEditCommentBody("");
      toast.success("Comment updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to edit comment");
    } finally {
      setSavingCommentEdit(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!discussion) return;
    if (!window.confirm("Are you sure you want to delete this comment?")) return;

    try {
      const data = await apiRequest<{ discussion: ApiDiscussion }>(`/discussions/${discussion._id}/comments/${commentId}`, {
        method: "DELETE",
      });
      setDiscussion(data.discussion);
      toast.success("Comment deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to delete comment");
    }
  };

  const handleToggleLock = async () => {
    if (!discussion || user?.role !== "admin") return;
    try {
      const data = await apiRequest<{ discussion: ApiDiscussion }>(`/discussions/${discussion._id}`, {
        method: "PUT",
        body: JSON.stringify({ isLocked: !discussion.isLocked }),
      });
      setDiscussion(data.discussion);
      toast.success(data.discussion.isLocked ? "Discussion locked" : "Discussion unlocked");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update thread");
    }
  };

  const handleSaveEdit = async (event: FormEvent) => {
    event.preventDefault();
    if (!discussion) return;
    if (!editTitle.trim() || !editBody.trim()) {
      toast.error("Title and body cannot be empty");
      return;
    }

    setSavingEdit(true);
    try {
      const payload: Record<string, any> = {
        title: editTitle.trim(),
        body: editBody.trim(),
        tags: [editTag],
        problem: editProblem === "none" ? "" : editProblem,
        contest: editContest === "none" ? "" : editContest,
      };

      const data = await apiRequest<{ discussion: ApiDiscussion }>(`/discussions/${discussion._id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });

      setDiscussion(data.discussion);
      setIsEditing(false);
      toast.success("Post updated successfully");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update post");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteDiscussion = async () => {
    if (!discussion) return;
    if (!window.confirm("Are you sure you want to permanently delete this discussion?")) return;

    try {
      await apiRequest<void>(`/discussions/${discussion._id}`, {
        method: "DELETE",
      });
      toast.success("Discussion deleted successfully");
      navigate({ to: "/discuss" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to delete discussion");
    }
  };

  if (loading) {
    return (
      <AppShell>
        <div className="grid min-h-[60vh] place-items-center bg-background">
          <div className="h-10 w-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      </AppShell>
    );
  }

  if (!discussion) {
    return (
      <AppShell>
        <div className="grid min-h-[60vh] place-items-center text-sm text-muted-foreground">
          Discussion not found.
        </div>
      </AppShell>
    );
  }

  const author = discussion.author?.username ?? discussion.authorUsername ?? "anonymous";
  const isAuthor = user && discussion.author && discussion.author._id === user.id;
  const isAdmin = user?.role === "admin";
  const canManage = isAuthor || isAdmin;

  const isUpvoted = discussion.userVote === "up";
  const isDownvoted = discussion.userVote === "down";

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl space-y-6 p-6">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/discuss">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to discussions
          </Link>
        </Button>

        {isEditing ? (
          <Card className="p-6 border-border/60 bg-card/50 backdrop-blur-md">
            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold">Edit Post</h2>
                <Button type="button" variant="ghost" size="icon" onClick={() => setIsEditing(false)}>
                  <X className="h-5 w-5" />
                </Button>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase">Title</label>
                <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} required />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase">Content</label>
                <Textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} className="min-h-60 font-sans" required />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase">Category Tag</label>
                  <Select value={editTag} onValueChange={setEditTag}>
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

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase">Link Problem (Optional)</label>
                  <Select value={editProblem} onValueChange={setEditProblem}>
                    <SelectTrigger className="w-full bg-card">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {problems.map((p) => (
                        <SelectItem key={p._id} value={p._id}>{p.problemId}. {p.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase">Link Contest (Optional)</label>
                  <Select value={editContest} onValueChange={setEditContest}>
                    <SelectTrigger className="w-full bg-card">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {contests.map((c) => (
                        <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="outline" onClick={() => setIsEditing(false)} disabled={savingEdit}>Cancel</Button>
                <Button type="submit" className="gradient-primary text-primary-foreground font-semibold" disabled={savingEdit}>
                  {savingEdit ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </form>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* Main Thread Card */}
            <Card className="border-border/60 bg-card/40 backdrop-blur-md p-6 relative shadow-xl">
              <div className="flex items-start gap-4">
                <Avatar className="h-12 w-12 border border-border/60 shadow-inner">
                  <AvatarImage src={discussion.author?.avatar} />
                  <AvatarFallback className="bg-secondary text-secondary-foreground font-bold text-lg">{author[0]?.toUpperCase()}</AvatarFallback>
                </Avatar>

                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    {discussion.isLocked && (
                      <Badge variant="secondary" className="gap-1 bg-muted text-muted-foreground border-border text-[10px] uppercase font-bold py-0.5 px-2">
                        <Lock className="h-3 w-3" /> Locked
                      </Badge>
                    )}
                    <h1 className="text-2xl font-bold tracking-tight text-foreground">{discussion.title}</h1>
                  </div>

                  <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span>by <span className="font-semibold text-foreground/80">{author}</span></span>
                    <span>•</span>
                    <span>{formatDistanceToNow(new Date(discussion.createdAt))} ago</span>
                    {discussion.updatedAt && discussion.updatedAt !== discussion.createdAt && (
                      <>
                        <span>•</span>
                        <span>edited {formatDistanceToNow(new Date(discussion.updatedAt))} ago</span>
                      </>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {discussion.tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="font-semibold text-[11px] rounded-md px-2 py-0.5 bg-accent/30 border border-border/20">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Edit & Delete Action Panel */}
                <div className="flex items-center gap-1.5">
                  {canManage && (
                    <>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => setIsEditing(true)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={handleDeleteDiscussion}>
                        <Trash className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                  {isAdmin && (
                    <Button variant="ghost" size="icon" className={`h-8 w-8 ${discussion.isLocked ? "text-red-500 bg-red-500/10" : "text-muted-foreground hover:text-red-500"}`} onClick={handleToggleLock}>
                      <Lock className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>

              {/* Linked Items Banner */}
              {(discussion.problem || discussion.contest) && (
                <div className="mt-4 flex flex-wrap gap-2.5 p-3 rounded-lg bg-secondary/20 border border-border/40 text-xs">
                  {discussion.problem && (
                    <div className="flex items-center gap-1.5 font-medium">
                      <Code className="h-3.5 w-3.5 text-primary" />
                      <span>Linked Problem:</span>
                      <Link to="/problems/$slug" params={{ slug: discussion.problem.slug }} className="text-primary hover:underline font-bold">
                        {discussion.problem.title}
                      </Link>
                    </div>
                  )}
                  {discussion.problem && discussion.contest && <div className="h-4 w-px bg-border/40" />}
                  {discussion.contest && (
                    <div className="flex items-center gap-1.5 font-medium">
                      <Trophy className="h-3.5 w-3.5 text-amber-500" />
                      <span>Linked Contest:</span>
                      <Link to="/contests/$id" params={{ id: String(discussion.contest.contestId) }} className="text-amber-500 hover:underline font-bold">
                        {discussion.contest.name}
                      </Link>
                    </div>
                  )}
                </div>
              )}

              {/* Body */}
              <div className="mt-6 text-sm text-foreground/90 font-sans leading-relaxed whitespace-pre-wrap select-text">
                {discussion.body}
              </div>

              {/* Vote Score Panel */}
              <div className="mt-6 pt-4 border-t border-border/30 flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className={`h-9 gap-1.5 transition-all ${isUpvoted ? "bg-success/15 border-success/40 text-success" : "text-muted-foreground hover:text-success"}`}
                  onClick={() => handleVote("up")}
                >
                  <ThumbsUp className={`h-4 w-4 ${isUpvoted ? "fill-success" : ""}`} /> Upvote
                </Button>
                <span className="text-sm font-bold font-mono px-2">
                  {discussion.upvotes - discussion.downvotes}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className={`h-9 gap-1.5 transition-all ${isDownvoted ? "bg-destructive/15 border-destructive/40 text-destructive" : "text-muted-foreground hover:text-destructive"}`}
                  onClick={() => handleVote("down")}
                >
                  <ThumbsDown className={`h-4 w-4 ${isDownvoted ? "fill-destructive" : ""}`} /> Downvote
                </Button>
              </div>
            </Card>

            {/* Comments Area */}
            <div className="space-y-4">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <MessageCircle className="h-5 w-5 text-muted-foreground" />
                Comments ({discussion.comments?.length ?? 0})
              </h2>

              {/* Locked Banner / Form */}
              {discussion.isLocked ? (
                <div className="flex items-center gap-3 p-4 rounded-lg bg-secondary/35 border border-border text-sm text-muted-foreground">
                  <ShieldAlert className="h-5 w-5 text-muted-foreground shrink-0" />
                  <span>This thread is locked. You cannot post replies at this time.</span>
                </div>
              ) : (
                <Card className="p-4 border-border/60 bg-card/30 backdrop-blur-md">
                  <form onSubmit={handleAddComment} className="flex gap-3">
                    <Textarea
                      value={commentBody}
                      onChange={(e) => setCommentBody(e.target.value)}
                      placeholder={user ? "Write a supportive, constructive comment..." : "Please log in to leave a comment"}
                      disabled={!user || postingComment}
                      className="min-h-16 flex-1 bg-card resize-none font-sans"
                    />
                    <Button type="submit" size="icon" className="h-10 w-10 self-end gradient-primary text-primary-foreground shrink-0 shadow-lg" disabled={postingComment || !user || !commentBody.trim()}>
                      <Send className="h-4.5 w-4.5" />
                    </Button>
                  </form>
                </Card>
              )}

              {/* Comments List */}
              <div className="space-y-3">
                {discussion.comments?.map((comment) => {
                  const commentAuthor = comment.author?.username ?? "anonymous";
                  const isCommentAuthor = user && comment.author && comment.author._id === user.id;
                  const canManageComment = isCommentAuthor || isAdmin;
                  const isCommentUpvoted = comment.userVote === "up";

                  return (
                    <Card key={comment._id} className="p-4 border-border/40 bg-card/20 backdrop-blur-sm">
                      <div className="flex items-start gap-3">
                        <Avatar className="h-8 w-8 border border-border/50">
                          <AvatarImage src={comment.author?.avatar} />
                          <AvatarFallback className="bg-secondary text-secondary-foreground font-semibold text-sm">
                            {commentAuthor[0]?.toUpperCase()}
                          </AvatarFallback>
                        </Avatar>

                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-foreground/80">{commentAuthor}</span>
                              <span className="text-[10px] text-muted-foreground">{formatDistanceToNow(new Date(comment.createdAt))} ago</span>
                            </div>

                            {/* Comment editing/deleting operations */}
                            {canManageComment && (
                              <div className="flex items-center gap-1 opacity-70 hover:opacity-100 transition-opacity">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 text-muted-foreground hover:text-foreground"
                                  onClick={() => {
                                    setEditingCommentId(comment._id);
                                    setEditCommentBody(comment.body);
                                  }}
                                >
                                  <Edit className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 text-muted-foreground hover:text-destructive"
                                  onClick={() => handleDeleteComment(comment._id)}
                                >
                                  <Trash className="h-3 w-3" />
                                </Button>
                              </div>
                            )}
                          </div>

                          {editingCommentId === comment._id ? (
                            <div className="space-y-2 pt-1.5">
                              <Textarea
                                value={editCommentBody}
                                onChange={(e) => setEditCommentBody(e.target.value)}
                                className="min-h-16 font-sans"
                                required
                              />
                              <div className="flex justify-end gap-2">
                                <Button size="sm" variant="outline" className="h-7 text-xs px-2.5" onClick={() => setEditingCommentId(null)}>Cancel</Button>
                                <Button size="sm" className="h-7 text-xs px-2.5 gradient-primary text-primary-foreground font-semibold" onClick={() => handleUpdateComment(comment._id)} disabled={savingCommentEdit}>
                                  {savingCommentEdit ? "Saving..." : "Save"}
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="text-sm text-foreground/80 leading-relaxed font-sans whitespace-pre-wrap select-text">
                                {comment.body}
                              </div>
                              <div className="flex items-center gap-1.5 pt-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className={`h-7 gap-1 px-1.5 text-xs transition-colors ${isCommentUpvoted ? "text-success bg-success/10" : "text-muted-foreground hover:text-success"}`}
                                  onClick={() => handleCommentVote(comment._id, comment.userVote || null)}
                                >
                                  <ThumbsUp className={`h-3 w-3 ${isCommentUpvoted ? "fill-success" : ""}`} />
                                  <span className="font-semibold font-mono">{comment.upvotes}</span>
                                </Button>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </Card>
                  );
                })}

                {(!discussion.comments || discussion.comments.length === 0) && (
                  <div className="p-8 text-center text-xs text-muted-foreground flex items-center justify-center gap-2 bg-secondary/5 rounded-lg border border-dashed border-border/40">
                    <AlertCircle className="h-4 w-4 opacity-50" />
                    <span>No comments yet. Be the first to start the conversation!</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
