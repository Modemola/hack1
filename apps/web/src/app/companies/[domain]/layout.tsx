import type { Metadata } from "next";

export async function generateMetadata({ params }: { params: Promise<{ domain: string }> }): Promise<Metadata> {
  const domain = decodeURIComponent((await params).domain);
  const title = `${domain}'s Promise Score · Pakka`;
  const description = `Does ${domain} keep its joining dates? A public record built from verified offer emails, which nobody can edit.`;
  return { title, description, openGraph: { title, description }, twitter: { card: "summary_large_image", title, description } };
}

export default function CompanyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
