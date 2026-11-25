export type Severity = "high" | "medium" | "info";

export interface RedFlag {
  code: string;
  severity: Severity;
  message: string;
}

/** Free mailbox providers. Real employers send offers from their own domain. */
export const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.in", "yahoo.in", "outlook.com", "hotmail.com", "live.com",
  "msn.com", "rediffmail.com", "rediff.com", "aol.com", "icloud.com", "me.com", "protonmail.com", "proton.me",
  "zoho.in", "zohomail.in", "yandex.com", "gmx.com", "mail.com", "tutanota.com",
]);

/** Large employers whose brands are most often impersonated in Indian job scams. */
export const KNOWN_EMPLOYERS: { name: string; domains: string[]; tokens: string[] }[] = [
  { name: "TCS", domains: ["tcs.com", "tataconsultancyservices.com"], tokens: ["tcs", "tataconsultancy"] },
  { name: "Infosys", domains: ["infosys.com"], tokens: ["infosys", "infy"] },
  { name: "Wipro", domains: ["wipro.com"], tokens: ["wipro"] },
  { name: "HCLTech", domains: ["hcltech.com", "hcl.com"], tokens: ["hcltech", "hcl"] },
  { name: "Tech Mahindra", domains: ["techmahindra.com"], tokens: ["techmahindra", "techm"] },
  { name: "Cognizant", domains: ["cognizant.com"], tokens: ["cognizant"] },
  { name: "Accenture", domains: ["accenture.com"], tokens: ["accenture"] },
  { name: "Capgemini", domains: ["capgemini.com"], tokens: ["capgemini"] },
  { name: "LTIMindtree", domains: ["ltimindtree.com"], tokens: ["ltimindtree", "mindtree"] },
  { name: "IBM", domains: ["ibm.com"], tokens: ["ibm"] },
  { name: "Deloitte", domains: ["deloitte.com"], tokens: ["deloitte"] },
  { name: "Amazon", domains: ["amazon.com", "amazon.in"], tokens: ["amazon"] },
  { name: "Google", domains: ["google.com"], tokens: ["google"] },
  { name: "Microsoft", domains: ["microsoft.com"], tokens: ["microsoft"] },
  { name: "Flipkart", domains: ["flipkart.com"], tokens: ["flipkart"] },
  { name: "Reliance", domains: ["ril.com", "jio.com", "relianceretail.com"], tokens: ["reliance", "jio"] },
  { name: "Zoho", domains: ["zohocorp.com", "zoho.com"], tokens: ["zoho"] },
  { name: "Genpact", domains: ["genpact.com"], tokens: ["genpact"] },
  { name: "Mphasis", domains: ["mphasis.com"], tokens: ["mphasis"] },
  { name: "Hexaware", domains: ["hexaware.com"], tokens: ["hexaware"] },
  { name: "Swiggy", domains: ["swiggy.in", "swiggy.com"], tokens: ["swiggy"] },
  { name: "Zomato", domains: ["zomato.com", "eternal.com"], tokens: ["zomato"] },
  { name: "Paytm", domains: ["paytm.com"], tokens: ["paytm"] },
];

function isSameOrSub(domain: string, parent: string): boolean {
  return domain === parent || domain.endsWith(`.${parent}`);
}

/** Undo common digit-for-letter swaps used in lookalike domains (inf0sys → infosys). */
function deLeet(s: string): string {
  return s.replace(/0/g, "o").replace(/1/g, "l").replace(/3/g, "e").replace(/5/g, "s").replace(/\$/g, "s");
}

function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

export function officialEmployer(domain: string) {
  return KNOWN_EMPLOYERS.find((e) => e.domains.some((d) => isSameOrSub(domain, d)));
}

/** Returns the employer a domain is pretending to be, if it looks like one but isn't. */
export function impersonatedEmployer(domain: string) {
  if (officialEmployer(domain)) return undefined;
  const labels = domain.toLowerCase().split(".");
  const body = deLeet(labels.slice(0, -1).join("-")); // everything except the TLD
  const parts = body.split(/[-.]/).filter(Boolean);
  for (const e of KNOWN_EMPLOYERS) {
    for (const t of e.tokens) {
      // Short tokens (tcs, ibm, hcl) only count as a whole hyphen/dot-separated part, to avoid false hits.
      if (t.length <= 4 ? parts.includes(t) : body.includes(t)) return e;
    }
    for (const d of e.domains) {
      const root = d.split(".")[0];
      if (root.length >= 5 && parts.some((p) => p !== root && editDistance(p, root) <= 1)) return e;
    }
  }
  return undefined;
}

const MONEY = /\b((registration|security|refundable|training|processing|verification|onboarding|laptop|kit|document(ation)?|joining|background\s+check)\s+(fee|fees|deposit|charges?|amount)|pay\s+(a\s+)?(fee|deposit|rs\.?|₹|inr)|deposit\s+(of\s+)?(rs\.?|₹|inr)|transfer\s+(the\s+)?(amount|fee|money)|via\s+(upi|google\s*pay|phone\s*pe|paytm)|upi\s+id)\b/i;
const OFF_PLATFORM = /\b(whats\s?app|telegram|signal\s+app)\b/i;
const URGENCY = /\b(within\s+(24|12|48)\s+hours|immediately|today\s+itself|limited\s+(seats|slots)|offer\s+(will\s+)?expires?\s+today|last\s+date\s+(is\s+)?today)\b/i;
const NO_INTERVIEW = /\b(without\s+(any\s+)?interview|no\s+interview\s+(is\s+)?required|direct\s+(joining|selection))\b/i;

export function findRedFlags(input: { fromDomain: string; fromName: string; text: string; subject: string }): RedFlag[] {
  const flags: RedFlag[] = [];
  const domain = input.fromDomain.toLowerCase();
  const all = `${input.subject}\n${input.text}`;

  if (FREE_EMAIL_DOMAINS.has(domain)) {
    flags.push({ code: "FREE_EMAIL_DOMAIN", severity: "high", message: `Sent from a free ${domain} mailbox. Real employers send offers from their own company domain.` });
  }
  const fake = impersonatedEmployer(domain);
  if (fake) {
    flags.push({ code: "LOOKALIKE_DOMAIN", severity: "high", message: `${domain} looks like ${fake.name}, but ${fake.name} only uses ${fake.domains.join(", ")}.` });
  }
  const nameMatch = KNOWN_EMPLOYERS.find((e) =>
    e.tokens.some((t) => new RegExp(`\\b${t}\\b`, "i").test(input.fromName.replace(/[^a-z0-9 ]/gi, " "))),
  );
  if (nameMatch && !nameMatch.domains.some((d) => isSameOrSub(domain, d)) && !fake) {
    flags.push({ code: "DISPLAY_NAME_SPOOF", severity: "high", message: `The sender calls themselves "${input.fromName}", but the email came from ${domain}, not ${nameMatch.name}.` });
  }
  if (MONEY.test(all)) {
    flags.push({ code: "ASKS_FOR_MONEY", severity: "high", message: "Asks you to pay a fee or deposit. Genuine employers never charge candidates to join." });
  }
  if (OFF_PLATFORM.test(all)) {
    flags.push({ code: "OFF_PLATFORM_CONTACT", severity: "medium", message: "Moves the conversation to WhatsApp or Telegram, a common scam pattern." });
  }
  if (URGENCY.test(all)) {
    flags.push({ code: "URGENCY", severity: "medium", message: "Pressures you to act within hours. Real offers give you time." });
  }
  if (NO_INTERVIEW.test(all)) {
    flags.push({ code: "NO_INTERVIEW", severity: "medium", message: "Offers a job with no interview." });
  }
  return flags;
}
