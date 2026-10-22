"use client";
import type { ReactNode } from "react";
import Link from "next/link";
import { Lock } from "lucide-react";
import { buttonStyles, LoadingBlock } from "./ui";
import { useSession } from "@/lib/session";

/** Gate for Ask, Quiz and Notes: they only work once a video has been summarized. */
export function RequireVideo({ feature, children }: { feature: string; children: ReactNode }) {
  const { status } = useSession();
  if (status === "restoring") return <LoadingBlock label="Loading your session…" />;
  if (status === "ready") return children;

  const analyzing = status === "analyzing";
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-6 py-24 text-center">
      <span className="mb-5 grid size-12 place-items-center rounded-full bg-pine-tint text-pine">
        <Lock className="size-5" aria-hidden="true" />
      </span>
      <h1 className="text-xl font-bold tracking-[-0.01em]">
        {analyzing ? `${feature} unlocks when your summary is ready` : `${feature} needs a video first`}
      </h1>
      <p className="mt-2 text-[0.95rem] text-ink-soft">
        {analyzing
          ? "Your video is still being transcribed and summarized."
          : "Paste a YouTube link on the Summary page. Once it's summarized, you can use this here."}
      </p>
      <Link href="/" className={`${buttonStyles.primary} mt-6`}>
        {analyzing ? "Back to summary" : "Summarize a video"}
      </Link>
    </div>
  );
}
