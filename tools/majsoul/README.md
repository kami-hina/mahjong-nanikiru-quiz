# 雀魂（じゃんたま）の牌譜を一括で Mortal にかける

1. `fetch-paipu.js` … 雀魂の牌譜URLを一気に集める（Node + Playwright）
2. `mortal-ext/` … 集めたURLを Mortal（mjai.ekyu.moe）に順番にかけて、解析後URLの一覧を作る Chrome 拡張
3. できた一覧をクイズアプリ（index.html）の「取り込み」欄に貼ると、牌譜URLを紐づけたまままとめて取り込める

Mortal のフォームは Cloudflare の人間確認（Turnstile）付きで、Playwright などの自動操作ブラウザでは通らない。
そのため 2 は普段使いの Chrome に入れる拡張にしてある。人間確認のチェックを押す以外は自動。

## 1. 牌譜URLを集める

```
cd C:\麻雀
node tools/majsoul/fetch-paipu.js            # 四麻・半荘だけ（Mortalで検討できるもの）
node tools/majsoul/fetch-paipu.js --all      # 三麻・東風・一局戦も
node tools/majsoul/fetch-paipu.js --type 2   # 0=全部(既定) 1=友人戦 2=段位戦 4=大会戦
```

- Chromium が開いて雀魂のログイン画面が出るので、ログインする（「次回から自動でログイン」にチェック）。
  2回目以降は自動ログイン。ログイン情報は `tools/majsoul/profile/` に保存され、git には入らない。
- ホーム画面が出たら自動で牌譜一覧を取得する（直近 約1000件まで。サーバー側の上限）。
- 出力（`tools/majsoul/out/`、git には入らない）
  - `牌譜URL_<日時>.txt` … 1行1URL。クリップボードにもコピー済み
  - `牌譜一覧_<日時>.tsv` … 日時・種別・卓・順位・参加者つき
  - `records.json` … 取得済み全件。実行のたびに合流するので何度やっても続きから

仕組み: 雀魂のWeb版は Unity 製でブラウザのコンソールから内部APIを呼べないため、
ゲームがサーバーと話している WebSocket を捕まえて牌譜一覧の要求（`.lq.Lobby.fetchGameRecordList`）を流し込み、
返ってきた protobuf を最小限のデコーダで読む。自動取得に失敗したときは、ゲーム内の「牌譜」画面を
スクロールして読み込まれた分を拾う保険モードになる。
牌譜URL末尾の `_a〜` は自分のアカウントIDを符号化したもの（雀魂牌譜屋と同じ式）。これがあると Mortal が自分の席を自動で選ぶ。

## 2. Mortal にかける（Chrome 拡張）

初回のみ: Chrome で `chrome://extensions` → 右上「デベロッパーモード」ON →
「パッケージ化されていない拡張機能を読み込む」→ `C:\麻雀\tools\majsoul\mortal-ext` を選ぶ。

1. ツールバーの「Mortal一括解析」を開き、牌譜URL（1 でできた一覧。天鳳URLも可）を貼って「開始」
2. Mortal のフォームが開く。人間確認のチェックボックスが出たら押す（自動で通ることもある）。
   通ると自動で送信され、解析が終わって結果ページに移ると結果URLを控えて次のURLへ進む
3. 全部終わったら「結果をコピー」。`牌譜URL ⇥ MortalURL` の形で1行1件コピーされる
4. クイズアプリの「取り込み」欄に貼って「取り込む」

失敗したものは「失敗分をやり直す」で再挑戦できる（三麻・東風・大会ルールなど Mortal 非対応の牌譜はエラーになる）。
進み具合は拡張のアイコンのバッジに出る（「押す」= 人間確認待ち）。

## 必要なもの

- Node.js と playwright（`npm i -g playwright` か、`npx playwright` のキャッシュ）。
  ブラウザは Playwright の Chromium（無ければ入っている Google Chrome）
