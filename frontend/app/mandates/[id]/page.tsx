import { Suspense } from "react";

import { MandateDetail } from "@/components/mandate/mandate-detail";

export async function generateMetadata({ params }: PageProps<"/mandates/[id]">) {
  const { id } = await params;
  return { title: `Mandate #${id}` };
}

export default async function MandatePage({ params }: PageProps<"/mandates/[id]">) {
  const { id } = await params;
  return (
    <Suspense>
      <MandateDetail id={id} />
    </Suspense>
  );
}
