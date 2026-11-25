"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useState } from "react";
import { api, formatRange, shareToLine, tripAddUrl, yen } from "@/lib/client";
import type { TripDetail } from "@/lib/types";
import { Avatar, signed, TopBar, TripGate, useToast } from "@/components/ui";

export default function TripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <TripGate id={id}>{(trip, reload) => <TripView trip={trip} reload={reload} />}</TripGate>;
}

function shortDate(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function TripView({ trip, reload }: { trip: TripDetail; reload: () => Promise<void> }) {
  const router = useRouter();
  const [tab, setTab] = useState<"expenses" | "members">("expenses");
  const [toast, showToast] = useToast();
  const [newMember, setNewMember] = useState("");
  const [settings, setSettings] = useState(false);

  const byId = new Map(trip.members.map((m) => [m.id, m]));
  const active = trip.status === "active";
  const per = trip.members.length ? Math.round(trip.total / trip.members.length) : 0;
  const paidCount = trip.settlements.filter((s) => s.paidAt).length;

  const share = async () => {
    const r = await shareToLine(`${trip.name}の立て替え入力\n${tripAddUrl(trip.id)}`);
    if (r === "shared") showToast("送信しました");
    if (r === "copied") showToast("リンクをコピーしました");
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
    const name = prompt("名前", current);
    if (!name || name === current) return;
    await api(`/api/trips/${trip.id}/members/${mid}`, { method: "PATCH", body: { name } }).catch((e) => showToast(e.message));
    await reload();
  };

  const removeMember = async (mid: string, name: string) => {
    if (!confirm(`${name}を削除しますか？`)) return;
    await api(`/api/trips/${trip.id}/members/${mid}`, { method: "DELETE" }).catch((e) => showToast(e.message));
    await reload();
  };

  return (
    <div className="page">
      <TopBar
        title={trip.name}
        back="/"
        right={
          <button className="btn sm" onClick={share}>
            LINEで共有
          </button>
        }
      />

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
      <div className="small muted" style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
        <span>{formatRange(trip.startDate, trip.endDate)}</span>
        <button className="textbtn muted small" style={{ padding: 0, fontSize: 12 }} onClick={() => setSettings((v) => !v)}>
          {settings ? "閉じる" : "設定"}
        </button>
      </div>

      {settings && <TripSettings trip={trip} reload={reload} onClose={() => setSettings(false)} onDeleted={() => router.replace("/")} />}

      {trip.status !== "active" && (
        <Link href={`/trips/${trip.id}/settle`} className="note" style={{ display: "flex", justifyContent: "space-between", marginTop: 10 }}>
          <span>{trip.status === "settling" ? `精算中　${paidCount}/${trip.settlements.length}件 支払い済み` : "精算済み"}</span>
          <span className="muted">›</span>
        </Link>
      )}

      <div className="tabs">
        <button className={tab === "expenses" ? "on" : ""} onClick={() => setTab("expenses")}>
          立て替え {trip.expenses.length}
        </button>
        <button className={tab === "members" ? "on" : ""} onClick={() => setTab("members")}>
          メンバー {trip.members.length}
        </button>
      </div>

      {tab === "expenses" &&
        (trip.expenses.length === 0 ? (
          <div className="empty">記録はまだありません</div>
        ) : (
          <div className="rows">
            {trip.expenses.map((e) => {
              const all = e.shareIds.length === trip.members.length;
              const content = (
                <>
                  <div className="grow">
                    <div className="t">{e.title}</div>
                    <div className="s">
                      {shortDate(e.createdAt)}　{byId.get(e.payerId)?.name}が支払い
                      {all ? "" : `　${e.shareIds.map((x) => byId.get(x)?.name).join("・")}で割り勘`}
                    </div>
                  </div>
                  <div className="amt">{yen(e.amount)}</div>
                </>
              );
              return active ? (
                <Link key={e.id} href={`/trips/${trip.id}/add?edit=${e.id}`}>
                  {content}
                </Link>
              ) : (
                <div key={e.id}>{content}</div>
              );
            })}
          </div>
        ))}

      {tab === "members" && (
        <>
          <div className="rows">
            {trip.members.map((m) => {
              const b = trip.balances[m.id];
              return (
                <div key={m.id}>
                  <Avatar member={m} />
                  <div className="grow">
                    <div className="t">
                      {m.name}
                      {m.id === trip.meId && <span className="muted small">（自分）</span>}
                    </div>
                    <div className="s">
                      支払 {yen(b.paid)}　負担 {yen(b.owed)}
                    </div>
                  </div>
                  <div className={`amt ${b.balance > 0 ? "plus" : b.balance < 0 ? "minus" : "muted"}`}>{signed(b.balance, yen)}</div>
                  {active && (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                      <button className="textbtn muted small" style={{ padding: "2px 0", fontSize: 12 }} onClick={() => renameMember(m.id, m.name)}>
                        変更
                      </button>
                      {!m.linked && (
                        <button className="textbtn danger" style={{ padding: "2px 0", fontSize: 12, fontWeight: 400 }} onClick={() => removeMember(m.id, m.name)}>
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
            <form onSubmit={addMember} className="hstack" style={{ marginTop: 10 }}>
              <input className="input" placeholder="メンバーを追加" value={newMember} maxLength={20} onChange={(e) => setNewMember(e.target.value)} />
              <button className="btn" style={{ flex: "0 0 auto", height: 40 }} disabled={!newMember.trim()}>
                追加
              </button>
            </form>
          )}
        </>
      )}

      <div className="bottombar">
        <div className="in">
          {active ? (
            <>
              <Link href={`/trips/${trip.id}/settle`} className="btn">
                会計
              </Link>
              <Link href={`/trips/${trip.id}/add`} className="btn primary" style={{ flex: 2 }}>
                立て替えを追加
              </Link>
            </>
          ) : (
            <Link href={`/trips/${trip.id}/settle`} className="btn primary">
              精算を見る
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
    if (!confirm(`「${trip.name}」を削除します。記録もすべて消えます。`)) return;
    try {
      await api(`/api/trips/${trip.id}`, { method: "DELETE" });
      onDeleted();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div style={{ borderTop: "1px solid var(--border)", marginTop: 8, paddingTop: 4 }}>
      {error && <div className="error">{error}</div>}
      <div className="label">旅行名</div>
      <input className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
      <div className="label">日程</div>
      <div className="hstack">
        <input type="date" className="input" value={startDate} onChange={(e) => setStart(e.target.value)} aria-label="開始日" />
        <input type="date" className="input" value={endDate} onChange={(e) => setEnd(e.target.value)} aria-label="終了日" />
      </div>
      <div className="hstack" style={{ marginTop: 10, alignItems: "center" }}>
        <button className="textbtn danger" style={{ flex: 1, textAlign: "left", fontWeight: 400 }} onClick={del}>
          旅行を削除
        </button>
        <button className="btn sm primary" style={{ flex: "0 0 auto" }} onClick={save}>
          保存
        </button>
      </div>
    </div>
  );
}
