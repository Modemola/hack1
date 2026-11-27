import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarClock, FileSignature, Lock, ShieldCheck, Wallet } from "lucide-react";
import { loadOfferView, STATUS_TEXT } from "@/lib/offerView";
import { ScoreBadge } from "@/components/ScoreBadge";
import { StatusPill } from "@/components/StatusPill";
import { ShareBar } from "@/components/ShareBar";
import { addresses, addressUrl } from "@/lib/config";
import { date, plural, shortAddress } from "@/lib/format";

export const revalidate = 30;

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const view = await loadOfferView(id).catch(() => null);
  if (!view) return { title: "Offer not found · Pakka" };
  const title = `Verified job offer from ${view.offer.domain} · Pakka`;
  const description = `Signed by ${view.offer.domain}'s own mail servers and recorded onchain. Joining ${date(view.offer.currentDate || view.offer.promisedDate)}. Status: ${STATUS_TEXT[view.offer.status]}.`;
  return { title, description, openGraph: { title, description, type: "article" }, twitter: { card: "summary_large_image", title, description } };
}

export default async function OfferProofPage({ params }: Props) {
  const { id } = await params;
  let view: Awaited<ReturnType<typeof loadOfferView>> = null;
  let failed = false;
  try {
    view = await loadOfferView(id);
  } catch {
    failed = true;
  }

  if (!view && !failed) notFound();
  if (!view) {
    return (
      <div className="max-w-xl grid gap-3">
        <h1 className="font-display text-3xl font-bold">{failed ? "Couldn't reach the chain" : "No offer with this id"}</h1>
        <p className="text-muted">
          {failed
            ? "Refresh in a moment."
            : "Nothing has been recorded on Pakka under this id. Check the link, or verify the original offer email yourself."}
        </p>
        <Link className="btn btn-primary self-start" href="/">
          Verify an offer email
        </Link>
      </div>
    );
  }

  const { offer, stats } = view;
  const delayed = offer.status === "DELAYED";
  const share = `My offer from ${offer.domain} is Pakka-verified: signed by the company's own mail servers and recorded onchain.`;

  return (
    <div className="grid gap-6 max-w-3xl">
      <div className="card relative overflow-hidden p-6 sm:p-8">
        <span className="stamp stamp-in absolute right-4 top-5 sm:right-8 sm:top-7 text-lg sm:text-3xl">Pakka</span>
        <p className="text-xs font-semibold uppercase tracking-wider text-accent">Verified job offer</p>
        <h1 className="font-display text-3xl sm:text-5xl font-bold mt-2 break-all pr-28 sm:pr-48">{offer.domain}</h1>
        <p className="text-muted mt-3 max-w-xl">
          This offer email was signed by {offer.domain}&apos;s own mail servers and hasn&apos;t been edited since. Pakka checked the signature and recorded the
          offer onchain. The letter itself stays private.
        </p>
        <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-4 mt-6 text-sm">
          <Fact icon={<CalendarClock className="size-4" />} label="Promised joining">
            {date(offer.promisedDate)}
            {delayed && <span className="text-warn"> → {offer.currentDate ? date(offer.currentDate) : "no new date"}</span>}
          </Fact>
          <Fact icon={<ShieldCheck className="size-4" />} label="Status">
            <StatusPill status={offer.status} />
            {offer.postponements > 0 && <span className="text-muted ml-2">{plural(offer.postponements, "postponement")}</span>}
          </Fact>
          <Fact icon={<FileSignature className="size-4" />} label="Offer email sent">
            {date(offer.issuedAt)}
          </Fact>
          <Fact icon={<Wallet className="size-4" />} label="Candidate wallet">
            <span className="font-mono">{shortAddress(offer.candidate)}</span>
          </Fact>
        </dl>
        {offer.escrowed && (
          <p className="mt-5 inline-flex items-center gap-2 rounded-lg bg-verified-soft text-verified px-3 py-2 text-sm font-semibold">
            <Lock className="size-4" /> Backed by a joining guarantee: the candidate is paid if joining slips.
          </p>
        )}
        <div className="mt-6">
          <ShareBar path={`/offer/${offer.id}`} text={share} />
        </div>
      </div>

      <Link href={`/companies/${encodeURIComponent(offer.domain)}`} className="card p-5 flex items-center gap-4 hover:border-accent transition-colors">
        <ScoreBadge score={stats.score} judged={stats.judged} size={64} />
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">{offer.domain}&apos;s Promise Score</p>
          <p className="text-sm mt-1">
            {stats.judged
              ? `Based on ${plural(stats.judged, "offer")} past their joining date, out of ${stats.offers} on record.`
              : `${plural(stats.offers, "offer")} on record, none past their joining date yet.`}
          </p>
        </div>
      </Link>

      <section className="card p-5 text-sm grid gap-2">
        <h2 className="font-display text-lg font-bold">Check it yourself</h2>
        <p className="text-muted">
          The offer id <span className="font-mono break-all text-ink">{offer.id}</span> is a fingerprint of the company&apos;s email signature. Drop the original
          email on <Link className="underline underline-offset-2" href="/">Pakka</Link> and it produces the same id, or read the record straight from the{" "}
          {addressUrl(addresses.registry) ? (
            <a className="underline underline-offset-2" href={addressUrl(addresses.registry)} target="_blank" rel="noreferrer">
              registry contract
            </a>
          ) : (
            "registry contract"
          )}
          .
        </p>
      </section>
    </div>
  );
}

function Fact({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
        {icon} {label}
      </dt>
      <dd className="mt-1 text-base">{children}</dd>
    </div>
  );
}
