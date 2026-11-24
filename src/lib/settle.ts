// 割り勘と精算（最小送金回数）の計算ロジック。金額はすべて整数（円）。

export type ExpenseInput = {
  amount: number;
  payerId: string;
  shareIds: string[]; // 割り勘の対象者
};

export type Transfer = { from: string; to: string; amount: number };

/**
 * 1件の支出を対象者で割った負担額を返す。
 * 割り切れない端数は、立て替えた本人が対象に含まれていれば本人が負担し、
 * 含まれていなければ対象者の並び順で先頭から1円ずつ負担する。
 */
export function splitExpense(e: ExpenseInput): Map<string, number> {
  const ids = Array.from(new Set(e.shareIds));
  const result = new Map<string, number>();
  if (ids.length === 0) return result;
  const base = Math.floor(e.amount / ids.length);
  let rest = e.amount - base * ids.length;
  for (const id of ids) result.set(id, base);
  if (rest > 0 && result.has(e.payerId)) {
    result.set(e.payerId, base + rest);
    rest = 0;
  }
  for (const id of ids) {
    if (rest <= 0) break;
    result.set(id, result.get(id)! + 1);
    rest--;
  }
  return result;
}

/** 各メンバーの収支（＋なら受け取る側、−なら払う側）。 */
export function computeBalances(memberIds: string[], expenses: ExpenseInput[]) {
  const paid = new Map<string, number>();
  const owed = new Map<string, number>();
  for (const id of memberIds) {
    paid.set(id, 0);
    owed.set(id, 0);
  }
  for (const e of expenses) {
    paid.set(e.payerId, (paid.get(e.payerId) ?? 0) + e.amount);
    for (const [id, v] of splitExpense(e)) owed.set(id, (owed.get(id) ?? 0) + v);
  }
  const balances = new Map<string, number>();
  for (const id of new Set([...paid.keys(), ...owed.keys()])) {
    balances.set(id, (paid.get(id) ?? 0) - (owed.get(id) ?? 0));
  }
  return { paid, owed, balances };
}

/** グループ内を「最大の債務者 → 最大の債権者」で貪欲に解消（グループ人数−1回で済む）。 */
function greedy(entries: [string, number][]): Transfer[] {
  const debtors = entries.filter(([, v]) => v < 0).map(([id, v]) => ({ id, v: -v }));
  const creditors = entries.filter(([, v]) => v > 0).map(([id, v]) => ({ id, v }));
  const out: Transfer[] = [];
  while (debtors.length && creditors.length) {
    debtors.sort((a, b) => b.v - a.v);
    creditors.sort((a, b) => b.v - a.v);
    const d = debtors[0];
    const c = creditors[0];
    const amt = Math.min(d.v, c.v);
    out.push({ from: d.id, to: c.id, amount: amt });
    d.v -= amt;
    c.v -= amt;
    if (d.v === 0) debtors.shift();
    if (c.v === 0) creditors.shift();
  }
  return out;
}

const EXACT_LIMIT = 18;

/**
 * 送金回数が最小になる精算案を求める。
 * 最小回数 = (収支が0でない人数) − (合計0になるグループに分割できる最大数)。
 * 人数が少なければビットDPで厳密解、多ければ貪欲法で近似する。
 */
export function minimizeTransfers(balances: Map<string, number>): Transfer[] {
  const entries = [...balances.entries()].filter(([, v]) => v !== 0);
  const n = entries.length;
  if (n === 0) return [];
  if (n > EXACT_LIMIT) return greedy(entries);

  const size = 1 << n;
  const sum = new Int32Array(size);
  const dp = new Int16Array(size);
  for (let mask = 1; mask < size; mask++) {
    const low = mask & -mask;
    const bit = 31 - Math.clz32(low);
    sum[mask] = sum[mask ^ low] + entries[bit][1];
    let best = 0;
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) {
        const v = dp[mask ^ (1 << i)];
        if (v > best) best = v;
      }
    }
    dp[mask] = best + (sum[mask] === 0 ? 1 : 0);
  }

  // 復元: 全体から1人ずつ外していき、合計0になる地点でグループを区切る
  const groups: number[] = [];
  let mask = size - 1;
  let groupStart = mask;
  while (mask) {
    const add = sum[mask] === 0 ? 1 : 0;
    let next = -1;
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i) && dp[mask ^ (1 << i)] + add === dp[mask]) {
        next = mask ^ (1 << i);
        break;
      }
    }
    if (next === -1) break; // 理論上起きない
    if (sum[next] === 0) {
      groups.push(groupStart ^ next);
      groupStart = next;
    }
    mask = next;
  }

  const transfers: Transfer[] = [];
  for (const g of groups) {
    const members = entries.filter((_, i) => g & (1 << i));
    transfers.push(...greedy(members));
  }
  return transfers.sort((a, b) => b.amount - a.amount);
}
