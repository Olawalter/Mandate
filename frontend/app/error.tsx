"use client";

import { Button } from "@/components/ui/button";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="grid max-w-xl gap-4 rounded-lg border border-no/40 bg-no/10 p-6">
      <p className="eyebrow">Something went wrong</p>
      <h1 className="text-xl font-semibold">This page could not be shown.</h1>
      <p className="text-sm text-dim">
        No transaction was sent and no contract state changed. {error.message ? `Detail: ${error.message}` : ""}
      </p>
      <Button className="w-fit" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
