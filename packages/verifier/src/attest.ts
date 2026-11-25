import { keccak256, toBytes, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { ATTESTATION_TYPES, eip712Domain } from "../../contracts/attestation";

export { AttestationKind, ATTESTATION_TYPES, eip712Domain, type AttestationKindName } from "../../contracts/attestation";

export interface Attestation {
  kind: number;
  /** Candidate wallet (offer events) or company wallet (COMPANY). */
  subject: Address;
  /** Unique id of the email that proves this, derived from its DKIM signature. */
  emailId: Hex;
  /** Offer this event belongs to. Equal to emailId for OFFER, zero for COMPANY. */
  offerId: Hex;
  /** Company domain that signed the email. */
  domain: string;
  /** Promised join date (OFFER) or new date (POSTPONED), unix seconds. 0 if not stated. */
  date: bigint;
  /** When the company's mail server signed the email, unix seconds. */
  emailTime: bigint;
  /** Signature not valid after this time, unix seconds. */
  deadline: bigint;
}

/** The DKIM b= value is unique per signed email; hashing it gives a stable id that blocks double-submission. */
export function emailIdFromSignature(dkimSignature: string): Hex {
  return keccak256(toBytes(dkimSignature.replace(/\s+/g, "")));
}

export async function signAttestation(
  verifierPrivateKey: Hex,
  chainId: number,
  registry: Address,
  att: Attestation,
): Promise<Hex> {
  const account = privateKeyToAccount(verifierPrivateKey);
  return account.signTypedData({
    domain: eip712Domain(chainId, registry),
    types: ATTESTATION_TYPES,
    primaryType: "Attestation",
    message: att,
  });
}
