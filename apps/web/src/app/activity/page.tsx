import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, Lock } from "lucide-react";
import { loadSnapshot } from "@/components/NetworkStats";
import { StatusPill } from "@/components/StatusPill";
import { addresses, addressUrl, chain, demoMode } from "@/lib/config";
import { date, shortAddress, usd } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Activity · Pakka",
  description: "Every offer, postponement and joining guarantee on Pakka's public record, read live from the chain.",
};

export default async function ActivityPage() {
  const s = await loadSnapshot();

  return (
    <div className="grid gap-8 max-w-4xl">
      <div>
        <p className="text-sm font-semibold text-accent">Public record</p>
        <h1 className="font-display text-3xl sm:text-4xl font-bold mt-2">Everything on Pakka, in the open</h1>
        <p className="text-muted mt-3 max-w-2xl">
          These numbers are read straight from Pakka&apos;s contracts on {chain.name}, not from our database. Anyone can check them, and nobody,
          including us, can edit them.
        </p>
      </div>

      {!s ? (
        <p className="text-sm text-muted">Couldn&apos;t reach the chain. Refresh in a moment.</p>
      ) : (
        <>
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Figure value={s.offers} label="Verified offers" />
            <Figure value={s.delayed} label="Delayed right now" tone={s.delayed ? "text-warn" : undefined} />
            <Figure value={s.revoked} label="Revoked" tone={s.revoked ? "text-danger" : undefined} />
            <Figure value={s.joined} label="Joined" tone={s.joined ? "text-verified" : undefined} />
            <Figure value={s.companies} label="Companies" />
            <Figure value={s.guarantees} label="Joining guarantees" />
            <Figure value={usd(s.lockedNow, 0)} label="Locked right now" />
            <Figure value={usd(s.paidToCandidates, 0)} label="Paid to candidates" tone={s.paidToCandidates ? "text-verified" : undefined} />
          </dl>

          <section>
            <h2 className="font-display text-xl font-bold mb-3">Latest offers</h2>
            {s.recentOffers.length === 0 && <p className="text-sm text-muted">None yet. Verify an offer email to add the first one.</p>}
            <ul className="grid gap-2">
              {s.recentOffers.map((o) => (
                <li key={o.id}>
                  <Link href={`/offer/${o.id}`} className="card px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm hover:border-accent transition-colors">
                    <span className="font-semibold break-all">{o.domain}</span>
                    <StatusPill status={o.status} />
                    <span className="text-muted">
                      Joining {date(o.currentDate || o.promisedDate)}
                      {o.postponements > 0 && ` · postponed ${o.postponements}×`}
                    </span>
                    {o.escrowed && (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-verified">
                        <Lock className="size-3" /> Guaranteed
                      </span>
                    )}
                    <span className="ml-auto text-xs text-muted">Sent {date(o.issuedAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="font-display text-xl font-bold mb-3">Latest joining guarantees</h2>
            {s.recentGuarantees.length === 0 && <p className="text-sm text-muted">None yet. Employers can lock one from the Employers page.</p>}
            <ul className="grid gap-2">
              {s.recentGuarantees.map((g) => (
                <li key={g.id}>
                  <Link href={`/guarantee/${g.id}`} className="card px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm hover:border-accent transition-colors">
                    <span className="font-semibold break-all">{g.domain || shortAddress(g.company)}</span>
                    <StatusPill status={g.state} guarantee />
                    <span className="text-muted">
                      {usd(g.amount, 0)} locked · {usd(g.stipendPerMonth, 0)}/month if late
                      {g.paid > 0n && g.state !== "WITHDRAWN" && <span className="text-verified"> · {usd(g.paid)} paid out</span>}
                    </span>
                    <span className="ml-auto text-xs text-muted">{g.role}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      <section className="card p-5 text-sm grid gap-2">
        <h2 className="font-display text-lg font-bold">Read it yourself</h2>
        <p className="text-muted">
          Offers and Promise Scores live in the{" "}
          <ContractLink address={addresses.registry} label="registry contract" />, and the money in the{" "}
          <ContractLink address={addresses.escrow} label="joining guarantee contract" />. Emails are never stored: only a fingerprint of the
          company&apos;s signature, the domain and the dates go onchain.
        </p>
        {demoMode && (
          <p className="text-muted">This is a demo deployment on a test network, so the dollars are test tokens and demo companies use .demo domains.</p>
        )}
      </section>
    </div>
  );
}

function Figure({ value, label, tone }: { value: number | string; label: string; tone?: string }) {
  return (
    <div className="card p-4">
      <dd className={`font-display text-2xl sm:text-3xl font-bold tabular ${tone ?? ""}`}>{value}</dd>
      <dt className="text-xs text-muted mt-1">{label}</dt>
    </div>
  );
}

function ContractLink({ address, label }: { address: string; label: string }) {
  const href = addressUrl(address);
  if (!href) return <span>{label}</span>;
  return (
    <a className="underline underline-offset-2 inline-flex items-center gap-0.5" href={href} target="_blank" rel="noreferrer">
      {label} <ExternalLink className="size-3" />
    </a>
  );
}
