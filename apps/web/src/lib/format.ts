import { formatUnits } from "viem";
import { USD_DECIMALS } from "./config";

export function usd(amount: bigint, digits = 2): string {
  const n = Number(formatUnits(amount, USD_DECIMALS));
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

export function date(unixSeconds: bigint | number | undefined, opts: Intl.DateTimeFormatOptions = {}): string {
  const s = Number(unixSeconds ?? 0);
  if (!s) return "Not stated";
  return new Date(s * 1000).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC", ...opts });
}

export function shortAddress(a?: string): string {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "";
}

export function dayCount(seconds: bigint | number): number {
  return Math.floor(Number(seconds) / 86400);
}

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export type ScoreTone = "good" | "ok" | "bad" | "none";

export function scoreTone(score: number, judged: number): ScoreTone {
  if (!judged) return "none";
  if (score >= 80) return "good";
  if (score >= 50) return "ok";
  return "bad";
}
