"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, canLoginWithLine, setGuestName, useAuth } from "@/lib/client";
import type { Member, TripDetail } from "@/lib/types";

const COLORS = ["#f97316", "#3b82f6", "#a855f7", "#ec4899", "#14b8a6", "#eab308", "#6366f1", "#ef4444", "#22c55e"];

export function Avatar({ member, size }: { member?: Pick<Member, "name" | "pictureUrl" | "id"> | null; size?: number }) {
  const style = size ? { width: size, height: size, fontSize: size * 0.42 } : undefined;
  if (!member) return <span className="avatar" style={style} />;
  if (member.pictureUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="avatar" src={member.pictureUrl} alt="" style={style} />;
  }
  let h = 0;
  for (const ch of member.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span className="avatar" style={{ ...style, background: COLORS[h % COLORS.length] }}>
      {[...member.name][0] ?? "?"}
    </span>
  );
}

export function Header({ title, back, right }: { title: string; back?: string; right?: React.ReactNode }) {
  return (
    <div className="header">
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

export function Spinner() {
  return <div className="spinner" />;
}

export function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  const t = useRef<ReturnType<typeof setTimeout>>(undefined);
  const show = useCallback((m: string) => {
    setMsg(m);
    clearTimeout(t.current);
    t.current = setTimeout(() => setMsg(null), 2200);
  }, []);
  const node = msg ? <div className="toast">{msg}</div> : null;
  return [node, show] as const;
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

/**
 * まだ旅行に参加していない人に「あなたは誰？」を選んでもらう。
 * LINEでログインしていて、引き継ぐ候補がいなければ自動で参加する。
 */
export function JoinGate({ trip, onJoined }: { trip: TripDetail; onJoined: () => void }) {
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

  if (auto && !error) return <Spinner />;

  return (
    <div className="container">
      <Header title={trip.name} back="/" />
      <div className="card">
        <h2 style={{ fontSize: 18, margin: "0 0 4px" }}>はじめまして！</h2>
        <p className="muted" style={{ margin: "0 0 16px", fontSize: 14 }}>
          この旅行の会計に参加します。あなたはどなたですか？
          {me?.kind === "line" ? "（次回からは自動で認識されます）" : "（この端末で次回から自動で認識されます）"}
        </p>
        {error && <div className="error">{error}</div>}
        {unlinked.length > 0 && (
          <div className="field">
            <div className="label">メンバー一覧から選ぶ</div>
            <div className="chips">
              {unlinked.map((m) => (
                <button key={m.id} className="chip" disabled={busy} onClick={() => join({ memberId: m.id })}>
                  <Avatar member={m} /> {m.name}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="field">
          <div className="label">{unlinked.length > 0 ? "いなければ新しく参加" : "名前を入力して参加"}</div>
          <div className="btn-row">
            <input
              className="input"
              placeholder="名前"
              value={name}
              maxLength={20}
              onChange={(e) => setName(e.target.value)}
            />
            <button
              className="btn primary"
              style={{ flex: "0 0 auto" }}
              disabled={busy || !name.trim()}
              onClick={() => join({ name: name.trim() })}
            >
              参加
            </button>
          </div>
        </div>
        {canLoginWithLine() && (
          <button className="btn outline block" onClick={loginWithLine}>
            LINEでログインして参加
          </button>
        )}
      </div>
    </div>
  );
}

/** 旅行ページ共通：読み込み → 未参加なら JoinGate → 本体 */
export function TripGate({ id, children }: { id: string; children: (trip: TripDetail, reload: () => Promise<void>) => React.ReactNode }) {
  const { trip, error, reload } = useTrip(id);
  if (error && !trip)
    return (
      <div className="container">
        <Header title="エラー" back="/" />
        <div className="error">{error}</div>
      </div>
    );
  if (!trip) return <Spinner />;
  if (!trip.meId) return <JoinGate trip={trip} onJoined={reload} />;
  return <>{children(trip, reload)}</>;
}
