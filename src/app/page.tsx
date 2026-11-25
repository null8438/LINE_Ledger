import { metaForPath } from "@/lib/meta";
import HomeClient from "./HomeClient";

// liff.line.me/{LIFF_ID}/trips/... のリンクは ?liff.state=/trips/... 付きでここに届く
export async function generateMetadata({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const state = (await searchParams)["liff.state"];
  return metaForPath(Array.isArray(state) ? state[0] : state);
}

export default function Page() {
  return <HomeClient />;
}
