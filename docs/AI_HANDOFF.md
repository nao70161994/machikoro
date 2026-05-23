# AI handoff notes

この文書は、途中参加した人間 / AI が最初に読む短い入口です。
詳細は各専門 doc を参照し、このファイルは現在地と次の安全な一手だけを示します。

## 読む順番

1. `README.md`: 起動方法、テスト、主要機能。
2. `docs/ARCHITECTURE.md`: 責務境界、phase/action map、壊してはいけない不変条件。
3. `docs/AI_MAINTENANCE_ISSUES.md`: AI が誤読しやすい不変条件、stop conditions、grep 入口。
4. `docs/REFACTOR_PLAN.md`: Phase 1〜6 の方針と実施済みログ。
5. `docs/CARD_SYSTEM.md`: 新カード / 新 effect / 新ランドマーク追加時の修正箇所。
6. `docs/ONLINE_SYNC.md`: オンライン同期、再接続、server restart restore の正本。
7. `docs/CPU_AI.md`: CPU 評価の追従箇所とデータ駆動化の順番。

## 2026-05-16 時点の実施済み範囲

- Phase 1: 構成・リスク・棚卸し docs を追加し、Termux 向けの `test:static` / `test:smoke` を入口化した。
- Phase 2: `CARD_IDS`, `CARD_EFFECT_METADATA`, `CARD_INCOME_EFFECT_HANDLERS` を追加し、単純 income effect の dispatch 足場を作った。
- Phase 3: `GAME_ACTIONS`, `GAME_PHASE_ACTIONS`, `GameManager.allowedActionsFor(game)` を追加し、server と main の action gate を寄せた。
- Phase 4: server 内の live action / replay action payload 判定を `validateActionPayloadForState()` へ集約した。
- Phase 5: 建設メニューのカード / ランドマーク button HTML を helper 化した。
- Phase 6: docs の入口と実施済みログを揃えた。

## 2026-05-19 時点の追加実施済み範囲

- UI: dice / Business Center / card select / stats / static shell / player settings の inline handler を delegated handler へ移行した。既知の `onclick=` / `onchange=` / `oninput=` は解消済み。
- UI: `renderPending()` の表示可否と modal content 更新を helper 化した。pending 種別 HTML の分割は targeted HTML assertion 追加後に行う。
- CPU: 診断系 profile / trace 集計を `js/cpuDiagnostics.js` へ分離した。評価式と行動選択は未変更。
- GameManager/Card metadata: 飲食店・商店 category group を `CARD_CATEGORY_GROUPS` に寄せ、該当効果のカテゴリ判定を helper 経由にした。
- Server: restore rank / replacement 判定を `server/restoreRank.js` へ分離した。

## Continuous review operating policy

- Continuous review は、現在のユーザー依頼が自律的な実装修正を求めている場合に限り、Cycle 完了ごとに停止せず、停止条件に該当するまで Cycle 1, 2, 3... と自律継続する。明示的な review-only / no-edit 指示がある場合はそれを優先する。
- 各 Cycle は全体レビュー、修正、tests、docs 更新、commit / push、working tree clean 確認まで行い、直後に次 Cycle を開始する。
- 「完了しました。次へ進めますか？」で止めない。停止してよいのは、テスト3回修正失敗、git conflict、push失敗、破壊的変更、実機確認必須、hostless restore / server persisted canonical state など設計判断必須、または自動で安全に対応できる指摘がなくなった場合のみ。
- 次 Cycle では前 Cycle の副作用も含め、変更箇所だけでなく毎回ディレクトリ全体を再レビューする。

## 次に安全な作業候補

- UI: pending 種別ごとの HTML helper 化は、HTML 出力の targeted assertion を追加してから小さく進める。
- CPU: evaluation / execution の分離は、同等性を固定する targeted tests を先に追加してから関数単位で進める。
- GameManager: pending / steal / redistribute の dispatch registry 化は、発火順とログ文言 test を増やしてから効果単位で進める。
- Server: socket handler / validation のさらなる分割は、room lifecycle と restore manual regression の影響範囲を docs に固定してから小さく進める。

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

## 2026-05-20 continuous review Cycle 1

- Critical: 未検出。
- High fixed: 遅延 dice callback の世代ずれ、pending queue の out-of-order 解決、勝利後 online action の許可。
- 追加した不変条件: pending 中に許可される action は queue の先頭 descriptor の action だけ。UI も server も `GameManager` の同じ helper を正本にする。
- 次に見る Medium/design: action contract の層間重複、snapshot ownership の整理、server socket handler / validation 分割、CPU evaluation / execution 分割。
- 手動確認候補: 複数端末 online で複数 pending が連続するケース、最終ランドマーク建設直後の reconnect / restore、iPhone Safari の dice animation 中 restart。

## 2026-05-20 continuous review Cycle 2

- High fixed: server restart restore の actionLog replay が勝利後 action を再生できる不整合を修正した。
- 追加した不変条件: live validation と restore replay のどちらでも、勝利済み game には追加 action を適用しない。
- Medium follow-up: eval scripts と RLCPU action mask は pending queue の先頭 descriptor を正本にする余地がある。

## 2026-05-20 continuous review Cycle 2 pending parity

- Medium fixed: RLCPU action mask と expert eval fast path を pending queue 先頭 descriptor に追従させた。
- 追加した不変条件: RL / CPU evaluation 補助でも、pending 中に扱う action は GameManager の queue 先頭を正本にする。


## 2026-05-20 continuous review Cycle 3 UI/PWA

- High fixed: pending floating panel の ARIA contract mismatch、PWA waiting update button の disabled 状態残留、PWA banner の iPhone safe-area 未対応。
- 追加した不変条件: non-blocking panel は `aria-modal=true` にしない。PWA update banner は表示ごとに既定状態を初期化してからオンライン対戦中の制約を適用する。
- 手動確認候補: iPhone Safari / Android Chrome の install/update banner、standalone PWA の home indicator 付近、オンライン対戦中に waiting SW が来てゲーム終了後に更新可能になる流れ。


## 2026-05-20 continuous review Cycle 3 online/RL safety

- High fixed: malformed pending renovation queue の loop、prototype roomId lookup、accepted action payload の余分 key 保持、host migration 後の stale server host restore、Python/JS RL pending queue drift、JS eval export path race、JS CPU oracle hang。
- 追加した不変条件: pending queue が存在する場合、各 resolver/evaluator/oracle は queue 先頭 field のみを処理する。server が受理して残す action data は action ごとの canonical payload だけにする。
- Design deferred: host-supplied restore snapshot の server signature / persisted canonical state。


## 2026-05-20 continuous review Cycle 3 pendingActions schema

- High fixed: pendingActions snapshot の action/field 不一致・count mismatch、CPU fallback の queue 先頭迂回、pendingActions schema docs 欠落。
- 不変条件: `pendingActions` の entry は固定 action/field pair で、queue 内 field 件数は legacy pending field count と一致する。

## 2026-05-20 continuous review Cycle 4

- Critical: 未検出。
- High: host-supplied restore snapshot の署名/永続 canonical state は設計判断待ちのため自動修正対象外。
- Medium fixed: expert eval fast path の pending queue test を static source assertion から behavioral probe へ変更した。
- 追加した不変条件: eval fast path でも mixed pending queue は `GameManager.nextPendingActionFor()` が示す先頭 field だけを解決する。
- Docs: `PROJECT_ISSUES.md` / `IMPLEMENTATION_ROADMAP.md` は historical inventory/plan を含むため、最新状態は progress/audit/handoff を優先する。inline handler docs は delegated handler 移行済みとして更新した。
- Follow-up: ntfy endpoint の shared token/origin gate は production hardening backlog。iPhone/Android の PWA/update/online restore は manual verification required。

## 2026-05-20 continuous review Cycle 5 ntfy endpoint gate

- ntfy client error endpoint は optional `CLIENT_ERROR_SHARED_TOKEN` と origin gate を持つ。未設定時は既存の browser reporter がそのまま動く。
- cross-origin `Origin` / `Referer` は拒否される。production で別 origin から投げる必要がある場合は `CLIENT_ERROR_ALLOWED_ORIGINS` に明記する。
- Debug test endpoint も同じ auth gate を通るため、token 設定時の curl には `X-Client-Error-Token` が必要。

## 2026-05-20 continuous review Cycle 5 RL eval simulator guard

- `eval-rl-vs-js` は full-fidelity simulator 固定。`--fast` / `--lite` を安易に通さないことを test で固定した。
- 将来 lightweight 評価を足す場合は、adoption 用ではなく smoke 用の別 flag / 別 command として設計する。

## 2026-05-20 continuous review Cycle 5 accessibility labels

- title/game/PWA shell の主要 input と icon-only button に programmatic label を追加した。
- 今後 UI を追加する場合、視覚的な近接テキストだけに頼らず `label for` / `aria-label` / `aria-describedby` のいずれかで名前を固定する。

## 2026-05-20 continuous review Cycle 5 diagnostics helper split

- `diagnose-expert-v2-branches.js` の counter utilities は `scripts/diagnostics/expert-v2-branch-counters.js` に分離済み。
- 次に分けるなら、formatting helper か branch instrumentation の一部を targeted tests 付きで小さく抽出する。

## 2026-05-21 expert v2simple search

- v2simple 凍結を解除し、最小変更として `buildTempo` を `0.05 -> 0.03` に下げた。
- 採用理由: 100戦 full suite で旧 `0.05` 比 `strongWeighted 56.2% -> 57.5%`, `strongMin/allStrong4 36.0% -> 38.0%`、`normalCrowd 59.0% -> 57.0%` で -2pt 以内。
- 不採用: `buildTempo=0.02` は strong 側を改善したが `normalCrowd=56.0%` で -3pt のため採用しない。
- 次候補は、広い duplicate/growth/guard ではなく、loss 側に偏る狭い条件だけを見る。benchmark は `docs/expert-v2-diagnostics.md` の gate を優先する。


## 2026-05-23 continuous review Cycle 7

- restore replacement は既存 room の reconnect token で認証する。incoming `gameStartPayload.reconnectTokenHashes` は既存 room replacement の認証根拠にしない。
- restore rank は replacement 判定で replay-backed seq（snapshot/actionLog）だけを使う。`gameStartPayload.actionSeq` は互換用 metadata として扱う。
- RL export は `stateSchema` / `actionSchema` を明示し、runtime は既知 schema の action/card count mismatch を早期拒否する。
- `eval-rl-models` result と registry import は `evaluationConfig` で seed policy を残す。
- APK workflow は Bubblewrap build 前に `test:static`, `npm test`, `test:pwa`, `test:release` を通す。
- game 中の Service Worker update / controllerchange は自動 reload せず banner 表示へ倒す。

## 2026-05-23 continuous review Cycle 8

- PWA update: game 中の unsolicited controllerchange は reload しないが、ユーザーが `pwaApplyUpdate()` を押した場合は reload を許可する。
- Restore rank: replacement freshness は `gameStartPayload.actionSeq` と raw `actionLog[].seq` を信頼しない。`stateSnapshot.actionSeq + replayable action count` を client/server/docs/tests の正とする。
- Restore cleanup: reconnect failure cleanup は restore bundle も破棄する。
- RLCPU: custom state schema でも flat action head の `numActions` mismatch は早期拒否する。

## 2026-05-23 continuous review Cycle 9

- Restore ack guard: `rejoinData.acceptedClientActions` is now part of reconnect semantics. It is a compact list of accepted `clientActionId` refs retained even after action log compaction into canonical snapshot; clients use it only to clear matching pending outbound action, not to replay.
- Client-error privacy: browser reports send only origin+pathname; ntfy output hashes room id. Avoid reintroducing query/hash or raw reconnect/session data into notifications.
- RL eval artifacts now record effective schema/action metadata. Legacy portfolio JSONs without explicit schema should still evaluate via `stateDim` fallback.

## 2026-05-23 continuous review Cycle 10

- `rejoinData.acceptedClientActions` must be present on normal `rejoinRoom` and server-restart `recreateRoom` paths. It is ack metadata only; never replay it as canonical action log.
- Modal open now marks `titleScreen`, `gameScreen`, `pwaUpdateBanner`, and `pwaInstallBanner` inert/aria-hidden, then restores previous attributes on close. New modal roots need the same restore discipline.
- PWA update banner wins over install banner. Only suppress install when update banner is explicitly `display: block`; an absent/default display must not block `beforeinstallprompt`.
- `normalizeClientErrorPayload` strips URL query/hash from stack and filename before ntfy formatting. Do not reintroduce raw room/session/token data into notification text.
- `validate-rl-registry` warns on same-condition eval entries with conflicting metrics. Treat warnings as adoption-review blockers until the registry records a discriminator or removes the duplicate.

## 2026-05-23 continuous review Cycle 11

- Express `trust proxy` defaults to false. Set `TRUST_PROXY=1` or `EXPRESS_TRUST_PROXY` only when the deployment is actually behind a trusted proxy and `CLIENT_ERROR_ALLOWED_ORIGINS` covers the public HTTPS origin.
- Production ntfy reporting rejects no-origin/no-token client-error requests by default. Use browser same-origin reports, `CLIENT_ERROR_SHARED_TOKEN`, or an explicit `CLIENT_ERROR_ALLOW_NO_ORIGIN` exception only for controlled diagnostics.
- If `beforeinstallprompt` arrives while the PWA update banner is visible, the install event is retained and shown after update banner dismissal. Keep this arbitration when changing banner lifecycle.
- `runTest()` returns async test promises. New async tests should either return/await `runTest(...)` or stay synchronous; do not rely on fire-and-forget promise handlers.
- `validate-rl-registry --strict-warnings` fails on warnings for adoption review. `render-rl-registry-evals` rejects same-identity evals with conflicting metrics instead of silently skipping them.
- Host-supplied restore snapshot signing / server persisted canonical state remains design decision required; do not implement partial trust-boundary changes without a design doc and migration plan.
