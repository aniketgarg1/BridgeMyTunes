import { SwitchView } from "./view";

export default async function Page({ searchParams }: PageProps<"/switch">) {
  const { error } = await searchParams;
  return <SwitchView initialError={typeof error === "string" ? error : null} />;
}
