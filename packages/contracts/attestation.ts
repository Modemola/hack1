// Single source of truth for the EIP-712 attestation format. Must match PakkaRegistry.sol.
// Kept in the contracts package (CommonJS) so both the Hardhat tests and the ESM verifier can import it.

/** Must match the Kind enum in PakkaRegistry.sol. */
export const AttestationKind = { OFFER: 1, POSTPONED: 2, REVOKED: 3, JOINED: 4, COMPANY: 5 } as const;
export type AttestationKindName = keyof typeof AttestationKind;

export const ATTESTATION_TYPES = {
  Attestation: [
    { name: "kind", type: "uint8" },
    { name: "subject", type: "address" },
    { name: "emailId", type: "bytes32" },
    { name: "offerId", type: "bytes32" },
    { name: "domain", type: "string" },
    { name: "date", type: "uint64" },
    { name: "emailTime", type: "uint64" },
    { name: "deadline", type: "uint64" },
  ],
} as const;

export function eip712Domain(chainId: number, registry: `0x${string}`) {
  return { name: "Pakka", version: "1", chainId, verifyingContract: registry } as const;
}
