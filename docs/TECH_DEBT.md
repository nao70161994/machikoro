# Technical debt register

作成日: 2026-05-16

この文書は、`PROJECT_ISSUES.md` の指摘を技術負債の束として並べ直したものです。実装順を決めるときは、ここにある roadmap を小PRへ分割してください。

## Debt Themes

### 1. Online authority and restore debt

- Server は full canonical state を常時保持せず、action log / snapshot から mirror を再構築する。
- Dice は client 生成で、server は範囲検証のみ。現行の信頼境界は `docs/ONLINE_SYNC.md` の casual trust model を正本にする。
- Server restart restore は host local bundle を強く信頼する。公開/競技運用では server canonical mirror か signed action log が必要。
- Snapshot schema が local save / online / server / undo で分散している。
- `onlineActionInFlight` timeout がなく、モバイル回線で固まりやすい。
- `recreateRoom` payload に総量制限がない。

推奨ロードマップ:

1. Socket handler payload guard と size limit を追加する。
2. Snapshot roundtrip / malformed actionLog matrix test を追加する。
3. server-side dice / canonical mirror が必要になる運用条件を `ONLINE_SYNC.md` の trust boundary と同期する。
4. room 内に server canonical mirror を保持する実験ブランチを作る。
5. action log に hash / signature / seq owner invariant を導入する。

### 2. Game state and phase debt

- `GameManager` はルール正本だが、pending/effect/turn/build/win が集中している。
- Pending は `pendingTV` など個別 field で、新 effect 追加時に横断変更が多い。
- `allowedActionsFor()` は action 名だけで、payload/inventory/authority は別層。
- CPU/UI/server が phase/pending をそれぞれ直接見る箇所が残る。

推奨ロードマップ:

1. `getPendingActionState(game)` を追加し、既存 pending fields を読み取り専用で一覧化する。
2. `resetTurnState()` / `resetPendingState()` を導入する。
3. `pendingActions` queue を互換 field と並行導入する。
4. `TurnManager` は最後に導入し、いきなり全面移行しない。

### 3. Card and data model debt

- `CARD_IDS` はあるが、`CARDS` は positional constructor 配列。
- `CARD_EFFECT_METADATA` は分類表で、dispatch の正本ではない。
- shop stock / snapshot / CPU / UI はカード名 key が多い。
- 新カード追加時の修正箇所が `Card`, `GameManager`, `CPU`, `UI`, `server`, tests に散る。

推奨ロードマップ:

1. `CARD_DEFS` object 配列を作り、`CARDS` と name/id map を生成する。
2. `Player.countCardById()` と `shopStockById` を追加し、name fallback を残す。
3. `getCardActivationProfile(card)` を導入し、`NORMAL` の色別挙動を明文化する。
4. effect handler を income から pending/steal へ段階拡張する。
5. `cpuHints` / `tags` / `comboSource` を card metadata に追加する。

### 4. CPU and RL debt

- `CPU.js` が巨大で、live / simulation / selfplay の実行器が分裂している。
- CPU戦略はカード名 magic string と tuning option に強く依存する。
- Online CPU build send failure の扱いが弱い。
- RL business action space はカード数の二乗で、拡張パックに弱い。
- RL 5〜10人 state は上位3人射影で情報落ちがある。
- eval/selfplay は `exhausted` を gate として十分に使っていない。

推奨ロードマップ:

1. live/simulation/selfplay の action execution を共通 helper へ寄せる。
2. CPU build action は success/failure を返すようにする。
3. CPU tuning preset を `cpuTuning.js` へ切り出す。
4. `CARD_EFFECT_METADATA` の `cpuHints` を CPU 評価へ接続する。
5. RL state/action schema v2 を設計し、既存モデル互換を残す。

### 5. UI, mobile, and PWA debt

- UI は `innerHTML` と inline handler が中心。
- `render()` が描画以外の副作用を持つ。
- `style.css` は巨大で media query がほぼない。
- PWA install/update banner の overlay 階層が整理されていない。
- Native `alert()` が残る。
- 実ブラウザ複数タブ / スマホ / PWA の自動 smoke がない。

推奨ロードマップ:

1. PWA banner CSS と z-index scale を整える。
2. native `alert()` を `showNotice()` へ置換する。
3. pending modal から `data-action` + event delegation へ移行する。
4. `render()` を active/winner/persist に分ける。
5. `style.css` を UI領域ごとに section 化し、スマホ media query を足す。

### 6. Test and tooling debt

- `test:static` は Python を見ない。
- `test:smoke` は CPU停止系と PWA を見ない。
- malformed replay payload matrix / snapshot roundtrip が不足。
- docs 内コマンドと `package.json` scripts の同期検査が弱い。
- 実ブラウザ multi-client smoke が手動依存。

推奨ロードマップ:

1. `test:static` に Python compile check を追加する。
2. `test:smoke` へ軽量 CPU pending test を追加する。
3. action schema coverage test を追加する。
4. docs の `npm run ...` 参照が存在するか検査する。
5. Playwright 導入前に、手動 smoke checklist を短く機械表示できる script を作る。

## Suggested Priority

### First 1-2 weeks

1. Socket handler object guard。
2. `recreateRoom` payload size limit。
3. malformed replay payload matrix。
4. snapshot roundtrip tests。
5. PWA banner z-index/CSS。
6. Python static check。

### Next month

1. `CARD_DEFS` 正本化。
2. `getPendingActionState()`。
3. action registry coverage。
4. CPU live/simulation/selfplay 実行 helper。
5. UI pending modal delegation。

### Longer term

1. server canonical mirror。
2. server-side dice。
3. pendingActions queue。
4. CPU/RL schema v2。
5. componentized UI and CSS sections。
