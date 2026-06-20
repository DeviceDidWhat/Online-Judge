import { useState } from "react";
import { Check, Code2, Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button, type ButtonProps } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiRequest, type ApiSubmission } from "@/lib/api";

type ViewCodeButtonProps = {
  submissionId: string;
  language?: string;
  problemTitle?: string;
  label?: string;
  className?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
};

/**
 * A self-contained "View Code" button. Fetches the full submission on demand
 * (GET /submissions/:id returns sourceCode to the owner/admin only) and shows it
 * in a dialog with a copy button. The fetched code is cached so re-opening the
 * dialog doesn't refetch.
 */
export function ViewCodeButton({
  submissionId,
  language,
  problemTitle,
  label = "View Code",
  className,
  variant = "outline",
  size = "sm",
}: ViewCodeButtonProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [lang, setLang] = useState<string | undefined>(language);
  const [copied, setCopied] = useState(false);

  const openDialog = async () => {
    setOpen(true);
    if (code !== null) return; // already loaded once
    setLoading(true);
    try {
      const data = await apiRequest<{ submission: ApiSubmission }>(`/submissions/${submissionId}`);
      setCode(data.submission.sourceCode ?? "");
      setLang(data.submission.language ?? language);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to load source code");
      setOpen(false);
    } finally {
      setLoading(false);
    }
  };

  const copyCode = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy to clipboard");
    }
  };

  return (
    <>
      <Button type="button" variant={variant} size={size} className={className} onClick={openDialog}>
        <Code2 className="h-3.5 w-3.5" />
        {label}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Code2 className="h-4 w-4" /> Submission Code
            </DialogTitle>
            <DialogDescription>
              {problemTitle ? `${problemTitle} · ` : ""}
              {lang ?? "—"}
            </DialogDescription>
          </DialogHeader>

          <div className="relative">
            {loading ? (
              <div className="grid h-48 place-items-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={copyCode}
                  className="absolute right-2 top-2 z-10 h-7 gap-1 px-2"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Copied" : "Copy"}
                </Button>
                <pre className="max-h-[60vh] overflow-auto rounded-lg border border-border/60 bg-secondary/30 p-4 pt-10 font-mono text-xs leading-relaxed whitespace-pre">
                  <code>{code || "// No source code available"}</code>
                </pre>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
