import { useState } from "react";
import {
  Sparkles, Loader2, Lightbulb, Code2, Zap, Gauge, AlertTriangle,
  Target, Route as RouteIcon, ArrowRight, Wand2, Bug,
} from "lucide-react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { aiReviewCode, aiGetHint, type AiReview, type AiHint, type AiCodeQuality } from "@/lib/api";
import { toast } from "sonner";

const qualityStyles: Record<AiCodeQuality, string> = {
  Poor: "bg-red-500/15 text-red-400 border-red-500/30",
  Okayish: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  Good: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  Excellent: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
};

type Props = {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  slug: string;
  language: string;
  code: string;
};

function Field({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/40 p-3">
      <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {icon}{label}
      </div>
      <div className="text-sm leading-relaxed">{children}</div>
    </div>
  );
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="mt-6 flex flex-col items-center gap-2 rounded-xl border border-dashed border-border/60 px-6 py-10 text-center">
      <div className="text-muted-foreground/40">{icon}</div>
      <p className="max-w-xs text-xs text-muted-foreground">{text}</p>
    </div>
  );
}

function ReviewView({ review }: { review: AiReview }) {
  return (
    <div className="space-y-3 animate-in fade-in-50 duration-300">
      <Field icon={<Target className="h-3 w-3" />} label="Current approach">{review.currentApproach}</Field>
      <Field icon={<Sparkles className="h-3 w-3" />} label="Key idea">{review.keyIdea}</Field>
      <Field icon={<RouteIcon className="h-3 w-3" />} label="Suggested approach">{review.suggestedApproach}</Field>

      <Field icon={<Code2 className="h-3 w-3" />} label="Code quality">
        <div className="flex items-center gap-2">
          <span className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${qualityStyles[review.codeQualityRating] ?? qualityStyles.Okayish}`}>
            {review.codeQualityRating}
          </span>
          <span className="text-muted-foreground">{review.codeQualityComment}</span>
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field icon={<Gauge className="h-3 w-3" />} label="Time">
          <span className="font-mono text-primary">{review.timeComplexity}</span>
        </Field>
        <Field icon={<Gauge className="h-3 w-3" />} label="Space">
          <span className="font-mono text-primary">{review.spaceComplexity}</span>
        </Field>
      </div>

      <div className="rounded-lg border border-violet-500/30 bg-violet-500/10 p-3">
        <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-violet-300">
          <Zap className="h-3 w-3" />Performance tip
        </div>
        <div className="text-sm leading-relaxed">{review.performanceTip}</div>
      </div>

      {review.correctnessConcern?.trim() && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
          <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300">
            <AlertTriangle className="h-3 w-3" />Possible issue
          </div>
          <div className="text-sm leading-relaxed">{review.correctnessConcern}</div>
        </div>
      )}
    </div>
  );
}

function HintView({ hint }: { hint: AiHint }) {
  return (
    <div className="space-y-4 animate-in fade-in-50 duration-300">
      <div className="space-y-2">
        {hint.hints.map((h, i) => (
          <div key={i} className="flex gap-3 rounded-lg border border-border/60 bg-card/40 p-3">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-amber-500/15 text-xs font-bold text-amber-400">
              {i + 1}
            </span>
            <p className="text-sm leading-relaxed">{h}</p>
          </div>
        ))}
      </div>

      {hint.codeIssues && hint.codeIssues.length > 0 && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3">
          <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-red-300">
            <Bug className="h-3 w-3" />Issues in your code
          </div>
          <ul className="space-y-1.5">
            {hint.codeIssues.map((issue, i) => (
              <li key={i} className="flex gap-2 text-sm leading-relaxed">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" />
                <span>{issue}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-lg border border-primary/30 bg-primary/10 p-3">
        <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
          <ArrowRight className="h-3 w-3" />Next step
        </div>
        <div className="text-sm leading-relaxed">{hint.nextStep}</div>
      </div>
    </div>
  );
}

export function AiReviewPanel({ open, onOpenChange, slug, language, code }: Props) {
  const [tab, setTab] = useState("review");
  const [reviewLoading, setReviewLoading] = useState(false);
  const [hintLoading, setHintLoading] = useState(false);
  const [review, setReview] = useState<AiReview | null>(null);
  const [hint, setHint] = useState<AiHint | null>(null);

  const runReview = async () => {
    if (!code.trim()) { toast.error("Write some code first, then ask for a review."); return; }
    setReviewLoading(true);
    try {
      const data = await aiReviewCode({ problemSlug: slug, language, code });
      setReview(data.review);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "AI review failed");
    } finally {
      setReviewLoading(false);
    }
  };

  const runHint = async () => {
    setHintLoading(true);
    try {
      const data = await aiGetHint({ problemSlug: slug, language, code });
      setHint(data.hint);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "AI hint failed");
    } finally {
      setHintLoading(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex h-full w-[440px] flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="space-y-1 border-b border-border/60 px-5 py-4">
          <SheetTitle className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-lg shadow-violet-500/20">
              <Sparkles className="h-4 w-4" />
            </span>
            AI Assistant
          </SheetTitle>
          <SheetDescription className="text-xs">
            Powered by Gemini — reviews your approach &amp; complexity, or unblocks you with hints.
          </SheetDescription>
        </SheetHeader>

        <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
          <TabsList className="mx-5 mt-4 grid grid-cols-2 bg-secondary/60">
            <TabsTrigger value="review"><Code2 className="mr-1.5 h-3.5 w-3.5" />Code Review</TabsTrigger>
            <TabsTrigger value="hint"><Lightbulb className="mr-1.5 h-3.5 w-3.5" />Get Hint</TabsTrigger>
          </TabsList>

          <ScrollArea className="min-h-0 flex-1">
            <TabsContent value="review" className="m-0 space-y-3 px-5 py-4">
              <Button onClick={runReview} disabled={reviewLoading} className="w-full gradient-primary text-primary-foreground">
                {reviewLoading
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Analyzing your code…</>
                  : <><Wand2 className="mr-2 h-4 w-4" />Analyze my code</>}
              </Button>
              {review
                ? <ReviewView review={review} />
                : !reviewLoading && <EmptyState icon={<Code2 className="h-8 w-8" />} text="Get a one-line breakdown of your approach, key idea, complexity, code quality, and a concrete performance tip." />}
            </TabsContent>

            <TabsContent value="hint" className="m-0 space-y-3 px-5 py-4">
              <Button onClick={runHint} disabled={hintLoading} variant="secondary" className="w-full">
                {hintLoading
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Thinking…</>
                  : <><Lightbulb className="mr-2 h-4 w-4" />I'm stuck — give me a hint</>}
              </Button>
              {hint
                ? <HintView hint={hint} />
                : !hintLoading && <EmptyState icon={<Lightbulb className="h-8 w-8" />} text="Progressive hints that guide your thinking (never the full solution), plus concrete bugs spotted in your current code." />}
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
