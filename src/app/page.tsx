import { HOME_COVERS } from "@/lib/covers";
import { ShareView } from "./share/view";

export default async function Home({ searchParams }: PageProps<"/">) {
  const { error } = await searchParams;
  return <ShareView initialError={typeof error === "string" ? error : null} covers={HOME_COVERS} />;
}
