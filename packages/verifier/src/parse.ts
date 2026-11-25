import PostalMime from "postal-mime";

export interface ParsedEmail {
  fromAddress: string;
  fromName: string;
  to: string[];
  subject: string;
  date?: Date;
  messageId?: string;
  /** Readable body text (HTML is stripped to text when there is no plain part). */
  text: string;
}

export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#8377;|&#x20b9;/gi, "₹")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
}

export async function parseEmail(raw: string | Buffer): Promise<ParsedEmail> {
  const email = await PostalMime.parse(typeof raw === "string" ? raw : new Uint8Array(raw));
  const text = email.text?.trim() || (email.html ? htmlToText(email.html) : "");
  const date = email.date ? new Date(email.date) : undefined;
  return {
    fromAddress: (email.from?.address ?? "").toLowerCase(),
    fromName: email.from?.name ?? "",
    to: (email.to ?? []).map((t) => (t.address ?? "").toLowerCase()).filter(Boolean),
    subject: email.subject ?? "",
    date: date && !Number.isNaN(date.getTime()) ? date : undefined,
    messageId: email.messageId,
    text,
  };
}
