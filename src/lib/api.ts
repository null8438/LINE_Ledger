import { NextResponse } from "next/server";
import { getIdentity, HttpError, type Identity } from "./auth";

/** API ルートの共通処理：本人確認とエラーの JSON 化。 */
export function route<P>(fn: (req: Request, me: Identity, params: P) => Promise<unknown>) {
  return async (req: Request, ctx: { params: Promise<P> }) => {
    try {
      const me = await getIdentity(req);
      const result = await fn(req, me, await ctx.params);
      return NextResponse.json(result ?? { ok: true });
    } catch (e) {
      if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
      console.error(e);
      return NextResponse.json({ error: "サーバーでエラーが発生しました" }, { status: 500 });
    }
  };
}

export async function body<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, "リクエストが不正です");
  }
}
