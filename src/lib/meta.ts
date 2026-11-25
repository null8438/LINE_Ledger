import type { Metadata } from "next";
import { db } from "./db";

export const DEFAULT_TITLE = "旅の会計";
export const DEFAULT_DESCRIPTION = "旅行の立て替えと精算";

function meta(title: string, description: string): Metadata {
  return { title, description, openGraph: { title, description, siteName: DEFAULT_TITLE } };
}

/** LINE のリンクプレビュー用。旅行のパスなら旅行名入りの文言を返す */
export async function metaForPath(path: string | null | undefined): Promise<Metadata> {
  const m = path?.match(/^\/trips\/([a-z0-9]+)(\/(add|settle))?/);
  if (!m || m[1] === "new") return meta(DEFAULT_TITLE, DEFAULT_DESCRIPTION);
  try {
    const rs = await (await db()).execute({ sql: "SELECT name FROM trips WHERE id = ?", args: [m[1]] });
    const name = rs.rows[0]?.name;
    if (!name) return meta(DEFAULT_TITLE, DEFAULT_DESCRIPTION);
    const desc = m[3] === "add" ? "タップして立て替えを入力" : m[3] === "settle" ? "精算の状況を確認" : "立て替えの記録と精算";
    return meta(`${name}の会計`, desc);
  } catch {
    return meta(DEFAULT_TITLE, DEFAULT_DESCRIPTION);
  }
}
