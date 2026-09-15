import type { Metadata } from "next";

import { RequestIndex } from "@/components/decision/request-index";

export const metadata: Metadata = { title: "Authorization requests" };

export default function RequestsPage() {
  return <RequestIndex />;
}
