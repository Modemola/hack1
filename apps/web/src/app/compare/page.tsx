import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, Award, Lock, Plus, X } from "lucide-react";
import { getCompanyStats, getDomainOffers, pakkaRegistryAbi } from "@/lib/pakka";
import { publicClient } from "@/lib/chain";
import { addresses, isConfigured } from "@/lib/config";
import { plural } from "@/lib/format";
import { ScoreBadge } from "@/components/ScoreBadge";
import { ShareBar } from "@/components/ShareBar";

export const dynamic = "force-dynamic";

const MAX = 4;
const DOMAIN = /^(?=.{3,253}$)[a-z0-9-]+(\.[a-z0-9-]+)+$/;

type Props = { searchParams: Promise<{ d?: string | string[] }> };

/** Accepts "Infosys.com", "https://www.infosys.com/careers" or "hr@infosys.com" and returns "infosys.com". */
function normalize(raw: string): string | null {
  let s = raw.trim().toLowerCase();
  if (!s) return null;
  if (s.includes("@")) s = s.slice(s.lastIndexOf("@") + 1);
  s = s.replace(/^[a-z]+:\/\//, "").replace(/[/?#].*$/, "").replace(/^www\./, "").replace(/\.$/, "");
  return DOMAIN.test(s) ? s : null;
}

function parse(d: string | string[] | undefined): { domains: string[]; rejected: string[] } {
  const parts = (Array.isArray(d) ? d.join(",") : (d ?? "")).split(/[\s,;]+/).filter(Boolean);
  const domains: string[] = [];
  const rejected: string[] = [];
  for (const p of parts) {
    const n = normalize(p);
    if (!n) rejected.push(p.slice(0, 40));
    else if (!domains.includes(n)) domains.push(n);
  }
  return { domains: domains.slice(0, MAX), rejected };
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { domains } = parse((await searchParams).d);
  const title = domains.length > 1 ? `${domains.join(" vs ")} · Pakka` : "Compare companies · Pakka";
  return { title, description: "Which employer keeps its joining dates? Compare Promise Scores built from verified offer emails." };
}

async function loadRow(domain: string) {
  const [stats, offers] = await Promise.all([getCompanyStats(domain), getDomainOffers(domain)]);
  // Delay per offer: how far the latest announced (or actual) joining date slipped past the promise.
  const slips = offers
    .filter((o) => (o.status === "DELAYED" || o.status === "JOINED_LATE") && o.promisedDate > 0n && o.currentDate > o.promisedDate)
    .map((o) => Number(o.currentDate - o.promisedDate) / 86400);
  return {
    domain,
    stats,
    guaranteed: offers.filter((o) => o.escrowed).length,
    avgDelay: slips.length ? Math.round(slips.reduce((a, b) => a + b, 0) / slips.length) : 0,
  };
}

type Row = Awaited<ReturnType<typeof loadRow>>;

export default async function ComparePage({ searchParams }: Props) {
  const raw = (await searchParams).d;
  const { domains, rejected } = parse(raw);
  // Tidy the shareable URL ("https://www.Orbit.demo/careers" becomes "orbit.demo") when nothing needs flagging.
  const tidy = domains.join(",");
  if (typeof raw === "string" && !rejected.length && raw !== tidy) redirect(tidy ? `/compare?d=${encodeURIComponent(tidy)}` : "/compare");

  let rows: Row[] | null = null;
  let known: readonly string[] = [];
  let failed = false;
  if (isConfigured) {
    try {
      [rows, known] = await Promise.all([
        Promise.all(domains.map(loadRow)),
        publicClient.readContract({ address: addresses.registry, abi: pakkaRegistryAbi, functionName: "allDomains" }),
      ]);
    } catch {
      failed = true;
    }
  }

  const judged = rows?.filter((r) => r.stats.judged > 0) ?? [];
  const best = judged.length > 1 ? judged.reduce((a, b) => (b.stats.score > a.stats.score ? b : a)) : null;
  const tie = best && judged.filter((r) => r.stats.score === best.stats.score).length > 1;
  const suggestions = known.filter((k) => !domains.includes(k)).slice(0, 6);
  const withAdded = (d: string) => `/compare?d=${encodeURIComponent([...domains, d].join(","))}`;
  const without = (d: string) => (domains.length > 1 ? `/compare?d=${encodeURIComponent(domains.filter((x) => x !== d).join(","))}` : "/compare");

  return (
    <div className="grid gap-6">
      <div className="max-w-3xl">
        <h1 className="font-display text-3xl sm:text-4xl font-bold">Compare companies</h1>
        <p className="text-muted mt-2">
          Holding more than one offer, or deciding which recruiters to invite to campus? Put up to {MAX} companies side by side and see who keeps their
          joining dates.
        </p>
      </div>

      <form action="/compare" method="get" className="card p-4 sm:p-5 grid gap-3 max-w-3xl">
        <label className="block">
          <span className="label">Company domains</span>
          <input
            className="input"
            name="d"
            defaultValue={domains.join(", ")}
            placeholder="e.g. infosys.com, wipro.com, tcs.com"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn btn-primary" type="submit">
            Compare
          </button>
          {suggestions.length > 0 && domains.length < MAX && (
            <>
              <span className="text-xs text-muted ml-1">On record:</span>
              {suggestions.map((s) => (
                <Link key={s} href={withAdded(s)} className="btn btn-ghost btn-sm">
                  <Plus className="size-3.5" /> {s}
                </Link>
              ))}
            </>
          )}
        </div>
        {rejected.length > 0 && <p className="text-sm text-danger">Not a company domain: {rejected.join(", ")}</p>}
      </form>

      {failed && <p className="text-sm text-muted">Couldn&apos;t reach the chain. Refresh in a moment.</p>}

      {rows && rows.length > 0 && (
        <>
          <ul className={`grid gap-4 ${rows.length > 1 ? "sm:grid-cols-2" : "max-w-md"} ${rows.length > 2 ? "xl:grid-cols-4" : ""}`} data-testid="compare-grid">
            {rows.map((r) => (
              <CompanyColumn key={r.domain} row={r} best={!tie && best?.domain === r.domain} removeHref={without(r.domain)} />
            ))}
          </ul>
          <p className="text-xs text-muted max-w-3xl">
            Scores count only offers past their joining date: on time earns 1 point, a delay or late joining 0.5, a revocation 0. Every number comes from
            verified offer emails and escrowed offers on the public record.
          </p>
          {rows.length > 1 && (
            <div className="max-w-3xl">
              <ShareBar path={`/compare?d=${encodeURIComponent(domains.join(","))}`} text={`Which of these employers keeps its joining dates? ${domains.join(" vs ")} on Pakka.`} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function CompanyColumn({ row, best, removeHref }: { row: Row; best: boolean; removeHref: string }) {
  const s = row.stats;
  const facts: [string, string | number, string?][] = [
    ["Offers on record", s.offers],
    ["Judged so far", s.judged],
    ["Joined on time", s.joinedOnTime, s.joinedOnTime ? "text-verified" : undefined],
    ["Joined late", s.joinedLate, s.joinedLate ? "text-warn" : undefined],
    ["Delayed right now", s.delayed, s.delayed ? "text-warn" : undefined],
    ["Revoked", s.revoked, s.revoked ? "text-danger" : undefined],
    ["Average delay", row.avgDelay ? plural(row.avgDelay, "day") : "None", row.avgDelay ? "text-warn" : undefined],
    ["Backed by a guarantee", row.guaranteed ? `${row.guaranteed} of ${s.offers}` : "None"],
  ];
  return (
    <li className={`card p-5 grid gap-4 content-start ${best ? "border-verified" : ""}`}>
      <div className="flex items-start gap-3">
        <ScoreBadge score={s.score} judged={s.judged} size={52} />
        <div className="min-w-0 flex-1">
          <Link href={`/companies/${encodeURIComponent(row.domain)}`} className="font-display text-lg font-bold [overflow-wrap:anywhere] hover:underline underline-offset-2">
            {row.domain}
          </Link>
          {best && (
            <p className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-verified">
              <Award className="size-3.5" /> Best record here
            </p>
          )}
        </div>
        <Link href={removeHref} className="text-muted hover:text-ink p-1 -m-1" aria-label={`Remove ${row.domain}`}>
          <X className="size-4" />
        </Link>
      </div>
      <dl className="grid gap-2 text-sm">
        {facts.map(([label, value, tone]) => (
          <div key={label} className="flex justify-between gap-3 border-b border-line pb-2 last:border-0 last:pb-0">
            <dt className="text-muted">{label}</dt>
            <dd className={`font-semibold tabular ${tone ?? ""}`}>{value}</dd>
          </div>
        ))}
      </dl>
      <Verdict row={row} />
    </li>
  );
}

function Verdict({ row }: { row: Row }) {
  const s = row.stats;
  if (!s.offers)
    return (
      <p className="text-sm bg-sunk rounded-lg px-3 py-2">
        No record yet. That isn&apos;t a bad sign on its own: ask them to back your offer with a joining guarantee.
      </p>
    );
  if (s.revoked)
    return (
      <p className="text-sm bg-danger-soft text-danger rounded-lg px-3 py-2 flex gap-2">
        <AlertTriangle className="size-4 shrink-0 mt-0.5" /> Revoked {plural(s.revoked, "offer")} after making {s.revoked === 1 ? "it" : "them"}.
      </p>
    );
  if (s.delayed)
    return (
      <p className="text-sm bg-warn-soft text-warn rounded-lg px-3 py-2 flex gap-2">
        <AlertTriangle className="size-4 shrink-0 mt-0.5" /> {plural(s.delayed, "candidate")} waiting past the promised date right now.
      </p>
    );
  if (row.guaranteed)
    return (
      <p className="text-sm bg-verified-soft text-verified rounded-lg px-3 py-2 flex gap-2">
        <Lock className="size-4 shrink-0 mt-0.5" /> Puts money behind its joining dates.
      </p>
    );
  return null;
}
