"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, getGuestName, setGuestName, useAuth } from "@/lib/client";
import { Header, Spinner } from "@/components/ui";

export default function NewTrip() {
  const router = useRouter();
  const { ready, me } = useAuth();
  const [name, setName] = useState("");
  const [startDate, setStart] = useState("");
  const [endDate, setEnd] = useState("");
  const [myName, setMyName] = useState(() => (typeof window === "undefined" ? "" : getGuestName()));
  const [others, setOthers] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!ready) return <Spinner />;
  const isGuest = me?.kind !== "line";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const memberNames = others.split(/[,、，\s]+/).map((s) => s.trim()).filter(Boolean);
      const r = await api<{ id: string }>("/api/trips", {
        method: "POST",
        body: { name, startDate, endDate, myName: isGuest ? myName : undefined, memberNames },
      });
      if (isGuest) setGuestName(myName.trim());
      router.replace(`/trips/${r.id}?created=1`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <form className="container" onSubmit={submit}>
      <Header title="新しい旅行" back="/" />
      {error && <div className="error">{error}</div>}
      <div className="field">
        <label htmlFor="name">旅行名</label>
        <input id="name" className="input" placeholder="例：沖縄旅行 2026" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} autoFocus />
      </div>
      <div className="field">
        <div className="label">日程（任意）</div>
        <div className="btn-row">
          <input type="date" className="input" value={startDate} onChange={(e) => setStart(e.target.value)} aria-label="開始日" />
          <input type="date" className="input" value={endDate} min={startDate || undefined} onChange={(e) => setEnd(e.target.value)} aria-label="終了日" />
        </div>
      </div>
      {isGuest && (
        <div className="field">
          <label htmlFor="me">あなたの名前</label>
          <input id="me" className="input" placeholder="例：たくみ" value={myName} maxLength={20} onChange={(e) => setMyName(e.target.value)} />
        </div>
      )}
      <div className="field">
        <label htmlFor="others">他のメンバー（任意）</label>
        <input id="others" className="input" placeholder="例：けんた、ゆい、さき" value={others} onChange={(e) => setOthers(e.target.value)} />
        <p className="muted" style={{ fontSize: 13, margin: "6px 2px 0" }}>
          空欄でもOK。LINEグループに送ったリンクを開いた人は自動でメンバーに加わります。LINEを使わない人だけ先に入れておくと便利です。
        </p>
      </div>
      <div className="fab-bar">
        <div className="inner">
          <button className="btn primary" disabled={busy || !name.trim() || (isGuest && !myName.trim())}>
            作成する
          </button>
        </div>
      </div>
    </form>
  );
}
