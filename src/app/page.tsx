"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, formatRange, useAuth, yen } from "@/lib/client";
import type { TripSummary } from "@/lib/types";
import { Spinner } from "@/components/ui";

export default function Home() {
  const { ready, me, loginWithLine } = useAuth();
  const [trips, setTrips] = useState<TripSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || !me) return;
    api<{ trips: TripSummary[] }>("/api/trips")
      .then((r) => setTrips(r.trips))
      .catch((e) => setError(e.message));
  }, [ready, me]);

  if (!ready) return <Spinner />;

  const current = (trips ?? []).filter((t) => t.status !== "completed");
  const records = (trips ?? []).filter((t) => t.status === "completed");

  return (
    <div className="container">
      <div className="header">
        <h1>旅の会計</h1>
        {me?.kind === "guest" && (
          <button className="link-btn" onClick={loginWithLine} hidden={!process.env.NEXT_PUBLIC_LIFF_ID}>
            LINEでログイン
          </button>
        )}
      </div>

      {error && <div className="error">{error}</div>}
      {!trips && !error && <Spinner />}

      {trips && current.length === 0 && records.length === 0 && (
        <div className="card center">
          <div style={{ fontSize: 40 }}>🧳</div>
          <p style={{ fontWeight: 700, margin: "8px 0 4px" }}>まだ旅行がありません</p>
          <p className="muted" style={{ fontSize: 14, margin: 0 }}>
            旅行を作ってリンクをLINEグループに送ると、
            <br />
            みんながタップするだけで立て替えを登録できます。
          </p>
        </div>
      )}

      {current.map((t) => (
        <Link key={t.id} href={`/trips/${t.id}`} className="trip-current">
          <span className="label">{t.status === "settling" ? "精算中" : "進行中"}</span>
          <div className="name">{t.name}</div>
          <div className="meta">
            {[formatRange(t.startDate, t.endDate), `${t.memberCount}人`, `${t.expenseCount}件`].filter(Boolean).join(" ・ ")}
          </div>
          <div className="total">{yen(t.total)}</div>
        </Link>
      ))}

      {records.length > 0 && (
        <>
          <div className="section-title">これまでの記録</div>
          <div className="list">
            {records.map((t) => (
              <Link key={t.id} href={`/trips/${t.id}`} className="row">
                <div className="grow">
                  <div className="title">{t.name}</div>
                  <div className="sub">
                    {[formatRange(t.startDate, t.endDate), `${t.memberCount}人`].filter(Boolean).join(" ・ ")}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="amount">{yen(t.total)}</div>
                  <span className="badge ok">完了</span>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}

      <div className="fab-bar">
        <div className="inner">
          <Link href="/trips/new" className="btn primary">
            ＋ 新しい旅行を作る
          </Link>
        </div>
      </div>
    </div>
  );
}
