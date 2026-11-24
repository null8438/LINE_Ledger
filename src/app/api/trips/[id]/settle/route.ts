import { route } from "@/lib/api";
import { settleTrip } from "@/lib/trips";

export const POST = route<{ id: string }>(async (_req, me, { id }) => {
  await settleTrip(id, me);
});
