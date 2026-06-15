import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet, Link, createRootRouteWithContext, useRouter,
  HeadContent, Scripts,
} from "@tanstack/react-router";
import appCss from "../styles.css?url";
import { ThemeProvider } from "@/lib/theme";
import { AuthProvider, useAuth } from "@/lib/auth";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { getSocket, reconnectSocket, destroySocket } from "@/lib/socket";

function NotFoundComponent() {
  const [typedLines, setTypedLines] = React.useState<string[]>([]);
  const lines = [
    { text: "$ ./find_page --url=/wasdwasd", color: "text-muted-foreground" },
    { text: "> Scanning route tree...", color: "text-info" },
    { text: "> ERROR 404: Route not resolved", color: "text-destructive" },
    { text: "> Verdict: Page Not Found", color: "text-warning" },
    { text: "> Suggestion: Return to /home", color: "text-success" },
  ];

  React.useEffect(() => {
    let i = 0;
    const timers: NodeJS.Timeout[] = [];
    lines.forEach((_, idx) => {
      const t = setTimeout(() => {
        setTypedLines(prev => [...prev, lines[idx].text]);
      }, 400 + idx * 600);
      timers.push(t);
    });
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden bg-background px-4">
      {/* Grid background */}
      <div className="pointer-events-none absolute inset-0 grid-bg opacity-30" />

      <div className="relative z-10 w-full max-w-2xl">
        {/* Code editor frame */}
        <div className="rounded-xl border border-border bg-card/80 backdrop-blur-sm shadow-elegant overflow-hidden">
          {/* Window chrome */}
          <div className="flex items-center gap-2 border-b border-border bg-muted/50 px-4 py-3">
            <div className="h-3 w-3 rounded-full bg-destructive/80" />
            <div className="h-3 w-3 rounded-full bg-warning/80" />
            <div className="h-3 w-3 rounded-full bg-success/80" />
            <span className="ml-3 text-xs text-muted-foreground font-mono">terminal — 404.cpp</span>
          </div>

          {/* Terminal content */}
          <div className="p-6 font-mono text-sm">
            {/* Big 404 with glitch */}
            <div className="mb-6 text-center">
              <h1 className="text-9xl font-bold leading-none">
                <span className="relative inline-block">
                  <span className="gradient-text">4</span>
                  <span className="absolute left-0 top-0 -translate-x-0.5 text-destructive/60 animate-pulse" style={{ clipPath: 'inset(0 30% 0 0)' }}>4</span>
                </span>
                <span className="relative inline-block mx-1">
                  <span className="text-primary animate-glitch">0</span>
                </span>
                <span className="relative inline-block">
                  <span className="gradient-text">4</span>
                  <span className="absolute left-0 top-0 translate-x-0.5 text-info/60 animate-pulse" style={{ clipPath: 'inset(0 0 0 40%)', animationDelay: '0.3s' }}>4</span>
                </span>
              </h1>
              <p className="mt-2 text-muted-foreground text-xs uppercase tracking-widest">Runtime Error: Page Not Found</p>
            </div>

            {/* Typed terminal output */}
            <div className="space-y-1 rounded-lg bg-background/60 p-4 border border-border/50">
              {typedLines.map((line, i) => (
                <div key={i} className={`${i === 1 ? 'text-info' : i === 2 ? 'text-destructive' : i === 3 ? 'text-warning' : i === 4 ? 'text-success' : 'text-muted-foreground'} flex items-center gap-2`}>
                  <span className="text-muted-foreground/40 select-none">{String(i + 1).padStart(2, '0')}</span>
                  <span>{line}</span>
                  {i === typedLines.length - 1 && (
                    <span className="inline-block h-4 w-2 bg-primary animate-pulse" />
                  )}
                </div>
              ))}
              {typedLines.length === 0 && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span className="text-muted-foreground/40 select-none">01</span>
                  <span className="inline-block h-4 w-2 bg-primary animate-pulse" />
                </div>
              )}
            </div>

            {/* Error details */}
            <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <svg className="mt-0.5 h-5 w-5 text-destructive shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                <div className="space-y-1 text-xs">
                  <p className="text-destructive font-semibold">SIGSEGV — Segmentation Fault</p>
                  <p className="text-muted-foreground">The page you requested does not exist in the route tree.</p>
                  <p className="text-muted-foreground">Check the URL or navigate back to a known route.</p>
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Link to="/" className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-glow transition-all hover:scale-105 hover:shadow-glow">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
                cd /home
              </Link>
              <Link to="/problems" className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary px-5 py-2.5 text-sm font-medium text-secondary-foreground transition-all hover:bg-accent">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
                goto problems
              </Link>
            </div>
          </div>
        </div>

        {/* Footer joke */}
        <p className="mt-6 text-center text-xs text-muted-foreground/60 font-mono">
          // If you think this is a bug, please open an issue. Otherwise, try a different URL.
        </p>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  return (
    <div className="grid min-h-screen place-items-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold">Runtime Error</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <button
          onClick={() => { router.invalidate(); reset(); }}
          className="mt-6 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "CodeArena — Competitive Coding Platform" },
      { name: "description", content: "CodeArena is a modern online judge for competitive programmers. Solve problems, compete in contests, and climb the leaderboard." },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head><HeadContent /></head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

// ── Socket lifecycle tied to auth state ─────────────────────────────────────────
function SocketProvider({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  React.useEffect(() => {
    // Wait until auth resolves before touching the socket.
    if (isLoading) return;

    if (user) {
      // User is logged in — connect (or reconnect with fresh token).
      reconnectSocket();
    } else {
      // User logged out — destroy so next login gets a fresh authenticated connection.
      destroySocket();
    }
  }, [user, isLoading]);

  // Global notification toast listener.
  React.useEffect(() => {
    if (!user) return;

    const socket = getSocket();
    const handler = (notification: {
      title: string;
      body: string;
      type: string;
      link?: string;
    }) => {
      toast.info(notification.title, {
        description: notification.body,
        action: notification.link
          ? { label: 'View', onClick: () => window.location.assign(notification.link!) }
          : undefined,
      });
    };

    socket.on('notification:new', handler);
    return () => { socket.off('notification:new', handler); };
  }, [user]);

  return <>{children}</>;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <SocketProvider>
            <TooltipProvider>
              <Outlet />
              <Toaster />
            </TooltipProvider>
          </SocketProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}