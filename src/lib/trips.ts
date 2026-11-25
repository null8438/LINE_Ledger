import { db, newId, now, type DB as Client, type Stmt as InStatement } from "./db";
import { HttpError, type Identity } from "./auth";
import { computeBalances, minimizeTransfers, type ExpenseInput } from "./settle";
import type { Expense, Member, Settlement, TripDetail, TripStatus, TripSummary } from "./types";

type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? null : String(v));

function toSummary(r: Row): TripSummary {
  return {
    id: String(r.id),
    name: String(r.name),
    startDate: s(r.start_date),
    endDate: s(r.end_date),
    status: r.status as TripStatus,
    total: Number(r.total ?? 0),
    memberCount: Number(r.member_count ?? 0),
    expenseCount: Number(r.expense_count ?? 0),
    createdAt: String(r.created_at),
    completedAt: s(r.completed_at),
  };
}

const SUMMARY_SELECT = `
  SELECT t.*,
    (SELECT COALESCE(SUM(amount),0) FROM expenses e WHERE e.trip_id = t.id) AS total,
    (SELECT COUNT(*) FROM expenses e WHERE e.trip_id = t.id) AS expense_count,
    (SELECT COUNT(*) FROM members m WHERE m.trip_id = t.id) AS member_count
  FROM trips t`;

export async function listTrips(me: Identity): Promise<TripSummary[]> {
  const c = await db();
  const rs = await c.execute({
    sql: `${SUMMARY_SELECT}
      WHERE t.id IN (SELECT trip_id FROM members WHERE user_id = ?)
      ORDER BY COALESCE(t.start_date, t.created_at) DESC, t.created_at DESC`,
    args: [me.userId],
  });
  const trips = rs.rows.map((r) => toSummary(r as Row));
  if (trips.length) {
    const mem = await c.execute({
      sql: `SELECT trip_id, name, picture_url FROM members WHERE trip_id IN (${trips.map(() => "?").join(",")}) ORDER BY created_at`,
      args: trips.map((t) => t.id),
    });
    for (const t of trips) {
      t.faces = mem.rows
        .filter((m) => m.trip_id === t.id)
        .map((m) => ({ name: String(m.name), pictureUrl: s(m.picture_url) }));
    }
  }
  return trips;
}

export async function createTrip(
  me: Identity,
  input: { name: string; startDate?: string | null; endDate?: string | null; myName?: string; memberNames?: string[] },
): Promise<string> {
  const name = input.name.trim();
  if (!name) throw new HttpError(400, "旅行名を入力してください");
  const myName = (me.name ?? input.myName ?? "").trim();
  if (!myName) throw new HttpError(400, "あなたの名前を入力してください");
  const id = newId();
  const t = now();
  const stmts: InStatement[] = [
    {
      sql: "INSERT INTO trips (id, name, start_date, end_date, status, created_at) VALUES (?, ?, ?, ?, 'active', ?)",
      args: [id, name, input.startDate || null, input.endDate || null, t],
    },
    {
      sql: "INSERT INTO members (id, trip_id, name, user_id, picture_url, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      args: [newId(), id, myName, me.userId, me.picture ?? null, t],
    },
  ];
  for (const n of new Set((input.memberNames ?? []).map((x) => x.trim()).filter(Boolean))) {
    if (n === myName) continue;
    stmts.push({
      sql: "INSERT INTO members (id, trip_id, name, created_at) VALUES (?, ?, ?, ?)",
      args: [newId(), id, n, t],
    });
  }
  await (await db()).batch(stmts, "write");
  return id;
}

async function tripRow(c: Client, tripId: string): Promise<Row> {
  const rs = await c.execute({ sql: `${SUMMARY_SELECT} WHERE t.id = ?`, args: [tripId] });
  if (!rs.rows.length) throw new HttpError(404, "旅行が見つかりません");
  return rs.rows[0] as Row;
}

async function loadExpenses(c: Client, tripId: string): Promise<Expense[]> {
  const [ex, sh] = await Promise.all([
    c.execute({ sql: "SELECT * FROM expenses WHERE trip_id = ? ORDER BY created_at DESC", args: [tripId] }),
    c.execute({
      sql: "SELECT es.* FROM expense_shares es JOIN expenses e ON e.id = es.expense_id WHERE e.trip_id = ?",
      args: [tripId],
    }),
  ]);
  const shares = new Map<string, string[]>();
  for (const r of sh.rows) {
    const k = String(r.expense_id);
    shares.set(k, [...(shares.get(k) ?? []), String(r.member_id)]);
  }
  return ex.rows.map((r) => ({
    id: String(r.id),
    title: String(r.title),
    amount: Number(r.amount),
    payerId: String(r.payer_id),
    shareIds: shares.get(String(r.id)) ?? [],
    createdBy: s(r.created_by),
    createdAt: String(r.created_at),
  }));
}

export async function getTrip(tripId: string, me: Identity): Promise<TripDetail> {
  const c = await db();
  const [row, mem, expenses, st] = await Promise.all([
    tripRow(c, tripId),
    c.execute({ sql: "SELECT * FROM members WHERE trip_id = ? ORDER BY created_at, rowid", args: [tripId] }),
    loadExpenses(c, tripId),
    c.execute({ sql: "SELECT * FROM settlements WHERE trip_id = ? ORDER BY amount DESC", args: [tripId] }),
  ]);
  let meId: string | null = null;
  const members: Member[] = mem.rows.map((r) => {
    if (r.user_id === me.userId) meId = String(r.id);
    return { id: String(r.id), name: String(r.name), pictureUrl: s(r.picture_url), linked: r.user_id != null };
  });
  const inputs: ExpenseInput[] = expenses.map((e) => ({ amount: e.amount, payerId: e.payerId, shareIds: e.shareIds }));
  const { paid, owed, balances } = computeBalances(
    members.map((m) => m.id),
    inputs,
  );
  const bal: TripDetail["balances"] = {};
  for (const m of members) {
    bal[m.id] = { paid: paid.get(m.id) ?? 0, owed: owed.get(m.id) ?? 0, balance: balances.get(m.id) ?? 0 };
  }
  const settlements: Settlement[] = st.rows.map((r) => ({
    id: String(r.id),
    fromId: String(r.from_id),
    toId: String(r.to_id),
    amount: Number(r.amount),
    paidAt: s(r.paid_at),
  }));
  const preview =
    row.status === "active"
      ? minimizeTransfers(balances).map((t) => ({ fromId: t.from, toId: t.to, amount: t.amount }))
      : [];
  return { ...toSummary(row), members, expenses, balances: bal, settlements, preview, meId };
}

/** LINEユーザー（またはゲスト）を旅行のメンバーとして紐づける。 */
export async function joinTrip(
  tripId: string,
  me: Identity,
  input: { memberId?: string; name?: string },
): Promise<string> {
  const c = await db();
  await tripRow(c, tripId);
  const existing = await c.execute({
    sql: "SELECT id FROM members WHERE trip_id = ? AND user_id = ?",
    args: [tripId, me.userId],
  });
  if (existing.rows.length) return String(existing.rows[0].id);

  if (input.memberId) {
    // まだ誰とも紐づいていないメンバー（手動で追加された名前）を自分として引き継ぐ
    const rs = await c.execute({
      sql: `UPDATE members SET user_id = ?, picture_url = COALESCE(?, picture_url)
            WHERE id = ? AND trip_id = ? AND user_id IS NULL`,
      args: [me.userId, me.picture ?? null, input.memberId, tripId],
    });
    if (!rs.rowsAffected) throw new HttpError(409, "そのメンバーはすでに他の人と紐づいています");
    return input.memberId;
  }
  const name = (input.name ?? me.name ?? "").trim();
  if (!name) throw new HttpError(400, "名前を入力してください");
  const id = newId();
  await c.execute({
    sql: "INSERT INTO members (id, trip_id, name, user_id, picture_url, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    args: [id, tripId, name, me.userId, me.picture ?? null, now()],
  });
  return id;
}

async function requireMember(c: Client, tripId: string, me: Identity): Promise<string> {
  const rs = await c.execute({
    sql: "SELECT id FROM members WHERE trip_id = ? AND user_id = ?",
    args: [tripId, me.userId],
  });
  if (!rs.rows.length) throw new HttpError(403, "この旅行に参加してから操作してください");
  return String(rs.rows[0].id);
}

async function requireStatus(c: Client, tripId: string, allowed: TripStatus[]) {
  const row = await tripRow(c, tripId);
  if (!allowed.includes(row.status as TripStatus)) {
    throw new HttpError(409, row.status === "active" ? "まだ会計されていません" : "会計済みのため変更できません。「会計をやり直す」から戻してください");
  }
  return row;
}

export async function updateTrip(
  tripId: string,
  me: Identity,
  input: { name?: string; startDate?: string | null; endDate?: string | null },
) {
  const c = await db();
  await requireMember(c, tripId, me);
  const row = await tripRow(c, tripId);
  const name = input.name?.trim() || String(row.name);
  await c.execute({
    sql: "UPDATE trips SET name = ?, start_date = ?, end_date = ? WHERE id = ?",
    args: [
      name,
      input.startDate !== undefined ? input.startDate || null : s(row.start_date),
      input.endDate !== undefined ? input.endDate || null : s(row.end_date),
      tripId,
    ],
  });
}

export async function deleteTrip(tripId: string, me: Identity) {
  const c = await db();
  await requireMember(c, tripId, me);
  await c.batch(
    [
      { sql: "DELETE FROM settlements WHERE trip_id = ?", args: [tripId] },
      {
        sql: "DELETE FROM expense_shares WHERE expense_id IN (SELECT id FROM expenses WHERE trip_id = ?)",
        args: [tripId],
      },
      { sql: "DELETE FROM expenses WHERE trip_id = ?", args: [tripId] },
      { sql: "DELETE FROM members WHERE trip_id = ?", args: [tripId] },
      { sql: "DELETE FROM trips WHERE id = ?", args: [tripId] },
    ],
    "write",
  );
}

export async function addMember(tripId: string, me: Identity, name: string): Promise<string> {
  const c = await db();
  await requireMember(c, tripId, me);
  await requireStatus(c, tripId, ["active"]);
  const n = name.trim();
  if (!n) throw new HttpError(400, "名前を入力してください");
  const id = newId();
  await c.execute({
    sql: "INSERT INTO members (id, trip_id, name, created_at) VALUES (?, ?, ?, ?)",
    args: [id, tripId, n, now()],
  });
  return id;
}

export async function renameMember(tripId: string, me: Identity, memberId: string, name: string) {
  const c = await db();
  await requireMember(c, tripId, me);
  const n = name.trim();
  if (!n) throw new HttpError(400, "名前を入力してください");
  await c.execute({ sql: "UPDATE members SET name = ? WHERE id = ? AND trip_id = ?", args: [n, memberId, tripId] });
}

export async function removeMember(tripId: string, me: Identity, memberId: string) {
  const c = await db();
  await requireMember(c, tripId, me);
  await requireStatus(c, tripId, ["active"]);
  const used = await c.execute({
    sql: `SELECT 1 FROM expenses WHERE trip_id = ? AND payer_id = ?
          UNION ALL SELECT 1 FROM expense_shares es JOIN expenses e ON e.id = es.expense_id
          WHERE e.trip_id = ? AND es.member_id = ? LIMIT 1`,
    args: [tripId, memberId, tripId, memberId],
  });
  if (used.rows.length) throw new HttpError(409, "支出に関わっているメンバーは削除できません");
  await c.execute({ sql: "DELETE FROM members WHERE id = ? AND trip_id = ?", args: [memberId, tripId] });
}

type ExpenseBody = { title?: string; amount?: number; payerId?: string; shareIds?: string[] };

async function validateExpense(c: Client, tripId: string, body: ExpenseBody) {
  const title = (body.title ?? "").trim();
  const amount = Math.round(Number(body.amount));
  if (!title) throw new HttpError(400, "項目を入力してください");
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100_000_000) throw new HttpError(400, "金額が正しくありません");
  const mem = await c.execute({ sql: "SELECT id FROM members WHERE trip_id = ?", args: [tripId] });
  const ids = new Set(mem.rows.map((r) => String(r.id)));
  if (!body.payerId || !ids.has(body.payerId)) throw new HttpError(400, "立て替えた人を選んでください");
  const shareIds = [...new Set(body.shareIds ?? [])].filter((x) => ids.has(x));
  if (!shareIds.length) throw new HttpError(400, "割り勘する人を1人以上選んでください");
  return { title, amount, payerId: body.payerId, shareIds };
}

export async function addExpense(tripId: string, me: Identity, body: ExpenseBody): Promise<string> {
  const c = await db();
  const myId = await requireMember(c, tripId, me);
  await requireStatus(c, tripId, ["active"]);
  const v = await validateExpense(c, tripId, body);
  const id = newId();
  await c.batch(
    [
      {
        sql: "INSERT INTO expenses (id, trip_id, title, amount, payer_id, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        args: [id, tripId, v.title, v.amount, v.payerId, myId, now()],
      },
      ...v.shareIds.map((m) => ({ sql: "INSERT INTO expense_shares (expense_id, member_id) VALUES (?, ?)", args: [id, m] })),
    ],
    "write",
  );
  return id;
}

export async function updateExpense(tripId: string, me: Identity, expenseId: string, body: ExpenseBody) {
  const c = await db();
  await requireMember(c, tripId, me);
  await requireStatus(c, tripId, ["active"]);
  const v = await validateExpense(c, tripId, body);
  const rs = await c.execute({
    sql: "UPDATE expenses SET title = ?, amount = ?, payer_id = ? WHERE id = ? AND trip_id = ?",
    args: [v.title, v.amount, v.payerId, expenseId, tripId],
  });
  if (!rs.rowsAffected) throw new HttpError(404, "支出が見つかりません");
  await c.batch(
    [
      { sql: "DELETE FROM expense_shares WHERE expense_id = ?", args: [expenseId] },
      ...v.shareIds.map((m) => ({
        sql: "INSERT INTO expense_shares (expense_id, member_id) VALUES (?, ?)",
        args: [expenseId, m],
      })),
    ],
    "write",
  );
}

export async function deleteExpense(tripId: string, me: Identity, expenseId: string) {
  const c = await db();
  await requireMember(c, tripId, me);
  await requireStatus(c, tripId, ["active"]);
  await c.batch(
    [
      { sql: "DELETE FROM expense_shares WHERE expense_id = ?", args: [expenseId] },
      { sql: "DELETE FROM expenses WHERE id = ? AND trip_id = ?", args: [expenseId, tripId] },
    ],
    "write",
  );
}

/** 会計：その時点の収支から最小回数の送金案を確定する。 */
export async function settleTrip(tripId: string, me: Identity) {
  const c = await db();
  await requireMember(c, tripId, me);
  await requireStatus(c, tripId, ["active"]);
  const [mem, expenses] = await Promise.all([
    c.execute({ sql: "SELECT id FROM members WHERE trip_id = ?", args: [tripId] }),
    loadExpenses(c, tripId),
  ]);
  const { balances } = computeBalances(
    mem.rows.map((r) => String(r.id)),
    expenses,
  );
  const transfers = minimizeTransfers(balances);
  const t = now();
  await c.batch(
    [
      { sql: "DELETE FROM settlements WHERE trip_id = ?", args: [tripId] },
      ...transfers.map((x) => ({
        sql: "INSERT INTO settlements (id, trip_id, from_id, to_id, amount) VALUES (?, ?, ?, ?, ?)",
        args: [newId(), tripId, x.from, x.to, x.amount],
      })),
      {
        sql: "UPDATE trips SET status = ?, settled_at = ?, completed_at = ? WHERE id = ?",
        args: transfers.length ? ["settling", t, null, tripId] : ["completed", t, t, tripId],
      },
    ],
    "write",
  );
}

/** 会計を取り消して入力できる状態に戻す。 */
export async function reopenTrip(tripId: string, me: Identity) {
  const c = await db();
  await requireMember(c, tripId, me);
  await requireStatus(c, tripId, ["settling", "completed"]);
  await c.batch(
    [
      { sql: "DELETE FROM settlements WHERE trip_id = ?", args: [tripId] },
      {
        sql: "UPDATE trips SET status = 'active', settled_at = NULL, completed_at = NULL WHERE id = ?",
        args: [tripId],
      },
    ],
    "write",
  );
}

/** 送金の支払い済みを切り替える。全員払い終えたら旅行を完了にする。 */
export async function markSettlement(tripId: string, me: Identity, settlementId: string, paid: boolean) {
  const c = await db();
  await requireMember(c, tripId, me);
  await requireStatus(c, tripId, ["settling", "completed"]);
  const rs = await c.execute({
    sql: "UPDATE settlements SET paid_at = ? WHERE id = ? AND trip_id = ?",
    args: [paid ? now() : null, settlementId, tripId],
  });
  if (!rs.rowsAffected) throw new HttpError(404, "精算が見つかりません");
  const left = await c.execute({
    sql: "SELECT COUNT(*) AS n FROM settlements WHERE trip_id = ? AND paid_at IS NULL",
    args: [tripId],
  });
  const done = Number(left.rows[0].n) === 0;
  await c.execute({
    sql: "UPDATE trips SET status = ?, completed_at = ? WHERE id = ?",
    args: [done ? "completed" : "settling", done ? now() : null, tripId],
  });
}
