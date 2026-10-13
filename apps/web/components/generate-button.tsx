"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function GenerateButton({ kind, start, end, label = "Generate", variant = "default" }: { kind: "daily" | "range"; start: string; end: string; label?: string; variant?: "default" | "outline" }) {
  const router = useRouter();
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startedAt) return;
    const t = setInterval(() => setElapsed(Math.round((Date.now() - startedAt) / 1000)), 500);
    return () => clearInterval(t);
  }, [startedAt]);

  async function run() {
    setStartedAt(Date.now());
    setElapsed(0);
    try {
      const res = await fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, start, end }) });
      const data = (await res.json()) as { id?: number; error?: string | null };
      if (!res.ok || data.error) toast.error(data.error ?? "Generation failed");
      else toast.success("Stand-up generated");
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setStartedAt(null);
    }
  }

  return (
    <Button onClick={run} disabled={startedAt !== null} variant={variant}>
      {startedAt ? <Loader2 className="animate-spin" /> : <Sparkles />}
      {startedAt ? `Generating… ${elapsed}s` : label}
    </Button>
  );
}
