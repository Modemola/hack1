import { dkimVerify } from "mailauth";
import type { Resolver } from "./resolver.js";

export type DkimStatus = "pass" | "fail" | "none";

export interface DkimOutcome {
  status: DkimStatus;
  /** Domain that cryptographically vouches for the email (aligned with the From header). */
  domain?: string;
  selector?: string;
  /** Base64 signature value (b= tag). Unique per email; used to derive the email id. */
  signature?: string;
  /** When the sender's server signed it (t= tag), if present. */
  signedAt?: Date;
  headerFrom: string[];
  /** Plain-language reason, shown to users when status is not "pass". */
  reason?: string;
}

interface MailauthSignatureResult {
  signingDomain?: string;
  selector?: string;
  signature?: string;
  signTime?: string | null;
  status: {
    result: string;
    comment?: string;
    aligned?: string | false;
    underSized?: number;
  };
}

function explain(r: MailauthSignatureResult): string {
  const comment = (r.status.comment ?? "").toLowerCase();
  if (comment.includes("body hash")) return "The email was changed after it was sent: its content no longer matches the sender's signature.";
  if (comment.includes("bad signature") || r.status.result === "fail")
    return "The sender's signature does not match. The email was altered or forged.";
  if (comment.includes("no key") || comment.includes("not found") || r.status.result === "permerror")
    return `The signing key for ${r.signingDomain ?? "the sender"} could not be found. The domain may have rotated its key, or the signature is fake.`;
  if (r.status.result === "temperror") return "Could not reach DNS to check the signature. Try again in a minute.";
  if (r.status.result === "policy") return "The signature uses a weak key or algorithm, so we can't trust it.";
  return `Signature check returned "${r.status.result}"${r.status.comment ? ` (${r.status.comment})` : ""}.`;
}

/**
 * Verifies the DKIM signatures on a raw email (.eml) and decides whether the domain in the
 * From header really sent it.
 *
 * A signature only counts when it:
 *  - verifies (dkim=pass),
 *  - is aligned with the From domain (else anyone could sign with their own domain and fake From),
 *  - covers the whole body (an l= length limit would let someone append text after signing).
 */
export async function verifyDkim(raw: string | Buffer, opts: { resolver: Resolver; now?: Date }): Promise<DkimOutcome> {
  const result = (await dkimVerify(raw, { resolver: opts.resolver as never, curTime: opts.now })) as {
    headerFrom: string[];
    results: MailauthSignatureResult[];
  };
  const headerFrom = result.headerFrom ?? [];
  const sigs = (result.results ?? []).filter((r) => r.signature);

  if (headerFrom.length !== 1) {
    return { status: "fail", headerFrom, reason: "The email must have exactly one From address." };
  }
  if (sigs.length === 0) {
    return {
      status: "none",
      headerFrom,
      reason:
        "This email has no sender signature. Forwarded or copy-pasted emails lose it: download the original instead (Gmail: ⋮ → Download message).",
    };
  }

  const good = sigs.find((r) => r.status.result === "pass" && r.status.aligned && !r.status.underSized);
  if (good) {
    return {
      status: "pass",
      domain: String(good.status.aligned).toLowerCase(),
      selector: good.selector,
      signature: good.signature,
      signedAt: good.signTime ? new Date(good.signTime) : undefined,
      headerFrom,
    };
  }

  const passedButUnaligned = sigs.find((r) => r.status.result === "pass" && !r.status.aligned);
  if (passedButUnaligned) {
    return {
      status: "fail",
      headerFrom,
      reason: `The email claims to be from ${headerFrom[0]} but was signed by ${passedButUnaligned.signingDomain}. That's a classic spoofing sign.`,
    };
  }
  const partial = sigs.find((r) => r.status.result === "pass" && r.status.underSized);
  if (partial) {
    return { status: "fail", headerFrom, reason: "Only part of this email is signed; text was added after the sender signed it." };
  }
  return { status: "fail", headerFrom, reason: explain(sigs[0]) };
}
