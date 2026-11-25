const MONTHS: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3, may: 4, jun: 5, june: 5,
  jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10,
  dec: 11, december: 11,
};

function utc(y: number, m: number, d: number): Date | undefined {
  if (y < 100) y += 2000;
  const dt = new Date(Date.UTC(y, m, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m || dt.getUTCDate() !== d) return undefined;
  return dt;
}

const MONTH_RE = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";

/** Finds the first date in a piece of text. Indian day-first order is assumed for numeric dates. */
export function findDate(text: string): Date | undefined {
  const patterns: [RegExp, (m: RegExpMatchArray) => Date | undefined][] = [
    // 2027-01-15
    [/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/, (m) => utc(+m[1], +m[2] - 1, +m[3])],
    // 15th January 2027 / 15 Jan, 2027
    [new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH_RE}\\.?,?\\s+(\\d{4})\\b`, "i"),
      (m) => utc(+m[3], MONTHS[m[2].toLowerCase()], +m[1])],
    // January 15, 2027 / Jan 15th 2027
    [new RegExp(`\\b${MONTH_RE}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, "i"),
      (m) => utc(+m[3], MONTHS[m[1].toLowerCase()], +m[2])],
    // 15/01/2027, 15-01-2027, 15.01.2027 (day first)
    [/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})\b/, (m) => utc(+m[3], +m[2] - 1, +m[1])],
  ];
  let best: { index: number; date: Date } | undefined;
  for (const [re, build] of patterns) {
    const m = text.match(re);
    if (m && m.index !== undefined) {
      const date = build(m);
      if (date && (!best || m.index < best.index)) best = { index: m.index, date };
    }
  }
  return best?.date;
}

/** Looks for a date right after one of the given cue phrases (e.g. "date of joining"). */
export function findDateAfter(text: string, cues: RegExp): Date | undefined {
  const re = new RegExp(cues.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const window = text.slice(m.index + m[0].length, m.index + m[0].length + 80);
    const d = findDate(window);
    if (d) return d;
  }
  return undefined;
}

export function toUnixSeconds(d?: Date): number {
  return d ? Math.floor(d.getTime() / 1000) : 0;
}
