import { Link, useRouterState } from "@tanstack/react-router";
import {
  BarChart3, BookOpen, FileCode2, Home, LayoutDashboard,
  MessagesSquare, Settings, ShieldCheck, Trophy, User,
} from "lucide-react";

const items = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/problems", label: "Problems", icon: FileCode2 },
  { to: "/contests", label: "Contests", icon: Trophy },
  { to: "/leaderboard", label: "Leaderboard", icon: BarChart3 },
  { to: "/discuss", label: "Discuss", icon: MessagesSquare },
  { to: "/submissions", label: "Submissions", icon: BookOpen },
];
const account = [
  { to: "/profile", label: "Profile", icon: User },
  { to: "/settings", label: "Settings", icon: Settings },
  { to: "/admin", label: "Admin", icon: ShieldCheck },
];

export function Sidebar() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const Item = ({ to, label, icon: Icon }: { to: string; label: string; icon: any }) => {
    const active = path === to || path.startsWith(to + "/");
    return (
      <Link
        to={to}
        className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all ${
          active
            ? "bg-primary/15 text-primary font-medium"
            : "text-muted-foreground hover:bg-accent hover:text-foreground"
        }`}
      >
        <Icon className="h-4 w-4" />
        {label}
      </Link>
    );
  };
  return (
    <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-60 shrink-0 border-r border-border/60 bg-sidebar/40 backdrop-blur md:block">
      <nav className="flex h-full flex-col gap-1 p-4">
        <Link to="/" className="mb-2 flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground">
          <Home className="h-4 w-4" /> Home
        </Link>
        <div className="px-3 pb-1 pt-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Workspace</div>
        {items.map((i) => <Item key={i.to} {...i} />)}
        <div className="px-3 pb-1 pt-5 text-xs font-medium uppercase tracking-wider text-muted-foreground">Account</div>
        {account.map((i) => <Item key={i.to} {...i} />)}
        <div className="mt-auto rounded-xl border border-border/60 bg-gradient-to-br from-primary/15 to-transparent p-4">
          <div className="text-sm font-semibold">Upgrade to Pro</div>
          <p className="mt-1 text-xs text-muted-foreground">Unlock premium problems and contest analytics.</p>
        </div>
      </nav>
    </aside>
  );
}
