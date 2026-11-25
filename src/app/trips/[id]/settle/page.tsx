"use client";

import { use, useState } from "react";
import { api, appUrl, shareToLine, yen } from "@/lib/client";
import type { TripDetail } from "@/lib/types";
import { signed, TopBar, TripGate, useToast } from "@/components/ui";

export default function SettlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <TripGate id={id}>{(trip, reload) => <SettleView trip={trip} reload={reload} />}</TripGate>;
}

function SettleView({ trip, reload }: { trip: TripDetail; reload: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [toast, showToast] = useToast();
  const name = (id: string) => trip.members.find((m) => m.id === id)?.name ?? "";
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
    if (!confirm("会計を確定しますか？確定後は立て替えの追加・編集ができなくなります。")) return;
    run(() => api(`/api/trips/${trip.id}/settle`, { method: "POST" }));
  };
  const reopen = () => {
    if (!confirm("会計を取り消して入力できる状態に戻しますか？支払い済みのチェックも消えます。")) return;
    run(() => api(`/api/trips/${trip.id}/reopen`, { method: "POST" }));
  };
  const toggle = (sid: string, paid: boolean) => {
    if (!busy) run(() => api(`/api/trips/${trip.id}/settlements/${sid}`, { method: "PATCH", body: { paid } }));
  };

  const shareResult = async () => {
    const lines = trip.settlements.map((s) => `${s.paidAt ? "済" : "未"} ${name(s.fromId)} → ${name(s.toId)} ${yen(s.amount)}`);
    const text = [`${trip.name} 精算`, `合計 ${yen(trip.total)}（${trip.members.length}人）`, ...lines, appUrl(`/trips/${trip.id}/settle`)].join("\n");
    const r = await shareToLine(text);
    if (r === "shared") showToast("送信しました");
    if (r === "copied") showToast("コピーしました");
  };

  const balances = (
    <>
      <div className="label" style={{ marginTop: 20 }}>
        メンバー別
      </div>
      <div className="rows">
        {trip.members.map((m) => {
          const b = trip.balances[m.id];
          return (
            <div key={m.id}>
              <div className="grow">
                <div className="t">{m.name}</div>
                <div className="s">
                  支払 {yen(b.paid)}　負担 {yen(b.owed)}
                </div>
              </div>
              <div className={`amt ${b.balance > 0 ? "plus" : b.balance < 0 ? "minus" : "muted"}`}>{signed(b.balance, yen)}</div>
            </div>
          );
        })}
      </div>
    </>
  );

  const stats = (
    <div className="stats">
      <div>
        <div className="k">合計</div>
        <div className="v">{yen(trip.total)}</div>
      </div>
      <div>
        <div className="k">1人あたり（{trip.members.length}人）</div>
        <div className="v">{yen(per)}</div>
      </div>
    </div>
  );

  if (trip.status === "active") {
    return (
      <div className="page">
        <TopBar title="会計" back={back} />
        {stats}
        <div className="label" style={{ marginTop: 20 }}>
          送金（{trip.preview.length}回）
        </div>
        {trip.preview.length === 0 ? (
          <div className="empty">送金は不要です</div>
        ) : (
          <div className="rows">
            {trip.preview.map((t, i) => (
              <div key={i}>
                <div className="grow t">
                  <b style={t.fromId === trip.meId ? { color: "var(--danger)" } : undefined}>{name(t.fromId)}</b>
                  <span className="muted"> → </span>
                  {name(t.toId)}
                </div>
                <div className="amt">{yen(t.amount)}</div>
              </div>
            ))}
          </div>
        )}
        {balances}
        <div className="bottombar">
          <div className="in">
            <button className="btn primary" onClick={settle} disabled={busy || trip.expenses.length === 0}>
              会計を確定
            </button>
          </div>
        </div>
        {toast}
      </div>
    );
  }

  const paidCount = trip.settlements.filter((s) => s.paidAt).length;
  const total = trip.settlements.length;

  return (
    <div className="page no-bar">
      <TopBar
        title="精算"
        back={back}
        right={
          total > 0 ? (
            <button className="btn sm" onClick={shareResult}>
              LINEで共有
            </button>
          ) : undefined
        }
      />
      {stats}
      <div className="label" style={{ marginTop: 20 }}>
        <span>{trip.status === "completed" ? "全員支払い済み" : "支払ったらチェック"}</span>
        <span className="num">
          {paidCount}/{total}
        </span>
      </div>
      <div className="progress" style={{ marginBottom: 8 }}>
        <div style={{ width: `${total ? (paidCount / total) * 100 : 100}%` }} />
      </div>
      {total === 0 ? (
        <div className="empty">送金は不要でした</div>
      ) : (
        <div className="rows">
          {trip.settlements.map((s) => (
            <div key={s.id} onClick={() => toggle(s.id, !s.paidAt)} style={{ cursor: "pointer", opacity: s.paidAt ? 0.5 : 1 }}>
              <span className={`check ${s.paidAt ? "on" : ""}`}>{s.paidAt ? "✓" : ""}</span>
              <div className="grow t" style={{ textDecoration: s.paidAt ? "line-through" : undefined }}>
                <b style={!s.paidAt && s.fromId === trip.meId ? { color: "var(--danger)" } : undefined}>{name(s.fromId)}</b>
                <span className="muted"> → </span>
                {name(s.toId)}
              </div>
              <div className="amt">{yen(s.amount)}</div>
            </div>
          ))}
        </div>
      )}
      {balances}
      <button className="textbtn danger" style={{ marginTop: 16, fontWeight: 400 }} onClick={reopen} disabled={busy}>
        会計をやり直す
      </button>
      {toast}
    </div>
  );
}
