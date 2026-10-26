# Mortal代役AI（ローカル麻雀のCPU・解析）の学習

ローカル麻雀（`play.html`）のCPUと「正解がわからない」「FALSE判定」は、端末内で動く **Mortal代役AI** が担当します。
Mortal 本体（ニューラルネット）はブラウザで動かせないため、Mortal の解析結果を教師データにして、
牌効率・押し引き・鳴き・リーチ判断の特徴量から Mortal の確率分布を再現するモデルを学習しています。
推論は `local/mj-ai.js` と学習済みの重み `local/ai-weights.js` だけで行い、通信はしません（機内モード可）。

## 再学習の手順

牌譜データ（`牌譜データ.json` / `牌譜データv2.txt`）に Mortal の検討URLを追加したら、次の順に実行します。

```sh
cd tools/local-ai
node fetch-reports.js ../../.cache/reports        # Mortal のレポートを取得（取得済みは飛ばす）
node featurize.js ../../.cache/reports ../../.cache/feat --perms 0,1,2   # 特徴量を計算（並列）
node train2.js ../../.cache/feat --perms 0,1,2              # 学習用/テスト用に分けて精度を確認
node train2.js ../../.cache/feat --perms 0,1,2 --all --write  # 全データで学習して local/ai-weights.js に書き出す
node rules-test.js                                          # 対局ルールの単体テスト
node selfplay.js 5                                          # AI 4人で半荘を自動対局（例外・点数の保存則の確認）
```

`.cache/` はリポジトリに含めません（`.gitignore` 済み）。

## ファイル

| ファイル | 内容 |
|---|---|
| `dataset.js` | レポートの mjai ログを再生して、レビュー対象プレイヤーの各判断時点の局面・合法手・Mortal の確率を取り出す |
| `featurize.js` | 局面ごとの特徴量を並列計算してバイナリ保存。萬子・筒子・索子を入れ替えた局面も作れる（`--perms`） |
| `train2.js` | 線形＋隠れ層1つのモデルを、Mortal の確率分布との交差エントロピーで学習 |
| `analyze.js` / `debug.js` | Mortal と食い違った局面の表示、特定の手牌の特徴量の確認 |
| `rules-test.js` / `selfplay.js` | 対局エンジンのテスト |

## 精度の目安

学習に使っていない半荘で、Mortal 本家の最善手との一致率を測っています（数値は `local/ai-weights.js` の `meta`）。
Mortal が90%以上の確信で選ぶ局面ではおおむね一致しますが、Mortal 自身が迷う局面（候補の確率が拮抗）では食い違いが増えます。
