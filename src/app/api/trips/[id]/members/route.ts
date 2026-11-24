import { body, route } from "@/lib/api";
import { addMember } from "@/lib/trips";

export const POST = route<{ id: string }>(async (req, me, { id }) => {
  const b = await body<{ name: string }>(req);
  return { id: await addMember(id, me, b.name ?? "") };
});
