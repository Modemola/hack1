import type { EmailKind } from "./extract.js";

export interface AiOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface AiReading {
  kind?: EmailKind;
  candidateName?: string;
  role?: string;
  ctc?: string;
  joinDate?: string; // YYYY-MM-DD
  redFlags: string[];
  summary?: string;
  model: string;
}

const SYSTEM = `You read job-related emails for Indian job seekers and return strict JSON only.
Fields:
- kind: one of OFFER (a job offer / offer letter), POSTPONED (joining/onboarding date moved later), REVOKED (offer withdrawn or cancelled), JOINED (confirms the person has joined), UNKNOWN.
- candidateName, role, ctc (as written, keep currency), joinDate (the promised or new joining date as YYYY-MM-DD; null if none).
- redFlags: short phrases for scam signs actually present in the text (asks for any payment/deposit, pressure to act within hours, WhatsApp/Telegram-only contact, no interview, too-good pay, poor grammar on an official letter). Empty array if none. Never invent.
- summary: one plain sentence a student would understand.
Use null for unknown fields. Output only the JSON object.`;

/** Optional AI read of the email. Returns null on any failure: the DKIM check never depends on it. */
export async function aiRead(
  email: { subject: string; from: string; text: string },
  opts: AiOptions = {},
): Promise<AiReading | null> {
  const baseUrl = opts.baseUrl ?? "https://cloud-api.near.ai/v1";
  const model = opts.model ?? "anthropic/claude-haiku-5-5";
  const fetchImpl = opts.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 15000);
  try {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (opts.apiKey) headers.authorization = `Bearer ${opts.apiKey}`;
    const res = await fetchImpl(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model,
        max_tokens: 400,
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: `From: ${email.from}\nSubject: ${email.subject}\n\n${email.text.slice(0, 6000)}`,
          },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content ?? "";
    const json = content.match(/\{[\s\S]*\}/);
    if (!json) return null;
    const parsed = JSON.parse(json[0]) as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
    const kinds: EmailKind[] = ["OFFER", "POSTPONED", "REVOKED", "JOINED", "UNKNOWN"];
    const kind = kinds.find((k) => k === parsed.kind);
    const joinDate = str(parsed.joinDate);
    return {
      kind,
      candidateName: str(parsed.candidateName),
      role: str(parsed.role),
      ctc: str(parsed.ctc),
      joinDate: joinDate && /^\d{4}-\d{2}-\d{2}$/.test(joinDate) ? joinDate : undefined,
      redFlags: Array.isArray(parsed.redFlags) ? parsed.redFlags.filter((f): f is string => typeof f === "string").slice(0, 5) : [],
      summary: str(parsed.summary),
      model,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
