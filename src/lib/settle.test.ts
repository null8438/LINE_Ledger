import { describe, expect, it } from "vitest";
import { computeBalances, minimizeTransfers, splitExpense } from "./settle";

function apply(balances: Map<string, number>, transfers: { from: string; to: string; amount: number }[]) {
  const b = new Map(balances);
  for (const t of transfers) {
    b.set(t.from, b.get(t.from)! + t.amount);
    b.set(t.to, b.get(t.to)! - t.amount);
  }
  return b;
}

describe("splitExpense", () => {
  it("端数は立て替えた人が負担する", () => {
    const r = splitExpense({ amount: 1000, payerId: "a", shareIds: ["a", "b", "c"] });
    expect(r.get("a")).toBe(334);
    expect(r.get("b")).toBe(333);
    expect(r.get("c")).toBe(333);
  });
  it("立て替えた人が対象外なら先頭から1円ずつ", () => {
    const r = splitExpense({ amount: 1001, payerId: "x", shareIds: ["a", "b", "c"] });
    expect([...r.values()].reduce((s, v) => s + v, 0)).toBe(1001);
    expect(r.get("a")).toBe(334);
    expect(r.get("b")).toBe(334);
    expect(r.get("c")).toBe(333);
  });
});

describe("minimizeTransfers", () => {
  it("全員の収支が0になる", () => {
    const { balances } = computeBalances(
      ["a", "b", "c", "d"],
      [
        { amount: 12000, payerId: "a", shareIds: ["a", "b", "c", "d"] },
        { amount: 3000, payerId: "b", shareIds: ["a", "b", "c", "d"] },
        { amount: 999, payerId: "c", shareIds: ["c", "d"] },
      ],
    );
    const t = minimizeTransfers(balances);
    for (const v of apply(balances, t).values()) expect(v).toBe(0);
    expect(t.length).toBeLessThanOrEqual(3);
  });

  it("独立したペアを見つけて回数を減らす", () => {
    // a:+5 b:-5 c:+3 d:-3 → 2回で済む（貪欲だと3回になり得る並び）
    const balances = new Map([
      ["a", 500],
      ["b", -500],
      ["c", 300],
      ["d", -300],
      ["e", 700],
      ["f", -400],
      ["g", -300],
    ]);
    const t = minimizeTransfers(balances);
    for (const v of apply(balances, t).values()) expect(v).toBe(0);
    expect(t.length).toBe(4);
  });

  it("収支がすべて0なら送金なし", () => {
    expect(minimizeTransfers(new Map([["a", 0], ["b", 0]]))).toEqual([]);
  });

  it("大人数でも収支が合う（貪欲フォールバック）", () => {
    const m = new Map<string, number>();
    let total = 0;
    for (let i = 0; i < 25; i++) {
      const v = ((i * 7919) % 2001) - 1000;
      m.set(`p${i}`, v);
      total += v;
    }
    m.set("last", -total);
    const t = minimizeTransfers(m);
    for (const v of apply(m, t).values()) expect(v).toBe(0);
    expect(t.length).toBeLessThan(26);
  });
});
