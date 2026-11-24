import { body, route } from "@/lib/api";
import { markSettlement } from "@/lib/trips";

export const PATCH = route<{ id: string; settlementId: string }>(async (req, me, { id, settlementId }) => {
  const b = await body<{ paid: boolean }>(req);
  await markSettlement(id, me, settlementId, !!b.paid);
});
