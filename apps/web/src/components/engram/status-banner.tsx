import { useEffect, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { server, type Health } from "@/lib/api";

const NAMES = { walrus: "Walrus Memory", sui: "Sui (Tatum)", llm: "LLM" } as const;

/** Shows which outside services are degraded or down, so errors make sense. */
export function StatusBanner() {
  const [h, setH] = useState<Health | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => server.health().then((x) => alive && setH(x)).catch(() => {});
    load();
    const t = setInterval(load, 120_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  if (!h) return null;
  const issues = (Object.keys(NAMES) as (keyof typeof NAMES)[]).filter((k) => h[k].state === "degraded" || h[k].state === "down");
  if (issues.length === 0) return null;
  return (
    <div role="status" className="mb-6 flex items-start gap-3 rounded-xl border border-amber-400/25 bg-amber-400/[0.06] px-4 py-3 text-sm">
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-300" />
      <div className="space-y-0.5">
        {issues.map((k) => (
          <div key={k}>
            <span className="font-medium text-amber-200">{NAMES[k]} is {h[k].state}</span>
            <span className="text-muted-foreground"> — {h[k].detail}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
