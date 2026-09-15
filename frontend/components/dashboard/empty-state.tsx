import type { ReactNode } from "react";

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="grid justify-items-start gap-3 rounded-lg border border-dashed border-line px-6 py-10">
      <p className="text-base font-semibold">{title}</p>
      {children ? <div className="max-w-xl text-sm text-dim">{children}</div> : null}
      {action}
    </div>
  );
}

export function LoadError({ what, error }: { what: string; error: unknown }) {
  const text = String((error as Error)?.message ?? error);
  const limited = /rate limit|429/i.test(text);
  return (
    <div role="alert" className="rounded-lg border border-no/40 bg-no/10 px-5 py-4 text-sm">
      <p className="font-semibold text-no">Could not read {what}.</p>
      <p className="mt-1 text-dim">
        {limited ? "The GenLayer RPC is rate limiting reads. Wait a minute and reload." : text}
      </p>
    </div>
  );
}

export function PageHeader({ eyebrow, title, children, actions }: { eyebrow?: string; title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="grid gap-2">
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        {children ? <div className="max-w-2xl text-sm text-dim">{children}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}
