import Link from "next/link";
import { ShieldCheck, ScrollText, HandCoins, ArrowRight } from "lucide-react";
import { Verifier } from "@/components/Verifier";
import { Leaderboard } from "@/components/Leaderboard";

const STATS = [
  {
    figure: "10,000+",
    text: "freshers had their joining postponed by Infosys, Wipro and TCS.",
    source: "Outlook Business",
    href: "https://www.outlookbusiness.com/corporate/it-giants-infosys-wipro-tcs-postpone-onboarding-of-over-10000-graduates",
  },
  {
    figure: "1,000+",
    text: "graduates from Tech Mahindra's 2025 campus batch were left waiting, some with no formal offer letter for nearly a year.",
    source: "People Matters",
    href: "https://www.peoplematters.in/news/strategic-hr/tech-mahindra-delays-onboarding-of-1000-freshers-amid-hiring-slowdown-48782",
  },
  {
    figure: "46%",
    text: "of job seekers who met fraudulent offers say they lost money.",
    source: "Indeed survey, 2026",
    href: "https://www.businesstoday.in/jobs/story/more-than-9-in-10-job-seekers-encounter-fake-job-offers-542006-2026-07-09",
  },
];

const STEPS = [
  {
    icon: ShieldCheck,
    title: "Verify",
    text: "Every company mail server signs its emails (DKIM). Pakka checks that signature, so a forged or edited offer letter can't pass, and flags lookalike domains and fee requests.",
  },
  {
    icon: ScrollText,
    title: "Record",
    text: "Record your verified offer, and later any postponement or revocation. Each company builds a public Promise Score it can't edit or delete.",
  },
  {
    icon: HandCoins,
    title: "Guarantee",
    text: "Employers who mean it lock a joining guarantee in stablecoins. If your joining slips, a stipend streams to you every second. If they revoke, you keep the rest.",
  },
];

export default function Home() {
  return (
    <div className="grid gap-16 sm:gap-20">
      <section className="grid lg:grid-cols-[1.05fr_1fr] gap-8 lg:gap-12 items-start">
        <div className="lg:pt-6">
          <p className="text-sm font-semibold text-accent">For every fresher waiting on a joining date</p>
          <h1 className="font-display text-4xl sm:text-6xl font-bold tracking-tight leading-[1.02] mt-3">
            Is your offer{" "}
            <span className="whitespace-nowrap">
              <span className="stamp text-[0.55em] align-middle px-3 py-1 ml-1 -translate-y-1 stamp-in">pakka</span>?
            </span>
          </h1>
          <p className="text-lg text-muted mt-5 max-w-xl">
            Check that an offer letter really came from the company. See which employers keep their joining dates. And when
            they don&apos;t, get paid while you wait.
          </p>
          <div className="flex flex-wrap gap-3 mt-6">
            <Link href="/companies" className="btn btn-ghost">
              See Promise Scores <ArrowRight className="size-4" />
            </Link>
            <Link href="/employer" className="btn btn-ghost">
              I&apos;m hiring
            </Link>
          </div>
        </div>
        <Verifier compact />
      </section>

      <section aria-labelledby="why">
        <h2 id="why" className="font-display text-2xl sm:text-3xl font-bold">
          An offer letter is a promise with no teeth
        </h2>
        <div className="grid sm:grid-cols-3 gap-4 mt-6">
          {STATS.map((s) => (
            <figure key={s.figure} className="card p-5">
              <p className="font-display text-4xl font-bold text-accent tabular">{s.figure}</p>
              <p className="mt-2">{s.text}</p>
              <figcaption className="text-xs text-muted mt-3">
                Source:{" "}
                <a href={s.href} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-ink">
                  {s.source}
                </a>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section aria-labelledby="how">
        <h2 id="how" className="font-display text-2xl sm:text-3xl font-bold">
          How Pakka works
        </h2>
        <ol className="grid md:grid-cols-3 gap-4 mt-6">
          {STEPS.map((s, i) => (
            <li key={s.title} className="card p-5">
              <div className="flex items-center gap-3">
                <span className="grid place-items-center size-10 rounded-xl bg-accent-soft text-accent">
                  <s.icon className="size-5" aria-hidden />
                </span>
                <span className="text-xs font-semibold text-muted">Step {i + 1}</span>
              </div>
              <h3 className="font-display text-xl font-bold mt-3">{s.title}</h3>
              <p className="text-muted mt-1.5">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="board" className="grid lg:grid-cols-[1fr_1.2fr] gap-8 items-start">
        <div>
          <h2 id="board" className="font-display text-2xl sm:text-3xl font-bold">
            Who keeps their word?
          </h2>
          <p className="text-muted mt-3">
            Promise Scores are built from verified emails and escrowed offers, never from anonymous reviews. A joining on
            time earns a full point, a delay half, a revocation nothing. Nobody, including us, can edit the record.
          </p>
          <Link href="/companies" className="btn btn-ghost mt-5">
            All companies <ArrowRight className="size-4" />
          </Link>
        </div>
        <Leaderboard limit={5} />
      </section>
    </div>
  );
}
