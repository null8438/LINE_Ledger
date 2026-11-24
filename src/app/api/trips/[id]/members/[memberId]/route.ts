import { body, route } from "@/lib/api";
import { removeMember, renameMember } from "@/lib/trips";

type P = { id: string; memberId: string };

export const PATCH = route<P>(async (req, me, { id, memberId }) => {
  const b = await body<{ name: string }>(req);
  await renameMember(id, me, memberId, b.name ?? "");
});

export const DELETE = route<P>(async (_req, me, { id, memberId }) => {
  await removeMember(id, me, memberId);
});
