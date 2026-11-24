"use client";

import Link from "next/link";
import { use, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, yen } from "@/lib/client";
import type { TripDetail } from "@/lib/types";
import { Avatar, Header, TripGate } from "@/components/ui";

const PRESETS = ["ごはん", "交通費", "宿泊", "ガソリン", "高速代", "駐車場", "お酒", "おやつ", "観光", "おみやげ", "買い出し"];

export default function AddPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <TripGate id={id}>{(trip, reload) => <ExpenseForm trip={trip} reload={reload} />}</TripGate>;
}

function ExpenseForm({ trip, reload }: { trip: TripDetail; reload: () => Promise<void> }) {
  const editId = useSearchParams().get("edit");
  const editing = editId ? trip.expenses.find((e) => e.id === editId) : undefined;
  const allIds = useMemo(() => trip.members.map((m) => m.id), [trip.members]);

  const [amount, setAmount] = useState(editing ? String(editing.amount) : "");
  const [title, setTitle] = useState(editing?.title ?? "");
  const [payerId, setPayerId] = useState(editing?.payerId ?? trip.meId!);
  const [shareIds, setShareIds] = useState<string[]>(editing?.shareIds ?? allIds);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const amountNum = Number(amount.replace(/[^\d]/g, "")) || 0;
  const per = shareIds.length ? Math.floor(amountNum / shareIds.length) : 0;
  const back = `/trips/${trip.id}`;

  if (trip.status !== "active") {
    return (
      <div className="container">
        <Header title={trip.name} back={back} />
        <div className="notice warn">
          この旅行はすでに会計済みのため、立て替えを追加できません。追加したい場合は旅行ページの「会計をやり直す」から戻してください。
        </div>
        <Link href={back} className="btn primary block" style={{ marginTop: 16 }}>
          旅行のページへ
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="container">
        <Header title={trip.name} back={back} />
        <div className="card center" style={{ padding: 28 }}>
          <div style={{ fontSize: 44, color: "var(--accent)" }}>✓</div>
          <p style={{ fontWeight: 800, fontSize: 18, margin: "4px 0" }}>{editing ? "更新しました" : "登録しました"}</p>
          <p className="muted" style={{ margin: 0 }}>{done}</p>
        </div>
        <div className="btn-row" style={{ marginTop: 16 }}>
          <Link href={back} className="btn outline">
            旅行のページへ
          </Link>
          {!editing && (
            <button
              className="btn primary"
              onClick={() => {
                setDone(null);
                setAmount("");
                setTitle("");
                setPayerId(trip.meId!);
                setShareIds(allIds);
              }}
            >
              続けて追加
            </button>
          )}
        </div>
      </div>
    );
  }

  const toggleShare = (mid: string) =>
    setShareIds((ids) => (ids.includes(mid) ? ids.filter((x) => x !== mid) : [...ids, mid]));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = { title: title.trim(), amount: amountNum, payerId, shareIds };
      if (editing) await api(`/api/trips/${trip.id}/expenses/${editing.id}`, { method: "PATCH", body });
      else await api(`/api/trips/${trip.id}/expenses`, { method: "POST", body });
      const payer = trip.members.find((m) => m.id === payerId)?.name;
      setDone(`${body.title} ${yen(amountNum)}（${payer}が立て替え）`);
      await reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!editing || !confirm("この立て替えを削除しますか？")) return;
    setBusy(true);
    try {
      await api(`/api/trips/${trip.id}/expenses/${editing.id}`, { method: "DELETE" });
      location.href = back;
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <form className="container" onSubmit={submit}>
      <Header title={editing ? "立て替えを編集" : "立て替えを追加"} back={back} />
      <p className="muted" style={{ margin: "-8px 0 16px", fontSize: 14 }}>
        {trip.name}
      </p>
      {error && <div className="error">{error}</div>}

      <div className="field">
        <label htmlFor="amount">金額</label>
        <div className="amount-input">
          <span>¥</span>
          <input
            id="amount"
            inputMode="numeric"
            placeholder="0"
            autoFocus={!editing}
            value={amountNum ? amountNum.toLocaleString("ja-JP") : ""}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, "").slice(0, 9))}
          />
        </div>
      </div>

      <div className="field">
        <label htmlFor="title">項目</label>
        <input id="title" className="input" placeholder="例：夕食（居酒屋）" value={title} maxLength={40} onChange={(e) => setTitle(e.target.value)} />
        <div className="chips" style={{ marginTop: 10 }}>
          {PRESETS.map((p) => (
            <button type="button" key={p} className={`chip ${title === p ? "on" : ""}`} onClick={() => setTitle(p)}>
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <div className="label">立て替えた人</div>
        <div className="chips">
          {trip.members.map((m) => (
            <button type="button" key={m.id} className={`chip ${payerId === m.id ? "on" : ""}`} onClick={() => setPayerId(m.id)}>
              <Avatar member={m} />
              {m.name}
              {m.id === trip.meId && <span className="muted" style={{ fontSize: 12 }}>（自分）</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <div className="label" style={{ display: "flex", justifyContent: "space-between" }}>
          <span>
            割り勘する人（{shareIds.length}人{per ? `・1人あたり約${yen(per)}` : ""}）
          </span>
          <button
            type="button"
            className="link-btn"
            style={{ padding: 0, fontSize: 13 }}
            onClick={() => setShareIds(shareIds.length === allIds.length ? [] : allIds)}
          >
            {shareIds.length === allIds.length ? "すべて外す" : "全員"}
          </button>
        </div>
        <div className="chips">
          {trip.members.map((m) => (
            <button type="button" key={m.id} className={`chip ${shareIds.includes(m.id) ? "on" : ""}`} onClick={() => toggleShare(m.id)}>
              <Avatar member={m} />
              {m.name}
            </button>
          ))}
        </div>
      </div>

      {editing && (
        <button type="button" className="btn danger block" onClick={remove} disabled={busy}>
          この立て替えを削除
        </button>
      )}

      <div className="fab-bar">
        <div className="inner">
          <button className="btn primary" disabled={busy || !amountNum || !title.trim() || !shareIds.length}>
            {editing ? "更新する" : amountNum ? `${yen(amountNum)} を登録` : "登録する"}
          </button>
        </div>
      </div>
    </form>
  );
}
