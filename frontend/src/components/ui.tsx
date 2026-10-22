import type { ReactNode } from "react";
import { CircleAlert, LoaderCircle } from "lucide-react";

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50";

export const buttonStyles = {
  primary: `${BUTTON_BASE} bg-pine text-white hover:bg-pine-dark`,
  secondary: `${BUTTON_BASE} border border-line-strong bg-surface text-ink hover:border-pine hover:text-pine-dark`,
  ghost: `${BUTTON_BASE} text-ink-soft hover:bg-pine-tint hover:text-pine-dark`,
};

export function Spinner({ className = "size-5" }: { className?: string }) {
  return <LoaderCircle className={`${className} animate-spin`} aria-hidden="true" />;
}

/** Page frame: a heading with optional description and actions, then content. */
export function Page({
  title,
  description,
  actions,
  children,
  wide = false,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={`mx-auto w-full px-4 py-6 sm:px-6 md:py-10 lg:px-10 ${wide ? "max-w-6xl" : "max-w-3xl"}`}>
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between md:mb-8">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-[-0.02em] text-ink sm:text-[1.75rem]">{title}</h1>
          {description && <p className="mt-1.5 max-w-prose text-[0.95rem] text-ink-soft">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
      </header>
      {children}
    </div>
  );
}

export function ErrorNotice({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <div role="alert" className="flex flex-col gap-3 rounded-xl border border-danger/30 bg-danger-tint p-4 sm:flex-row sm:items-center">
      <CircleAlert className="size-5 shrink-0 text-danger" aria-hidden="true" />
      <p className="flex-1 text-sm text-ink">{message}</p>
      {action}
    </div>
  );
}

export function LoadingBlock({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-24 text-ink-soft" role="status">
      <Spinner />
      <span className="text-sm">{label}</span>
    </div>
  );
}
