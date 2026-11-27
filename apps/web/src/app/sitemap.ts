import type { MetadataRoute } from "next";
import { publicClient } from "@/lib/chain";
import { addresses, isConfigured } from "@/lib/config";
import { pakkaRegistryAbi } from "@/lib/pakka";
import { siteUrl } from "@/lib/site";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages = ["", "/companies", "/activity"].map((p) => ({ url: `${siteUrl}${p}` }));
  if (!isConfigured) return pages;
  const domains = await publicClient
    .readContract({ address: addresses.registry, abi: pakkaRegistryAbi, functionName: "allDomains" })
    .catch(() => [] as readonly string[]);
  return [...pages, ...domains.map((d) => ({ url: `${siteUrl}/companies/${encodeURIComponent(d)}` }))];
}
