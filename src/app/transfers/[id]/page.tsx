import { TransferView } from "@/components/TransferView";

export default async function Page({ params }: PageProps<"/transfers/[id]">) {
  const { id } = await params;
  return <TransferView id={id} />;
}
