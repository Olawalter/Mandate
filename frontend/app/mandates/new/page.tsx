import type { Metadata } from "next";

import { MandateWizard } from "@/components/mandate/mandate-wizard";

export const metadata: Metadata = { title: "New mandate" };

export default function NewMandatePage() {
  return <MandateWizard />;
}
