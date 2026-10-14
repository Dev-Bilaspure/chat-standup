"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Star } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Usage = "as_is" | "minor_edits" | "major_edits" | "not_used";
const USAGES: { value: Usage; label: string }[] = [
  { value: "as_is", label: "Used as-is" },
  { value: "minor_edits", label: "Minor edits" },
  { value: "major_edits", label: "Major edits" },
  { value: "not_used", label: "Didn't use" },
];

export type FeedbackInitial = { rating: number | null; usage: Usage | null; missing: string; wrong: string; wrongBullets: string[]; finalText: string } | null;
export type BulletRef = { key: string; section: string; text: string };

export function FeedbackForm({ generationId, bullets, generatedText, initial }: { generationId: number; bullets: BulletRef[]; generatedText: string; initial: FeedbackInitial }) {
  const router = useRouter();
  const [rating, setRating] = useState<number | null>(initial?.rating ?? null);
  const [usage, setUsage] = useState<Usage | null>(initial?.usage ?? null);
  const [wrongBullets, setWrongBullets] = useState<Set<string>>(new Set(initial?.wrongBullets ?? []));
  const [missing, setMissing] = useState(initial?.missing ?? "");
  const [wrong, setWrong] = useState(initial?.wrong ?? "");
  const [finalText, setFinalText] = useState(initial?.finalText || generatedText);
  const [saving, setSaving] = useState(false);

  const toggle = (key: string) =>
    setWrongBullets((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  async function save() {
    setSaving(true);
    const res = await fetch(`/api/feedback/${generationId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating, usage, missing, wrong, wrongBullets: [...wrongBullets], finalText: finalText === generatedText && usage !== "as_is" ? "" : finalText }),
    });
    setSaving(false);
    if (res.ok) {
      toast.success("Feedback saved");
      router.refresh();
    } else toast.error("Could not save feedback");
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label>How good was it overall?</Label>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" onClick={() => setRating(n)} aria-label={`${n} stars`} className="p-0.5">
              <Star className={cn("size-6", rating && n <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground")} />
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label>How did you use it?</Label>
        <RadioGroup value={usage} onValueChange={(v) => setUsage(v as Usage)} className="flex flex-wrap gap-4">
          {USAGES.map((u) => (
            <label key={u.value} className="flex items-center gap-2 text-sm">
              <RadioGroupItem value={u.value} />
              {u.label}
            </label>
          ))}
        </RadioGroup>
      </div>

      {bullets.length > 0 && (
        <div className="space-y-2">
          <Label>Tick bullets that are wrong or shouldn&apos;t be there</Label>
          <ul className="space-y-1">
            {bullets.map((b) => (
              <li key={b.key}>
                <label className="flex cursor-pointer items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-1" checked={wrongBullets.has(b.key)} onChange={() => toggle(b.key)} />
                  <span className={cn(wrongBullets.has(b.key) && "text-muted-foreground line-through")}>
                    <span className="text-xs text-muted-foreground">{b.section}: </span>
                    {b.text}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor={`missing-${generationId}`}>What was missing? One item per line</Label>
        <Textarea id={`missing-${generationId}`} value={missing} onChange={(e) => setMissing(e.target.value)} placeholder={"Reviewed Ashwin's PR #9612\nDebugged the staging deploy with Ujjwal"} rows={3} />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`wrong-${generationId}`}>Anything else wrong? (optional)</Label>
        <Textarea id={`wrong-${generationId}`} value={wrong} onChange={(e) => setWrong(e.target.value)} placeholder="e.g. wording too vague, wrong PR number, mixed up two tasks" rows={2} />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`final-${generationId}`}>What you actually sent or said (edit to match)</Label>
        <Textarea id={`final-${generationId}`} value={finalText} onChange={(e) => setFinalText(e.target.value)} rows={8} className="font-mono text-xs" />
      </div>

      <Button onClick={save} disabled={saving}>
        {saving ? "Saving…" : initial ? "Update feedback" : "Save feedback"}
      </Button>
    </div>
  );
}
