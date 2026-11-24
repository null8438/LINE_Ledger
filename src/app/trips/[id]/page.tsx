"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { use, useState } from "react";
import { api, formatRange, shareToLine, tripAddUrl, yen } from "@/lib/client";
import type { TripDetail } from "@/lib/types";
import { Avatar, Header, TripGate, useToast } from "@/components/ui";

export default function TripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <TripGate id={id}>{(trip, reload) => <TripView trip={trip} reload={reload} />}</TripGate>;
}

function shortDate(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function TripView({ trip, reload }: { trip: TripDetail; reload: () => Promise<void> }) {
  const router = useRouter();
  const created = useSearchParams().get("created") === "1";
  const [tab, setTab] = useState<"expenses" | "members">("expenses");
  const [toast, showToast] = useToast();
  const [newMember, setNewMember] = useState("");
  const [editingInfo, setEditingInfo] = useState(false);

  const byId = new Map(trip.members.map((m) => [m.id, m]));
  const me = trip.meId ? byId.get(trip.meId) : undefined;
  const myBal = trip.meId ? trip.balances[trip.meId] : undefined;
  const active = trip.status === "active";
  const paidCount = trip.settlements.filter((s) => s.paidAt).length;

  const share = async () => {
    const text = `【${trip.name}】の立て替えはここから登録してね！\n${tripAddUrl(trip.id)}`;
    const r = await shareToLine(text);
    if (r === "shared") showToast("LINEに送りました");
    if (r === "copied") showToast("リンクをコピーしました");
  };

  const copy = async () => {
    await navigator.clipboard?.writeText(tripAddUrl(trip.id));
    showToast("リンクをコピーしました");
  };

  const addMember = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api(`/api/trips/${trip.id}/members`, { method: "POST", body: { name: newMember } });
      setNewMember("");
      await reload();
    } catch (err) {
      showToast((err as Error).message);
    }
  };

  const renameMember = async (mid: string, current: string) => {
    const name = prompt("名前を変更", current);
    if (!name || name === current) return;
    await api(`/api/trips/${trip.id}/members/${mid}`, { method: "PATCH", body: { name } }).catch((e) => showToast(e.message));
    await reload();
  };

  const removeMember = async (mid: string, name: string) => {
    if (!confirm(`${name} をメンバーから外しますか？`)) return;
    await api(`/api/trips/${trip.id}/members/${mid}`, { method: "DELETE" }).catch((e) => showToast(e.message));
    await reload();
  };

  return (
    <div className="container">
      <Header
        title={trip.name}
        back="/"
        right={
          <button className="btn small primary" onClick={share}>
            LINEで送る
          </button>
        }
      />

      {created && (
        <div className="notice" style={{ marginBottom: 12 }}>
          旅行を作成しました！「LINEで送る」でグループにリンクを送ると、タップした人がすぐ立て替えを登録できます。
          <div style={{ marginTop: 8 }}>
            <button className="link-btn" style={{ padding: 0 }} onClick={copy}>
              リンクをコピー
            </button>
          </div>
        </div>
      )}

      {trip.status === "settling" && (
        <Link href={`/trips/${trip.id}/settle`} className="notice warn" style={{ display: "block", marginBottom: 12 }}>
          <b>精算中</b>（{paidCount}/{trip.settlements.length} 件 支払い済み）── タップして送金状況を確認 ›
        </Link>
      )}
      {trip.status === "completed" && (
        <Link href={`/trips/${trip.id}/settle`} className="notice" style={{ display: "block", marginBottom: 12 }}>
          <b>🎉 精算完了</b> ── 全員の支払いが終わりました。精算内容を見る ›
        </Link>
      )}

      <div className="stat-grid">
        <div className="stat">
          <div className="k">合計</div>
          <div className="v">{yen(trip.total)}</div>
        </div>
        <div className="stat">
          <div className="k">{me?.name ?? "あなた"}の収支</div>
          <div className={`v ${myBal && myBal.balance > 0 ? "plus" : myBal && myBal.balance < 0 ? "minus" : ""}`}>
            {myBal ? (myBal.balance > 0 ? `+${yen(myBal.balance)}` : myBal.balance < 0 ? `-${yen(-myBal.balance)}` : "±0") : "-"}
          </div>
        </div>
      </div>
      <p className="muted" style={{ fontSize: 13, margin: "8px 4px 0", display: "flex", justifyContent: "space-between" }}>
        <span>{[formatRange(trip.startDate, trip.endDate), `${trip.members.length}人`].filter(Boolean).join(" ・ ")}</span>
        <button className="link-btn" style={{ padding: 0, fontSize: 13 }} onClick={() => setEditingInfo((v) => !v)}>
          旅行の設定
        </button>
      </p>

      {editingInfo && <TripSettings trip={trip} reload={reload} onClose={() => setEditingInfo(false)} onDeleted={() => router.replace("/")} />}

      <div style={{ height: 16 }} />
      <div className="tabs">
        <button className={tab === "expenses" ? "on" : ""} onClick={() => setTab("expenses")}>
          立て替え（{trip.expenses.length}）
        </button>
        <button className={tab === "members" ? "on" : ""} onClick={() => setTab("members")}>
          メンバー（{trip.members.length}）
        </button>
      </div>

      {tab === "expenses" &&
        (trip.expenses.length === 0 ? (
          <div className="empty">まだ立て替えはありません。下のボタンから追加しましょう。</div>
        ) : (
          <div className="list">
            {trip.expenses.map((e) => {
              const payer = byId.get(e.payerId);
              const all = e.shareIds.length === trip.members.length;
              const inner = (
                <>
                  <Avatar member={payer} />
                  <div className="grow">
                    <div className="title">{e.title}</div>
                    <div className="sub">
                      {payer?.name}が立て替え ・ {all ? "全員" : e.shareIds.map((x) => byId.get(x)?.name).join("、")}で割り勘
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div className="amount">{yen(e.amount)}</div>
                    <div className="sub muted" style={{ fontSize: 12 }}>{shortDate(e.createdAt)}</div>
                  </div>
                </>
              );
              return active ? (
                <Link key={e.id} href={`/trips/${trip.id}/add?edit=${e.id}`} className="row">
                  {inner}
                </Link>
              ) : (
                <div key={e.id} className="row">
                  {inner}
                </div>
              );
            })}
          </div>
        ))}

      {tab === "members" && (
        <>
          <div className="list">
            {trip.members.map((m) => {
              const b = trip.balances[m.id];
              return (
                <div key={m.id} className="row">
                  <Avatar member={m} />
                  <div className="grow">
                    <div className="title">
                      {m.name}
                      {m.id === trip.meId && <span className="muted" style={{ fontWeight: 400 }}>（自分）</span>}
                    </div>
                    <div className="sub">
                      立て替え {yen(b.paid)} ・ 負担 {yen(b.owed)}
                      {!m.linked && " ・ 未参加"}
                    </div>
                  </div>
                  <div className={`amount ${b.balance > 0 ? "plus" : b.balance < 0 ? "minus" : "muted"}`}>
                    {b.balance > 0 ? `+${yen(b.balance)}` : b.balance < 0 ? `-${yen(-b.balance)}` : "±0"}
                  </div>
                  {active && (
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <button className="link-btn" style={{ fontSize: 12 }} onClick={() => renameMember(m.id, m.name)}>
                        名前変更
                      </button>
                      {!m.linked && (
                        <button className="link-btn" style={{ fontSize: 12, color: "var(--danger)" }} onClick={() => removeMember(m.id, m.name)}>
                          削除
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {active && (
            <form onSubmit={addMember} className="btn-row" style={{ marginTop: 12 }}>
              <input className="input" placeholder="LINEを使わないメンバーを追加" value={newMember} maxLength={20} onChange={(e) => setNewMember(e.target.value)} />
              <button className="btn outline" style={{ flex: "0 0 auto" }} disabled={!newMember.trim()}>
                追加
              </button>
            </form>
          )}
          <p className="muted" style={{ fontSize: 12, margin: "8px 4px" }}>
            ＋は受け取る額、−は払う額です。リンクを開いた人は自動でメンバーに加わります。
          </p>
        </>
      )}

      <div className="fab-bar">
        <div className="inner">
          {active ? (
            <>
              <Link href={`/trips/${trip.id}/add`} className="btn primary">
                ＋ 立て替え
              </Link>
              <Link href={`/trips/${trip.id}/settle`} className="btn" style={{ background: "var(--card)", border: "1.5px solid var(--line)" }}>
                会計する
              </Link>
            </>
          ) : (
            <Link href={`/trips/${trip.id}/settle`} className="btn primary">
              {trip.status === "settling" ? "精算状況を見る" : "精算結果を見る"}
            </Link>
          )}
        </div>
      </div>
      {toast}
    </div>
  );
}

function TripSettings({
  trip,
  reload,
  onClose,
  onDeleted,
}: {
  trip: TripDetail;
  reload: () => Promise<void>;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [name, setName] = useState(trip.name);
  const [startDate, setStart] = useState(trip.startDate ?? "");
  const [endDate, setEnd] = useState(trip.endDate ?? "");
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    try {
      await api(`/api/trips/${trip.id}`, { method: "PATCH", body: { name, startDate, endDate } });
      await reload();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const del = async () => {
    if (!confirm(`「${trip.name}」を削除します。立て替えの記録もすべて消えます。よろしいですか？`)) return;
    try {
      await api(`/api/trips/${trip.id}`, { method: "DELETE" });
      onDeleted();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="card" style={{ marginTop: 12 }}>
      {error && <div className="error">{error}</div>}
      <div className="field">
        <label>旅行名</label>
        <input className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field">
        <div className="label">日程</div>
        <div className="btn-row">
          <input type="date" className="input" value={startDate} onChange={(e) => setStart(e.target.value)} aria-label="開始日" />
          <input type="date" className="input" value={endDate} onChange={(e) => setEnd(e.target.value)} aria-label="終了日" />
        </div>
      </div>
      <div className="btn-row">
        <button className="btn outline" onClick={onClose}>
          閉じる
        </button>
        <button className="btn primary" onClick={save}>
          保存
        </button>
      </div>
      <button className="btn danger block" style={{ marginTop: 10 }} onClick={del}>
        この旅行を削除
      </button>
    </div>
  );
}
