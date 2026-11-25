"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, canLoginWithLine, setGuestName, useAuth } from "@/lib/client";
import type { Member, TripDetail } from "@/lib/types";

export function Avatar({ member }: { member?: Pick<Member, "name" | "pictureUrl"> | null }) {
  if (member?.pictureUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="avatar" src={member.pictureUrl} alt="" />;
  }
  return <span className="avatar">{member ? ([...member.name][0] ?? "") : ""}</span>;
}

export function TopBar({ title, back, right }: { title: string; back?: string; right?: React.ReactNode }) {
  return (
    <div className="topbar">
      {back && (
        <Link href={back} className="back" aria-label="戻る">
          ‹
        </Link>
      )}
      <h1>{title}</h1>
      {right}
    </div>
  );
}

export function Loading() {
  return <div className="loading">読み込み中…</div>;
}

export function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  const t = useRef<ReturnType<typeof setTimeout>>(undefined);
  const show = useCallback((m: string) => {
    setMsg(m);
    clearTimeout(t.current);
    t.current = setTimeout(() => setMsg(null), 2000);
  }, []);
  return [msg ? <div className="toast">{msg}</div> : null, show] as const;
}

export function useTrip(id: string) {
  const { ready, me } = useAuth();
  const [trip, setTrip] = useState<TripDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    try {
      setTrip(await api<TripDetail>(`/api/trips/${id}`));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);
  useEffect(() => {
    if (ready && me) reload();
  }, [ready, me, reload]);
  return { trip, error, reload };
}

/** 旅行に未参加の人にメンバーを選んでもらう。LINEログイン済みで候補がいなければ自動参加。 */
function JoinGate({ trip, onJoined }: { trip: TripDetail; onJoined: () => void }) {
  const { me, loginWithLine } = useAuth();
  const [name, setName] = useState(me?.name ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unlinked = trip.members.filter((m) => !m.linked);
  const auto = me?.kind === "line" && unlinked.length === 0;

  const join = useCallback(
    async (body: { memberId?: string; name?: string }) => {
      setBusy(true);
      setError(null);
      try {
        await api(`/api/trips/${trip.id}/join`, { method: "POST", body });
        if (me?.kind === "guest") {
          const n = body.name ?? trip.members.find((m) => m.id === body.memberId)?.name;
          if (n) setGuestName(n);
        }
        onJoined();
      } catch (e) {
        setError((e as Error).message);
        setBusy(false);
      }
    },
    [trip, me, onJoined],
  );

  useEffect(() => {
    if (auto) join({ name: me?.name ?? undefined });
  }, [auto]); // eslint-disable-line react-hooks/exhaustive-deps

  if (auto && !error) return <Loading />;

  return (
    <div className="page no-bar">
      <TopBar title={trip.name} back="/" />
      {error && <div className="error">{error}</div>}
      {unlinked.length > 0 && (
        <>
          <div className="label">あなたはどれですか</div>
          <div className="opts">
            {unlinked.map((m) => (
              <button key={m.id} className="opt" disabled={busy} onClick={() => join({ memberId: m.id })}>
                {m.name}
              </button>
            ))}
          </div>
        </>
      )}
      <div className="label">{unlinked.length > 0 ? "一覧にいない場合" : "名前を入力して参加"}</div>
      <div className="hstack">
        <input className="input" placeholder="名前" value={name} maxLength={20} onChange={(e) => setName(e.target.value)} />
        <button className="btn primary" style={{ flex: "0 0 auto", height: 40 }} disabled={busy || !name.trim()} onClick={() => join({ name: name.trim() })}>
          参加
        </button>
      </div>
      {canLoginWithLine() && (
        <button className="btn block" style={{ marginTop: 12 }} onClick={loginWithLine}>
          LINEでログイン
        </button>
      )}
    </div>
  );
}

/** 旅行ページ共通：読み込み → 未参加ならメンバー選択 → 本体 */
export function TripGate({ id, children }: { id: string; children: (trip: TripDetail, reload: () => Promise<void>) => React.ReactNode }) {
  const { trip, error, reload } = useTrip(id);
  if (error && !trip)
    return (
      <div className="page no-bar">
        <TopBar title="" back="/" />
        <div className="error">{error}</div>
      </div>
    );
  if (!trip) return <Loading />;
  if (!trip.meId) return <JoinGate trip={trip} onJoined={reload} />;
  return <>{children(trip, reload)}</>;
}

export function signed(n: number, yen: (n: number) => string) {
  return n > 0 ? `+${yen(n)}` : n < 0 ? `-${yen(-n)}` : yen(0);
}
