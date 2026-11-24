"use client";

// クライアント側：LIFF 初期化・本人識別・API 呼び出し

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

// LIFF ID はサーバー側の環境変数 LIFF_ID から layout 経由で受け取る
let LIFF_ID = "";
export const hasLiff = () => !!LIFF_ID;

export type Me = {
  kind: "line" | "guest";
  name: string | null;
  picture: string | null;
};

type AuthState = { ready: boolean; me: Me | null; error: string | null; inClient: boolean };

let idToken: string | null = null;
let liffMod: typeof import("@line/liff").default | null = null;

const GUEST_KEY = "line-ledger:guest-id";
const NAME_KEY = "line-ledger:guest-name";

function storage(key: string, value?: string): string | null {
  try {
    if (value !== undefined) localStorage.setItem(key, value);
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function guestId(): string {
  let id = storage(GUEST_KEY);
  if (!id) {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    id = Array.from(crypto.getRandomValues(new Uint8Array(20)), (b) => chars[b % chars.length]).join("");
    storage(GUEST_KEY, id);
  }
  return id;
}

export function getGuestName(): string {
  return storage(NAME_KEY) ?? "";
}
export function setGuestName(n: string) {
  storage(NAME_KEY, n);
}

async function initAuth(): Promise<AuthState> {
  if (LIFF_ID) {
    try {
      const liff = (await import("@line/liff")).default;
      await liff.init({ liffId: LIFF_ID });
      liffMod = liff;
      // https://liff.line.me/{LIFF_ID}/trips/xxx/add で開かれた場合、目的のページへ移動する
      const state = new URLSearchParams(location.search).get("liff.state");
      if (state && state.startsWith("/") && !state.startsWith("//")) {
        location.replace(state);
        return new Promise(() => {});
      }
      if (liff.isInClient() || liff.isLoggedIn()) {
        if (!liff.isLoggedIn()) {
          liff.login({ redirectUri: location.href });
          return new Promise(() => {}); // リダイレクト待ち
        }
        idToken = liff.getIDToken();
        const p = await liff.getProfile();
        return {
          ready: true,
          inClient: liff.isInClient(),
          error: null,
          me: { kind: "line", name: p.displayName, picture: p.pictureUrl ?? null },
        };
      }
    } catch (e) {
      console.warn("LIFF init failed", e);
    }
  }
  guestId();
  return { ready: true, inClient: false, error: null, me: { kind: "guest", name: getGuestName() || null, picture: null } };
}

const AuthCtx = createContext<AuthState & { loginWithLine: () => void }>({
  ready: false,
  me: null,
  error: null,
  inClient: false,
  loginWithLine: () => {},
});

let initPromise: Promise<AuthState> | null = null;

export function AuthProvider({ children, liffId }: { children: ReactNode; liffId: string }) {
  LIFF_ID = liffId;
  const [state, setState] = useState<AuthState>({ ready: false, me: null, error: null, inClient: false });
  useEffect(() => {
    initPromise ??= initAuth();
    initPromise.then(setState, (e) => setState({ ready: true, me: null, error: String(e), inClient: false }));
  }, []);
  const loginWithLine = () => {
    if (liffMod && !liffMod.isLoggedIn()) liffMod.login({ redirectUri: location.href });
  };
  return <AuthCtx.Provider value={{ ...state, loginWithLine }}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);

export function canLoginWithLine() {
  return !!liffMod && !liffMod.isLoggedIn();
}

export async function api<T = unknown>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (idToken) headers.Authorization = `Bearer ${idToken}`;
  else headers["X-Guest-Id"] = guestId();
  const res = await fetch(path, {
    method: init?.method ?? "GET",
    headers,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `エラー (${res.status})`);
  return data as T;
}

/** 旅行の入力ページのURL（LINEで開くとLIFFとして起動する） */
export function appUrl(path: string): string {
  if (LIFF_ID) return `https://liff.line.me/${LIFF_ID}${path}`;
  return `${location.origin}${path}`;
}

export const tripAddUrl = (tripId: string) => appUrl(`/trips/${tripId}/add`);

export async function shareToLine(text: string): Promise<"shared" | "opened" | "copied"> {
  if (liffMod?.isLoggedIn() && liffMod.isApiAvailable("shareTargetPicker")) {
    try {
      const r = await liffMod.shareTargetPicker([{ type: "text", text }]);
      if (r) return "shared";
    } catch (e) {
      console.warn(e);
    }
  }
  const url = `https://line.me/R/share?text=${encodeURIComponent(text)}`;
  if (/iPhone|iPad|Android/i.test(navigator.userAgent)) {
    if (liffMod?.isInClient()) liffMod.openWindow({ url, external: false });
    else location.href = url;
    return "opened";
  }
  await navigator.clipboard?.writeText(text).catch(() => {});
  window.open(url, "_blank");
  return "copied";
}

export const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;

export function formatRange(start: string | null, end: string | null) {
  const f = (d: string) => {
    const [y, m, day] = d.split("-").map(Number);
    return `${y}/${m}/${day}`;
  };
  if (start && end) {
    if (start === end) return f(start);
    const sameYear = start.slice(0, 4) === end.slice(0, 4);
    return `${f(start)} 〜 ${sameYear ? f(end).replace(/^\d+\//, "") : f(end)}`;
  }
  if (start) return `${f(start)} 〜`;
  if (end) return `〜 ${f(end)}`;
  return "";
}
