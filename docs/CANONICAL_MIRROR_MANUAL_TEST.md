# Canonical Mirror Manual Regression

作成日: 2026-05-17
対象: PR-031 server canonical mirror / state hash diagnostics

## 目的

実ブラウザ複数端末で、server canonical mirror が長時間オンライン対戦、再接続、Undo、host 移譲、server restart restore の間も破綻しないことを確認する。

この環境では複数実機ブラウザの長時間操作を代替できないため、確認結果は manual verification required として本手順に記録する。

## 事前準備

1. 作業ツリーを clean にする。
2. サーバーを起動する。

```sh
node server.js 2>&1 | tee /tmp/machikoro-canonical-mirror.log
```

3. 2台以上の端末、または別ブラウザプロファイルを用意する。
4. 各クライアントで同じ URL を開き、Service Worker 更新バナーが出た場合はゲーム開始前にリロードして揃える。
5. DevTools console を開ける環境では開き、version mismatch / reconnect / appError を確認できるようにする。

## ログ確認

サーバーログに次が出ないことを確認する。

```sh
grep -n "canonical mirror mismatch detected|appError|uncaughtException|unhandledRejection" /tmp/machikoro-canonical-mirror.log
```

mismatch が出た場合は、以下を記録する。

- roomId
- actionSeq
- marker.actionSeq
- marker.actionLogLength
- previousHash
- rebuiltHash
- 直前の操作
- 各プレイヤーの所持コイン、現在フェーズ、手番プレイヤー

## シナリオ A: 再接続

1. ホスト A がオンライン部屋を作成する。
2. 参加者 B が入室し、2人以上で開始する。
3. 10ターン以上進める。青、赤、緑、紫の発火を最低1回ずつ含める。
4. B のタブを閉じる。
5. B が同じブラウザで再度アプリを開き、オンライン復帰する。
6. A と B の画面で、手番、フェーズ、所持コイン、建設済みランドマークが一致することを確認する。
7. さらに5ターン進め、サーバーログに canonical mirror mismatch がないことを確認する。

## シナリオ B: Undo

1. 建設フェーズまで進める。
2. 現在プレイヤーが施設カードを建設する。
3. Undo ボタンで建設を取り消す。
4. 同じターンで別のカードまたはランドマークを建設する。
5. 全クライアントで shop stock、所持コイン、builtThisTurn 表示が一致することを確認する。
6. サーバーログに canonical mirror mismatch がないことを確認する。

## シナリオ C: host 移譲

1. ホスト A、参加者 B、可能なら C で開始する。
2. 10ターン以上進める。
3. A のタブを閉じる。
4. B または C が host になり、CPU 手番や人間手番が止まらず進むことを確認する。
5. A が再接続できる場合は復帰し、画面状態が一致することを確認する。
6. サーバーログに canonical mirror mismatch がないことを確認する。

## シナリオ D: server restart restore

1. ホスト A と参加者 B で開始し、10ターン以上進める。
2. サーバーを Ctrl-C で停止する。
3. 同じコマンドでサーバーを再起動する。
4. A が部屋再作成 / 復元導線を実行する。
5. B が再参加または再接続する。
6. 復元後に5ターン以上進める。
7. 再起動前後で actionSeq が後退していないこと、画面状態が一致すること、canonical mirror mismatch がないことを確認する。

## シナリオ E: 長時間プレイ

1. 3人以上、CPU 混在ありで開始する。
2. 60分以上、または actionLog compact が起きる程度まで継続する。
3. 途中で最低1回ずつ、再接続と Undo を行う。
4. 終了時にサーバーログを grep し、canonical mirror mismatch / uncaughtException / unhandledRejection がないことを確認する。

## 記録テンプレート

- 実施日:
- commit hash:
- 端末 / ブラウザ:
- player count / CPU設定:
- 開始時刻:
- 終了時刻:
- シナリオ A:
- シナリオ B:
- シナリオ C:
- シナリオ D:
- シナリオ E:
- grep 結果:
- mismatch 発生時の詳細:
- 判定:
