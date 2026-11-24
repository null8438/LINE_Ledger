import { route } from "@/lib/api";
import { reopenTrip } from "@/lib/trips";

export const POST = route<{ id: string }>(async (_req, me, { id }) => {
  await reopenTrip(id, me);
});
