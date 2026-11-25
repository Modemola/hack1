import { dkimSign } from "mailauth";
import { randomUUID } from "node:crypto";
import demoKeys from "../fixtures/demo-keys.json" with { type: "json" };

/** Fictional companies for the live demo. Their *.demo domains only resolve inside Pakka. */
export const DEMO_COMPANIES = {
  nimbus: { name: "Nimbus Systems", domain: "nimbus.demo", sender: "talent@nimbus.demo", signer: "Priya Raman, Talent Acquisition" },
  orbit: { name: "Orbit Analytics", domain: "orbit.demo", sender: "careers@orbit.demo", signer: "Arjun Mehta, HR Operations" },
  kestrel: { name: "Kestrel Labs", domain: "kestrel.demo", sender: "people@kestrel.demo", signer: "Neha Kulkarni, People Team" },
  // A scammer who registered a lookalike domain. Its emails are validly signed, which is the point:
  // a valid signature proves who sent it, and the domain itself gives the scam away.
  scam: { name: "TCS Onboarding Desk", domain: "tcs-onboarding.demo", sender: "hr.desk@tcs-onboarding.demo", signer: "HR Desk" },
} as const;

export type DemoCompanyKey = keyof typeof DEMO_COMPANIES;
export type DemoEmailKind = "OFFER" | "POSTPONED" | "REVOKED" | "JOINED" | "SCAM" | "COMPANY_VERIFY";

export interface DemoEmailInput {
  company: DemoCompanyKey;
  kind: DemoEmailKind;
  candidateName?: string;
  candidateEmail?: string;
  role?: string;
  ctc?: string;
  joinDate?: Date;
  newJoinDate?: Date;
  wallet?: string;
  sentAt?: Date;
  /** Fixed Message-ID for reproducible fixtures. */
  messageId?: string;
}

const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

function body(i: Required<Pick<DemoEmailInput, "candidateName" | "role" | "ctc">> & DemoEmailInput): { subject: string; text: string } {
  const c = DEMO_COMPANIES[i.company];
  const join = i.joinDate ? fmt(i.joinDate) : "";
  switch (i.kind) {
    case "OFFER":
      return {
        subject: `Offer Letter - ${i.role} - ${c.name}`,
        text: `Dear ${i.candidateName},

Congratulations! Following your campus interviews, we are pleased to offer you the position of ${i.role} at ${c.name}.

Your annual CTC will be ₹ ${i.ctc} per annum. Your date of joining is ${join}, at our Bengaluru office.

Please confirm your acceptance by replying to this email within 7 days.

We look forward to having you on the team.

Warm regards,
${c.signer}
${c.name}`,
      };
    case "POSTPONED":
      return {
        subject: `Update on your joining date - ${c.name}`,
        text: `Dear ${i.candidateName},

Due to business realignment, your onboarding as ${i.role} has been postponed. Your revised joining date is ${i.newJoinDate ? fmt(i.newJoinDate) : "to be confirmed"}.

Your offer remains valid. We regret the inconvenience.

Regards,
${c.signer}
${c.name}`,
      };
    case "REVOKED":
      return {
        subject: `Regarding your offer - ${c.name}`,
        text: `Dear ${i.candidateName},

We regret to inform you that due to changing business requirements, we are unable to proceed with your offer for the role of ${i.role}. Your offer has been withdrawn.

We wish you the very best.

Regards,
${c.signer}
${c.name}`,
      };
    case "JOINED":
      return {
        subject: `Welcome aboard, ${i.candidateName}!`,
        text: `Dear ${i.candidateName},

Welcome to the team! You have successfully joined ${c.name} as ${i.role}. Your employee ID and laptop are ready.

Cheers,
${c.signer}
${c.name}`,
      };
    case "SCAM":
      return {
        subject: `TCS Offer Letter - Immediate Joining - ${i.role}`,
        text: `Dear ${i.candidateName},

Congratulations! You are selected for the role of ${i.role} at TCS without any interview. Your annual CTC will be ₹ 9,80,000 per annum and your date of joining is ${join}.

To confirm your seat, pay a refundable security deposit of ₹ 4,999 via UPI to tcs.onboarding@upi within 24 hours. Seats are limited.

For queries contact our HR on WhatsApp: +91 98xxxxxx10.

Regards,
${c.signer}`,
      };
    case "COMPANY_VERIFY":
      return {
        subject: `Pakka verify ${i.wallet}`,
        text: `This email links the wallet ${i.wallet} to ${c.domain} on Pakka.`,
      };
  }
}

/** Builds a DKIM-signed demo email (.eml) for a fictional company. */
export async function makeDemoEmail(input: DemoEmailInput): Promise<string> {
  const c = DEMO_COMPANIES[input.company];
  const filled = {
    ...input,
    candidateName: input.candidateName ?? "Aarav Sharma",
    role: input.role ?? "Associate Software Engineer",
    ctc: input.ctc ?? "6,50,000",
  };
  const { subject, text } = body(filled);
  const sentAt = input.sentAt ?? new Date();
  const to = input.kind === "COMPANY_VERIFY" ? "verify@pakka.app" : input.candidateEmail ?? "aarav.sharma@student.demo";
  const headers = [
    `From: "${c.signer.split(",")[0]} - ${c.name}" <${c.sender}>`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `Date: ${sentAt.toUTCString().replace("GMT", "+0000")}`,
    `Message-ID: <${input.messageId ?? randomUUID()}@${c.domain}>`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="utf-8"',
    "Content-Transfer-Encoding: 8bit",
  ];
  const message = `${headers.join("\r\n")}\r\n\r\n${text.replace(/\r?\n/g, "\r\n")}\r\n`;
  const signed = await dkimSign(message, {
    canonicalization: "relaxed/relaxed",
    signTime: sentAt,
    signatureData: [{ signingDomain: c.domain, selector: demoKeys.selector, privateKey: demoKeys.privateKeyPem }],
  });
  if (signed.errors?.length) throw new Error(`Demo signing failed: ${JSON.stringify(signed.errors)}`);
  return signed.signatures + message;
}
