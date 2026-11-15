import { chartSongs } from "@/lib/chart";
import { ShareView } from "./share/view";

export default async function Home({ searchParams }: PageProps<"/">) {
  const [{ error }, covers] = await Promise.all([searchParams, chartSongs()]);
  return <ShareView initialError={typeof error === "string" ? error : null} covers={covers} />;
}
