import { findDate, findDateAfter } from "./dates.js";

export type EmailKind = "OFFER" | "POSTPONED" | "REVOKED" | "JOINED" | "COMPANY_VERIFY" | "UNKNOWN";

export interface OfferDetails {
  kind: EmailKind;
  candidateName?: string;
  role?: string;
  /** Compensation as written in the email, e.g. "₹ 6,50,000 per annum". */
  ctc?: string;
  /** Promised (OFFER) or newly announced (POSTPONED) joining date. */
  joinDate?: Date;
  /** Wallet address a company wants to bind to its domain (COMPANY_VERIFY emails). */
  walletToVerify?: `0x${string}`;
}

const REVOKED = /\b(revok(e|ed|ing)|rescind(ed|ing)?|withdraw(n|ing)?\s+(the|your|our)\s+offer|offer\s+(has\s+been|is)\s+(withdrawn|cancell?ed)|unable\s+to\s+(proceed|honou?r)\s+(with\s+)?(the|your)\s+offer)/i;
const POSTPONED = /\b(postpon(e|ed|ement)|defer(red|ment)?|reschedul(e|ed|ing)|revised\s+(joining|start)\s+date|new\s+(joining|start)\s+date|(joining|onboarding)\s+(has\s+been|is|will\s+be)\s+(delayed|moved|pushed))/i;
const JOINED = /\b(welcome\s+(aboard|to\s+the\s+team)|successfully\s+(joined|onboarded)|onboarding\s+(is\s+)?complete[d]?|completed\s+your\s+joining\s+formalities)/i;
const OFFER = /\b(offer\s+letter|pleased\s+to\s+offer|delighted\s+to\s+offer|happy\s+to\s+offer|offer\s+of\s+employment|letter\s+of\s+intent|selected\s+for\s+the\s+(role|position|post)|offer\s+you\s+the\s+(role|position))/i;
const COMPANY_VERIFY = /pakka\s*verify\s*[:\-]?\s*(0x[a-fA-F0-9]{40})/i;

const JOIN_CUES = /(date\s+of\s+joining|joining\s+date|start\s+date|report(ing)?\s+(to\s+\w+\s+)?on|join\s+us\s+on|commence\s+(your\s+)?(employment|duties)\s+on|revised\s+(joining\s+)?date|new\s+(joining\s+)?date|(now\s+)?(re)?scheduled\s+(for|to)|moved\s+to|postponed\s+to|deferred\s+to)\s*(is|will\s+be|:|-|of)?/;

export function classify(subject: string, text: string): EmailKind {
  const all = `${subject}\n${text}`;
  if (COMPANY_VERIFY.test(subject)) return "COMPANY_VERIFY";
  if (REVOKED.test(all)) return "REVOKED";
  if (POSTPONED.test(all)) return "POSTPONED";
  if (JOINED.test(all)) return "JOINED";
  if (OFFER.test(all)) return "OFFER";
  return "UNKNOWN";
}

function clean(s?: string): string | undefined {
  const v = s?.replace(/\s+/g, " ").replace(/^[\s"“'’:–-]+|[\s"”'’.,;:–-]+$/g, "").trim();
  return v ? v : undefined;
}

export function extractOffer(subject: string, text: string): OfferDetails {
  const kind = classify(subject, text);
  const all = `${subject}\n${text}`;
  const out: OfferDetails = { kind };

  const wallet = subject.match(COMPANY_VERIFY);
  if (wallet) out.walletToVerify = wallet[1] as `0x${string}`;

  const name = text.match(/\b(?:[Dd]ear|[Hh]i|[Hh]ello)\s+(?:(?:Mr|Ms|Mrs|Dr)\.?\s+)?\s*([A-Z][a-zA-Z.'-]+(?:\s+[A-Z][a-zA-Z.'-]+){0,3})\s*[,\n]/);
  out.candidateName = clean(name?.[1]);

  const role =
    all.match(/\b(?:position|role|designation|post)\s*(?:of|as|:|-)\s*["“]?([A-Z][\w&/().+ -]{2,60}?)["”]?(?=\s*(?:[,.\n(]|at\b|with\b|in\s+our\b|in\s+the\b|based\b|on\b|$))/) ??
    all.match(/\bas\s+(?:an?\s+)?["“]?([A-Z][\w&/+ -]{2,50}?(?:Engineer|Developer|Analyst|Associate|Consultant|Manager|Intern|Trainee|Designer|Scientist|Executive|Specialist|Architect|Lead))["”]?\b/);
  out.role = clean(role?.[1]);

  const ctc = all.match(
    /\b(?:CTC|cost\s+to\s+company|annual\s+(?:compensation|salary|package)|compensation|package|stipend|salary)\b[^₹\d\n]{0,40}((?:₹|rs\.?|inr)\s*[\d,]+(?:\.\d+)?(?:\s*(?:lakhs?|lpa|l|crores?|cr|k))?(?:\s*(?:per\s+(?:annum|year|month)|p\.?\s?a\.?|\/\s?(?:yr|year|month)))?|[\d.]+\s*(?:lakhs?|lpa)(?:\s*(?:per\s+annum|p\.?\s?a\.?))?)/i,
  );
  out.ctc = clean(ctc?.[1]);

  out.joinDate = findDateAfter(all, JOIN_CUES);
  if (!out.joinDate && (kind === "OFFER" || kind === "POSTPONED")) {
    // Fall back to the first date after the greeting (skips header-ish dates near the top).
    const greet = text.search(/\b(dear|hi|hello)\b/i);
    out.joinDate = findDate(greet >= 0 ? text.slice(greet) : text);
  }
  return out;
}
