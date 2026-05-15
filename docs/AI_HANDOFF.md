# AI handoff notes

この文書は、途中参加した人間 / AI が最初に読む短い入口です。
詳細は各専門 doc を参照し、このファイルは現在地と次の安全な一手だけを示します。

## 読む順番

1. `README.md`: 起動方法、テスト、主要機能。
2. `docs/ARCHITECTURE.md`: 責務境界、phase/action map、壊してはいけない不変条件。
3. `docs/REFACTOR_PLAN.md`: Phase 1〜6 の方針と実施済みログ。
4. `docs/CARD_SYSTEM.md`: 新カード / 新 effect / 新ランドマーク追加時の修正箇所。
5. `docs/ONLINE_SYNC.md`: オンライン同期、再接続、server restart restore の正本。
6. `docs/CPU_AI.md`: CPU 評価の追従箇所とデータ駆動化の順番。

## 2026-05-16 時点の実施済み範囲

- Phase 1: 構成・リスク・棚卸し docs を追加し、Termux 向けの `test:static` / `test:smoke` を入口化した。
- Phase 2: `CARD_IDS`, `CARD_EFFECT_METADATA`, `CARD_INCOME_EFFECT_HANDLERS` を追加し、単純 income effect の dispatch 足場を作った。
- Phase 3: `GAME_ACTIONS`, `GAME_PHASE_ACTIONS`, `GameManager.allowedActionsFor(game)` を追加し、server と main の action gate を寄せた。
- Phase 4: server 内の live action / replay action payload 判定を `validateActionPayloadForState()` へ集約した。
- Phase 5: 建設メニューのカード / ランドマーク button HTML を helper 化した。
- Phase 6: docs の入口と実施済みログを揃えた。

## 次に安全な作業候補

- Card system: `CARD_EFFECT_METADATA` の `requires` / `cpuKind` を CPU 評価で読む小さな helper を追加する。
- Turn management: pending field は残したまま、`pending action` を読むだけの snapshot helper を追加する。
- Online sync: `applyActionToMirror` と `js/online.js applyAction` の action 対応表テストを追加する。実行本体の統合はまだしない。
- UI: 触る箇所から順に小さな render helper へ切り出す。inline handler の全面移行はまだしない。

## 変更時の最低確認

```sh
npm run test:static
npm run test:smoke
npm test
```

対象別の追加確認は `docs/maintenance-checklists.md` と `TESTPLAN.md` を使います。

## Review note for 932c00d

2026-05-16 に 932c00d をレビューしました。大きな挙動破壊は見つかっていません。確認した責務境界は次の通りです。

- `GameManager.allowedActionsFor(game)`: phase / pending state から action 名だけを返す。payload、在庫、所持金、actor 権限は判定しない。
- `validateActionPayloadForState()`: server 内の payload 判定専用。caller が actor authority と phase/action gate を先に通す前提。
- `CARD_INCOME_EFFECT_HANDLERS`: 金額計算だけを共有し、休業・pending・coin transfer などの副作用は実ルール側に残す。

追加で、空 pending / unknown phase の allowed action が空になる test と、payload helper が phase gate を担当しないことを示す server test を足しています。


## Whole-project review note 2026-05-16

重大・高優先の指摘を再レビューし、次を小さく修正しました。

- GameManager boundary: 不正 card と未知 landmark の build を拒否し、server の landmark payload validation も同じ既知 landmark 判定へ揃えた。
- Card metadata: `LOAN` / `ITSTARTUP` に複合 `triggers` を追加し、許可値 test で固定した。
- CPU live flow: pending 解決で CPU が不正 target / null move を返した場合、合法な最小 fallback を選び pending 停止を避ける。
- Online restore compatibility: `resolveMover` の旧 `cardName` payload を validator でも許可し、replay 側の互換と揃えた。
- Mobile UI: title screen は低い画面で縦 scroll できるようにした。

残る中・低優先は `docs/REFACTOR_PLAN.md` の review backlog に整理しています。
