import { writeFileSync } from "node:fs";
import { makeDemoEmail } from "../src/demo.js";

const sentAt = new Date("2026-07-10T09:30:00Z");
const joinDate = new Date("2027-01-15T00:00:00Z");
const out = (name: string, eml: string) => writeFileSync(new URL(`../fixtures/${name}.eml`, import.meta.url), eml);

const offer = await makeDemoEmail({ company: "nimbus", kind: "OFFER", joinDate, sentAt, messageId: "fixture-offer" });
out("nimbus-offer", offer);
out("nimbus-postponed", await makeDemoEmail({ company: "nimbus", kind: "POSTPONED", newJoinDate: new Date("2027-06-01T00:00:00Z"), sentAt: new Date("2027-01-05T10:00:00Z"), messageId: "fixture-postponed" }));
out("nimbus-revoked", await makeDemoEmail({ company: "nimbus", kind: "REVOKED", sentAt: new Date("2027-05-20T10:00:00Z"), messageId: "fixture-revoked" }));
out("nimbus-joined", await makeDemoEmail({ company: "nimbus", kind: "JOINED", sentAt: new Date("2027-01-15T10:00:00Z"), messageId: "fixture-joined" }));
out("scam-lookalike", await makeDemoEmail({ company: "scam", kind: "SCAM", joinDate, sentAt, messageId: "fixture-scam" }));
out("company-verify", await makeDemoEmail({ company: "nimbus", kind: "COMPANY_VERIFY", wallet: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", sentAt, messageId: "fixture-verify" }));
// Tampered: someone edits the salary after receiving the genuine offer.
out("tampered-offer", offer.replace("6,50,000", "16,50,000"));
// Unsigned: the same offer with its signature stripped (what a forwarded/pasted copy looks like).
out("unsigned-offer", offer.replace(/^DKIM-Signature:[\s\S]*?\r\n(?=\S)/, ""));
console.log("fixtures written");
