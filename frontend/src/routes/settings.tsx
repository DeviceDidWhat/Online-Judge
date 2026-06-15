import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTheme } from "@/lib/theme";
import { apiRequest, type ApiUser } from "@/lib/api";
import { COUNTRIES } from "@/lib/countries";
import { toast } from "sonner";
import { Camera, Loader2, Trash2, Lock } from "lucide-react";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings - CodeArena" }] }),
  component: Settings,
});

const AUTH_STORAGE_KEY = "codearena_auth";
const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000/api";

type SettingsForm = {
  name: string;
  username: string;
  email: string;
  country: string;
  avatar: string;
};

const emptyForm: SettingsForm = {
  name: "",
  username: "",
  email: "",
  country: "",
  avatar: "",
};

async function getCroppedImage(imageSrc: string, pixelCrop: Area): Promise<Blob> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.addEventListener("load", () => resolve(img));
    img.addEventListener("error", reject);
    img.setAttribute("crossOrigin", "anonymous");
    img.src = imageSrc;
  });

  const canvas = document.createElement("canvas");
  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;
  const ctx = canvas.getContext("2d")!;

  ctx.drawImage(
    image,
    pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height,
    0, 0, pixelCrop.width, pixelCrop.height,
  );

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => { if (blob) resolve(blob); else reject(new Error("Canvas is empty")); },
      "image/jpeg",
      0.92,
    );
  });
}

function Settings() {
  const { theme, toggle } = useTheme();
  const [form, setForm] = useState<SettingsForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false);
  const [togglingPrivacy, setTogglingPrivacy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Crop state
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiRequest<{ user: ApiUser }>("/users/me")
      .then(({ user }) => {
        if (cancelled) return;
        setForm({
          name: user.name ?? "",
          username: user.username ?? "",
          email: user.email ?? "",
          country: user.country ?? "",
          avatar: user.avatar ?? "",
        });
        setIsPrivate(user.isPrivate ?? false);
      })
      .catch((error) => {
        if (!cancelled) toast.error(error instanceof Error ? error.message : "Unable to load settings");
      });
    return () => { cancelled = true; };
  }, []);

  const setField = <K extends keyof SettingsForm>(key: K, value: SettingsForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  // Step 1: file selected → open crop dialog
  const onFileSelected = (file: File) => {
    const objectUrl = URL.createObjectURL(file);
    setCropSrc(objectUrl);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    setCropOpen(true);
  };

  const onCropComplete = useCallback((_: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  // Step 2: user confirms crop → produce blob → upload
  const applyCrop = async () => {
    if (!cropSrc || !croppedAreaPixels) return;
    setCropOpen(false);

    try {
      const blob = await getCroppedImage(cropSrc, croppedAreaPixels);
      URL.revokeObjectURL(cropSrc);
      setCropSrc(null);
      await uploadAvatarBlob(blob);
    } catch {
      toast.error("Failed to process image");
      URL.revokeObjectURL(cropSrc);
      setCropSrc(null);
    }
  };

  const closeCropDialog = () => {
    if (cropSrc) { URL.revokeObjectURL(cropSrc); setCropSrc(null); }
    setCropOpen(false);
  };

  const removeAvatar = async () => {
    setUploadingAvatar(true);
    try {
      const stored = localStorage.getItem(AUTH_STORAGE_KEY);
      const token = stored ? (JSON.parse(stored) as { accessToken?: string }).accessToken : undefined;

      const response = await fetch(`${API_BASE_URL}/users/me/avatar`, {
        method: "DELETE",
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });

      const data = await response.json().catch(() => ({})) as { message?: string };
      if (!response.ok) throw new Error(data.message ?? "Failed to remove avatar");

      setField("avatar", "");
      toast.success("Avatar removed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to remove avatar");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const uploadAvatarBlob = async (blob: Blob) => {
    setUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append("avatar", blob, "avatar.jpg");

      const stored = localStorage.getItem(AUTH_STORAGE_KEY);
      const token = stored ? (JSON.parse(stored) as { accessToken?: string }).accessToken : undefined;

      const response = await fetch(`${API_BASE_URL}/users/me/avatar`, {
        method: "POST",
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: formData,
      });

      const data = await response.json().catch(() => ({})) as { avatarUrl?: string; message?: string };
      if (!response.ok) throw new Error(data.message ?? "Upload failed");

      setField("avatar", data.avatarUrl ?? "");
      toast.success("Avatar updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to upload avatar");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const togglePrivacy = async (value: boolean) => {
    setTogglingPrivacy(true);
    try {
      await apiRequest<{ user: ApiUser }>("/users/me/privacy", {
        method: "PUT",
        body: JSON.stringify({ isPrivate: value }),
      });
      setIsPrivate(value);
      toast.success(value ? "Profile set to private" : "Profile set to public");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update privacy");
    } finally {
      setTogglingPrivacy(false);
    }
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
          country: form.country.trim(),
        }),
      });
      toast.success("Profile updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update profile");
    } finally {
      setSaving(false);
    }
  };

  const displayName = form.name || form.username;

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-6 p-6">
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-sm text-muted-foreground">Manage your account and preferences.</p>
        </div>

        <Card className="border-border/60 p-6">
          <form onSubmit={saveProfile}>
            <h3 className="font-semibold">Profile</h3>
            <Separator className="my-4" />

            {/* Avatar upload */}
            <div className="mb-6 flex items-center gap-4">
              <div className="relative">
                <Avatar className="h-20 w-20">
                  <AvatarImage src={form.avatar} />
                  <AvatarFallback className="text-lg">
                    {displayName.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingAvatar}
                  className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 transition-opacity hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-0"
                >
                  <Camera className="h-5 w-5 text-white" />
                </button>
                {uploadingAvatar && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50">
                    <Loader2 className="h-5 w-5 animate-spin text-white" />
                  </div>
                )}
              </div>
              <div>
                <p className="font-medium">Profile photo</p>
                <p className="text-sm text-muted-foreground">JPG, PNG or GIF · Max 5 MB</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingAvatar}
                  >
                    {uploadingAvatar ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Uploading…</> : "Change photo"}
                  </Button>
                  {form.avatar && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={removeAvatar}
                      disabled={uploadingAvatar}
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/40"
                    >
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                      Remove
                    </Button>
                  )}
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onFileSelected(file);
                  e.target.value = "";
                }}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={form.name} onChange={(e) => setField("name", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Username</Label>
                <Input value={form.username} onChange={(e) => setField("username", e.target.value)} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Email</Label>
                <Input value={form.email} disabled />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Country</Label>
                <Select value={form.country} onValueChange={(v) => setField("country", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select your country" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {COUNTRIES.map((c) => (
                      <SelectItem key={c.code} value={c.name}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <Button type="submit" disabled={saving} className="gradient-primary text-primary-foreground">
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </form>
        </Card>

        <Card className="border-border/60 p-6">
          <h3 className="font-semibold">Appearance</h3>
          <Separator className="my-4" />
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Dark mode</div>
              <div className="text-sm text-muted-foreground">Toggle between dark and light themes.</div>
            </div>
            <Switch checked={theme === "dark"} onCheckedChange={toggle} />
          </div>
        </Card>

        <Card className="border-border/60 p-6">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4" />
            <h3 className="font-semibold">Privacy</h3>
          </div>
          <Separator className="my-4" />
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Private profile</div>
              <div className="text-sm text-muted-foreground">
                {isPrivate
                  ? "Your profile and stats are hidden from other users and the leaderboard."
                  : "Your profile is visible to everyone on the leaderboard."}
              </div>
            </div>
            <Switch
              checked={isPrivate}
              onCheckedChange={togglePrivacy}
              disabled={togglingPrivacy}
            />
          </div>
        </Card>
      </div>

      {/* Crop dialog */}
      <Dialog open={cropOpen} onOpenChange={(open) => { if (!open) closeCropDialog(); }}>
        <DialogContent className="max-w-lg p-0 overflow-hidden">
          <DialogHeader className="p-6 pb-2">
            <DialogTitle>Adjust your photo</DialogTitle>
          </DialogHeader>

          <div className="relative h-80 w-full bg-black">
            {cropSrc && (
              <Cropper
                image={cropSrc}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCrop}
                onCropComplete={onCropComplete}
                onZoomChange={setZoom}
              />
            )}
          </div>

          <div className="px-6 pt-3">
            <Label className="mb-2 block text-sm text-muted-foreground">Zoom</Label>
            <Slider
              min={1}
              max={3}
              step={0.05}
              value={[zoom]}
              onValueChange={([v]) => setZoom(v)}
              className="mb-4"
            />
          </div>

          <DialogFooter className="px-6 pb-6">
            <Button variant="outline" onClick={closeCropDialog}>Cancel</Button>
            <Button onClick={applyCrop} className="gradient-primary text-primary-foreground">
              Apply &amp; Upload
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
