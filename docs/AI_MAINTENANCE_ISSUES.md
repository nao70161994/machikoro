# AI maintenance issues

作成日: 2026-05-16

この文書は、Codex / Claude / ChatGPT などのAIがこのリポジトリを保守するときに誤解しやすい箇所をまとめます。バグ一覧ではなく、AIが安全に作業するための注意点です。

## High Risk Misreadings

### 1. `GameManager.allowedActionsFor()` は payload validation ではない

- 誤解: allowed action に入っていれば、その action は合法だと判断する。
- 実際: phase / pending state から action 名だけを返す。所持金、在庫、target、actor authority は別層。
- 関連: `js/GameManager.js`, `server.js`, `js/main.js`
- AI向け対策: action gate を触るときは、`allowedActionsFor`, `validateActionPayloadForState`, `validateGameAction`, `canRunHumanAction` を必ずセットで見る。

### 2. `validateActionPayloadForState()` は actor/phase gate ではない

- 誤解: server の全合法性をここで見ている。
- 実際: payload 形状と state に対する payload 合法性だけを見る。actor authority と phase gate は caller が先に通す。
- 関連: `server.js`
- AI向け対策: この関数へ authority 判定を混ぜない。混ぜるなら関数名と全テストを再設計する。

### 3. `CARD_EFFECT_METADATA` は実行処理の正本ではない

- 誤解: metadata に effect を足せばゲーム内で発動する。
- 実際: 実行処理はまだ `GameManager` の分岐が中心。metadata は分類・将来dispatch化の足場。
- 関連: `js/Card.js`, `js/GameManager.js`, `docs/CARD_SYSTEM.md`
- AI向け対策: 新effectでは `Card`, `GameManager`, `CPU`, `UI`, `server payload`, tests を確認する。

### 4. `CARD_INCOME_EFFECT_HANDLERS` は副作用を持たない

- 誤解: ワイナリーの休業や pending 追加も handler に入れる。
- 実際: 金額計算だけ。休業、coin transfer、pending は実ルール側に残す。
- 関連: `js/GameManager.js`, `docs/CARD_SYSTEM.md`
- AI向け対策: handler を増やすときは「数値だけ返す」制約を守る。

### 5. `card.name` と `card.id` の併存期

- 誤解: どちらか一方だけを変えればよい。
- 実際: 表示/旧save互換は名前、将来の内部安定キーはID。移行途中。
- 関連: `js/Card.js`, `js/storage.js`, `js/online.js`, `server.js`
- AI向け対策: 新規内部ロジックはID優先、旧データ読込は名前fallbackを残す。

### 6. Online は server authoritative ではない

- 誤解: server が完全状態を持ち、すべて検証している。
- 実際: server は action log と snapshot から mirror を作って検証する。dice や restore snapshot は client 由来の信頼境界が残る。
- 関連: `server.js`, `js/online.js`, `docs/ONLINE_SYNC.md`
- AI向け対策: online/security修正では「casual trust」か「authoritative」かを明示してから作業する。

### 7. CPU は live と selfplay で同じ入口ではない

- 誤解: `CPU.build` や `CPU._runSimulationStep` を直せば全CPU挙動が直る。
- 実際: live は `main.scheduleCPU`、simulation は `CPU._runSimulationStep`、scripts は `selfplay.js` に別入口がある。
- 関連: `js/main.js`, `js/CPU.js`, `scripts/selfplay.js`
- AI向け対策: CPU停止/判断修正では3入口を比較する。

### 8. `render()` は純粋な描画関数ではない

- 誤解: UI表示だけを変える安全な場所。
- 実際: stats記録、音、confetti、localStorage削除、save が入る。
- 関連: `js/ui.js`
- AI向け対策: render周辺を触る時は storage/stats/winner tests を走らせる。

### 9. `server.js` exports は外部APIではなく test hook が多い

- 誤解: exported helper を互換維持すべき公開APIと見る。
- 実際: 多くは tests 用の内部関数。
- 関連: `server.js`, `tests/server.test.js`
- AI向け対策: export変更は tests とセットで判断し、docs に test-only と明記する。

### 10. `models/rl_model/runs` は通常レビュー対象ではない

- 誤解: 生成物JSONをコード品質レビュー対象として読む。
- 実際: 多くは評価/学習artifactで、通常は registry/portfolio と scripts/tests を読む。
- 関連: `models/rl_model`, `scripts/rl`, `docs/rl-experiments.md`
- AI向け対策: 検索では source/docs/tests/scripts を優先し、artifact は必要時だけ見る。

## Recommended AI Workflow

### New card

1. `docs/CARD_SYSTEM.md` を読む。
2. `js/Card.js` の ID/name/effect/metadata/description を更新。
3. `js/GameManager.js` の発火処理か handler を更新。
4. `js/CPU.js` の評価と購入判断を確認。
5. `js/ui.js` のカードセット/表示を確認。
6. online payload が必要なら `server.js` / `js/online.js` を確認。
7. `tests/gamemanager.test.js`, `tests/cpu.test.js`, `tests/server.test.js` を追加。

### New pending effect

1. `GAME_ACTIONS` と `allowedActionsFor()` を確認。
2. `GameManager` に pending state/resolver を追加。
3. `main` の human/CPU action gate を追加。
4. `ui.renderPending()` を追加。
5. `server.validateActionPayloadForState()` と `applyActionToMirror()` を追加。
6. `online.applyAction()` を追加。
7. storage/online snapshot field を追加。
8. malformed payload と roundtrip tests を追加。

### Online sync change

1. `docs/ONLINE_SYNC.md` と `docs/online-restore-schema.md` を読む。
2. actor authority、phase gate、payload validation、mirror replay、client apply の5箇所を比較。
3. reconnect/session/snapshot/hostEpoch/actionSeq のテストを確認。
4. `npm run test:online` と `npm run test:smoke` を実行。

### CPU change

1. live: `main.scheduleCPU`
2. rule/expert: `js/CPU.js`
3. selfplay: `scripts/selfplay.js`
4. RL runtime: `js/RLCPU.js`
5. tests: `tests/cpu.test.js`, `tests/selfplay.test.js`, `tests/rlcpu.test.js`

## Search Tips

- `grep -RIn "pending[A-Z]" js server.js tests`
- `grep -RIn "validateActionPayloadForState\\|applyActionToMirror\\|applyAction(" js server.js tests`
- `grep -RIn "CARD_EFFECT_METADATA\\|CARD_INCOME_EFFECT_HANDLERS\\|CARD_IDS" js tests docs`
- `grep -RIn "localStorage\\|onlineStateSnapshot\\|onlinePendingAction" js tests docs`
- `grep -RIn "onclick=\\|innerHTML" index.html js tests`

`rg` が使えない環境もあるため、Termuxでは上記 `grep` で十分です。

## Stop Conditions For AI Agents

- Snapshot/restore schema の破壊的変更が必要。
- server authoritative へ切り替える仕様判断が必要。
- card name から card id への保存形式移行で互換方針が不明。
- Git conflict や履歴改変が必要。
- セキュリティ上危険な操作や credential 参照が必要。
