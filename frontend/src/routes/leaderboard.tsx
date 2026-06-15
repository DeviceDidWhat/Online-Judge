import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Crown, Medal, Search, Trophy } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { apiRequest, type ApiPagination, type ApiUser } from "@/lib/api";
import { toast } from "sonner";

export const Route = createFileRoute("/leaderboard")({
  head: () => ({ meta: [{ title: "Leaderboard - CodeArena" }] }),
  component: Leaderboard,
});

const icons = [Crown, Medal, Trophy];
const podiumColor = ["text-warning", "text-muted-foreground", "text-[oklch(0.65_0.18_45)]"];

function Leaderboard() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState<ApiPagination | null>(null);

  useEffect(() => {
    let cancelled = false;
    const handle = setTimeout(() => {
      setLoading(true);
      const query = q.trim() ? `?q=${encodeURIComponent(q.trim())}&limit=50` : "?limit=50";
      apiRequest<{ users: ApiUser[]; pagination: ApiPagination }>(`/users/leaderboard${query}`)
        .then((data) => {
          if (!cancelled) {
            setUsers(data.users);
            setPagination(data.pagination);
          }
        })
        .catch((error) => {
          if (!cancelled) toast.error(error instanceof Error ? error.message : "Unable to load leaderboard");
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [q]);

  const ranked = useMemo(() => users.map((user, index) => ({
    ...user,
    rank: user.rank ?? index + 1,
  })), [users]);
  const top3 = ranked.slice(0, 3);
  const rest = ranked.slice(3);

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl p-6">
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Global Leaderboard</h1>
            <p className="text-sm text-muted-foreground">{loading ? "Loading rankings..." : `${pagination?.total ?? users.length} ranked users`}</p>
          </div>
          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search username..." className="pl-9 bg-card/50" />
          </div>
        </div>

        <div className="mb-8 grid gap-4 md:grid-cols-3">
          {top3.map((user, index) => {
            const Icon = icons[index];
            return (
              <Link key={user._id ?? user.username} to="/users/$username" params={{ username: user.username }}>
                <Card className="relative overflow-hidden border-border/60 bg-gradient-to-br from-card to-secondary/40 p-6 transition hover:border-primary/40 cursor-pointer">
                  <Icon className={`absolute right-4 top-4 h-6 w-6 ${podiumColor[index]}`} />
                  <div className="flex items-center gap-3">
                    <Avatar className="h-14 w-14 ring-2 ring-primary/30">
                      <AvatarImage src={user.avatar} /><AvatarFallback>{user.username[0]?.toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="text-xs text-muted-foreground">Rank #{user.rank}</div>
                      <div className="font-semibold">{user.username}</div>
                      <div className="text-xs text-muted-foreground">{user.country ?? "??"}</div>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div><div className="text-xs text-muted-foreground">Rating</div><div className="text-lg font-bold gradient-text">{user.rating ?? 0}</div></div>
                    <div><div className="text-xs text-muted-foreground">Solved</div><div className="text-lg font-bold">{user.solved?.total ?? 0}</div></div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>

        <Card className="overflow-hidden border-border/60">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr><th className="px-4 py-3">Rank</th><th className="px-4 py-3">User</th><th className="px-4 py-3">Country</th><th className="px-4 py-3">Rating</th><th className="px-4 py-3">Solved</th><th className="px-4 py-3">Streak</th></tr>
            </thead>
            <tbody>
              {rest.map((user) => (
                <tr
                  key={user._id ?? user.username}
                  className="border-t border-border/60 hover:bg-accent/30 cursor-pointer"
                  onClick={() => navigate({ to: "/users/$username", params: { username: user.username } })}
                >
                  <td className="px-4 py-3 font-mono text-muted-foreground">#{user.rank}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8"><AvatarImage src={user.avatar} /><AvatarFallback>{user.username[0]?.toUpperCase()}</AvatarFallback></Avatar>
                      <span className="font-medium">{user.username}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{user.country ?? "-"}</td>
                  <td className="px-4 py-3 font-bold gradient-text">{user.rating ?? 0}</td>
                  <td className="px-4 py-3">{user.solved?.total ?? 0}</td>
                  <td className="px-4 py-3">{user.streak ?? 0}d</td>
                </tr>
              ))}
              {!loading && ranked.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No users found.</td></tr>
              )}
            </tbody>
          </table>
        </Card>
      </div>
    </AppShell>
  );
}
