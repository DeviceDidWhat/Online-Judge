import { createFileRoute } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, Crown, Medal, Trophy } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { leaderboard } from "@/lib/mock-data";

export const Route = createFileRoute("/leaderboard")({
  head: () => ({ meta: [{ title: "Leaderboard — CodeArena" }] }),
  component: Leaderboard,
});

const icons = [Crown, Medal, Trophy];
const podiumColor = ["text-warning", "text-muted-foreground", "text-[oklch(0.65_0.18_45)]"];

function Leaderboard() {
  const top3 = leaderboard.slice(0, 3);
  const rest = leaderboard.slice(3);
  return (
    <AppShell>
      <div className="mx-auto max-w-7xl p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Global Leaderboard</h1>
          <p className="text-sm text-muted-foreground">Top performers across all CodeArena contests.</p>
        </div>

        <div className="mb-8 grid gap-4 md:grid-cols-3">
          {top3.map((u, i) => {
            const Icon = icons[i];
            return (
              <Card key={u.username} className="relative overflow-hidden border-border/60 bg-gradient-to-br from-card to-secondary/40 p-6 transition hover:border-primary/40">
                <Icon className={`absolute right-4 top-4 h-6 w-6 ${podiumColor[i]}`} />
                <div className="flex items-center gap-3">
                  <Avatar className="h-14 w-14 ring-2 ring-primary/30">
                    <AvatarImage src={u.avatar} /><AvatarFallback>{u.username[0]}</AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="text-xs text-muted-foreground">Rank #{u.rank}</div>
                    <div className="font-semibold">{u.username}</div>
                    <div className="text-xs text-muted-foreground">🌍 {u.country}</div>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div><div className="text-xs text-muted-foreground">Rating</div><div className="text-lg font-bold gradient-text">{u.rating}</div></div>
                  <div><div className="text-xs text-muted-foreground">Solved</div><div className="text-lg font-bold">{u.solved}</div></div>
                </div>
              </Card>
            );
          })}
        </div>

        <Card className="overflow-hidden border-border/60">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr><th className="px-4 py-3">Rank</th><th className="px-4 py-3">User</th><th className="px-4 py-3">Country</th><th className="px-4 py-3">Rating</th><th className="px-4 py-3">Solved</th><th className="px-4 py-3">Δ</th></tr>
            </thead>
            <tbody>
              {rest.map((u) => (
                <tr key={u.username} className="border-t border-border/60 hover:bg-accent/30">
                  <td className="px-4 py-3 font-mono text-muted-foreground">#{u.rank}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8"><AvatarImage src={u.avatar} /><AvatarFallback>{u.username[0]}</AvatarFallback></Avatar>
                      <span className="font-medium">{u.username}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{u.country}</td>
                  <td className="px-4 py-3 font-bold gradient-text">{u.rating}</td>
                  <td className="px-4 py-3">{u.solved}</td>
                  <td className={`px-4 py-3 font-medium ${u.change >= 0 ? "text-success" : "text-destructive"}`}>
                    <span className="inline-flex items-center gap-1">
                      {u.change >= 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                      {Math.abs(u.change)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </AppShell>
  );
}
