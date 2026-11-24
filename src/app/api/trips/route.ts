import { body, route } from "@/lib/api";
import { createTrip, listTrips } from "@/lib/trips";

export const GET = route(async (_req, me) => ({ trips: await listTrips(me) }));

export const POST = route(async (req, me) => {
  const b = await body<{ name: string; startDate?: string; endDate?: string; myName?: string; memberNames?: string[] }>(req);
  return { id: await createTrip(me, b) };
});
