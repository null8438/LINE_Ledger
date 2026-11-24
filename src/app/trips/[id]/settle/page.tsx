"use client";

import { use, useState } from "react";
import { api, appUrl, shareToLine, yen } from "@/lib/client";
import type { Member, TripDetail } from "@/lib/types";
import { Avatar, Header, TripGate, useToast } from "@/components/ui";

export default function SettlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <TripGate id={id}>{(trip, reload) => <SettleView trip={trip} reload={reload} />}</TripGate>;
}

function TransferRow({
  from,
  to,
  amount,
  mine,
  paid,
  onToggle,
}: {
  from?: Member;
  to?: Member;
  amount: number;
  mine: boolean;
  paid?: boolean;
  onToggle?: () => void;
}) {
  return (
    <div className={`transfer ${paid ? "paid" : ""} ${mine && !paid ? "mine" : ""}`}>
      <div className="who">
        <Avatar member={from} size={40} />
        <span>{from?.name}</span>
      </div>
      <div className="arrow">
        <span className="amount">{yen(amount)}</span>
        <div className="line" />
        <span className="muted" style={{ fontSize: 11 }}>
          {paid ? "支払い済み" : "支払う"}
        </span>
      </div>
      <div className="who">
        <Avatar member={to} size={40} />
        <span>{to?.name}</span>
      </div>
      {onToggle && (
        <button className={`check ${paid ? "on" : ""}`} onClick={onToggle} aria-label={paid ? "未払いに戻す" : "支払い完了にする"}>
          {paid ? "✓" : ""}
        </button>
      )}
    </div>
  );
}

function SettleView({ trip, reload }: { trip: TripDetail; reload: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [toast, showToast] = useToast();
  const byId = new Map(trip.members.map((m) => [m.id, m]));
  const back = `/trips/${trip.id}`;
  const per = trip.members.length ? Math.round(trip.total / trip.members.length) : 0;

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      await reload();
    } catch (e) {
      showToast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const settle = () => {
    if (!confirm("この内容で会計を確定しますか？\n確定後は立て替えの追加・編集ができなくなります（やり直しは可能）。")) return;
    run(() => api(`/api/trips/${trip.id}/settle`, { method: "POST" }));
  };
  const reopen = () => {
    if (!confirm("会計を取り消して、立て替えを入力できる状態に戻しますか？\n支払い済みのチェックもリセットされます。")) return;
    run(() => api(`/api/trips/${trip.id}/reopen`, { method: "POST" }));
  };
  const toggle = (sid: string, paid: boolean) =>
    run(() => api(`/api/trips/${trip.id}/settlements/${sid}`, { method: "PATCH", body: { paid } }));

  const shareResult = async () => {
    const lines = trip.settlements.map(
      (s) => `${s.paidAt ? "✅" : "・"} ${byId.get(s.fromId)?.name} → ${byId.get(s.toId)?.name}  ${yen(s.amount)}`,
    );
    const text = [`【${trip.name}】の精算`, `合計 ${yen(trip.total)}（${trip.members.length}人）`, "", ...lines, "", "支払ったらアプリでチェックしてね！", appUrl(`/trips/${trip.id}/settle`)].join("\n");
    const r = await shareToLine(text);
    if (r === "shared") showToast("LINEに送りました");
    if (r === "copied") showToast("精算内容をコピーしました");
  };

  const summary = (
    <div className="list" style={{ marginTop: 8 }}>
      {trip.members.map((m) => {
        const b = trip.balances[m.id];
        return (
          <div key={m.id} className="row">
            <Avatar member={m} />
            <div className="grow">
              <div className="title">{m.name}</div>
              <div className="sub">
                立て替え {yen(b.paid)} ・ 負担 {yen(b.owed)}
              </div>
            </div>
            <div className={`amount ${b.balance > 0 ? "plus" : b.balance < 0 ? "minus" : "muted"}`}>
              {b.balance > 0 ? `+${yen(b.balance)}` : b.balance < 0 ? `-${yen(-b.balance)}` : "±0"}
            </div>
          </div>
        );
      })}
    </div>
  );

  // 会計前：精算案のプレビュー
  if (trip.status === "active") {
    return (
      <div className="container">
        <Header title="会計" back={back} />
        <div className="stat-grid">
          <div className="stat">
            <div className="k">合計</div>
            <div className="v">{yen(trip.total)}</div>
          </div>
          <div className="stat">
            <div className="k">1人あたり（目安）</div>
            <div className="v">{yen(per)}</div>
          </div>
        </div>

        <div className="section-title">最適な精算方法（{trip.preview.length}回の送金）</div>
        {trip.preview.length === 0 ? (
          <div className="card center muted">精算の必要はありません 👍</div>
        ) : (
          <div className="list">
            {trip.preview.map((t, i) => (
              <TransferRow key={i} from={byId.get(t.fromId)} to={byId.get(t.toId)} amount={t.amount} mine={t.fromId === trip.meId} />
            ))}
          </div>
        )}
        <p className="muted" style={{ fontSize: 12, margin: "8px 4px" }}>
          送金の回数が最も少なくなる組み合わせを計算しています。
        </p>

        <div className="section-title">メンバーごとの収支</div>
        {summary}

        <div className="fab-bar">
          <div className="inner">
            <button className="btn primary" onClick={settle} disabled={busy || trip.expenses.length === 0}>
              この内容で会計を確定
            </button>
          </div>
        </div>
        {toast}
      </div>
    );
  }

  // 会計後：支払い状況
  const paidCount = trip.settlements.filter((s) => s.paidAt).length;
  const total = trip.settlements.length;
  const mine = trip.settlements.filter((s) => s.fromId === trip.meId && !s.paidAt);
  const incoming = trip.settlements.filter((s) => s.toId === trip.meId && !s.paidAt);

  return (
    <div className="container">
      <Header
        title="精算"
        back={back}
        right={
          total > 0 ? (
            <button className="btn small primary" onClick={shareResult}>
              LINEで送る
            </button>
          ) : undefined
        }
      />

      {trip.status === "completed" ? (
        <div className="card center" style={{ padding: 24 }}>
          <div style={{ fontSize: 44 }}>🎉</div>
          <p style={{ fontWeight: 800, fontSize: 18, margin: "4px 0" }}>精算完了！</p>
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>
            全員の支払いが終わりました。この旅行は記録に移動しました。
          </p>
        </div>
      ) : (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <b>支払い状況</b>
            <span className="amount">
              {paidCount} / {total} 件
            </span>
          </div>
          <div style={{ height: 8, background: "var(--line)", borderRadius: 4, marginTop: 8, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${total ? (paidCount / total) * 100 : 0}%`, background: "var(--accent)", transition: "width .3s" }} />
          </div>
          {mine.length > 0 && (
            <p style={{ margin: "12px 0 0", fontSize: 14 }}>
              あなたは <b>{mine.map((s) => `${byId.get(s.toId)?.name}に${yen(s.amount)}`).join("、")}</b> 支払ってください。払ったら右の◯をタップ！
            </p>
          )}
          {mine.length === 0 && incoming.length > 0 && (
            <p style={{ margin: "12px 0 0", fontSize: 14 }}>
              あなたは <b>{incoming.map((s) => `${byId.get(s.fromId)?.name}から${yen(s.amount)}`).join("、")}</b> 受け取ります。
            </p>
          )}
        </div>
      )}

      <div className="section-title">送金リスト</div>
      {total === 0 ? (
        <div className="card center muted">精算の必要はありませんでした 👍</div>
      ) : (
        <div className="list">
          {trip.settlements.map((s) => (
            <TransferRow
              key={s.id}
              from={byId.get(s.fromId)}
              to={byId.get(s.toId)}
              amount={s.amount}
              mine={s.fromId === trip.meId}
              paid={!!s.paidAt}
              onToggle={() => !busy && toggle(s.id, !s.paidAt)}
            />
          ))}
        </div>
      )}

      <div className="section-title">メンバーごとの収支（合計 {yen(trip.total)}）</div>
      {summary}

      <button className="btn danger block" style={{ marginTop: 24 }} onClick={reopen} disabled={busy}>
        会計をやり直す
      </button>
      {toast}
    </div>
  );
}
