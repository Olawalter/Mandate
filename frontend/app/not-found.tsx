import Link from "next/link";

export default function NotFound() {
  return (
    <div className="grid max-w-xl gap-3">
      <p className="eyebrow">Not found</p>
      <h1 className="text-2xl font-semibold">There is no page here.</h1>
      <p className="text-sm text-dim">Mandates and decision receipts live under their own numbers.</p>
      <div className="flex gap-4 text-sm">
        <Link href="/" className="text-signal hover:text-signal-hover">
          Overview
        </Link>
        <Link href="/mandates" className="text-signal hover:text-signal-hover">
          Mandates
        </Link>
      </div>
    </div>
  );
}
