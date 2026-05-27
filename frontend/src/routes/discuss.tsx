import { createFileRoute } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { MessageCircle, Plus, ThumbsUp } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { discussions } from "@/lib/mock-data";

export const Route = createFileRoute("/discuss")({
  head: () => ({ meta: [{ title: "Discuss — CodeArena" }] }),
  component: Discuss,
});

function Discuss() {
  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-6 p-6">
        <div className="flex items-end justify-between">
          <div><h1 className="text-2xl font-bold">Discussions</h1><p className="text-sm text-muted-foreground">Editorials, questions, and contest debriefs from the community.</p></div>
          <Button className="gradient-primary text-primary-foreground"><Plus className="mr-2 h-4 w-4" />New post</Button>
        </div>

        <div className="flex gap-2">
          <Input placeholder="Search discussions…" className="bg-card/50" />
          {["All", "Tutorial", "Question", "Editorial", "Help"].map((t, i) => (
            <Badge key={t} variant={i === 0 ? "default" : "outline"} className="cursor-pointer px-3 py-1.5">{t}</Badge>
          ))}
        </div>

        <Card className="divide-y divide-border/60 border-border/60">
          {discussions.map((d) => (
            <div key={d.id} className="flex items-start gap-4 p-4 hover:bg-accent/20 transition cursor-pointer">
              <Avatar className="h-9 w-9"><AvatarFallback>{d.author[0]?.toUpperCase()}</AvatarFallback></Avatar>
              <div className="min-w-0 flex-1">
                <div className="font-medium">{d.title}</div>
                <div className="mt-1 text-xs text-muted-foreground">by {d.author} · {formatDistanceToNow(new Date(d.createdAt))} ago</div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {d.tags.map((t) => <Badge key={t} variant="secondary" className="font-normal text-xs">{t}</Badge>)}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1"><ThumbsUp className="h-3 w-3" /> {d.upvotes}</span>
                <span className="inline-flex items-center gap-1"><MessageCircle className="h-3 w-3" /> {d.comments}</span>
              </div>
            </div>
          ))}
        </Card>
      </div>
    </AppShell>
  );
}
