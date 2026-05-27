import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useTheme } from "@/lib/theme";
import { mockUser } from "@/lib/mock-data";
import { toast } from "sonner";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings — CodeArena" }] }),
  component: Settings,
});

function Settings() {
  const { theme, toggle } = useTheme();
  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-6 p-6">
        <div><h1 className="text-2xl font-bold">Settings</h1><p className="text-sm text-muted-foreground">Manage your account and preferences.</p></div>

        <Card className="border-border/60 p-6">
          <h3 className="font-semibold">Profile</h3>
          <Separator className="my-4" />
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2"><Label>Name</Label><Input defaultValue={mockUser.name} /></div>
            <div className="space-y-2"><Label>Username</Label><Input defaultValue={mockUser.username} /></div>
            <div className="space-y-2 md:col-span-2"><Label>Email</Label><Input defaultValue={mockUser.email} /></div>
          </div>
          <div className="mt-4 flex justify-end"><Button onClick={() => toast.success("Profile updated")} className="gradient-primary text-primary-foreground">Save</Button></div>
        </Card>

        <Card className="border-border/60 p-6">
          <h3 className="font-semibold">Appearance</h3>
          <Separator className="my-4" />
          <div className="flex items-center justify-between">
            <div><div className="font-medium">Dark mode</div><div className="text-sm text-muted-foreground">Toggle between dark and light themes.</div></div>
            <Switch checked={theme === "dark"} onCheckedChange={toggle} />
          </div>
        </Card>

        <Card className="border-border/60 p-6">
          <h3 className="font-semibold">Notifications</h3>
          <Separator className="my-4" />
          <div className="space-y-4">
            {["Contest reminders", "Solution accepted", "New replies on my posts", "Weekly digest"].map((n) => (
              <div key={n} className="flex items-center justify-between">
                <div className="text-sm">{n}</div>
                <Switch defaultChecked />
              </div>
            ))}
          </div>
        </Card>

        <Card className="border-destructive/40 p-6">
          <h3 className="font-semibold text-destructive">Danger zone</h3>
          <Separator className="my-4 bg-destructive/30" />
          <div className="flex items-center justify-between">
            <div><div className="font-medium">Delete account</div><div className="text-sm text-muted-foreground">Permanently delete your data. This cannot be undone.</div></div>
            <Button variant="destructive">Delete account</Button>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
