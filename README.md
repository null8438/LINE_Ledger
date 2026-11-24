# 旅の会計（LINE Ledger）

LINEグループで使う、旅行ごとの立て替え・割り勘・精算アプリです。

## できること

- **ホーム**：進行中（精算中を含む）の旅行が一番上に大きく表示され、精算が終わった旅行は「これまでの記録」として下に並びます。
- **リンクから即入力**：旅行ページの「LINEで送る」でグループにリンクを送ると、タップした人はすぐに「金額・項目・立て替えた人・割り勘する人」を選ぶだけの入力画面が開きます。
- **開いた人を自動で識別**：LINE内（LIFF）で開くとLINEのプロフィールから本人を割り出し、「立て替えた人」に最初から自分が選ばれた状態になります。初回だけ「あなたは誰？」を選び（候補がいなければ自動参加）、次回からは自動で認識されます。LINE外のブラウザでも端末ごとに記憶します。
- **会計**：「会計する」で、誰が誰にいくら払えばいいかを**送金回数が最小になる組み合わせ**で表示します（18人までは厳密解、それ以上は近似）。
- **支払い完了の管理**：会計を確定すると送金リストができ、払った人が◯をタップしてチェック。全員の支払いが終わると旅行は「完了」になり記録に移ります。「会計をやり直す」で入力状態に戻せます。

### 割り勘のルール

- 割り勘の対象は、登録時に選んだ人（初期値はその時点のメンバー全員）です。後から参加した人は、それ以前の支出には含まれません（編集で追加できます）。
- 割り切れない端数は、立て替えた人が対象に含まれていればその人が負担します。

## ローカルで動かす

```bash
npm install
npm run dev        # http://localhost:3000（ローカルの D1 を自動で使います）
npm test           # 精算ロジックのテスト
npm run preview    # Cloudflare の実行環境（workerd）で本番に近い形で確認
```

`LIFF_ID` が空のあいだはLINEなしのゲストモードで動きます（端末ごとのIDで識別）。

## Cloudflare に公開する（Workers + D1）

無料プランで動きます。

```bash
npx wrangler login                      # ブラウザで Cloudflare にログイン
npx wrangler d1 create line-ledger      # データベースを作成
```

表示された `database_id` を `wrangler.jsonc` の `d1_databases[0].database_id` に貼り付けて、

```bash
npm run deploy
```

`https://line-ledger.<あなたのサブドメイン>.workers.dev` が発行されます。テーブルは初回アクセス時に自動で作られます。

GitHub と連携して push のたびに自動デプロイしたい場合は、Cloudflare ダッシュボードの「Workers & Pages → 作成 → Git リポジトリをインポート」でこのリポジトリを選び、デプロイコマンドに `npm run deploy` を指定します（`database_id` を書き込んだ `wrangler.jsonc` をコミットしておく必要があります）。

## LINEで使えるようにする（LIFF の設定）

1. [LINE Developers](https://developers.line.biz/console/) でプロバイダーを作り、**LINEログイン**チャネルを作成します。
2. チャネルの「LIFF」タブで LIFF アプリを追加します。
   - サイズ：`Full`
   - エンドポイントURL：公開したURLのトップ（例 `https://line-ledger.xxxx.workers.dev`）
   - Scope：`profile` と `openid` にチェック
   - 「シェアターゲットピッカー」をオンにすると、アプリ内から直接グループを選んで送れます
3. `wrangler.jsonc` の `vars` を埋めて、もう一度 `npm run deploy` します（Cloudflare ダッシュボードの「設定 → 変数とシークレット」で設定してもOK）。
   - `LIFF_ID`：LIFF ID（`1234567890-xxxxxxxx`）
   - `LINE_LOGIN_CHANNEL_ID`：そのLINEログインチャネルのチャネルID。サーバー側でIDトークンを検証し、なりすましを防ぎます。
4. 共有されるリンクは `https://liff.line.me/{LIFF_ID}/trips/{旅行ID}/add` の形になり、LINEで開くとそのまま入力画面が表示されます。

## 注意

- 旅行へのアクセスは「リンクを知っていること」で許可しています（旅行IDは推測困難なランダム文字列）。リンクは旅行メンバー以外に共有しないでください。
- LINE の仕様上、LIFF からグループのメンバー一覧は取得できないため、メンバーは「リンクを開いた人」＋「手動で追加した人」で構成されます。

## 構成

- Next.js（App Router）/ React / TypeScript
- LIFF SDK（`@line/liff`）
- Cloudflare Workers（OpenNext）+ Cloudflare D1
- `src/lib/settle.ts`：割り勘と最小送金回数の精算アルゴリズム
- `src/lib/trips.ts`：データ操作、`src/app/api/**`：API
