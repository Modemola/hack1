"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Lock } from "lucide-react";
import { getCompanyStats, getDomainOffers, type CompanyStats, type Offer } from "@/lib/pakka";
import { ScoreBadge } from "@/components/ScoreBadge";
import { StatusPill } from "@/components/StatusPill";
import { BadgeEmbed } from "@/components/BadgeEmbed";
import { date, plural, shortAddress } from "@/lib/format";

export default function CompanyPage({ params }: { params: Promise<{ domain: string }> }) {
  const { domain: raw } = use(params);
  const domain = decodeURIComponent(raw);
  const [stats, setStats] = useState<CompanyStats | null>(null);
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getCompanyStats(domain), getDomainOffers(domain)])
      .then(([s, o]) => {
        setStats(s);
        setOffers(o);
      })
      .catch(() => setError("Couldn't reach the chain. Refresh in a moment."));
  }, [domain]);

  return (
    <div className="grid gap-6 max-w-3xl">
      <Link href="/companies" className="text-sm text-muted hover:text-ink flex items-center gap-1">
        <ArrowLeft className="size-4" /> All companies
      </Link>
      {error && <p className="text-sm text-danger">{error}</p>}
      {!stats && !error && (
        <p className="text-sm text-muted flex items-center gap-2">
          <Loader2 className="size-4 animate-spin" /> Loading…
        </p>
      )}
      {stats && (
        <>
          <div className="card p-5 sm:p-6 flex flex-col sm:flex-row gap-5 sm:items-center">
            <ScoreBadge score={stats.score} judged={stats.judged} size={96} />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">Promise Score</p>
              <h1 className="font-display text-3xl font-bold break-all">{domain}</h1>
              <p className="text-sm text-muted mt-1">
                {stats.judged
                  ? `Based on ${plural(stats.judged, "judged offer")} out of ${stats.offers} on record.`
                  : stats.offers
                    ? `${plural(stats.offers, "offer")} on record, none past their joining date yet.`
                    : "No offers on record yet."}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Joined on time" value={stats.joinedOnTime} tone="text-verified" />
            <Stat label="Joined late" value={stats.joinedLate} tone="text-warn" />
            <Stat label="Delayed now" value={stats.delayed} tone="text-warn" />
            <Stat label="Revoked" value={stats.revoked} tone="text-danger" />
          </div>
          {stats.totalDelayDays > 0 && (
            <p className="text-sm text-muted">
              Late joiners waited {plural(stats.totalDelayDays, "day")} in total beyond their promised dates.
            </p>
          )}
          <section>
            <h2 className="font-display text-xl font-bold mb-3">Offers on record</h2>
            {offers && offers.length === 0 && <p className="text-sm text-muted">None yet.</p>}
            <ul className="grid gap-2">
              {offers?.map((o) => (
                <li key={o.id} className="card px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <StatusPill status={o.status} />
                  <span>
                    Promised {date(o.promisedDate)}
                    {o.status === "DELAYED" && (
                      <span className="text-muted"> → {o.currentDate ? date(o.currentDate) : "no new date"}</span>
                    )}
                  </span>
                  {o.escrowed && (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-verified">
                      <Lock className="size-3" /> Guaranteed
                    </span>
                  )}
                  {o.selfReportedDelay && <span className="text-xs text-muted">delay reported by candidate</span>}
                  <Link href={`/offer/${o.id}`} className="ml-auto text-xs text-muted font-mono hover:text-ink underline-offset-2 hover:underline" title="Open this offer's public record">
                    {shortAddress(o.id)}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
          <BadgeEmbed domain={domain} />
        </>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="card p-4">
      <p className={`font-display text-3xl font-bold tabular ${value ? tone : "text-muted"}`}>{value}</p>
      <p className="text-xs text-muted mt-1">{label}</p>
    </div>
  );
}
