import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Calendar, MapPin } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Heatmap } from "@/components/heatmap";
import { VerdictBadge } from "@/components/verdict-badge";
import { apiRequest, type ApiActivity, type ApiSubmission, type ApiUser } from "@/lib/api";
import { toast } from "sonner";

export const Route = createFileRoute("/profile")({
  head: () => ({ meta: [{ title: "Profile - CodeArena" }] }),
  component: Profile,
});

function Profile() {
  const [user, setUser] = useState<ApiUser | null>(null);
  const [activity, setActivity] = useState<ApiActivity[]>([]);
  const [submissions, setSubmissions] = useState<ApiSubmission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      apiRequest<{ user: ApiUser }>("/users/me"),
      apiRequest<{ activity: ApiActivity[] }>("/users/me/activity?days=365"),
      apiRequest<{ submissions: ApiSubmission[] }>("/submissions?limit=8"),
    ])
      .then(([userData, activityData, submissionData]) => {
        if (cancelled) return;
        setUser(userData.user);
        setActivity(activityData.activity);
        setSubmissions(submissionData.submissions);
      })
      .catch((error) => {
        if (!cancelled) toast.error(error instanceof Error ? error.message : "Unable to load profile");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const name = user?.name || user?.username || "Coder";
  const joined = user?.joinedAt ? format(new Date(user.joinedAt), "MMM d, yyyy") : "-";

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl space-y-6 p-6">
        <Card className="overflow-hidden border-border/60">
          <div className="h-32 gradient-primary opacity-80" />
          <div className="flex flex-col items-start gap-4 p-6 md:flex-row md:items-end -mt-12">
            <Avatar className="h-24 w-24 ring-4 ring-background">
              <AvatarImage src={user?.avatar} /><AvatarFallback>{name.slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <h1 className="text-2xl font-bold">{name}</h1>
              <p className="text-sm text-muted-foreground">@{user?.username ?? "loading"}</p>
              <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {user?.country ?? "-"}</span>
                <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" /> Joined {joined}</span>
              </div>
            </div>
            <div className="flex gap-4 text-center">
              <div><div className="text-xl font-bold gradient-text">{user?.rating ?? 0}</div><div className="text-xs text-muted-foreground">Rating</div></div>
              <div><div className="text-xl font-bold">{user?.rank ? `#${user.rank}` : "-"}</div><div className="text-xs text-muted-foreground">Rank</div></div>
              <div><div className="text-xl font-bold">{user?.solved?.total ?? 0}</div><div className="text-xs text-muted-foreground">Solved</div></div>
            </div>
          </div>
        </Card>

        <div className="grid gap-4 md:grid-cols-3">
          {([
            ["Easy", user?.solved?.easy ?? 0, "text-success"],
            ["Medium", user?.solved?.medium ?? 0, "text-warning"],
            ["Hard", user?.solved?.hard ?? 0, "text-destructive"],
          ] as const).map(([label, value, color]) => (
            <Card key={label} className="border-border/60 p-5">
              <div className="text-xs text-muted-foreground">{label}</div>
              <div className={`mt-1 text-2xl font-bold ${color}`}>{value}</div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full gradient-primary" style={{ width: `${Math.min((value / Math.max(user?.solved?.total ?? 1, 1)) * 100, 100)}%` }} />
              </div>
            </Card>
          ))}
        </div>

        <Card className="border-border/60 p-5">
          <h3 className="mb-4 font-semibold">Submission activity</h3>
          <Heatmap days={activity} />
        </Card>

        <Tabs defaultValue="recent">
          <TabsList><TabsTrigger value="recent">Recent</TabsTrigger><TabsTrigger value="badges">Badges</TabsTrigger></TabsList>
          <TabsContent value="recent" className="pt-4 space-y-2">
            {submissions.map((submission) => (
              <div key={submission.submissionId} className="flex items-center justify-between rounded-lg border border-border/60 p-3">
                <div className="text-sm font-medium">{submission.problemTitle}</div>
                <VerdictBadge verdict={submission.verdict} />
              </div>
            ))}
            {!loading && submissions.length === 0 && <p className="text-sm text-muted-foreground">No submissions yet.</p>}
          </TabsContent>
          <TabsContent value="badges" className="pt-4 flex flex-wrap gap-2">
            {(user?.badges ?? []).map((badge) => (
              <Badge key={badge} variant="secondary" className="px-3 py-1.5">{badge}</Badge>
            ))}
            {!loading && (user?.badges ?? []).length === 0 && <p className="text-sm text-muted-foreground">No badges yet.</p>}
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
