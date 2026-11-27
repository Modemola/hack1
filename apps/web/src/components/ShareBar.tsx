"use client";

import { useEffect, useState } from "react";
import { Briefcase, Check, Copy, MessageCircle, Share2 } from "lucide-react";

/** Copy / LinkedIn / WhatsApp / native share for a page on this site. */
export function ShareBar({ path, text }: { path: string; text: string }) {
  const [url, setUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);

  useEffect(() => {
    setUrl(new URL(path, window.location.origin).toString());
    setCanShare(typeof navigator.share === "function");
  }, [path]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("Copy this link", url);
    }
  }

  const enc = encodeURIComponent;
  return (
    <div className="flex flex-wrap gap-2">
      <button className="btn btn-primary btn-sm" onClick={copy} disabled={!url}>
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} {copied ? "Link copied" : "Copy link"}
      </button>
      <a className="btn btn-ghost btn-sm" href={`https://www.linkedin.com/sharing/share-offsite/?url=${enc(url)}`} target="_blank" rel="noreferrer">
        <Briefcase className="size-3.5" /> LinkedIn
      </a>
      <a className="btn btn-ghost btn-sm" href={`https://wa.me/?text=${enc(`${text} ${url}`)}`} target="_blank" rel="noreferrer">
        <MessageCircle className="size-3.5" /> WhatsApp
      </a>
      {canShare && (
        <button className="btn btn-ghost btn-sm" onClick={() => navigator.share({ title: "Pakka", text, url }).catch(() => {})}>
          <Share2 className="size-3.5" /> More
        </button>
      )}
    </div>
  );
}
