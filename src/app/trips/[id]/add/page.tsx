"use client";

import Link from "next/link";
import { use, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, yen } from "@/lib/client";
import type { TripDetail } from "@/lib/types";
import { Avatar, TopBar, TripGate, useToast } from "@/components/ui";

const CATEGORIES = ["食費", "高速", "燃料", "備品", "その他"];
const SEP = "・";

export default function AddPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <TripGate id={id}>{(trip, reload) => <ExpenseForm trip={trip} reload={reload} />}</TripGate>;
}

/** 保存済みの項目名を「カテゴリ」と「自由入力」に戻す */
function parseTitle(title: string) {
  const parts = title.split(SEP);
  const cats = parts.filter((p) => CATEGORIES.includes(p));
  const free = parts.filter((p) => !CATEGORIES.includes(p)).join(SEP);
  return { cats, free };
}

function ExpenseForm({ trip, reload }: { trip: TripDetail; reload: () => Promise<void> }) {
  const editId = useSearchParams().get("edit");
  const editing = editId ? trip.expenses.find((e) => e.id === editId) : undefined;
  const allIds = useMemo(() => trip.members.map((m) => m.id), [trip.members]);
  const initial = editing ? parseTitle(editing.title) : { cats: [], free: "" };

  const [amount, setAmount] = useState(editing ? String(editing.amount) : "");
  const [cats, setCats] = useState<string[]>(initial.cats);
  const [useFree, setUseFree] = useState(!!initial.free);
  const [free, setFree] = useState(initial.free);
  const [payerId, setPayerId] = useState(editing?.payerId ?? trip.meId!);
  const [shareIds, setShareIds] = useState<string[]>(editing?.shareIds ?? allIds);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, showToast] = useToast();

  const back = `/trips/${trip.id}`;
  const amountNum = Number(amount) || 0;
  const title = [...CATEGORIES.filter((c) => cats.includes(c)), ...(useFree && free.trim() ? [free.trim()] : [])].join(SEP);
  const per = shareIds.length ? Math.ceil(amountNum / shareIds.length) : 0;
  const tripPer = trip.members.length ? Math.round(trip.total / trip.members.length) : 0;

  if (trip.status !== "active") {
    return (
      <div className="page no-bar">
        <TopBar title={trip.name} back={back} />
        <div className="note">会計済みのため追加できません。旅行ページの「会計をやり直す」で入力できる状態に戻せます。</div>
        <Link href={back} className="btn block" style={{ marginTop: 12 }}>
          旅行ページへ
        </Link>
      </div>
    );
  }

  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const reset = () => {
    setAmount("");
    setCats([]);
    setUseFree(false);
    setFree("");
    setPayerId(trip.meId!);
    setShareIds(allIds);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = { title, amount: amountNum, payerId, shareIds };
      if (editing) {
        await api(`/api/trips/${trip.id}/expenses/${editing.id}`, { method: "PATCH", body });
        location.href = back;
        return;
      }
      await api(`/api/trips/${trip.id}/expenses`, { method: "POST", body });
      await reload();
      reset();
      showToast(`${title} ${yen(amountNum)} を登録しました`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!editing || !confirm("削除しますか？")) return;
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
    <form className="page" onSubmit={submit}>
      <TopBar
        title={trip.name}
        back={back}
        right={
          <span className="muted small num" style={{ textAlign: "right", lineHeight: 1.3 }}>
            合計 {yen(trip.total)}
            <br />
            1人 {yen(tripPer)}
          </span>
        }
      />
      {error && <div className="error">{error}</div>}

      <div className="amount">
        <span>¥</span>
        <input
          inputMode="numeric"
          placeholder="0"
          aria-label="金額"
          value={amountNum ? amountNum.toLocaleString("ja-JP") : ""}
          onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, "").slice(0, 9))}
        />
      </div>

      <div className="label">項目（複数可）</div>
      <div className="opts grid">
        {CATEGORIES.map((c) => (
          <button type="button" key={c} className={`opt ${cats.includes(c) ? "on" : ""}`} onClick={() => setCats(toggle(cats, c))}>
            {c}
          </button>
        ))}
        <button type="button" className={`opt ${useFree ? "on" : ""}`} onClick={() => setUseFree(!useFree)}>
          入力する
        </button>
      </div>
      {useFree && (
        <input
          className="input"
          style={{ marginTop: 6 }}
          placeholder="項目名"
          value={free}
          maxLength={30}
          autoFocus
          onChange={(e) => setFree(e.target.value)}
        />
      )}

      <div className="label">払った人</div>
      <div className="opts">
        {trip.members.map((m) => (
          <button type="button" key={m.id} className={`opt ${payerId === m.id ? "on" : ""}`} onClick={() => setPayerId(m.id)}>
            <Avatar member={m} />
            {m.name}
          </button>
        ))}
      </div>

      <div className="label">
        <span>
          割り勘する人　{shareIds.length}人{per ? `・1人 ${yen(per)}` : ""}
        </span>
        <button type="button" className="textbtn" style={{ padding: 0, fontSize: 12 }} onClick={() => setShareIds(shareIds.length === allIds.length ? [] : allIds)}>
          {shareIds.length === allIds.length ? "全解除" : "全員"}
        </button>
      </div>
      <div className="opts">
        {trip.members.map((m) => (
          <button type="button" key={m.id} className={`opt ${shareIds.includes(m.id) ? "on" : ""}`} onClick={() => setShareIds(toggle(shareIds, m.id))}>
            <Avatar member={m} />
            {m.name}
          </button>
        ))}
      </div>

      {editing && (
        <button type="button" className="textbtn danger" style={{ marginTop: 16 }} onClick={remove} disabled={busy}>
          この記録を削除
        </button>
      )}

      <div className="bottombar">
        <div className="in">
          <button className="btn primary" disabled={busy || !amountNum || !title || !shareIds.length}>
            {editing ? "保存" : "登録"}
          </button>
        </div>
      </div>
      {toast}
    </form>
  );
}
