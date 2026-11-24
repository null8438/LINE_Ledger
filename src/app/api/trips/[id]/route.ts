import { body, route } from "@/lib/api";
import { deleteTrip, getTrip, updateTrip } from "@/lib/trips";

type P = { id: string };

export const GET = route<P>(async (_req, me, { id }) => getTrip(id, me));

export const PATCH = route<P>(async (req, me, { id }) => {
  await updateTrip(id, me, await body(req));
});

export const DELETE = route<P>(async (_req, me, { id }) => {
  await deleteTrip(id, me);
});
