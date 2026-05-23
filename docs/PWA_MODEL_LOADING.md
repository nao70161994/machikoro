# PWA RL Model Loading

作成日: 2026-05-19

## 方針

Service Worker の install / update では、アプリ起動に必要な軽量 asset だけを precache します。

RL CPU の browser model JSON は数十 MB 規模になるため、install 時には先読みしません。`AI（深層学習・ランダム）` を選択して `RLModelPortfolio` が model JSON を要求した時点で取得し、Service Worker の runtime cache に保存します。

## 期待する挙動

- 初回 install / update は RL model の転送を待たない。
- RL CPU を初めて使う時だけ、該当する portfolio model JSON を取得する。
- model JSON は network-first で取得し、失敗時は同じ Service Worker cache version 内の cached fallback を再利用する。
- model 取得に失敗した場合、既存どおり `CPU（最強）` へ fallback する。

## 実装境界

- `sw.js`
  - `STATIC_ASSETS` は app shell と起動に必要な JS / CSS / icon だけを持つ。
  - `/models/rl_model/portfolio/*.browser.json` は fetch 時に network-first / cached fallback で扱う。
- `js/RLModelPortfolio.js`
  - model JSON の取得タイミングは CPU 作成時のまま維持する。
  - Service Worker が無い環境でも通常の network request として動く。

## 確認

- `npm run test:pwa`
- `npm run test:static`
- 実ブラウザで PWA を更新し、install/update 時に RL model JSON が一括取得されないことを Network panel で確認する。
- RL CPU を選んだ時だけ model JSON が取得され、オフライン時は Service Worker cache から返ることを確認する。
