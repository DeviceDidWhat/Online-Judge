import { createFileRoute } from "@tanstack/react-router";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, Cpu, FileCode2, Plus, Server, Users } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { difficultyClass, problems } from "@/lib/mock-data";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin — CodeArena" }] }),
  component: Admin,
});

const queue = Array.from({ length: 12 }, (_, i) => ({ hour: `${i * 2}:00`, jobs: Math.floor(Math.random() * 400) + 80 }));
const workers = Array.from({ length: 8 }, (_, i) => ({
  id: `worker-${i + 1}`,
  region: ["us-east", "eu-west", "ap-south"][i % 3],
  load: Math.floor(Math.random() * 100),
  status: Math.random() > 0.1 ? "online" : "degraded",
}));

function Admin() {
  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-6 p-6">
        <div>
          <h1 className="text-2xl font-bold">Admin Console</h1>
          <p className="text-sm text-muted-foreground">Manage problems, users, and platform infrastructure.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          {[
            { l: "Total users", v: "243,184", i: Users, c: "text-info" },
            { l: "Problems", v: "3,142", i: FileCode2, c: "text-primary" },
            { l: "Jobs in queue", v: "84", i: Activity, c: "text-warning" },
            { l: "Workers online", v: "7 / 8", i: Server, c: "text-success" },
          ].map((s) => (
            <Card key={s.l} className="border-border/60 p-5">
              <div className="flex items-center justify-between"><span className="text-xs uppercase text-muted-foreground">{s.l}</span><s.i className="h-4 w-4 text-muted-foreground" /></div>
              <div className={`mt-2 text-2xl font-bold ${s.c}`}>{s.v}</div>
            </Card>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="border-border/60 p-5 lg:col-span-2">
            <h3 className="mb-4 font-semibold">Judge queue throughput</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={queue}>
                <CartesianGrid stroke="oklch(0.28 0.014 250)" strokeDasharray="3 3" />
                <XAxis dataKey="hour" stroke="oklch(0.65 0.012 250)" fontSize={11} />
                <YAxis stroke="oklch(0.65 0.012 250)" fontSize={11} />
                <Tooltip contentStyle={{ background: "oklch(0.20 0.014 250)", border: "1px solid oklch(0.28 0.014 250)", borderRadius: 8 }} />
                <Bar dataKey="jobs" fill="oklch(0.72 0.18 145)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card className="border-border/60 p-5">
            <h3 className="mb-4 font-semibold">Worker nodes</h3>
            <div className="space-y-2 text-sm">
              {workers.map((w) => (
                <div key={w.id} className="rounded-lg border border-border/60 p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Cpu className="h-4 w-4 text-muted-foreground" />
                      <span className="font-mono text-xs">{w.id}</span>
                    </div>
                    <Badge variant="outline" className={w.status === "online" ? "border-success/40 text-success" : "border-warning/40 text-warning"}>
                      <span className={`mr-1.5 h-1.5 w-1.5 rounded-full ${w.status === "online" ? "bg-success animate-pulse-glow" : "bg-warning"}`} />
                      {w.status}
                    </Badge>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                    <span>{w.region}</span><span>{w.load}% load</span>
                  </div>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
                    <div className={`h-full ${w.load > 80 ? "bg-destructive" : "gradient-primary"}`} style={{ width: `${w.load}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <Card className="border-border/60">
          <div className="flex items-center justify-between p-5">
            <h3 className="font-semibold">Problems</h3>
            <Button size="sm" className="gradient-primary text-primary-foreground"><Plus className="mr-1.5 h-4 w-4" />New problem</Button>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr><th className="px-4 py-3">ID</th><th className="px-4 py-3">Title</th><th className="px-4 py-3">Difficulty</th><th className="px-4 py-3">Acceptance</th><th className="px-4 py-3">Tests</th><th className="px-4 py-3 text-right">Actions</th></tr>
            </thead>
            <tbody>
              {problems.map((p) => (
                <tr key={p.id} className="border-t border-border/60 hover:bg-accent/30">
                  <td className="px-4 py-3 font-mono text-xs">{p.id}</td>
                  <td className="px-4 py-3 font-medium">{p.title}</td>
                  <td className={`px-4 py-3 font-medium ${difficultyClass[p.difficulty]}`}>{p.difficulty}</td>
                  <td className="px-4 py-3 text-muted-foreground">{p.acceptance}%</td>
                  <td className="px-4 py-3 text-muted-foreground">{Math.floor(Math.random() * 100) + 20}</td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="ghost" size="sm">Edit</Button>
                    <Button variant="ghost" size="sm" className="text-destructive">Delete</Button>
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
