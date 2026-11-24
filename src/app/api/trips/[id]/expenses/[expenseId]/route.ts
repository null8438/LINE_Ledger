import { body, route } from "@/lib/api";
import { deleteExpense, updateExpense } from "@/lib/trips";

type P = { id: string; expenseId: string };

export const PATCH = route<P>(async (req, me, { id, expenseId }) => {
  await updateExpense(id, me, expenseId, await body(req));
});

export const DELETE = route<P>(async (_req, me, { id, expenseId }) => {
  await deleteExpense(id, me, expenseId);
});
