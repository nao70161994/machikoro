# Online Restore Schema

オンライン復元は、サーバーが完全なゲーム状態を永続化しない前提で、クライアント保存データとサーバー側 mirror snapshot を組み合わせて状態を戻す仕組みです。挙動変更時は、ここを「保存形式と互換性の確認表」として使ってください。

変更種別ごとの自動確認、手動確認、RL parity fixture は [`docs/maintenance-checklists.md`](maintenance-checklists.md) を入口にしてください。

## 復元フロー

1. ゲーム開始時にクライアントが `onlineGameStart` を保存する。
2. action 適用ごとに `onlineActionLog` を保存する。
3. action log が長くなると、クライアントは `onlineStateSnapshot` に圧縮して log を空にする。
4. サーバーも `stateSnapshot` と `actionLog` を持ち、長い log は canonical mirror state に圧縮する。
5. 再接続時は `gameStartPayload` で初期化し、`stateSnapshot` を復元し、残り `actionLog` を replay する。
6. サーバー再起動後はホストが `recreateRoom` で保存済み bundle を送り、サーバーが検証済み canonical snapshot に畳み直す。

## localStorage Keys

| key | 所有者 | 内容 | 破棄条件 |
| --- | --- | --- | --- |
| `onlineGameStart` | client | 復元の root payload。`schemaVersion` と開始時設定を含む。 | schema mismatch、壊れた JSON、再接続不能な session |
| `onlineActionLog` | client | snapshot 以降の action 差分。各 entry は replay 可能な action。 | snapshot 圧縮時、schema mismatch |
| `onlineStateSnapshot` | client | `GameManager` 相当の復元用状態。action log 圧縮後の基準点。 | 新規ゲーム開始、schema mismatch、壊れた JSON |
| `onlinePendingAction` | client | 送信済みだが ack 前の action。再接続時に重複しない形で action log へ戻す。 | ack、reset、schema mismatch |
| `onlineSession` | client | タイトル画面の再接続 UI 用 session 情報。 | reconnect failure、明示削除 |

## `onlineGameStart`

現在の schema は `schemaVersion: 2` です。`js/online.js` の `ONLINE_RESTORE_SCHEMA_VERSION` を更新する場合、古い保存データの破棄または migration 方針を同時に決めてください。

| field | 必須 | 互換性メモ |
| --- | --- | --- |
| `schemaVersion` | yes | 現行値と一致しない場合、クライアントは復元送信せず破棄する。 |
| `playerNames` | yes | 開始時の元 index 順。サーバー検証では `playerOrder` 後の表示順と混同しない。 |
| `playerSettings` | yes | CPU / human と difficulty。空配列は旧ロビー互換として扱う。 |
| `cpuSpeed` | yes | CPU 自動進行の速度。数値で非負。 |
| `playerOrder` | nullable | シャッフル後の対応表。存在する場合は `0..playerCount-1` の permutation。 |
| `enabledCards` | nullable | null は全カード有効。カード追加時は旧 snapshot の unknown card 拒否に注意する。 |
| `enabledLandmarks` | nullable | null は全ランドマーク有効。 |
| `versions` | optional | バージョン不一致警告用。復元可否の唯一条件にしない。 |
| `reconnectTokenHashes` | yes | プレイヤーごとの再接続検証用。配列であることが schema gate。 |
| `hostPlayerIndex` | yes | host 復元 / 移譲の基準。server-side player index。 |
| `hostEpoch` | optional | 復元 bundle の新旧比較に使う。欠落時は `0` 扱い。 |
| `actionSeq` | optional | compatibility / local sequencing metadata。復元置換の freshness は `stateSnapshot.actionSeq + replayable actionLog count` を使い、この値だけでは既存roomを上書きしない。 |

## `onlineActionLog` / Server `actionLog`

各 entry は `{ action, data, playerIndex?, seq?, clientActionId? }` です。

| field | 必須 | 互換性メモ |
| --- | --- | --- |
| `action` | yes | `GameManager` に replay できる action 名。未知 action は server replay で拒否。 |
| `data` | optional | 欠落時は `{}` に正規化される。replay action 側で必要 field を検証する。 |
| `playerIndex` | optional | server-side actor index。オンラインでは UI 表示 index ではなくこの index を検証に使う。 |
| `seq` | optional | `actionSeq` と比較して、snapshot に畳み込まれた未 ack action の再送を避ける。 |
| `clientActionId` | optional | ack / pending action 重複排除用。存在する場合はこれを優先して同一判定する。 |

## `stateSnapshot` / `onlineStateSnapshot`

snapshot は `serializeMirrorState()` / `buildOnlineSnapshot()` の同型データです。server restore では型と room 設定との整合を検証し、旧 snapshot の補完可能な field 欠落は既定値で復元します。

| field | 必須 | 互換性メモ |
| --- | --- | --- |
| `players` | yes | `playerCount` と同じ長さ。各 player は `name`, `coins`, `cards`, `dormantIndices`, `landmarks`, `itVentureCoins`, `hasYakusho` を持つ。旧 snapshot の `dormantIndices`, `landmarks`, `itVentureCoins`, `hasYakusho` 欠落は既定値で補完される。 |
| `currentPlayerIndex` | optional | ある場合は `0..playerCount-1`。欠落時は初期値を使う。 |
| `phase` | optional | ある場合は `GAME_PHASES` の値。欠落時は初期値を使う。 |
| `log` | optional | 構造化ログ配列。欠落時は空ログ。自由文字列へ戻さない。 |
| `lastDiceResult`, `lastDice1`, `lastDice2` | optional | ある場合は非負整数。欠落時は初期値を使う。 |
| `builtThisTurn` | optional | ある場合は boolean。欠落時は初期値を使う。 |
| `pendingTV`, `pendingBusiness`, `pendingCleaning` | optional | ある場合は非負整数。欠落時は初期値を使う。 |
| `pendingMover`, `pendingRenovation`, `pendingIT`, `pendingTunaDice` | optional | 旧 snapshot 互換のため欠落許容。復元時は既定値へ戻る。 |
| `pendingActions` | optional | interactive pending の解決順 queue。各 entry は `{ action, field }` で、`pendingTV`/`resolveTV`, `pendingBusiness`/`resolveBusiness`, `pendingCleaning`/`resolveCleaning`, `pendingMover`/`resolveMover`, `pendingRenovation`/`resolveRenovation` の正しい対応だけを許可する。旧 snapshot は欠落許容。 |
| `usedReroll` | optional | ある場合は boolean。欠落時は初期値を使う。 |
| `turnCount`, `hadAmusementParkAtRoll` | optional | 旧 snapshot 互換のため欠落許容。 |
| `shopStock` | optional | card name -> 非負整数。欠落カードは初期在庫として扱う。 |
| `undoState` | nullable | valid な場合のみ採用。client 由来 snapshot は invalid `undoState` を null 化して復元を続ける。server 保持済み snapshot / mirror validation では invalid `undoState` を含む snapshot 全体を拒否する。 |
| `actionSeq` | optional | snapshot がどこまで action を畳み込んだかを示す。 |

validation の重要条件:

- `coins`, `itVentureCoins`, stock count, dice / pending count は非負整数のみ許可する。小数 coin は server restore と local save resume の両方で拒否される。
- `dormantIndices` は重複、範囲外、整数以外、休業不可の大施設 index を拒否する。
- `landmarks` は既知 key かつ boolean のみ許可する。欠落 key は既定値 `false` で補完される。
- `enabledCards` で無効化されたカードは、初期配布の `麦畑` / `パン屋` を人数分まで持つ場合を除き snapshot 所持を拒否する。無効化カードの `shopStock` は欠落または `0` のみ許可する。
- `enabledLandmarks` で無効化されたランドマークは、建設済み `true` の snapshot を拒否する。未建設または欠落は許容される。
- `pendingActions` が存在する場合、各 entry の `field` と `action` は固定対応している必要がある。queue 内の field 件数は対応する legacy pending count と一致する必要がある。不一致 snapshot は server mirror では拒否し、client 側では queue を捨てて legacy field から補修する。

## `undoState`

`undoState` は build 直前状態で、`undoBuild` replay のために必要です。player 数とカード名の検証に失敗した場合は採用しないでください。

主な field:

- `playerCoins`
- `playerCardNames`
- `playerDormantIndices`
- `playerLandmarks`
- `playerItVenture`
- `playerHasYakusho`
- `shopStock`
- `log`
- `builtThisTurn`

## 変更時の注意

- 復元 schema を変える場合は、`tests/server.test.js`, `tests/online.test.js`, `tests/online-integration.test.js`, `tests/storage.test.js` のうち該当するものへ旧データ/壊れたデータの assertion を足す。
- 新しい pending state を追加した場合、client snapshot、server snapshot、restore、mirror validate、旧 snapshot 欠落時の既定値を同時に更新する。
- 新しい replay action を追加した場合、server の payload validation と mirror replay を同時に追加する。
- validation を強める場合は、無効化 stock、重複 dormant、小数 coin の拒否と、landmark key / 旧 field 欠落の補完を server / storage の両方で確認する。
- `actionSeq` / `hostEpoch` の比較は、古いホスト復元 bundle が新しい room を巻き戻さないための防御です。単純な上書きに戻さないでください。
- アプリ固有の失敗通知は `appError` を使い、Socket.IO transport の `error` と混ぜないでください。
