// リクエストから「誰が操作しているか」を割り出す。
// - LINE（LIFF）内: クライアントが送る ID トークンを LINE の API で検証し userId を得る
// - LINE 外のブラウザ: 端末ごとのゲストID（localStorage）で識別する

export type Identity = {
  userId: string;
  name?: string;
  picture?: string;
  kind: "line" | "guest";
};

type Verified = { sub: string; name?: string; picture?: string; exp: number };
const cache = new Map<string, Verified>();

async function verifyLineIdToken(idToken: string): Promise<Verified | null> {
  const channelId = process.env.LINE_LOGIN_CHANNEL_ID;
  if (!channelId) return null;
  const hit = cache.get(idToken);
  if (hit && hit.exp * 1000 > Date.now()) return hit;
  const res = await fetch("https://api.line.me/oauth2/v2.1/verify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ id_token: idToken, client_id: channelId }),
  });
  if (!res.ok) return null;
  const v = (await res.json()) as Verified;
  if (cache.size > 1000) cache.clear();
  cache.set(idToken, v);
  return v;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function getIdentity(req: Request): Promise<Identity> {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const v = await verifyLineIdToken(auth.slice(7));
    if (v) return { userId: v.sub, name: v.name, picture: v.picture, kind: "line" };
    if (process.env.LINE_LOGIN_CHANNEL_ID) throw new HttpError(401, "LINEの認証に失敗しました。開き直してください。");
  }
  const guest = req.headers.get("x-guest-id");
  if (guest && /^[a-z0-9]{8,40}$/.test(guest)) return { userId: `guest:${guest}`, kind: "guest" };
  throw new HttpError(401, "ユーザーを識別できませんでした。");
}
