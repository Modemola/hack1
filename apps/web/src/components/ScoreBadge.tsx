import { scoreTone } from "@/lib/format";

/** Circular Promise Score meter. Shows "New" until at least one offer has been judged. */
export function ScoreBadge({ score, judged, size = 56 }: { score: number; judged: number; size?: number }) {
  const tone = scoreTone(score, judged);
  const color = tone === "good" ? "var(--verified)" : tone === "ok" ? "var(--warn)" : tone === "bad" ? "var(--danger)" : "var(--muted)";
  const r = 15.5;
  const c = 2 * Math.PI * r;
  const pct = judged ? score / 100 : 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={judged ? `Promise Score ${score} out of 100` : "No judged offers yet"}>
      <svg viewBox="0 0 36 36" className="size-full -rotate-90">
        <circle cx="18" cy="18" r={r} fill="none" stroke="var(--line)" strokeWidth="3.5" />
        {judged > 0 && (
          <circle
            cx="18"
            cy="18"
            r={r}
            fill="none"
            stroke={color}
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeDasharray={`${pct * c} ${c}`}
            style={{ transition: "stroke-dasharray 0.6s ease" }}
          />
        )}
      </svg>
      <span
        className="absolute inset-0 grid place-items-center font-display font-bold tabular"
        style={{ color, fontSize: judged ? size * 0.3 : size * 0.22 }}
      >
        {judged ? score : "New"}
      </span>
    </div>
  );
}
