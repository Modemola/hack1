"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { BadgeCheck, ChevronRight, Copy, Loader2, Lock } from "lucide-react";
import { isAddress, parseUnits, type Address } from "viem";
import { useWallet, guestAddress } from "@/lib/wallet";
import { createGuarantee, getCompanyDomain, getGuarantee, getGuaranteeIds, type Guarantee } from "@/lib/pakka";
import { ConnectGate } from "@/components/ConnectGate";
import { Verifier } from "@/components/Verifier";
import { StatusPill } from "@/components/StatusPill";
import { date, usd } from "@/lib/format";
import { USD_DECIMALS } from "@/lib/config";

export default function EmployerPage() {
  return (
    <div className="grid gap-8 max-w-3xl">
      <div>
        <h1 className="font-display text-3xl sm:text-4xl font-bold">Make offers candidates can trust</h1>
        <p className="text-muted mt-2">
          Lock a joining guarantee behind each offer. If you onboard on time, every rupee comes back. If joining slips,
          your candidate is paid while they wait. Your Promise Score shows the world you keep your word.
        </p>
      </div>
      <ConnectGate persona="company" why="Your company wallet makes and funds offers.">
        <EmployerConsole />
      </ConnectGate>
    </div>
  );
}

function EmployerConsole() {
  const { address } = useWallet();
  const [domain, setDomain] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (address) setDomain(await getCompanyDomain(address));
  }, [address]);

  useEffect(() => {
    setDomain(null);
    void refresh();
  }, [refresh]);

  // While unverified, poll so the console unlocks right after the verification is recorded.
  useEffect(() => {
    if (domain !== "") return;
    const t = setInterval(() => void refresh(), 4000);
    return () => clearInterval(t);
  }, [domain, refresh]);

  if (domain === null) {
    return (
      <p className="text-sm text-muted flex items-center gap-2">
        <Loader2 className="size-4 animate-spin" /> Checking your company…
      </p>
    );
  }
  if (!domain) return <VerifyDomain address={address!} />;
  return (
    <>
      <div className="card px-4 py-3 flex items-center gap-3">
        <BadgeCheck className="size-5 text-verified" aria-hidden />
        <p className="flex-1">
          This wallet speaks for <strong>{domain}</strong>.
        </p>
        <Link href={`/companies/${encodeURIComponent(domain)}`} className="text-sm underline underline-offset-2">
          Promise Score
        </Link>
      </div>
      <CreateOffer />
      <MyGuarantees />
    </>
  );
}

function VerifyDomain({ address }: { address: Address }) {
  const [copied, setCopied] = useState(false);
  const subject = `Pakka verify ${address}`;
  return (
    <section className="grid gap-4">
      <div className="card p-5 grid gap-3">
        <h2 className="font-display text-xl font-bold">Step 1: prove you speak for your company</h2>
        <ol className="list-decimal pl-5 text-sm grid gap-1.5">
          <li>From your company email (for example hr@yourcompany.com), send an email to anyone, even yourself, with this exact subject:</li>
        </ol>
        <div className="flex items-center gap-2 bg-sunk rounded-lg px-3 py-2">
          <code className="text-xs sm:text-sm break-all flex-1">{subject}</code>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              void navigator.clipboard.writeText(subject);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            <Copy className="size-3.5" /> {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <ol start={2} className="list-decimal pl-5 text-sm grid gap-1.5">
          <li>Download it from your Sent folder as a .eml file and drop it below.</li>
        </ol>
        <p className="text-xs text-muted">
          Your mail server&apos;s DKIM signature proves the email came from your domain, so no paperwork or manual review is needed.
        </p>
      </div>
      <Verifier
        compact
        dropTitle="Drop your verification email"
        dropText="We check your domain's signature and link this wallet to it."
        samples={[{ id: "verify", label: "Use demo company Nimbus Systems (nimbus.demo)", url: `/api/demo-email?company=nimbus&kind=COMPANY_VERIFY&wallet=${address}` }]}
      />
    </section>
  );
}

function defaultJoinDate() {
  const d = new Date(Date.now() + 30 * 86400_000);
  return d.toISOString().slice(0, 10);
}

function CreateOffer() {
  const { address, send } = useWallet();
  const router = useRouter();
  const [form, setForm] = useState({
    candidate: "",
    role: "Associate Software Engineer",
    amount: "1500",
    stipend: "500",
    joinDate: defaultJoinDate(),
    grace: "15",
    pledge: "25",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!isAddress(form.candidate)) return setError("Enter the candidate's wallet address.");
    if (address && form.candidate.toLowerCase() === address.toLowerCase()) return setError("The candidate needs a different wallet from yours.");
    setBusy(true);
    try {
      const id = await createGuarantee(send, address!, {
        candidate: form.candidate as Address,
        role: form.role.trim().slice(0, 80),
        amount: parseUnits(form.amount || "0", USD_DECIMALS),
        stipendPerMonth: parseUnits(form.stipend || "0", USD_DECIMALS),
        joinDate: BigInt(Date.parse(`${form.joinDate}T04:30:00Z`) / 1000),
        grace: BigInt(Math.round(Number(form.grace || "0") * 86400)),
        pledge: parseUnits(form.pledge || "0", USD_DECIMALS),
      });
      router.push(`/guarantee/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card p-5 grid gap-4">
      <div>
        <h2 className="font-display text-xl font-bold">Make a guaranteed offer</h2>
        <p className="text-sm text-muted">Amounts are in pUSD test dollars on the demo; your wallet is topped up from the faucet automatically.</p>
      </div>
      <label className="block">
        <span className="label">Candidate wallet</span>
        <div className="flex gap-2">
          <input className="input font-mono text-sm" placeholder="0x…" value={form.candidate} onChange={set("candidate")} />
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setForm((f) => ({ ...f, candidate: guestAddress("candidate") }))}>
            Demo candidate
          </button>
        </div>
      </label>
      <label className="block">
        <span className="label">Role</span>
        <input className="input" value={form.role} onChange={set("role")} maxLength={80} />
      </label>
      <div className="grid sm:grid-cols-2 gap-4">
        <label className="block">
          <span className="label">Joining date</span>
          <input className="input" type="date" value={form.joinDate} onChange={set("joinDate")} />
        </label>
        <label className="block">
          <span className="label">Grace period (days)</span>
          <input className="input" type="number" min="0" max="90" value={form.grace} onChange={set("grace")} />
        </label>
        <label className="block">
          <span className="label">Guarantee locked (pUSD)</span>
          <input className="input" type="number" min="1" step="any" value={form.amount} onChange={set("amount")} />
        </label>
        <label className="block">
          <span className="label">Delay stipend per month (pUSD)</span>
          <input className="input" type="number" min="1" step="any" value={form.stipend} onChange={set("stipend")} />
        </label>
        <label className="block">
          <span className="label">Candidate pledge (pUSD, optional)</span>
          <input className="input" type="number" min="0" step="any" value={form.pledge} onChange={set("pledge")} />
        </label>
      </div>
      <p className="text-sm bg-sunk rounded-lg px-3 py-2">
        If joining slips past {form.joinDate || "the date"} + {form.grace || 0} days, the candidate earns {form.stipend || 0} pUSD a
        month from the guarantee, up to {form.amount || 0} pUSD. Join on time and it all comes back to you.
      </p>
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
      <button className="btn btn-primary justify-self-start" disabled={busy}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Lock className="size-4" />} Lock guarantee and send offer
      </button>
    </form>
  );
}

function MyGuarantees() {
  const { address } = useWallet();
  const [rows, setRows] = useState<Guarantee[] | null>(null);
  useEffect(() => {
    if (!address) return;
    getGuaranteeIds(address, "company")
      .then((ids) => Promise.all(ids.map(getGuarantee)))
      .then(setRows)
      .catch(() => setRows([]));
  }, [address]);
  if (!rows || rows.length === 0) return null;
  return (
    <section className="grid gap-3">
      <h2 className="font-display text-xl font-bold">Your guaranteed offers</h2>
      {rows.map((g) => (
        <Link key={String(g.id)} href={`/guarantee/${g.id}`} className="card px-4 py-3 flex items-center gap-4 hover:border-accent transition-colors">
          <div className="min-w-0 flex-1">
            <p className="font-semibold truncate">{g.role}</p>
            <p className="text-xs text-muted">
              {usd(g.amount, 0)} locked · joining {date(g.currentJoinDate)}
            </p>
          </div>
          <StatusPill status={g.state} guarantee />
          <ChevronRight className="size-4 text-muted" aria-hidden />
        </Link>
      ))}
    </section>
  );
}
