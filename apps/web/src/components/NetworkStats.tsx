import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getNetworkSnapshot, type NetworkSnapshot } from "@/lib/network";
import { isConfigured } from "@/lib/config";
import { usd } from "@/lib/format";

export async function loadSnapshot(): Promise<NetworkSnapshot | null> {
  if (!isConfigured) return null;
  try {
    return await getNetworkSnapshot();
  } catch {
    return null;
  }
}

/** A live strip of totals from the public record. Renders nothing if the chain can't be read. */
export async function NetworkStats() {
  const s = await loadSnapshot();
  if (!s) return null;
  const items = [
    { figure: s.offers.toLocaleString("en-US"), label: "verified offers on record" },
    { figure: s.companies.toLocaleString("en-US"), label: "companies with a Promise Score" },
    { figure: usd(s.lockedNow, 0), label: "locked in joining guarantees" },
    { figure: usd(s.paidToCandidates, 0), label: "paid to candidates who waited" },
  ];
  return (
    <section aria-label="Pakka in numbers" className="card p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted flex items-center gap-2">
          <span className="size-2 rounded-full bg-verified animate-pulse" aria-hidden /> Live from the public record
        </p>
        <Link href="/activity" className="text-sm text-muted hover:text-ink inline-flex items-center gap-1">
          See all activity <ArrowRight className="size-4" />
        </Link>
      </div>
      <dl className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
        {items.map((i) => (
          <div key={i.label}>
            <dd className="font-display text-3xl sm:text-4xl font-bold tabular">{i.figure}</dd>
            <dt className="text-sm text-muted mt-1">{i.label}</dt>
          </div>
        ))}
      </dl>
    </section>
  );
}
