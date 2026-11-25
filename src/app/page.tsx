"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, formatRange, hasLiff, useAuth, yen } from "@/lib/client";
import type { TripSummary } from "@/lib/types";
import { Avatar, Loading, TopBar } from "@/components/ui";

function Faces({ t }: { t: TripSummary }) {
  const faces = t.faces ?? [];
  return (
    <div className="faces">
      {faces.slice(0, 6).map((f, i) => (
        <Avatar key={i} member={f} />
      ))}
      {faces.length > 6 && <span className="muted small" style={{ marginLeft: 4 }}>+{faces.length - 6}</span>}
    </div>
  );
}

function TripCard({ t }: { t: TripSummary }) {
  const done = t.status === "completed";
  return (
    <Link href={`/trips/${t.id}`} className={`trip-card ${done ? "done" : "current"}`}>
      <div className="head">
        <div className="name">{t.name}</div>
        {t.status === "settling" && <span className="tag on">精算中</span>}
        {done && <span className="tag">精算済</span>}
      </div>
      <div className="meta">{[formatRange(t.startDate, t.endDate), `${t.memberCount}人`, `${t.expenseCount}件`].filter(Boolean).join("　")}</div>
      <div className="foot">
        <Faces t={t} />
        <div className="total">{yen(t.total)}</div>
      </div>
    </Link>
  );
}

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

  if (!ready) return <Loading />;

  const current = (trips ?? []).filter((t) => t.status !== "completed");
  const records = (trips ?? []).filter((t) => t.status === "completed");

  return (
    <div className="page">
      <TopBar
        title="旅行"
        right={
          me?.kind === "guest" && hasLiff() ? (
            <button className="textbtn" onClick={loginWithLine}>
              LINEでログイン
            </button>
          ) : undefined
        }
      />
      {error && <div className="error">{error}</div>}
      {!trips && !error && <Loading />}

      {trips && (
        <>
          <div className="label">進行中</div>
          {current.length ? current.map((t) => <TripCard key={t.id} t={t} />) : <div className="empty">進行中の旅行はありません</div>}
          {records.length > 0 && (
            <>
              <div className="label" style={{ marginTop: 20 }}>
                記録
              </div>
              {records.map((t) => (
                <TripCard key={t.id} t={t} />
              ))}
            </>
          )}
        </>
      )}

      <div className="bottombar">
        <div className="in">
          <Link href="/trips/new" className="btn primary">
            旅行を作成
          </Link>
        </div>
      </div>
    </div>
  );
}
