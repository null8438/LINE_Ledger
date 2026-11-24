import { body, route } from "@/lib/api";
import { joinTrip } from "@/lib/trips";

export const POST = route<{ id: string }>(async (req, me, { id }) => ({
  memberId: await joinTrip(id, me, await body(req)),
}));
