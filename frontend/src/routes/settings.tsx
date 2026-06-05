import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTheme } from "@/lib/theme";
import { apiRequest, type ApiLanguage, type ApiUser } from "@/lib/api";
import { toast } from "sonner";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings - CodeArena" }] }),
  component: Settings,
});

type SettingsForm = {
  name: string;
  username: string;
  email: string;
  country: string;
  avatar: string;
  defaultLanguage: string;
  editorFontSize: string;
};

const emptyForm: SettingsForm = {
  name: "",
  username: "",
  email: "",
  country: "",
  avatar: "",
  defaultLanguage: "cpp",
  editorFontSize: "14",
};

function Settings() {
  const { theme, toggle } = useTheme();
  const [form, setForm] = useState<SettingsForm>(emptyForm);
  const [languages, setLanguages] = useState<ApiLanguage[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiRequest<{ user: ApiUser }>("/users/me"),
      apiRequest<{ languages: ApiLanguage[] }>("/languages"),
    ])
      .then(([userData, languageData]) => {
        if (cancelled) return;
        const user = userData.user;
        setLanguages(languageData.languages);
        setForm({
          name: user.name ?? "",
          username: user.username ?? "",
          email: user.email ?? "",
          country: user.country ?? "",
          avatar: user.avatar ?? "",
          defaultLanguage: user.preferences?.defaultLanguage ?? languageData.languages[0]?.languageId ?? "cpp",
          editorFontSize: String(user.preferences?.editorFontSize ?? 14),
        });
      })
      .catch((error) => {
        if (!cancelled) toast.error(error instanceof Error ? error.message : "Unable to load settings");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setField = <K extends keyof SettingsForm>(key: K, value: SettingsForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await apiRequest<{ user: ApiUser }>("/users/me", {
        method: "PUT",
        body: JSON.stringify({
          name: form.name.trim(),
          username: form.username.trim(),
          avatar: form.avatar.trim(),
          country: form.country.trim().toUpperCase(),
          preferences: {
            defaultLanguage: form.defaultLanguage,
            editorFontSize: Number(form.editorFontSize) || 14,
            theme,
          },
        }),
      });
      toast.success("Profile updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update profile");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-6 p-6">
        <div><h1 className="text-2xl font-bold">Settings</h1><p className="text-sm text-muted-foreground">Manage your account and preferences.</p></div>

        <Card className="border-border/60 p-6">
          <form onSubmit={saveProfile}>
            <h3 className="font-semibold">Profile</h3>
            <Separator className="my-4" />
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2"><Label>Name</Label><Input value={form.name} onChange={(event) => setField("name", event.target.value)} /></div>
              <div className="space-y-2"><Label>Username</Label><Input value={form.username} onChange={(event) => setField("username", event.target.value)} /></div>
              <div className="space-y-2 md:col-span-2"><Label>Email</Label><Input value={form.email} disabled /></div>
              <div className="space-y-2"><Label>Country</Label><Input value={form.country} maxLength={2} onChange={(event) => setField("country", event.target.value)} /></div>
              <div className="space-y-2"><Label>Avatar URL</Label><Input value={form.avatar} onChange={(event) => setField("avatar", event.target.value)} /></div>
            </div>

            <h3 className="mt-6 font-semibold">Editor</h3>
            <Separator className="my-4" />
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Default language</Label>
                <Select value={form.defaultLanguage} onValueChange={(value) => setField("defaultLanguage", value)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {languages.map((language) => <SelectItem key={language.languageId} value={language.languageId}>{language.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Editor font size</Label><Input value={form.editorFontSize} inputMode="numeric" onChange={(event) => setField("editorFontSize", event.target.value)} /></div>
            </div>

            <div className="mt-4 flex justify-end"><Button type="submit" disabled={saving} className="gradient-primary text-primary-foreground">{saving ? "Saving..." : "Save"}</Button></div>
          </form>
        </Card>

        <Card className="border-border/60 p-6">
          <h3 className="font-semibold">Appearance</h3>
          <Separator className="my-4" />
          <div className="flex items-center justify-between">
            <div><div className="font-medium">Dark mode</div><div className="text-sm text-muted-foreground">Toggle between dark and light themes.</div></div>
            <Switch checked={theme === "dark"} onCheckedChange={toggle} />
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
