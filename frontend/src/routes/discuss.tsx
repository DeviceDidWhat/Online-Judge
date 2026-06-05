import { createFileRoute } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { MessageCircle, Plus, ThumbsUp } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiRequest, type ApiDiscussion, type ApiPagination } from "@/lib/api";
import { toast } from "sonner";

export const Route = createFileRoute("/discuss")({
  head: () => ({ meta: [{ title: "Discuss - CodeArena" }] }),
  component: Discuss,
});

const tags = ["All", "Tutorial", "Question", "Editorial", "Help"];

function Discuss() {
  const [q, setQ] = useState("");
  const [tag, setTag] = useState("All");
  const [discussions, setDiscussions] = useState<ApiDiscussion[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [newTags, setNewTags] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const id = setTimeout(() => {
      setLoading(true);
      const params = new URLSearchParams({ limit: "50" });
      if (q.trim()) params.set("q", q.trim());
      if (tag !== "All") params.set("tag", tag);
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
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [q, tag]);

  const createDiscussion = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const data = await apiRequest<{ discussion: ApiDiscussion }>("/discussions", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          tags: newTags.split(",").map((item) => item.trim()).filter(Boolean),
        }),
      });
      setDiscussions((current) => [data.discussion, ...current]);
      setDialogOpen(false);
      setTitle("");
      setBody("");
      setNewTags("");
      toast.success("Discussion posted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to create discussion");
    } finally {
      setSaving(false);
    }
  };

  const vote = async (discussion: ApiDiscussion) => {
    try {
      const data = await apiRequest<{ discussion: ApiDiscussion }>(`/discussions/${discussion._id}/vote`, {
        method: "POST",
        body: JSON.stringify({ vote: "up" }),
      });
      setDiscussions((current) => current.map((item) => item._id === discussion._id ? { ...item, upvotes: data.discussion.upvotes, downvotes: data.discussion.downvotes } : item));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to vote");
    }
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-6 p-6">
        <div className="flex items-end justify-between">
          <div><h1 className="text-2xl font-bold">Discussions</h1><p className="text-sm text-muted-foreground">{loading ? "Loading posts..." : "Editorials, questions, and contest debriefs from the community."}</p></div>
          <Button className="gradient-primary text-primary-foreground" onClick={() => setDialogOpen(true)}><Plus className="mr-2 h-4 w-4" />New post</Button>
        </div>

        <div className="flex flex-wrap gap-2">
          <Input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search discussions..." className="min-w-64 flex-1 bg-card/50" />
          {tags.map((item) => (
            <Badge key={item} variant={tag === item ? "default" : "outline"} className="cursor-pointer px-3 py-1.5" onClick={() => setTag(item)}>{item}</Badge>
          ))}
        </div>

        <Card className="divide-y divide-border/60 border-border/60">
          {discussions.map((discussion) => {
            const author = discussion.author?.username ?? discussion.authorUsername ?? "unknown";
            return (
              <div key={discussion._id} className="flex items-start gap-4 p-4 hover:bg-accent/20 transition">
                <Avatar className="h-9 w-9"><AvatarImage src={discussion.author?.avatar} /><AvatarFallback>{author[0]?.toUpperCase()}</AvatarFallback></Avatar>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{discussion.title}</div>
                  <div className="mt-1 text-xs text-muted-foreground">by {author} / {formatDistanceToNow(new Date(discussion.createdAt))} ago</div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {discussion.tags.map((item) => <Badge key={item} variant="secondary" className="font-normal text-xs">{item}</Badge>)}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 text-xs text-muted-foreground">
                  <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => vote(discussion)}>
                    <ThumbsUp className="h-3 w-3" /> {discussion.upvotes}
                  </Button>
                  <span className="inline-flex items-center gap-1"><MessageCircle className="h-3 w-3" /> {discussion.comments?.length ?? 0}</span>
                </div>
              </div>
            );
          })}
          {!loading && discussions.length === 0 && <div className="p-8 text-center text-sm text-muted-foreground">No discussions found.</div>}
        </Card>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>New discussion</DialogTitle>
              <DialogDescription>Start a community thread.</DialogDescription>
            </DialogHeader>
            <form className="space-y-4" onSubmit={createDiscussion}>
              <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Title" required />
              <Textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="Body" className="min-h-40" required />
              <Input value={newTags} onChange={(event) => setNewTags(event.target.value)} placeholder="Tags, comma separated" />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
                <Button type="submit" className="gradient-primary text-primary-foreground" disabled={saving}>{saving ? "Posting..." : "Post"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}
