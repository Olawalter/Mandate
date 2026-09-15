import type { Metadata } from "next";

import { MandateIndex } from "@/components/mandate/mandate-index";

export const metadata: Metadata = { title: "Mandates" };

export default function MandatesPage() {
  return <MandateIndex />;
}
