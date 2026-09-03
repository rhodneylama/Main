import TvBoard from "@/components/TvBoard";
import { tvPayload } from "@/lib/tv";

export const dynamic = "force-dynamic";

export const metadata = { title: "Sales Floor — TV" };

export default function TvPage() {
  return <TvBoard initial={tvPayload()} />;
}
