"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, getGuestName, setGuestName, useAuth } from "@/lib/client";
import { Loading, TopBar } from "@/components/ui";

export default function NewTrip() {
  const router = useRouter();
  const { ready, me } = useAuth();
  const [name, setName] = useState("");
  const [startDate, setStart] = useState("");
  const [endDate, setEnd] = useState("");
  const [myName, setMyName] = useState(() => (typeof window === "undefined" ? "" : getGuestName()));
  const [others, setOthers] = useState("");
  const [showOthers, setShowOthers] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!ready) return <Loading />;
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
      router.replace(`/trips/${r.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <form className="page" onSubmit={submit}>
      <TopBar title="旅行を作成" back="/" />
      {error && <div className="error">{error}</div>}
      <div className="label">旅行名</div>
      <input className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
      <div className="label">日程</div>
      <div className="hstack">
        <input type="date" className="input" value={startDate} onChange={(e) => setStart(e.target.value)} aria-label="開始日" />
        <input type="date" className="input" value={endDate} min={startDate || undefined} onChange={(e) => setEnd(e.target.value)} aria-label="終了日" />
      </div>
      {isGuest && (
        <>
          <div className="label">自分の名前</div>
          <input className="input" value={myName} maxLength={20} onChange={(e) => setMyName(e.target.value)} />
        </>
      )}
      {showOthers ? (
        <>
          <div className="label">LINEを使用しないユーザー（読点区切り）</div>
          <input className="input" placeholder="例：けんた、ゆい" value={others} autoFocus onChange={(e) => setOthers(e.target.value)} />
        </>
      ) : (
        <button type="button" className="textbtn muted" style={{ marginTop: 14, fontSize: 13 }} onClick={() => setShowOthers(true)}>
          ＋ LINEを使用しないユーザーを追加
        </button>
      )}
      <div className="bottombar">
        <div className="in">
          <button className="btn primary" disabled={busy || !name.trim() || (isGuest && !myName.trim())}>
            作成
          </button>
        </div>
      </div>
    </form>
  );
}
