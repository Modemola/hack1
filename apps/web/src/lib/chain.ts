import { createPublicClient, http } from "viem";
import { chain, rpcUrl } from "./config";

export const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
