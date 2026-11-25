"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, formatRange, hasLiff, useAuth, yen } from "@/lib/client";
import type { TripSummary } from "@/lib/types";
import { Loading, TopBar } from "@/components/ui";

function TripRow({ t }: { t: TripSummary }) {
  return (
    <Link href={`/trips/${t.id}`}>
      <div className="grow">
        <div className="t" style={{ fontWeight: 600 }}>
          {t.name}
        </div>
        <div className="s">{[formatRange(t.startDate, t.endDate), `${t.memberCount}人`].filter(Boolean).join("　")}</div>
      </div>
      <div className="amt">
        {yen(t.total)}
        <div>
          {t.status === "settling" && <span className="tag on">精算中</span>}
          {t.status === "completed" && <span className="tag">精算済</span>}
        </div>
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
          {current.length ? (
            <div className="rows">
              {current.map((t) => (
                <TripRow key={t.id} t={t} />
              ))}
            </div>
          ) : (
            <div className="empty">進行中の旅行はありません</div>
          )}
          {records.length > 0 && (
            <>
              <div className="label" style={{ marginTop: 24 }}>
                記録
              </div>
              <div className="rows">
                {records.map((t) => (
                  <TripRow key={t.id} t={t} />
                ))}
              </div>
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
