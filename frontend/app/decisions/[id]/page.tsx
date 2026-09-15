import { DecisionReceipt } from "@/components/decision/decision-receipt";

export async function generateMetadata({ params }: PageProps<"/decisions/[id]">) {
  const { id } = await params;
  return { title: `Decision receipt #${id}` };
}

export default async function DecisionPage({ params }: PageProps<"/decisions/[id]">) {
  const { id } = await params;
  return <DecisionReceipt id={id} />;
}
