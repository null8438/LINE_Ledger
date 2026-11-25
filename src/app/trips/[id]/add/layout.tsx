import { metaForPath } from "@/lib/meta";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return metaForPath(`/trips/${id}/add`);
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
