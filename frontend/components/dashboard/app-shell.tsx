"use client";

import { Activity, FilePlus2, FileSignature, LayoutDashboard, ListChecks, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

import { Logo } from "@/components/dashboard/logo";
import { NetworkNotices, NetworkPill } from "@/components/wallet/network-status";
import { WalletButton } from "@/components/wallet/wallet-button";
import { shortAddress } from "@/lib/utils/present";
import { useMandateApp } from "@/providers/app-providers";

const NAV = [
  { href: "/", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/mandates", label: "Mandates", icon: FileSignature, exact: false },
  { href: "/mandates/new", label: "New mandate", icon: FilePlus2, exact: true },
  { href: "/requests", label: "Requests", icon: ListChecks, exact: false },
  { href: "/activity", label: "Activity", icon: Activity, exact: false },
];

function active(pathname: string, href: string, exact: boolean) {
  if (exact) return pathname === href;
  if (href === "/mandates") return pathname.startsWith("/mandates") && pathname !== "/mandates/new";
  return pathname.startsWith(href);
}

/**
 * The console shell: a fixed left rail with the product's sections and the
 * contract it is bound to, a slim top bar with network and wallet, and the
 * page. Below the large breakpoint the rail becomes a drawer.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { config } = useMandateApp();
  const [open, setOpen] = useState(false);

  const rail = (
    <nav aria-label="Sections" className="flex h-full flex-col gap-6 px-4 py-5">
      <Link href="/" className="flex items-center gap-2.5 px-2" onClick={() => setOpen(false)}>
        <Logo />
        <span className="grid leading-none">
          <span className="text-[15px] font-bold tracking-[0.08em]">MANDATE</span>
          <span className="mt-1 text-[11px] text-dim">Conditional authorization</span>
        </span>
      </Link>
      <ul className="grid gap-1">
        {NAV.map(({ href, label, icon: Icon, exact }) => {
          const on = active(pathname, href, exact);
          return (
            <li key={href}>
              <Link
                href={href}
                onClick={() => setOpen(false)}
                aria-current={on ? "page" : undefined}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                  on ? "bg-surface text-text" : "text-dim hover:bg-surface/60 hover:text-text"
                }`}
              >
                <Icon className={`size-4 ${on ? "text-signal" : ""}`} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="mt-auto grid gap-2 rounded-lg border border-line p-3 text-xs">
        <span className="eyebrow">Intelligent Contract</span>
        <a
          href={`${config.explorer}/address/${config.contractAddress}`}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-text hover:text-signal"
          title={config.contractAddress}
        >
          {shortAddress(config.contractAddress)}
        </a>
        <span className="text-dim">
          {config.networkName} · chain {config.chainId}
        </span>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-screen border-r border-line bg-well lg:block">{rail}</aside>

      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-ink/80" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[260px] border-r border-line bg-well">{rail}</aside>
        </div>
      ) : null}

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-ink/95 px-4 backdrop-blur sm:px-8">
          <button
            type="button"
            className="-ml-1 rounded-md p-1.5 text-dim hover:text-text lg:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
          <Link href="/" className="flex items-center gap-2 lg:hidden">
            <Logo className="size-6" />
            <span className="text-sm font-bold tracking-[0.08em]">MANDATE</span>
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <NetworkPill />
            <WalletButton />
          </div>
        </header>
        <NetworkNotices />
        <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8">{children}</main>
        <footer className="mx-auto max-w-6xl border-t border-line px-4 py-6 text-xs text-dim sm:px-8">
          Decisions shown here are read from the MANDATE Intelligent Contract on {config.networkName}. This interface
          stores nothing and decides nothing.
        </footer>
      </div>
    </div>
  );
}
