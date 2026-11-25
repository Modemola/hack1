import { verifyDkim, type DkimStatus } from "./dkim.js";
import { parseEmail } from "./parse.js";
import { extractOffer, type EmailKind } from "./extract.js";
import { findRedFlags, officialEmployer, type RedFlag } from "./redflags.js";
import { aiRead, type AiOptions } from "./ai.js";
import { defaultResolver, isDemoDomain, type Resolver } from "./resolver.js";
import { emailIdFromSignature } from "./attest.js";
import { toUnixSeconds } from "./dates.js";

export * from "./attest.js";
export * from "./resolver.js";
export * from "./redflags.js";
export { verifyDkim } from "./dkim.js";
export { parseEmail } from "./parse.js";
export { extractOffer, classify, type EmailKind } from "./extract.js";
export { findDate } from "./dates.js";
export { aiRead, type AiOptions } from "./ai.js";

export type Verdict = "verified" | "warning" | "danger";

export interface FieldValue {
  value: string;
  source: "email" | "ai";
}

export interface AnalysisReport {
  verdict: Verdict;
  headline: string;
  detail: string;
  dkim: { status: DkimStatus; domain?: string; reason?: string; signedAt?: string };
  sender: { address: string; name: string; domain: string; employer?: string; isDemo: boolean };
  email: { subject: string; date?: string; kind: EmailKind };
  offer: { candidateName?: FieldValue; role?: FieldValue; ctc?: FieldValue; joinDate?: FieldValue };
  flags: RedFlag[];
  ai: { used: boolean; model?: string; summary?: string };
  /** Present when the signature passed. Unique per email. */
  emailId?: `0x${string}`;
  /** Unix seconds the company's server signed the email (falls back to the Date header). */
  emailTime: number;
  /** Whether this email can be recorded onchain as proof. */
  attestable: boolean;
  /** Wallet the company asked to link (COMPANY_VERIFY emails only). */
  walletToVerify?: `0x${string}`;
}

export interface AnalyzeOptions {
  resolver?: Resolver;
  /** Pass false to skip the AI read entirely. */
  ai?: AiOptions | false;
  now?: Date;
}

function field(v: string | undefined, source: FieldValue["source"]): FieldValue | undefined {
  return v ? { value: v, source } : undefined;
}

export async function analyzeEmail(raw: string | Buffer, opts: AnalyzeOptions = {}): Promise<AnalysisReport> {
  const resolver = opts.resolver ?? defaultResolver();
  const [dkim, parsed] = await Promise.all([verifyDkim(raw, { resolver, now: opts.now }), parseEmail(raw)]);

  const fromDomain = parsed.fromAddress.split("@")[1] ?? "";
  const extracted = extractOffer(parsed.subject, parsed.text);
  const flags = findRedFlags({ fromDomain, fromName: parsed.fromName, text: parsed.text, subject: parsed.subject });

  const ai =
    opts.ai === false || extracted.kind === "COMPANY_VERIFY"
      ? null
      : await aiRead({ subject: parsed.subject, from: `${parsed.fromName} <${parsed.fromAddress}>`, text: parsed.text }, opts.ai ?? {});

  // The rules-based reading wins; AI only fills gaps. The signature check never depends on AI.
  const kind: EmailKind = extracted.kind !== "UNKNOWN" ? extracted.kind : ai?.kind ?? "UNKNOWN";
  const joinIso = extracted.joinDate?.toISOString().slice(0, 10);
  const offer = {
    candidateName: field(extracted.candidateName, "email") ?? field(ai?.candidateName, "ai"),
    role: field(extracted.role, "email") ?? field(ai?.role, "ai"),
    ctc: field(extracted.ctc, "email") ?? field(ai?.ctc, "ai"),
    joinDate: field(joinIso, "email") ?? field(ai?.joinDate, "ai"),
  };
  // AI flags are a safety net for what the rules miss; when rules already fired they'd only repeat them.
  if (flags.length === 0) {
    for (const f of ai?.redFlags ?? []) flags.push({ code: "AI_FLAG", severity: "medium", message: f });
  }

  const employer = dkim.domain ? officialEmployer(dkim.domain) : undefined;
  const high = flags.filter((f) => f.severity === "high");
  const medium = flags.filter((f) => f.severity === "medium");

  let verdict: Verdict;
  let headline: string;
  let detail: string;
  if (dkim.status === "fail") {
    verdict = "danger";
    headline = "Fake or altered email";
    detail = dkim.reason ?? "The sender's signature does not check out.";
  } else if (dkim.status === "none") {
    verdict = high.length ? "danger" : "warning";
    headline = high.length ? "Unverified, with scam warning signs" : "Can't verify this email";
    detail = dkim.reason ?? "";
  } else if (high.length) {
    verdict = "danger";
    headline = `Really sent by ${dkim.domain}, but it's a scam pattern`;
    detail = high[0].message;
  } else {
    const who = employer ? `${employer.name} (${dkim.domain})` : dkim.domain!;
    verdict = medium.length ? "warning" : "verified";
    headline = `Genuine: sent by ${who}`;
    detail = employer
      ? `Cryptographically signed by ${employer.name}'s mail servers. It was not forged or edited.`
      : `Cryptographically signed by ${dkim.domain}'s mail servers, and not edited since. We prove who sent it; check the company itself too.`;
    if (medium.length) detail += ` But note: ${medium[0].message}`;
  }

  const emailTime = toUnixSeconds(dkim.signedAt ?? parsed.date);
  const attestable =
    dkim.status === "pass" &&
    high.length === 0 &&
    ["OFFER", "POSTPONED", "REVOKED", "JOINED", "COMPANY_VERIFY"].includes(kind);

  return {
    verdict,
    headline,
    detail,
    dkim: { status: dkim.status, domain: dkim.domain, reason: dkim.reason, signedAt: dkim.signedAt?.toISOString() },
    sender: {
      address: parsed.fromAddress,
      name: parsed.fromName,
      domain: dkim.domain ?? fromDomain,
      employer: employer?.name,
      isDemo: isDemoDomain(dkim.domain ?? fromDomain),
    },
    email: { subject: parsed.subject, date: parsed.date?.toISOString(), kind },
    offer,
    flags,
    ai: { used: !!ai, model: ai?.model, summary: ai?.summary },
    emailId: dkim.signature ? emailIdFromSignature(dkim.signature) : undefined,
    emailTime,
    attestable,
    walletToVerify: extracted.walletToVerify,
  };
}
export { makeDemoEmail, DEMO_COMPANIES, type DemoCompanyKey, type DemoEmailKind } from "./demo.js";
