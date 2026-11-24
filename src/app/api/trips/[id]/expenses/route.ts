import { body, route } from "@/lib/api";
import { addExpense } from "@/lib/trips";

export const POST = route<{ id: string }>(async (req, me, { id }) => ({
  id: await addExpense(id, me, await body(req)),
}));
