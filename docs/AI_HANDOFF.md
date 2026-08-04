# AI handoff notes

この文書は、途中参加した人間 / AI が最初に読む短い入口です。
詳細は各専門 doc を参照し、このファイルは現在地と次の安全な一手だけを示します。

## 2026-07-19 Current restore status

- Read `docs/HOSTLESS_RESTORE_DESIGN.md` after the restore trust ADR. It is the
  source of truth for the accepted provisional quorum fallback.
- Normal host restore remains first. Only compatible clients enter hostless
  recovery after existing retries are exhausted; mixed old/new clients fail
  closed to host-only behavior.
- Candidate normalization, exact agreement, generation/expiry, confirmation
  rotation, server runtime, client payload/consent, and anonymous diagnostics
  are implemented in dedicated hostless restore modules and contract tests.
- `HOSTLESS_RESTORE_ENABLED=0` is the immediate operational rollback.
- Existing Socket.IO meanings, localStorage keys/formats, game rules, CPU/RL,
  and PWA/SW behavior remain unchanged. Existing-room replacement remains
  host-only.
- The four-player Android/iPhone completion on 2026-07-18 proves ordinary
  reconnect only. The full 60-second grace, 30-second collection, confirmation
  rotation, mismatch, mixed-old-client, and former-host-return matrix remains
  manual verification; do not infer it from WebKit or ordinary reconnect.

## Public naming

- 公開向けの製品名は「ダイスシティ」。
- 内部コード名、package 名、cache prefix、localStorage key、window debug helper、既存 URL、履歴説明には `machikoro` / `Machikoro` が残る。互換性リスクがあるため、公開文言の変更目的だけで内部識別子を一括 rename しない。

## 読む順番

1. `README.md`: 起動方法、テスト、主要機能。
2. `docs/ARCHITECTURE.md`: 責務境界、phase/action map、壊してはいけない不変条件。
3. `docs/AI_MAINTENANCE_ISSUES.md`: AI が誤読しやすい不変条件、stop conditions、grep 入口。
4. `docs/MAINTENANCE_BACKLOG.md`: 直近改善後の残リスク分類、触る/触らない判断、次の費用対効果候補。
5. `docs/ADR_INDEX.md`: 現在有効な設計判断とhistorical文書の索引。
6. `docs/ARCHITECTURE_REFACTOR_PLAN.md`: 根本改善が必要な責務境界、段階的移行順、contract test、rollback、実機確認 gate。
7. `docs/REFACTOR_PLAN.md`: 現行 phase 方針と実施済みログ。
8. `docs/CARD_SYSTEM.md`: 新カード / 新 effect / 新ランドマーク追加時の修正箇所。
9. `docs/ONLINE_SYNC.md`: オンライン同期、再接続、server restart restore の正本。
10. `docs/CPU_AI.md`: CPU 評価の追従箇所とデータ駆動化の順番。

## 2026-07-30 保守性改善の現在地

- app shell/storage: `js/clientCheckpoint.js`、`js/clientReporting.js`、`js/clientReportingTransport.js`、`js/lifecycleNotify.js`、`js/lifecycleTransport.js`、`js/uiWatchdog.js` にsnapshot失敗fallback・80件のmemory trace・5,000文字の永続化を持つ診断checkpoint記録、URL query/hash除去・runtime context・report整形、注入fetchによるclient-error POST/checkpoint transport、lifecycle payload/start/dedupe・通知設定state・runtime人数/CPU数/mode/version・session/start/finish/reset immutable state遷移・完了通知metadata・勝者CPU難易度投影と注入clock/RNGからのsession ID生成、注入fetchによるlifecycle POST/checkpoint transport、freeze分類、trace/root-cause整形、element可用性/lock理由、主要/pending/phase復旧可否、stale modal判定、render復旧可否/対象plan、render同期可否と人間手番lock issue選別、保存用診断圧縮を分離。`js/clientStorage.js`を唯一の直接`localStorage` ownerとし、app shell/main/online/onlineStorage/storage/ui/statsはfacade経由へ移行済み。`js/appShellStorage.js`は既存契約の互換wrapper、`js/pwaShell.js`はinstall prompt/banner controllerを所有する。既存key/value/JSON形式、DOM snapshot/recovery、fetch、timer、SW更新副作用は不変。
- client error入力: `js/clientReporting.js`がwindow error・unhandled rejection・console errorのreport入力をpureに組み立て、`appShell.js`はhandler登録、console hook、送信、dedupe、crash表示を維持する。
- crash screen: `js/crashScreen.js`が既存300文字のerror message、保存復帰/reload表示、初期focus、focus-loop判断をpureに所有する。`appShell.js`はCPU停止、storage参照、listener登録、DOM/ARIA書込み、実focus、公開wrapperを維持し、production/testのscript順とService Worker cache inclusionを契約で固定する。
- CPU: 既存pure helperに加えて`js/cpuActionProposal.js`へ全Action Contract variantのcanonical・detached・deep-frozen proposal生成、`js/cpuBuildExecution.js`へlocal/online建設実行、`js/cpuSimulation.js`へ2〜10人lookahead在庫生成、`js/cpuEvaluation.js`へ通常difficultyの安全補正・勝利距離・相手脅威度・盤面score合成・ランドマーク不足額・TVランドマーク妨害・expertロール収入上限/超過ペナルティ・strong条件付き赤カード/ランドマーク圧力・strong色役割補正・重複改装のランドマーク露出risk・4人expertカード候補補正・出目テンポ/ランドマーク相乗・strong紫カード補正/購入準備・base/profile/strongランドマーク優先度・expertランドマーク効果bonus・多人数購入補正・多人数妨害の希釈/解禁・出版社・ITベンチャー・条件付き赤・貸金業・カード依存・汎用重み付きoutcome集計・同点入力順を保つ購入候補ranking・重み付き出目/港代替のpure価値計算、`js/cpuLegalMoves.js`へ残り有効ランドマーク順・終盤閾値と妨害player/Cleaningカード候補の安定順位・枝刈り、`js/cpuBusinessMoves.js`へ交換候補列挙・安定rank・スコア合成・random/simple選択を分離。localのrule-based CPU actionはbuildを含めて共有mutable Game Engineへ適用し、online buildは既存authority/send経路を維持する。`CPU.chooseBuildAction()`は盤面/在庫を変えずproposalだけを返し、executorが一度だけ適用する。9 fixture×全difficultyの36 decision snapshotと、2〜10人×全difficultyの36完走self-playでheuristic値、difficulty、乱数消費、行動選択は未変更。
- server: `server/reportingPolicy.js`がtrust proxy、ntfy topic、rate key、debug endpoint許可/payload、lifecycle dedupe keyのpure policyを所有する。`server/reportThrottle.js`はclient-error/lifecycleごとのlimits・bucket・dedupe cache・dedupe keyを一つのadmission境界へ束縛する。`server/clientErrorReporting.js`は重複keyのfield集合・stack 600文字境界も注入hash越しに所有する。`server/clientErrorGateway.js`と`server/gameLifecycleGateway.js`がrequest判定順とHTTP statusを、`server/reportDelivery.js`が注入ntfy optionを、`server/reportingHttpRoutes.js`がExpress route・JSON limit・catch fallback登録を所有し、`server.js`はgateway生成とapp依存配線を維持。`server/lobbySocketHandlers.js`、`server/rejoinSocketHandler.js`、`server/actionSocketHandler.js`、`server/disconnectSocketHandler.js`へcreate/join/rejoin/action/disconnect familyを分離し、effect/emit順、hostless先行、古いsocket無視、host移譲を固定。`server/gameStartPayload.js`はschema gate、player順、version/token/capabilityを含む開始payload組立を所有し、room readinessとemit timingは`server.js`に維持する。`server/restoreGateway.js`はcanonical recordとclient bundleのsource選択、および既存roomのpureなreplace/reject/rejoin policyだけを所有する。`server/restoreAdmission.js`はpayload形状・上限・room ID・source・audit・snapshot trustの入口planと、新規roomのgame-start/RL検証→player設定正規化plan、player index→expected token→token hash→元host→reconnect hash集合→restored player生成のidentity plan、および既存roomのstarted確認→host認証→signed sanitize→replace/reject/rejoin→token再確認planを所有する。通常復元のcanonical読取→source→audit→署名検証、hostless時のauthority省略、正規化・identityの短絡順を表駆動契約で固定する。`server/existingRoomRejoin.js`は既存room再参加のdetach→identity→任意host再選出・persist→touch→`rejoinData`→`playerRejoined`順を所有し、`EXISTING_ROOM_REJOIN_EFFECT_AUTHORITY_ENABLED`は既定OFF、inline legacyがfallback。実Socket E2Eでflag ONを固定する。`server.js`は`appError`送信を維持する。`server/restoreReplayAdmission.js`はdynamic secret読取→action log sanitize→空log trust gate→canonical/fallback rank計算を所有する。`server/restorePreparation.js`はgame-start→identity→replay→metadata→room build→mirror preparationをactivation前に順序固定し、Socket・persist・activationを所有しない。`server/restoredRoom.js`は検証済み入力からhost/sequence/hostless metadataと既存game-start payloadへの順序固定適用、新規/置換/拒否、accepted-action再構築→mirror生成→state plan適用、有効mirror結果とrestored roomへの順序固定適用、匿名化済み完了log/戻り値を入力非破壊で計画し、注入log effectを一度実行して同じresultを返し、mutable room shellを決定的に組み立てる。既存roomのdetach→delete→installは既定OFFの`RESTORED_ROOM_ACTIVATION_EFFECT_AUTHORITY_ENABLED`で順序固定executorを選べ、inline legacyへ即時rollbackできる。続くpersist→Socket join→socket identity→`rejoinData`も別の既定OFF `RESTORED_ROOM_DELIVERY_EFFECT_AUTHORITY_ENABLED`とinline legacy fallbackで順序固定済み。admission後のgame-start validation/signing/sanitizeの呼出順、Socket effect、mirror/persistence順は`server.js`に維持。`server/hostlessRestoreDiagnostics.js`はroom IDを12桁hashへ変換し、coordinator診断を集計値だけへ限定する。`server/canonicalStateRepository.js`はrecord生成・save/load・schema/room検証・例外隔離を注入境界にし、store実装を`server.js`配線から分離する。`server/restoreAuditPayload.js`はsnapshot/actionの署名対象整形とcanonical action data適用だけをpureな注入境界として所有し、署名・keyring・検証順・authorityは`server.js`に維持する。`server/staticAssets.js`はBUILD_HASH環境値→Git短縮hash→時刻fallbackの解決、index/public-root response handler、公開asset注入を所有し、Express route登録順は`server.js`に維持する。`server/socketPayload.js`は通常/restore上限判定と、専用`appError` eventへ既存拒否文言を送る注入gatewayを所有する。canonical store capability、restore keyring、authority priorityのpure契約はあるが、既定storeはnoopでproduction authorityは未切替。
- server game settings: `server/gameSettings.js`がplayer/card/CPU設定正規化に加え、既存のCPU難易度日本語labelを正本化する。`server.js`のhoisted adapterはroom lifecycle注入順だけを維持する。
- server runtime loader: `server/gameRuntimeLoader.js`がCard → Player → Action Contract → GameManagerのVM source順とserver mirror公開symbolをfrozen契約として所有する。既存`loadGameRuntime` APIと起動配線は`server.js`に維持する。
- server reconnect identity: `server/reconnectIdentity.js`がtoken生成/hash/期待hash判定に加え、token一致後の既存・復元player activationを所有する。不一致時のroom非変更、legacy hash補完、socket ID更新は直接testで固定し、Socket callback順とprotocolは不変。
- server action acceptance: `server/actionAcceptance.js`がduplicate lookup、100件ACK cache/ref、restore rank fallback付きroom action採番と`gameStartPayload.actionSeq`同期を所有する。採番済みroomではfallbackを呼ばず、ACK/broadcast/compaction順は不変。
- server action validation gateway: `server/actionValidationGateway.js`がmirror取得→勝利済み拒否→actor authority→phase/action gate→server dice canonicalization→payload検証の順を所有する。早期拒否では乱数・payload検証を呼ばず、Undoはroom値をmirror値より優先する。event、payload、rule、authorityは不変。
- server restore audit runtime: `server/restoreAuditRuntime.js`が毎回のkeyring config読取、active secret/key ID、署名生成option、検証keyring/freshness optionを所有する。secretをcacheせず、署名・検証本体、authority、wireは既存ownerのまま。
- server restore audit gateway: `server/restoreAuditGateway.js`がsnapshot/actionのpayload生成→option生成→署名/検証の順序、action署名の`server-action-log` source、snapshotなし検証bypass、検証結果のboolean投影を所有する。暗号処理、keyring policy、restore authority、wire形式は変更しない。
- server compacted restore attachment: `server/restoreSnapshotAttachment.js`が圧縮前log上限超過、圧縮後残差log空、署名成功を確認してからaction entryへSnapshot/auditを同一参照で添付する。失敗時はentry非変更。圧縮・署名・Socket・authorityは不変。
- server game-start lifecycle: `server/gameStartLifecycle.js`がroom初期化→canonical mirror reset→時刻公開→永続化の順序を注入executorとして所有する。readiness、payload生成、Socket emit、logは`server.js`に維持する。
- server game-start coordinator: `server/gameStartCoordinator.js`がmissing/started/not-ready終了とpayload生成→room activation→`gameStart` emit→log順を所有する。event名とpayload identityは不変。
- server canonical mirror runtime: `server/canonicalMirrorRuntime.js`がmarker/hash同期、stale rebuild診断、build前Undo、Undo/turn後clear、accepted action採用を注入adapterとして所有する。Engine authority・wire・persistence policyは不変。
- server room socket policy: `server/roomLifecycle.js`が再接続後のcurrent socket本人性とhost接続有無をread-onlyに判定する。`server.js`は実Socket mapの配線だけを保持し、join/emit/host移譲順は不変。
- server room socket runtime: `server/roomSocketRuntime.js`が`hostChanged`送信、旧socketへの`appError`→leave→同room identity clear、room置換時の全player ID clear、host接続判定への現socket map配線を所有する。rejoin/disconnect/recreate判断は既存handlerのまま。
- online: live action sequenceのlog最大値・current/last-applied投影・next加算は`js/onlineActionSequence.js`へ分離し、`online.js`はstorage read・mutable sequence memory・game-start patch writeを維持する。復元room indexの最大actionSeq集約は`js/onlineStorage.js`の既定pure policyへ移し、注入overrideとkey/value形式を維持する。保存済み再接続sessionの必須field検証・空白除去・room ID正規化、rejoin pendingのreplay log/旧snapshot圧縮/accepted ID/未受理の根拠付き判定、署名なしsnapshot時のローカル完全action log保護、復元event queueの世代/snapshot-seq除外・元index保持planは`js/onlinePayload.js`へ統合済み。pending判定とaction log保存判定は各production未注入flagでlegacy完全一致時だけpure planを選ぶ。clear/resendはdefault-OFF executorとinline legacy fallbackを持ち、storage write effectは`online.js`に維持する。独立legacy planを既定とし、test-onlyの`MACHIKORO_ONLINE_RECONNECT_QUEUE_PLAN_AUTHORITY_ENABLED`はidentity/indexが完全一致する場合だけpure planを選び、不一致時はlegacyへ戻る。`js/onlineRestoreQueue.js`へ注入handlerの順次実行と失敗元index返却を分離し、別のtest-only queue-effect flagはpure plan採用時だけこのexecutorを選ぶ。例外伝播、失敗event以降の保持、legacy既定を固定済み。`js/onlineRestoreQueueState.js`はenqueue/上限判定・再join時の世代carry・flush開始時のdrain・適用失敗位置からのsuffix保持・disconnect/reset/gameStartのclearを入力非破壊のpure transitionとして所有し、production未注入flagかつinline legacy完全一致時だけ選択する。queueのraw read・replacement・legacy appendは`online.js`内の3つのowner helperに限定する。`OnlineRestoreQueueState.createStore()`は分離配列をshadow同期し、production未注入のstore-read flagはraw mirrorとの完全一致時だけread authorityを選ぶ。独立したstore-write flagはreplacement/appendをstore先行にし、完全一致時だけraw rollback mirrorへ反映する。各不一致・helper欠落時は同じ操作内でlegacy writeへ戻る。queue変数のproduction mirror/write owner・abort・handler実行・callbackは`online.js`に残し、`storage.js`は共通facade越しの永続化調停とUI effectを保持する。`js/onlineReconnectState.js`はreconnect/disconnect/restore/replay/activation/retry-exhausted/completed/reset eventを履歴化し、pure reducerとlegacy projection契約を所有する。`ONLINE_RECONNECT_EVENT_AUTHORITY_ENABLED=1`時だけ、履歴が完全一致する場合にUI/send/CPU/human input gateがevent stateを読む。別の`MACHIKORO_ONLINE_RECONNECT_EFFECT_AUTHORITY_ENABLED`はclean parity時だけ`isReconnectingOnline`互換booleanをevent stateから選び、timer flagはrejoin timer handle/deadline、callback flagはtimeoutのignore/rejoin/exhaust判断、request-plan flagは資格情報拒否/socket待機/8回上限/送信と次attempt countをpure/legacy完全一致時だけ選び、request-effect flagはpure plan採用時だけ`js/onlineReconnectRequest.js`のclear/count/emit/arm executorを選ぶ。`rejoinRoom`実送信は1関数へ集約済み。cleanup flagはterminal appError時のcleanup実行可否を選び、別のcleanup-effect flagはclean parity時だけ`js/onlineReconnectCleanup.js`の固定6-step executorを選ぶ。status-effect flagはsocket切断、restore開始、replay開始、restore完了、通常rejoin 8回上限の表示だけを段階的に選ぶ。restore lifecycleの表示はflag未注入時にDOM書込みを増やさない。各段階は不一致・不正履歴・未対応eventでlegacy ownerへ戻る。開始→切断→再join→復元・8回上限失敗と、status/parity fallbackを統合固定済み。effect/status/timer/callback/request-plan/request-effect/queue-plan/queue-effect/queue-state/cleanup-effect、およびgameAction/actionAccepted decode-effect flagはtest runtime専用でproduction HTMLへ注入しない。`js/onlineDecodeFailure.js`はactionAcceptedだけ先にACK flightを解除し、その後のreconnect/rejoin/retry順を共有する。clean reconnect shadowでない場合はinline legacyへ戻る。`js/onlineActionApplyFailure.js`はapply例外のreport/reconnect/CPU token/rejoin/retry順を共有し、restore queue flush中はrejoinをqueue ownerへ委ねる。authoritative pure apply planでない場合はinline legacyへ戻る。`js/onlineActionGap.js`はgap時のreconnect/CPU-token/受信側だけのstatus/rejoin/retry順を、`js/onlineActionNoGame.js`はincomingのstatus+rejoinとacceptedのstatus-only差を固定する。どちらもauthoritative pure decisionでない場合はinline legacyへ戻る。`js/onlineActionCommit.js`は成功時のsequence/log/acceptedだけのpending解除/render/CPU予約順を固定し、restore queue flush中はrender/CPU予約を省く。handler別のproduction未注入flagとauthoritative pure APPLY planが揃う場合だけexecutorを選び、それ以外はinline legacyへ戻る。`js/onlineSocketConnect.js`は待機表示解除/rejoin資格とcleanup→reconnect→rejoin順を、`js/onlineSocketDisconnect.js`はactive/restore中断判定とlobby解除→必要時restore隔離→reconnect/flight/CPU/event/status順を固定する。両者ともproduction未注入のplan/effect flag、legacy完全一致、clean shadow historyを要求し、それ以外はinline legacyへ戻る。`js/onlineHostChanged.js`はrestore queue通過後のhost所有判定とhost状態/log/render/CPU予約または無効化/persist順を固定し、別のproduction未注入plan/effect flagが揃う場合だけexecutorを選ぶ。`js/onlineRejoinPersistence.js`はreplay前のaction flight/pending/retry/settings/player index/host/restore bundle/session/CPU token/UI lock順をpure planとexecutorへ固定し、別のproduction未注入plan/effect flagとlegacy完全一致時だけ選択する。`js/onlinePendingResend.js`はrestore activation後のnone/clear/resend判定とstale pending消去またはACK flight設定→同一`gameAction` payload送信順を固定し、別のproduction未注入plan/effect flagとpending参照一致時だけ選択する。`js/onlineRestoreReplay.js`は入力参照を保持したままreplay mode開始→event/status→game初期化→Snapshot→残差Action→暫定log→必ずreplay mode解除の順を固定し、別のproduction未注入plan/effect flagと完全参照一致時だけ選択する。`js/onlineRestoreActivation.js`は復元済みsequence planと、reconnect完了解除→online有効化→互換flag解除→前回coin解除→適用seq公開→queue flush→activation event/statusの順を固定する。全handlerをeffect前に検証し、flush失敗時はactivation通知前に停止する。別のproduction未注入plan/effect flagと完全一致時だけexecutorを選び、inline legacyを既定/fallbackに維持する。`js/onlineRetryPolicy.js`は既存3秒/8回/15秒契約、timer controller、pure timeout decisionを所有。元host local bundle再提示は`js/onlineRestoreRank.js`のproduction未注入flagでlegacy完全一致時だけpure planを選び、recreate送信は既存ownerに維持する。production Socket emit authority、session read、hostless分岐、Restore queue変数・abort・flush authority、rejoin callback effect、ACK timing、socket切断・restore lifecycle・通常retry上限以外のstatus、storage、protocolは既存authorityで、production挙動は未変更。
- online runtime flags: `js/onlineRuntimeFlags.js`がschema/reconnect/engineの53 flag名、strict boolean read、frozen named-reader生成を正本化する。`online.js`の49 compatibility readerは単一adapterから生成し、4つのschema transport readerは既存のnegotiation前提を維持する。production HTMLはauthority flagを引き続き注入しない。
- online schema transport: `js/onlineSchemaTransport.js`がschema negotiation前提、capability/selection判定、Action/Snapshot/recreate codec dispatchを注入境界として所有する。`online.js`の公開wrapper、live selection、既存error reasonを維持し、production flagは引き続き未注入・legacy既定。
- UI/app shell: `js/onlinePlayerSettings.js`へオンライン設定正規化、option HTML、RL model固定/readiness文言、create/join button viewとunused/loader欠落/idle/portfolioのRL load-state選択を分離し、`online.js`はDOM、preload、timeout、Socket送信を保持する。`js/uiModalPolicy.js`がdeny-by-defaultのpure policy/stateとEscape/Tab keydown commandを所有。`js/uiModalOpen.js`はmodal identity planとcapture focus→active owner→body class→visual→dialog属性→focus→inertの順序を所有する。`js/uiModalClose.js`はhide後のactive owner→inert復元→orphan lock解除→pending描画→focus復元→trace plan/effect順を所有する。各production未注入flag・legacy完全一致時だけexecutorを選び、inline legacyが既定/fallback。modal hide、activeAfterClose入力、focus実行、inert/pointer handlerは`ui.js`に維持する。`js/uiTabView.js`はlocal/online/stats、create/join、online/offline可用性のdisplay/class/ARIA/disabledとstats描画effect条件をpureに所有し、`ui.js`/`appShell.js`はDOM書込みを保持する。`js/uiGameStatusView.js`は手番文言、roll/skip状態、出目選択、active-turn transition、入力非破壊のcoin deltaをpureに所有し、`ui.js`は手番通知timerとDOM/animation effectを保持する。`js/uiWinner.js`、ログHTML/要約/開閉viewと入力非破壊の300件履歴reducerを持つ`js/uiLogDisplay.js`、案内HTMLと操作control viewを持つ`js/uiTutorial.js`、`js/uiDiceChoice.js`、`js/uiDiceDisplay.js`、`js/uiTurnAnnouncer.js`、player panel HTMLとコイン増減animation viewを持つ`js/uiPlayerDisplay.js`までexact HTML/view生成を分離し、`js/uiCardSelect.js`は必須カード/最低1ランドマークを守るinput-nonmutating reducerとsorted view modelを、`js/uiCardDetail.js`はカードeffect fallback文言とランドマークeffect/emoji投影を所有する。`js/uiStatsView.js`はstats bucket選択、escape済みfilter/ranking HTML、空状態文言、overview投影を所有し、`stats.js`は保存・記録・event・DOM挿入を保持する。`js/uiInputPolicy.js`はonline block理由の優先順、local/onlineのhuman-turn判定、allowed action表示可否をpureに所有し、`ui.js`はlive game/socket/CPU読取とDOM effectを保持する。`js/localResumeView.js`はRL preload buttonとlocal/online再開sectionの表示投影だけを所有し、`storage.js`はrepository/session読取とDOM書込みを保持する。`js/uiBuildMenu.js`はcard filter state遷移とUndo表示/有効化を含むbuild action stateを、`js/uiPendingMenu.js`はphase/IT/renovationと人間手番のpending表示gate、およびmodal/content/inner-style投影をpureに所有する。`js/localGameStart.js`はpending/RL読込判断、設定snapshot、開始effect順を所有し、`main.js`がPromise/DOM/実初期化を保持する。`js/localPlayerSettings.js`はlocal設定の正規化、CPU/RL表示、速度表示、snapshot、escape、設定HTML、RL readiness文言、pending優先の開始button viewを所有する。`js/autoSkipPolicy.js`は既存順の在庫・コイン・紫重複・有効ランドマーク条件から購入可否だけをpureに判定する。`js/pageActivationPolicy.js`はページ復帰時のCPU scheduler outcomeと非表示時間だけをpureに分類する。`js/delayedHumanActionPolicy.js`はページ復帰時の遅延操作をidle/cancel/run/rescheduleへpureに分類する。`js/uiEventDelegation.js`はdelegated eventの対象要素、dataset key、role buttonのEnter/Space起動判定、immutableなfamily command decode、注入されたcommand実行を所有する。`js/citySkyline.js`はタイトル画面Canvas描画を所有し、viewport上限・描画命令・乱数注入契約を固定する。`main.js`はcanvas取得、サイコロ表示を含むDOM反映・preload・保存・game start、1.5秒timer・手番再検証・`nextTurn` effect、遅延操作のtoken/timer/callback/`Date.now()`、UI listener登録/preventDefault timing/lazy command-effect registry/DOM・PWA effect、およびvisibility/CPU再予約/checkpoint effectを保持する。`js/uiDiceDisplay.js`は出目HTMLとopacity viewだけを所有し、rolling中に既存opacityを変えない契約を固定する。`js/uiTurnAnnouncer.js`は人間/CPU文言と1300ms表示・400ms遷移policyを所有し、`ui.js`はDOMとtimer effectを維持する。DOM/focus/inert/pointer/event/SW更新effectsは既存ownerに残す。
- CPU scheduler state: `js/cpuSchedulerState.js`がwait正規化、lease期限、pending token一致、health投影、予約block理由の優先順位、phase step eligibilityをpureに所有する。`main.js`は実clock、winnerのlazy評価、mutable token/deadline、timer、checkpoint、phase順、CPU action実行を維持する。
- CPU non-build turn strategy: `js/cpuTurnStrategy.js`がroll/selectDice/reroll/Harbor/pending/nextTurn/ITの判断をcanonical frozen action proposalへ投影する。`main.js`はphase gate、timer、checkpoint、`cpuDo`、pending適用、全mutable effectを保持する。判断と乱数の呼出順、build経路、CPU強さは不変。
- local human action authority: `js/localActionPolicy.js`がgame/winner/stale player/CPU/not-my-turn/reconnecting/ACK flight/socket disconnectのfail-closed優先順位をpureに所有する。`main.js`は実状態読取、Action Contract、timer、全action effectを維持する。
- CPU evaluation boundary: `js/cpuEvaluation.js`が通常difficultyの安全補正、strong色役割補正、expertランドマーク効果bonus、既存の色/effect別カード発動評価、注入callbackを合成するカード購入評価、同点入力順を保つ購入候補ranking、自手番roll収入集計、汎用重み付きoutcome集計、重み付き出目期待値と港代替評価をpureに所有する。`CPU.js`はgame依存callbackと定数を配線し、heuristic値・候補順・RNG・difficultyは変更しない。direct contract、全difficulty decision baseline、2〜10人self-playで固定する。
- CPU live option policy: `js/cpuTuning.js`が全CPU constructor runtime configを入力非破壊で投影し、live `expert` v2simpleのpreset/mode/tempo/airport既定値も維持する。`CPU.js`はtyped field assignmentとmutable strategy state、`main.js`はCPU/RL生成を維持し、値変更時はdecision/self-play基準の意図的更新が必要。
- rejoin wire boundary: `server/rejoinPayload.js`がraw rejoin payloadに加えてnegotiated Snapshot wire合成とfail-closed結果を所有する。`server.js`は起動時flagを渡し、event名・payload形式・送信順を変えない。
- watchdog monitor: `js/uiWatchdog.js`がfreeze issueのfilter/sort/signatureをpureに所有し、`js/clientRuntimeSnapshot.js`がgroup化したgame/CPU/online/DOM factsを既存flat診断schemaへ投影し、`js/uiRuntimeSnapshot.js`がUI flow診断stateとpending actionをpureに投影し、`js/uiWatchdog.js`が捕捉済みcontainer/modal観測値からinteractability issue、freeze factsとfreeze分類の適格性/組立、render復旧可否/対象plan、action子要素要求判定、7種類の復旧可能freeze kind allowlistとfail-closed handler選択、render同期可否と人間手番lock issue選別をpureに組み立て、`js/uiWatchdogMonitor.js`が5秒停滞判定と60秒の重複report抑止状態を所有する。`js/clientReporting.js`はclient-errorの重複window admissionと次状態もpureに投影し、`appShell.js`はclock・mutable dedupe state・DOM検査・復旧・保存・report effectを維持して重複時も復旧を必ず試す。
- local resume policy: `js/localResumePolicy.js`がpending/no-save/invalid/RL preload/resume判定、detached runtime settings、保存済みCPU生成引数、正確なresume effect順を所有する。`storage.js`は既存key/schema、repository I/O、Promise、実hydrate/DOM/scheduler callbackを維持する。
- stored reconnect: `js/storedOnlineReconnect.js`が正規化済みsessionのruntime適用、Socket初期化失敗rollback、status/tab/rejoin順を所有する。`storage.js`は既存key/format、DOM notice、例外cleanup、実Socket callbackを保持する。
- contracts/engine: `js/actionContract.js`が15 actionのmetadata正本、`js/gameSnapshot.js`がclient/server/local-save/Undoのserializeと共有hydrate mechanics、`js/gameEngine.js`が共有dispatchを所有する。client replay、server mirror、localの全rule-based CPU actionが共有dispatchへ委譲済み。online CPUは既存authority/send経路を維持する。全action・全Action/Snapshot v0/v1組合せparityに加え、roll生成multi-pending、休業カード交換、Harbor/IT拒否、空港の建設なし収入、空港→IT積立pending、遊園地ゾロ目継続、貸金業の休業復帰、ワイナリー休業、出版社・税務署・ITベンチャー・公園の多人数コイン移動、ショッピングモールの赤→緑収支順、マグロ漁船の出目を駅→振り直し→港選択まで保持する多段遷移、条件付き赤カードのランドマーク閾値を駅選択→港選択→全額移動→役所救済まで、さらに引越し屋2枚のpending queue順・休業/稼働カードidentity・移動後状態、および清掃→改装2件の混合queueで全員休業化・対象なし自動消費を2/3/5/10人で固定。room生成とlive/shadow/pure採用比較は`tests/helpers/game-schema-parity.js`へ分離済み。Snapshot roundtripは復元後のpending action authority、清掃→改装queue順・休業card index・dice state、10人時のcurrent player、Undo保持、勝利後のaction閉鎖も意味契約として固定する。`GAME_SCHEMA_WIRE_ENABLED`はlive Action、`GAME_SCHEMA_SNAPSHOT_WIRE_ENABLED`はrejoin responseと圧縮action metadataだけを独立した既定OFF gateでv1化できる。`GAME_SCHEMA_RECREATE_WIRE_ENABLED`は`recreateRoom`の外枠とnegotiated Snapshot/action logを独立してv1化する。`js/gameSchemaRecreateWire.js`がseq/client/audit metadataを保持し、serverは署名・sanitize・authorityより前にlegacy形へ戻す。同じflag下でもunwrapped legacyは内部選択versionに関係なく無変換で受理し、unknown/malformed nested versionを副作用前に拒否する。`js/savedGameValidation.js`へ保存検証・旧CPU設定正規化・pending整合・旧card ID在庫解決を分離し、local `savedGame`とlocal Undo生成、local/server mirrorのUndo復元は共有serializer/hydrateへ委譲済み。`js/storageSettings.js`は保存済み人数・player設定・tutorial値のpure正規化と、既存key向けsave/load値投影を所有する。`savedGame`読取は共有Snapshot adapterでlegacy/v1 envelopeを受理し、unknown schemaをfail closedにする。`js/gameEngineAuthority.js`がclient/server共通のfail-closed authority選択を所有し、`server/gameEngineAuthority.js`は環境flag解釈だけを残す。serverは`GAME_ENGINE_TRANSITION_AUTHORITY_ENABLED=1`時でもtransition成功・shadow完全一致・snapshot再構築成功の全条件を満たす場合だけ内部canonical mirrorへpure結果を採用する。`js/gameEngineClientShadow.js`はonline replayのdetached transition比較と採用判定を所有し、production未注入のshadow/authority 2 flagが揃いparity一致・別runtime再構築成功時だけpure snapshotを採用する。`js/gameEngineRuntimeAdapter.js`はonline/local callerのhydrate・serialize・Undo互換adapterを共有し、`js/gameEngineDeterminism.js`は未確定乱数payloadをshadow対象外にする。local human action、CPU proposal、card/landmark build、Undoは独立したproduction未注入shadow/authority flagを持ち、完全一致と別runtime再構築成功時だけpure snapshotを採用する。全15 Action Contract entryについて、dice/Harbor、全pending resolver、build、Undo、turn transitionを実local adapterでlegacy最終snapshot一致に固定し、各失敗時は直前のmutable結果を維持する。production flag、ACK/broadcast/protocolは変えない。`js/localSaveRepository.js`は既存`savedGame`をrollback authorityとして維持し、独立した既定OFFの`LOCAL_SAVE_SCHEMA_WRITE_ENABLED=1`時だけ`savedGameV1`へ併記する。v1はlegacy存在時かつschema/内容検証成功時だけ採用し、破損・書込み失敗・旧版でのlegacy削除時はfallback/非復活になる。既定のlegacy JSON書込み形、Undoのログ全件保持、DOM更新順は不変。recreateのproduction flag、restore authority/timing、永続化shape、既定wireはlegacy/OFFのまま。
- tooling: scoped ESLint 10.7.0は199個のmaintenance fileをbug-detection rulesだけで検査する。TypeScript 5.9.3のno-emit checkJsを198個のbrowser/server runtime（`CPU.js`、`RLCPU.js`、`server.js`、`server/*.js`全件を含む）へ限定導入し、`npm run test:types`を`test:static`へ統合済み。allowlistと残る5つのside-effect client runtime除外はcontract testで固定し、style rules、`--fix`、全repository lint/checkJs、TypeScript移行は禁止。

2026-07-18にAndroid 2台＋iPhone 2台の4人オンライン戦を再接続ありで勝利まで完走確認済み。これは基本同期と再接続継続の実機根拠だが、host移譲、server restart restore、Undo、online CPU、background復帰、PWA更新、modal focus/inertは未確認。2026-08-02時点で既定OFFのversioned live Action wire、rejoin/compacted-Snapshot wire、既定OFFのrecreate outer/nested v1 wire、local-save serialize/hydrate共有化とrollback-safeな既定OFF v1 shadow dual-write境界、event-labelled reconnect controllerとpure reducer/parity、既定OFF・fail-closedの入力/手番gate read authority、test-onlyの再接続互換boolean・timer・timeout decision・ACK-timeout ignore/clear-only/rejoin plan/effect executor・incoming gameAction/pending一致後actionAcceptedのno-game/duplicate/gap/apply plan・malformed Action decode時のoptional flight-clear/reconnect/rejoin/retry executor・Action apply例外時のreport/reconnect/CPU-token/rejoin/retry executor・sequence gap/no-gameのhandler別effect executor・成功時のsequence/log/pending解除/render/CPU予約executor・socket connect/disconnect callback plan/effect・host変更plan/effect・rejoin runtime/session永続化plan/effect・復元replay本体plan/effect・復元activation/queue flush plan/effect・復元後pending clear/resend plan/effect・rejoin pending reconciliation/action-log保存plan・元host local bundle再提示plan・rejoin request plan/effect executor・terminal cleanup decision/effect executor・restore-abort generation/status/queue plan/effect executor・socket切断/通常retry上限status authority、server reporting pure policy/request gateway/delivery adapter、online replayとlocal human/CPU/build/Undoの既定OFF・fail-closed Engine shadow境界、local rule-based CPU buildの共有Engine適用、Business Center交換選択、全client storage owner統一、watchdog snapshot/phase/modal policyとfreeze summary/checkpoint縮約、lifecycle開始/dedupe、card-select state/view、local/online-player-settingとonline lobby viewのpure分離、既定OFF・legacy fallback付きmodal-openとpost-hide modal-close plan/effect境界まで実施済み。server-mirror・online replay・local action pure-engine authorityのproduction有効化・他ownerへの拡大、recreate v1 wire/local-save v1 shadowのproduction有効化、reconnect callback/production Socket authority・restore queue変数/abort/flush authority・restore-abort effectのproduction有効化・残るstatus authority移行、recreate validation/signing/Socket/mirror effect、modal-open/modal-close gateのproduction有効化とmodal hide/focus trap/inert handler移動、CPUの大きなscoring/selectionはdeferred。production durable DB/providerは費用理由で保留し、追加iPhone実機確認も端末不在のため保留する。

## 2026-05-16 時点の実施済み範囲

- Phase 1: 構成・リスク・棚卸し docs を追加し、Termux 向けの `test:static` / `test:smoke` を入口化した。
- Phase 2: `CARD_IDS`, `CARD_EFFECT_METADATA`, `CARD_INCOME_EFFECT_HANDLERS` を追加し、単純 income effect の dispatch 足場を作った。
- Phase 3: `GAME_ACTIONS`, `GAME_PHASE_ACTIONS`, `GameManager.allowedActionsFor(game)` を追加し、server と main の action gate を寄せた。
- Phase 4: server 内の live action / replay action payload 判定を `validateActionPayloadForState()` へ集約した。
- Phase 5: 建設メニューのカード / ランドマーク button HTML を helper 化した。
- Phase 6: docs の入口と実施済みログを揃えた。

## 2026-05-19 時点の追加実施済み範囲

- UI: dice / Business Center / card select / stats / static shell / player settings の inline handler を delegated handler へ移行した。既知の `onclick=` / `onchange=` / `oninput=` は解消済み。
- UI: `renderPending()` のphase/IT/renovation・人間手番表示gate、modal content 更新、pending 種別 HTML 生成を helper / `PENDING_MENU_RENDERERS` registry に分離した。pending 追加時は renderer registry と HTML assertion を一緒に更新する。
- CPU: 診断系 profile / trace 集計を `js/cpuDiagnostics.js` へ分離した。評価式と行動選択は未変更。
- GameManager/Card metadata: 飲食店・商店 category group を `CARD_CATEGORY_GROUPS` に寄せ、該当効果のカテゴリ判定を helper 経由にした。
- Server: restore rank / replacement 判定を `server/restoreRank.js` へ分離した。

## Continuous review operating policy

- Continuous review は、現在のユーザー依頼が自律的な実装修正を求めている場合に限り、Cycle 完了ごとに停止せず、停止条件に該当するまで Cycle 1, 2, 3... と自律継続する。明示的な review-only / no-edit 指示がある場合はそれを優先する。
- AdSense review mode では `docs/OPERATIONS.md` の `AdSense Review Change Policy` を正本にする。審査中は docs/static 中心に限定し、docs/static 変更でも URL/PWA/広告位置/ルール/広範な UI 挙動を変えない。UI大改修、PWA挙動変更、URL変更、ルール変更、大規模リファクタ、実広告ユニット、SDK adapter、広告位置変更、広告拡張を追加しない。`index.html` head の AdSense 審査 loader は1つだけ維持し、追加 loader や live ad unit を入れない。unknown通知修正、CI失敗修正、軽微CSSの緊急例外も `docs/OPERATIONS.md` の条件内で扱う。
- 審査中は `canonical` / `og:url` / `twitter:url` と `preconnect` / `dns-prefetch` / `preload` / `modulepreload` を追加しない。公開ページの CSS は共有 `style.css` に限定し、外部 CSS host を追加しない。URL 方針、外部接続方針、または CSS 配信方針の変更が必要な場合は、先に `docs/OPERATIONS.md` と `docs/ADSENSE_SETUP.md` の確認手順を更新する。
- 各 Cycle は全体レビュー、修正、tests、docs 更新、commit / push、working tree clean 確認まで行い、直後に次 Cycle を開始する。
- 「完了しました。次へ進めますか？」で止めない。停止してよいのは、テスト3回修正失敗、git conflict、push失敗、破壊的変更、実機確認必須、hostless restore / server persisted canonical state など設計判断必須、または自動で安全に対応できる指摘がなくなった場合のみ。
- 次 Cycle では前 Cycle の副作用も含め、変更箇所だけでなく毎回ディレクトリ全体を再レビューする。

## 次に安全な作業の条件

- UI: pure表示helperはwinner/log/tutorial/dice choice/full player panelと建設gate/action stateまで実施済み。modal deny-by-default は実装済みで、既定OFFのmodal-openとpost-hide modal-close plan/effect境界も実装済み。次は具体的なUI変更に伴うexact-output helperだけを対象にし、両gateのproduction有効化やmodal hide/focus trap/inert handlerは実機matrixなしで移動しない。
- CPU: build・live pending・非build手番のaction-only strategy/executor境界、自己収入のcard-effect別pure評価、ランドマーク不足額・TV妨害価値・expertロール収入上限/超過ペナルティ・strong条件付き赤カード/ランドマーク圧力・strong色役割補正・重複改装のランドマーク露出risk・4人expertカード候補補正・出目テンポ/ランドマーク相乗・strong紫カード補正/購入準備・ランドマーク優先度・expertランドマーク効果bonus・多人数購入補正・多人数妨害の希釈/解禁、重み付き出目/港代替のpure evaluation境界と妨害候補の安定順位・枝刈りは実装済み。pendingの旧resolution APIはsimulation互換のため残す。残る大きなscoring/candidate orchestrationは、具体的な安定境界がない限り機械的に分割しない。変更時はdecision/self-play baseline、候補順、乱数消費の完全一致を要求する。
- GameManager / Server / Online: action/payload変更時は既存cross-layer contractを先に拡張する。timer/callback/handler/state-machine移動、hostless authority、signed/durable restore、複数room UIはdesign/manual required。
- Docs / Tooling: script load order、storage key、release pseudo-E2E、CI dependency の drift detection は強化済み。`npm run test:batch`はstatic、unit+simulation、3本のstandalone Socket E2E、releaseを重複なしで各1回実行し、バッチ末尾の正本gateとする。新しい helper script を足す場合は `index.html`、`sw.js`、integration runtime、`tests/main.test.js` の script/asset drift test を同時に更新する。運用docsを触る場合は `docs/OPERATIONS.md` と `docs/NTFY_ERROR_REPORTING.md` の通知分類、Render環境変数、stale-client対応も同期する。

## 変更時の最低確認

テーマごとにtargeted testを実行し、バッチ末尾では重複するgroup wrapperを個別に並べず、次を1回実行します。

```sh
npm run test:batch
```

AdSense review-period docs/static-page changes use the narrower gate from `docs/OPERATIONS.md`: `git diff --check`, `node tests/main.test.js`, and `npm run test:static`.

対象別の追加確認は `docs/maintenance-checklists.md` と `TESTPLAN.md` を使います。

## Review note for 932c00d

2026-05-16 に 932c00d をレビューしました。大きな挙動破壊は見つかっていません。確認した責務境界は次の通りです。

- `GameManager.allowedActionsFor(game)`: phase / pending state から action 名だけを返す。payload、在庫、所持金、actor 権限は判定しない。
- `validateActionPayloadForState()`: server 内の payload 判定専用。caller が phase/action gate を先に通す前提。シャッフル後human位置とCPU host代理のactor authorityは`server/actionValidation.js`の`canSocketSubmitCurrentAction()`でfail closedに判定する。
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
- CI の `npm test` は RLCPU parity fixture で Python `numpy` を使う。`.github/workflows/release-test.yml` と `build-apk.yml` は `scripts/rl/requirements.txt` を `pip install` してから Node test gate を実行する。
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

- Express `trust proxy` defaults to false. Set `TRUST_PROXY=1` only when the deployment is actually behind a trusted proxy and `CLIENT_ERROR_ALLOWED_ORIGINS` covers the public HTTPS origin.
- Production ntfy reporting rejects no-origin/no-token client-error requests by default. Use browser same-origin reports, `CLIENT_ERROR_SHARED_TOKEN`, or an explicit `CLIENT_ERROR_ALLOW_NO_ORIGIN` exception only for controlled diagnostics.
- If `beforeinstallprompt` arrives while the PWA update banner is visible, the install event is retained and shown after update banner dismissal. Keep this arbitration when changing banner lifecycle.
- `runTest()` returns async test promises. New async tests should either return/await `runTest(...)` or stay synchronous; do not rely on fire-and-forget promise handlers.
- `validate-rl-registry --strict-warnings` fails on warnings for adoption review. `render-rl-registry-evals` rejects same-identity evals with conflicting metrics instead of silently skipping them.
- Host-supplied restore snapshot signing / server persisted canonical state remains design decision required; do not implement partial trust-boundary changes without a design doc and migration plan.

## 2026-05-23 continuous review Cycle 12

- Public static serving is allowlisted. Do not reintroduce `express.static(__dirname)`; add public assets to `PUBLIC_ROOT_FILES` or `PUBLIC_STATIC_DIRS` deliberately.
- Restore snapshot validation now rejects pending counters/actions outside `phase === pending` and caps pending counts. Preserve this invariant when changing pending queue serialization.
- Service Worker runtime caching should stay allowlisted: app shell assets and RL portfolio JSON only. Avoid caching arbitrary same-origin GETs.
- RL portfolio browser JSONs now carry explicit `stateSchema` / `actionSchema`; adopted/active portfolio additions should include these fields.
- Async tests should return/await `runTest(...)`; release async cases use `runAsyncTest(...)` and `tests/test-utils.test.js` guards against direct async fire-and-forget patterns.
- Signed restore snapshots / server persisted canonical state remain design-required; do not patch around that with partial trust changes.


## 2026-05-23 continuous review Cycle 13

- Remote/replay application should continue through `applyReplayedAction`; do not reintroduce `handleRemoteAction` or a second direct `applyAction + render + scheduleCPU` replay path.
- `onlinePendingAction` entries now carry `roomId`. Generic app-error cleanup should only remove pending actions that belong to the current room; this avoids stale-tab errors deleting a live tab's unacked action.
- Existing-room `recreateRoom` replacement is host-only. Non-hosts may rejoin and become host for live actions, but must not replace canonical restored state until hostless restore has a separate design.
- Use `GameManager.clearPendingField(field)` when fallback logic needs to drop a pending kind; raw `game.pendingX = 0` can reorder `pendingActionQueue`.
- Python RL target-head code must use pending queue order, not raw pending counts, when selecting pending target kind.
- Crash/offline/tab/Business Center accessibility metadata is now covered by static/unit tests; preserve aria-selected/aria-pressed/live-region contracts when editing UI.
- Full per-tab/per-session pending-key namespacing and signed restore snapshots remain larger restore-schema design items.

## 2026-05-23 continuous review Cycle 14

- `onlinePendingAction.roomId` is now enforced at all use sites: app-error cleanup, restore bundle append, and reconnect resend. Do not append or resend a pending outbound action unless it belongs to the current room.
- Server restore sanitization drops actionLog entries at or below `stateSnapshot.actionSeq` and rejects actionLog entries that carry a mismatched `roomId`. Keep compacted snapshot + residual action log semantics monotonic.
- Restore `reconnectTokenHashes` must have one entry per player. Human slots require a valid 64-hex hash; CPU slots may use an empty hash.
- Local saved `pendingActions` are optional for legacy saves, but if present they must match field/action pairs and pending counts exactly. Empty queue plus nonzero pending count is invalid.
- RL parity traces now include ordered `pendingActions`; queue order differences should be treated as real parity differences, not just diagnostics noise.
- Online/server snapshots trim `log` to the last 30 entries. Avoid reintroducing unbounded logs into restore snapshots.
- `onlineStatus` is a polite live region, and `.card-detail-btn` has a larger touch target. Preserve these mobile/accessibility contracts.


## 2026-05-23 continuous review Cycle 15

- Restore rank は既知 replay action の件数だけで freshness を決める。server allowlist は `GAME_ACTION_REGISTRY` と同期する test があるため、新しい game action を追加したら restore rank test も更新されるべき。
- Existing restored room の replacement 判定は sanitize 後 actionLog を使う。raw actionLog seq や unknown action を freshness 根拠に戻さない。
- Snapshot compact 後は `stateSnapshot.actionSeq` 以下の action と seq なし legacy action を replay しない。legacy roomless pending は `seq` がある場合のみ互換再送を許容する。
- `onlinePendingAction` の復元bundle append / reconnect resend は current room gate を維持する。roomId なし + seq なし entry は stale 候補として使わない。
- Service Worker runtime cache writes use `event.waitUntil`; new fetch caching branches should call the same helper so cache writes are not detached from the fetch event.
- PWA update banner is `role=region` with a live message child, not `role=status` on a button container. Keep the release workflow `npm run test:pwa` gate when editing CI.
- Winner cleanup should call `clearOnlineSessionStorage` when available so restore bundle keys are cleared together with `onlineSession`.

## UI lock recovery guardrails

- UI watchdog recovery must only clear stale UI locks and re-render. It must not call game actions such as `nextTurn()`, pending resolvers, or CPU decisions.
- Normal human-turn unlock is limited to primary actions and must not close informational modals. Pending recovery is a separate `pending-ui-locked` path and only repairs `pendingModal` / `pendingMenu` visibility/lock state.
- Client error freeze notifications send compact `FREEZE_SUMMARY` data to ntfy. Keep full text-bearing UI snapshots local-only unless privacy is explicitly reviewed.
- CPU pending choices should be validated against live board state before sending/applying, especially RL-derived target names.
- CPU pending fallback and Cleaning target validation belong in `js/cpuPendingResolution.js`. The live strategy contract is a detached, deeply frozen canonical `{action, data}` proposal with no `apply` closure; keep `main.js` limited to scheduling and the shared action boundary, do not reintroduce local fallback copies or executable decision closures, and retain `choosePendingResolution()` only for simulation compatibility until those callers migrate.

## Implemented helper boundaries

- Server room lifecycle: use `server/roomLifecycle.js` for pure room/player/start-payload/version/token/disconnect-candidate/host index・epoch同期/hostless capability投影policy before editing equivalent logic in `server.js`.
- Online storage: use `js/onlineStorage.js` for existing localStorage/session key access and restore bundle/index helpers; do not create new ad-hoc key reads in `online.js`.
- UI pure rendering: use `js/uiBuildMenu.js` and `js/uiCardDetail.js` for build menu/card detail HTML. Keep modal lifecycle and real-device focus/pointer behavior in `ui.js` until planned verification exists.

## UI action enabled helper

- Dice choice, harbor choice, and pending resolver panels should consult `currentUiAllowedActions()` / `canShowUiAction()` when deciding what to render. Keep handler guards in `main.js`; UI helpers are for display/enabled parity, not authority.
- Do not mix this work with `ROOM_REPLACED` reconnect handling; that path remains a separate online/restore design item.

## UI build action enabled helper

- Build menu, landmark, skip/end turn, and undo build UI now use `currentUiAllowedActions()` / `canShowUiAction()` in `js/ui.js`. Keep handler authority in `main.js`; the UI helper is only a display/enabled parity layer.
- Online rendering treats reconnecting, disconnected socket, and `onlineActionInFlight` as input-blocked. Do not enable buttons during those states just because phase/turn ownership looks valid.
- `buildCard` and `buildLandmark` are checked independently. Avoid collapsing them into one phase-only `canBuild` gate, because restore/pending regressions can expose only one action at a time.
- `ROOM_REPLACED` remains intentionally separate from this UI parity work.

## UI action gate maintenance rule

- UI操作可否は `GameManager.allowedActionsFor(game)` を読む `currentUiAllowedActions()` / `canShowUiAction()` と、online input block 判定 `isOnlineUiInputBlocked()` に集約する。
- 新しい gameplay button を追加するときは、phase / turn / `isOnlineGame` だけで `disabled` や表示状態を決める別経路を作らない。表示側は `canShowUiAction()` 系 helper、実行側は `main.js` の `canRunHumanAction()` / `canRunLocalHumanAction()` 系 gate を通す。
- online input block は missing socket、disconnected socket、reconnecting、`onlineActionInFlight` を含む。これを緩める場合は `main.js` の handler gate と `tests/ui.test.js` の online gate tests を同時に更新する。
- `buildCard`, `buildLandmark`, `undoBuild`, `nextTurn` は独立 action として扱う。一つの `canBuild` や build phase 判定へ戻すと、restore/pending/online gate のズレが再発する。
- Pending resolver は queue head と allowed action の両方が一致する時だけ表示する。pending count だけで resolver を出さない。

Test index:

- `tests/ui.test.js`: skip/end turn, CPU/other online turn, build/landmark/undo, pending queue head, online input block.
- `tests/integration.test.js`: post-build UI lock recovery, CPU turn return unlock, human-turn watchdog, pending UI lock watchdog.

## UI action gate final audit

- Keep `isOnlineUiInputBlocked()` aligned with `canRunLocalHumanAction()`: missing socket, disconnected socket, reconnecting, and `onlineActionInFlight` all mean display-side controls must be disabled/hidden.
- UI tests now cover CPU turns, other-player online turns, reconnecting/disconnected/missing socket, and pending resolver hiding while online input is blocked. Update those tests when changing online action gate semantics.

## Maintainability up-cycle Cycle 1 handoff

- `scripts/compare-rl-match-trace.js` now treats a JS/Python trace mismatch as automation failure (`process.exitCode = 1`). If future parity diagnostics intentionally tolerate mismatches, update both the script and `tests/compare-rl-match-trace.test.js` explicitly.
- PWA waiting Service Worker state is centralized in `refreshPwaUpdateState()` and is rechecked from `restartGame()` after returning to title/reset. Keep this hook in sync if title/game lifecycle moves out of `js/main.js`.
- Release checklist CI gate wording is now tested against the actual release workflow and includes `npm run test:pwa`. Keep `docs/RELEASE_CHECKLIST.md`, `docs/AUTOMATED_RELEASE_TEST.md`, `.github/workflows/release-test.yml`, and `tests/release-e2e.test.js` synchronized when changing release gates.
- This cycle intentionally avoided broad refactors. CPU/RL/gameplay logic and model selection were not changed, so no benchmark interpretation changes are expected.
- Remaining larger items are still design/manual scoped: hostless restore, signed/server-persisted canonical state, client-error token deployment policy docs, broader action metadata contract tests, and real-device long-run online/PWA/accessibility checks.

## Maintainability up-cycle Cycle 2 handoff

- Local `startGame()` / `resumeGame()` should terminate stale online runtime before entering local play. Do not remove the `resetOnlineState()` calls unless a replacement socket/session ownership guard is added.
- `resetUiLocksForGameReset()` is now shared by local start, restart, resume, online gameStart, and online rejoin. New game-screen entry points should call it before showing `gameScreen`.
- Watchdog interactive action coverage includes dice choice phases (`selectDice`, `rerollDice`, `skipReroll`, `resolveHarbor`) through the `diceChoose` snapshot. If new choice panels are added, include their root in the usable-action snapshot and tests.
- `initOnlineGame()` is responsible for transient async reset: CPU schedule token, delayed human action, autoskip, `prevCoins`, and `undoState`. Keep it aligned with local `init()` for async safety.
- Local CPU build failure is pass-through to `nextTurn`; online send failure remains a hard stop. Preserve this distinction when editing CPU execution.
- Online lifecycle `play-start` is sent on fresh `gameStart`, not on `rejoinData`. Payload must stay privacy-light: no room id, reconnect token, player names, card inventories, snapshots, or raw logs.

## UI interactability contract

- Any visible and expected interaction must be both logically allowed and physically clickable. The runtime contract is now represented by `collectUiLockSnapshot()`, `validateUiInteractability()`, `syncUiInteractabilityAfterRender()`, and `recoverUiInteractability()` in `js/appShell.js`.
- Keep the three action layers distinct: `GAME_ACTION_REGISTRY` is the rule/server/replay payload contract, `currentUiAllowedActions()` / `canShowUiAction()` is the render gate, and `ActionUiRegistry.containers` is the allowed-action-to-physical-container clickability contract.
- When adding an action surface, add it to `ActionUiRegistry.containers` in `js/actionUiRegistry.js` if it is driven by `allowedActionsFor()`. The registry must cover every `GAME_ACTIONS` entry exactly once: `rollDice -> btnRoll`, dice/harbor choices -> `diceChoose`, build actions -> `buildMenu`, `nextTurn -> btnSkip`, and pending resolvers -> `pendingModal` / `pendingMenu`. `resolveIT` is also registered for the `pendingIT` special case where allowed actions can be `resolveIT` even before phase is normalized to `pending`.
- Do not treat `disabled=false` as sufficient. Check parent/root state too: `display:none`, `hidden`, `inert`, `aria-hidden`, `pointer-events:none`, and `ancestorBlocked` all make a visible control unusable. For content containers, the registry also checks that the expected `data-action` child exists and is usable, so unrelated detail/filter buttons do not satisfy gameplay actions.
- Content containers also have an action-child selector contract in `ActionUiRegistry.childSelectors`. When changing generated buttons, keep `data-action` values aligned with that registry. For `buildCard` / `buildLandmark`, child clickability is required only when an actual build candidate exists and the player has not already built this turn; `allowedActionsFor(game)` is phase-level and does not mean every build class has an affordable candidate or currently relevant child button.
- `closeAccessibleModal()` must use the actual visible blocking modal set as the close-time source of truth. If `rulesModal` / `cardSelectModal` closes and no blocking modal remains visible, shell roots and `body.modal-open` must not stay locked.
- Active modals are allowed to lock the background, but the visible modal itself must remain interactive. `pendingModal` is special: it is validated by pending resolver rules so populated pending UI must have `pendingModal` and `pendingMenu` pointer interaction restored to `auto`.
- Title/reset screens must not be auto-restored into `gameScreen`. `recoverUiInteractability()` should only be used with active game snapshots and must preserve the existing active-modal guard.

Test index:

- `tests/integration.test.js`: registry coverage against `GAME_ACTIONS`, missing-registry diagnostics, normal-render no-recovery checks for roll/selectDice/rerollConfirm/harborChoice/all pending resolvers/build actions/nextTurn, registry-based recovery fallback, action-specific child checks, root `gameScreen` display/inert locks, stale confirm/body locks, pending/buildMenu pointer locks, visible modal pointer locks, title/active-modal false positives.
- `tests/release-e2e.test.js`: registry container IDs exist in `index.html`; iPhone Safari pending pointer state approximation.

## Maintainability continuation Cycle 1 handoff

- Freeze watchdog duplicate suppression must only suppress reports, not recovery. Keep the `recoverUiInteractability(snapshot)` call inside the duplicate-report branch.
- Modal background locking now uses pointer-events as an inert fallback. When changing modal roots, update `MODAL_INERT_ROOT_IDS`, `setAppInertForModal()`, and the modal helper tests together.
- Stale `pendingModal` is not a legitimate blocking modal when no pending resolver is allowed or the pending menu is empty. Preserve `stale-modal-ui-locked` recovery unless a stricter pending modal lifecycle replaces it.
- Online pending action cleanup is clientActionId-first. For modern pending entries, do not clear `onlinePendingAction` from actionSeq alone or from an ack without matching `clientActionId`. Seq-only fallback is only for legacy entries that lack ids.
- Remaining follow-ups are no longer simple automatic fixes: nested modal stack exceptions need UI behavior design/manual mobile verification, and hostless/signed restore needs trust-boundary design. Enabled descendant checks and generic appError pending ownership were handled in continuation Cycles 2-3.

## Maintainability continuation Cycle 2 handoff

- `handleAppError()` should not clear `onlinePendingAction` for generic app errors. Keep pending clear scoped to explicit invalid-action resync or full reconnect/session teardown.
- When adding new server appError messages, decide whether they are action rejection, session teardown, or status-only; update `tests/online.test.js` for pending ownership semantics.

## Maintainability continuation Cycle 3 handoff

- UI interactability checks for container controls must verify generated child actions when the DOM exposes them. A container with `htmlLength > 0` but `totalInteractiveChildren > 0` and `usableInteractiveChildren === 0` is not clickable.
- Do not store freeze watchdog snapshots by slicing JSON strings. Use `freezePayloadStorageJson()` so localStorage keeps valid JSON even when diagnostics grow.

## Cross-design decision index

- `docs/IMPLEMENTATION_DECISIONS.md` is the current index for deferred design items. Check it before implementing modal stack/deny-nesting, hostless restore, signed restore, server-persisted canonical state, multiple-room resume UI, production client-error auth, per-room restore namespace, or room replacement migration.
- Modal policy is accepted as deny-by-default with no initial nested blocking modal exceptions. Keep `recoverUiInteractability()` as fallback recovery only; it must not become a gameplay-action executor.
- Restore trust priority is server-persisted canonical state first, signed snapshot/action metadata second, hostless restore last. Existing-room replacement remains host-only until a separate hostless/provisional design is implemented.
- Multiple room resume UI must use the existing per-room restore index only as a locator and still waits for candidate classification, retention/pruning policy, and mobile UX tests. Do not build a picker on global restore keys.
- Production client-error hardening should use same-origin browser reports plus `CLIENT_ERROR_ALLOWED_ORIGINS`; `CLIENT_ERROR_SHARED_TOKEN` is for scripted/no-origin diagnostics and `/api/client-error-test`. Same-origin browser reports remain tokenless, so do not expose the shared token to normal browser code unless a deliberate browser token model is added.

## Modal deny-nesting implementation

- Blocking modal open is now deny-by-default through `MODAL_POLICY_REGISTRY` in `js/ui.js`; `MODAL_STACK_EXCEPTION_REGISTRY` is intentionally empty. Do not add exceptions without tests and mobile manual verification.
- `showConfirm()` must not install callbacks or set `__machikoroConfirmModalOpen` when a blocking modal open is denied. Preserve this contract when changing confirm flows.
- `pendingModal` is guarded separately from `openAccessibleModal()`: populated pending UI must not open while another blocking modal is visible.
- Nested blocking modal states are diagnostics (`nested-blocking-modal-policy-violation`), not an invitation for recovery to auto-close valid modals.

## Client-error / lifecycle auth boundary

- Operational runbooks live in `docs/OPERATIONS.md`. For production incidents, start there before changing code.
- ntfy categories are intentionally separated: lifecycle `play-start/play-finish` is a heartbeat, `unknown` is urgent, `known-pattern` is a regression only on current versions or high frequency, `stale-client` means update guidance, and CI failures use `NTFY_CI_TOPIC`.

- Same-origin browser `/api/client-error` and `/api/game-lifecycle` reports should keep working without exposing a shared token. Do not make normal browser reports depend on `CLIENT_ERROR_SHARED_TOKEN` unless a deliberate browser token delivery model is added.
- No-origin scripted diagnostics are stricter: `/api/client-error` requires the shared token when configured, `/api/client-error-test` always requires it when configured even from same-origin, and `/api/game-lifecycle` requires it for no-origin scripted lifecycle diagnostics when configured.

## Canonical state store footing

- `server/canonicalStateStore.js` is a schema/adapter footing and `server/canonicalStateRepository.js` is its injected runtime save/load boundary. Default mode is noop; `CANONICAL_STATE_STORE=memory` is not durable and does not solve server restart restore.
- `persistRoomCanonicalState()` is called after game start, accepted actions, and server restart restore, but server-persisted canonical authority remains deferred until a durable adapter and retention/locking policy are designed.
- Do not let client restore bundles lose to or win over a future store implicitly. When durable storage is added, server-loaded canonical state must explicitly outrank client `recreateRoom` bundles and tests must cover that boundary.

## Online restore room index footing

- `js/online.js` maintains `onlineRestoreRoomIndex` from room-scoped `onlineSession`, `onlineGameStart`, `onlineActionLog`, `onlineStateSnapshot`, and `onlinePendingAction` copies. It is an index for future UX and diagnostics, not a new restore authority.
- Scoped restore reads still prefer `*:room:<ROOM>` keys and fall back to legacy global keys for compatibility. Do not remove legacy keys destructively until a retention policy and multiple-room resume UX are explicit.
- `_pruneOnlineRestoreRoomIndex()` prunes stale index rows only; it must not delete restore bundles. Multiple-room resume UI should use this index only after stale/live/completed bundle states are documented and tested.

## Restore audit / signed snapshot footing

- `server/restoreAudit.js` now supports HMAC-signed restore audit records for the canonical restore payload (`gameStartPayload` + `stateSnapshot`) when `RESTORE_AUDIT_SECRET` or `MACHIKORO_RESTORE_AUDIT_SECRET` is configured.
- Trust priority is: server-loaded canonical state, then valid signed client snapshot, then replay from action log without trusting the client snapshot. Unsigned audit records remain diagnostics only and must not increase restore rank or bypass host-only restore.
- If no signing secret is configured, compacted client snapshots are ignored unless server canonical state is available. Full action-log replay remains compatible; compacted restart restore needs the secret or a durable canonical adapter.

## Multiple room resume design footing

- `docs/MULTI_ROOM_RESUME_DESIGN.md` defines the future picker states and test plan. No visible multi-room resume UI exists yet.
- Do not build resume selection from legacy global restore keys. Use `onlineRestoreRoomIndex` only as a locator, then re-read and validate scoped room data before any action.
- A future picker must keep non-host candidates out of authoritative restore paths until hostless restore is explicitly redesigned and accepted.

## Hostless restore re-evaluation

- `docs/HOSTLESS_RESTORE_DESIGN.md` now lists the concrete gates for re-evaluation. The 2026-05-26 footings do not authorize hostless restore.
- Keep `recreateRoom` replacement host-only. `onlineRestoreRoomIndex` is a locator only; `restoreAudit` becomes authority only when server-generated and HMAC-verified for the exact canonical restore payload.
- Stop before implementation if the next step requires provisional quorum, durable storage selection, replacement timing rules, or multi-device manual verification.

## 2026-07-15 B分類採用handoff

- 採用単位とrollback順は`docs/UNCOMMITTED_WORK_RESCUE_PLAN.md`を正とする。B1 source commitsは`92805aa`, `6bc947d`, `3f73ec5`, `12a3a1a`, `d7a14c9`, `4585e0b`。
- GitHub Actions: Release `29348809695`、Nightly `29348807863`（online/soak/simulation/WebKit）は成功。Node 20 action deprecation warningは残る。
- B2のAPK `b0c6c14`/`172785b` とmanual delivery `d13e866`はmainへ入れない。APKは署名password secrets設定後、deliveryはworkflowがdefault branchへ入った後に再評価する。
- restart file persistence、durable canonical transaction、stream/watermark protocol、hostless restoreはB1へ混ぜない。実機iPhone Safariは未確認。

## 2026-07-15 Remaining AI-only validation

- GitHub Actions action runtime majors were updated and Release/Nightly/APK validation passed on the validation branch.
- Manual production delivery is workflow-dispatch only, fixed to the production origin, and performs GET checks plus a read-only Socket.IO connect/close. It emits no room or game event.
- APK validation no longer requires signing secrets. The signed job remains human-blocked until `ANDROID_KEYSTORE_BASE64`, `KEYSTORE_STORE_PASSWORD`, and `KEYSTORE_KEY_PASSWORD` are configured.
- Durable file persistence and canonical transactions remain experimental. The default canonical store is still `noop`.
- Dotted action IDs, watermarks, and non-host canonical replacement remain rejected; see `docs/PROTOCOL_COMPATIBILITY.md`. The completed four-device match includes two iPhones and two Android devices with reconnect; untested iPhone-specific paths remain limited to scenarios outside that recorded match.

## 2026-08-03 Batch 18 handoff

- CPU landmark candidate reduction is now pure and contract-tested, but `CPU.js` still owns candidate eligibility and every heuristic input. Preserve score construction and `Player.landmarkNames()` order when extending it.
- Pending outbound action shape is now built by `OnlinePayload`; keep sequence allocation before client-action-ID generation and keep memory, legacy key, and room-scoped key writes in `online.js`.
- Business Center selection view is owned by `UiPendingMenu`; `UiPendingEffects` deliberately owns ordered DOM mutation and `ui.js` retains lookup/public dispatch. Preserve group reset before selecting the clicked chip and preserve `bcSelectCard()`'s boolean/public behavior.
- Static content and metadata route registration are owned by `server/staticAssets.js`; injected values and the metadata → reporting → content ordering remain in `server.js`.
- Batch-end verification uses `npm run test:batch` once after the theme commits and docs sync. Continue choosing 3–5 independent seams per batch; do not narrow future batches to visible behavior changes only.

## 2026-08-03 Batch 19 handoff

- Read runtime flags through the single `OnlineRuntimeFlags` reader; do not reintroduce direct `window.MACHIKORO_*` checks. Reader roots are resolved per call so tests and runtime replacement stay observable.
- Lifecycle notification storage must use `LifecycleNotify.storageKeys` and its injected access functions. Do not duplicate the legacy-key fallback in `appShell.js`.
- Keep `registerStaticMetadataRoutes()` before reporting registration and `registerStaticContentRoutes()` after it. This ordering protects special routes from broad static middleware.
- For Business Center selection, preserve `UiPendingMenu` → `UiPendingEffects` → thin `ui.js` ownership and the reset-all → select-clicked → find/write-input order.
- The scoped gates are now 174 ESLint maintenance files and 173 checkJs runtime files; update package/config/type/global/runtime-loader lists atomically when adding another browser module.


## 2026-08-03 Batch 20 handoff

- Pending actionのfield/action正本とqueue補修は`js/pendingActionQueue.js`を使う。`GameManager`の既存static APIを迂回して同等ロジックを再実装しない。field counterとqueueのdual-write、IT special case、phase authorityは引き続き`GameManager`側にある。
- Lobbyの作成/参加枠判定は`server/lobbyAdmission.js`へ追加する。Socket event、schema交渉、room/socket mutation、token、emit順をpure plannerへ隠さない。
- CPUのstable tie reductionとrandom choiceは`CPUSelection`を使う。候補列挙順やRNG呼出回数を変える拡張はdecision baselineと2〜10人self-play baselineの両方を必須とする。
- Main/online tabとoffline availabilityのDOM反映は`UiTabEffects`を使う。`UiTabView`はpure、`ui.js`/`appShell.js`はlive DOM lookupと周辺orchestrationのownerである。
- Batch 20完了時のscoped gateは178 ESLint maintenance files / 177 checkJs runtime files。新module追加時はproduction/cache/runtime loader、lint、checkJs、global declaration、direct testを同じtheme commitで同期する。


## 2026-08-03 Batch 21 handoff

- 収入処理後phase、遊園地の追加手番、player index循環は`GameTurnPolicy`を正本にする。`GameManager`へ同じ条件式を戻さない。dice/RNG、収入副作用、reset/logはまだ`GameManager`のownerである。
- reconnect/Engine rollout flag readerを追加するときは`OnlineRuntimeFlags.names`へ登録し、`createNamedReaders()`の選択リストから既存名を公開する。直接の`window.MACHIKORO_*`判定や一行wrapperを増やさない。schema transportの4 readerはcodec prerequisiteがあるため通常named readerと混同しない。
- room GCの周期・clock・timer/unref配線は`server/roomGcRuntime.js`、TTLと削除policyは`server/roomLifecycle.js`、live rooms注入は`server.js`がownerである。durable repositoryやhostless authorityとは別境界として扱う。
- 勝利表示のHTMLは`UiWinner`、副作用順は`UiWinnerEffects`、live state/DOM callbackは`ui.js`がownerである。初回だけのmarker → sound → stats → lifecycle順と、毎回のsave/session cleanup → online/PWA completion → controls → redraw順を維持する。
- 現在のscoped gateは181 ESLint maintenance files / 180 checkJs runtime files。残るcheckJs除外は`appShell.js`、`main.js`、`online.js`、`storage.js`、`ui.js`の5つで変わらない。
- Batch 22以降も3〜5テーマを選び、各themeを独立commit、docsを最後の1commit、`npm run test:batch`とpush/CIをバッチ末尾に一度だけ行う。安全な境界は全体再監査から選び、行数削減だけを理由に抽出しない。

## 2026-08-04 Batch 22 handoff

- Pending enqueue/consume/clearは`PendingActionQueue.plan*()`を正本にし、`GameManager._applyPendingActionTransition()`だけがlive fields/queueへ反映する。phase判定、public/static API、legacy malformed表現は引き続き`GameManager`互換境界で維持する。
- score付きCPU候補の降順整列は`CPUSelection.stableRankDescending()`を使う。同点時の元順序、score評価1回、候補生成順を変えない。新しい適用箇所はdecision baselineと2〜10人self-play baselineの一致を必須とする。
- process例外listenerとHTTP listen配線は`server/processRuntime.js`、Express/Socket.IO構築と依存注入は`server.js`がownerである。listener名、listen引数、起動ログをadapter側で再解釈しない。
- active-game viewは`UiGameStatusView`、effect順は`UiGameStatusEffects`、live state/DOM lookupとoptional global解決は`ui.js`がownerである。callbackは遅延評価し、すべてのdependent redrawを従来の`safeRenderStep`名と順序で実行する。
- 現在のscoped gateは183 ESLint maintenance files / 182 checkJs runtime files。残るcheckJs除外は`appShell.js`、`main.js`、`online.js`、`storage.js`、`ui.js`の5つで変わらない。
- 次バッチもeffect抽出だけに限定せず、契約、pure transition、state machine、runtime/adapter、domain responsibilityを全体再監査して3〜5テーマを選ぶ。1テーマ1commit、docsは末尾1commit、`npm run test:batch`・push・CIはバッチ末尾に一度だけ行う。

## 2026-08-04 Batch 23 handoff

- card/landmark建設の拒否順は`GameBuildPolicy`を正本にする。lazy factは旧fail-fast順を守るための契約であり、先読みや値補正へ使わない。成功後のcoin/card/landmark/log/built mutationは`GameManager`がownerである。
- nextTurn admission、空港bonus可否、IT pending/advanceは`GameTurnPolicy`を使う。空港coin/logを適用してからactive IT cardを探索する既存順と、`_doNextTurn()`の遊園地/player advancement責務を維持する。
- inbound Socket eventを追加・変更する場合は`OnlineSocketRegistry.keys/order/staticEventNames`とdirect/runtime/online testsを同じcommitで更新する。callback本体とSocket emit、ACK、restore、reconnect authorityは引き続き`online.js`側にある。
- crash/online browser購読は`ClientEventRuntime`、reporting/console/crash UI/bound flags/PWA/watchdogは`appShell.js`がownerである。property assignmentとlistener登録順、初回online status updateを変えない。
- 現在のscoped gateは186 ESLint maintenance files / 185 checkJs runtime files。残るcheckJs除外は`appShell.js`、`main.js`、`online.js`、`storage.js`、`ui.js`の5つで変わらない。
- 次バッチもeffectだけに限定せず、共有Engine transition、CPU strategy、online state、server composition、UI state/viewから3〜5個の安全な境界を再監査する。

## 2026-08-04 Batch 24 handoff

- IT積立解決は`GameTurnPolicy.planItResolution()`を正本にする。`GameManager.resolveIT()`はplan適用、log、pending clear、turn advanceのownerであり、コイン不足時も従来どおりpendingを消して手番を進める。
- 事前計算済み複合keyのCPU順位付けは`CPUSelection.stableRankLexicographic()`を使う。key selectorは各候補1回、完全tieは入力順を維持する。脅威評価やprofile計測を含むsortへ機械適用せず、追加時はdecision baselineと2〜10人self-play baselineを必須とする。
- Socket接続時のfamily順は`server/socketConnectionRuntime.js`のhostless → lobby → action → rejoin → recreate → disconnectを正本にする。callback本体と依存配線は`server.js`、個別event登録は各handler moduleがownerである。
- UIルート分岐は`UiRenderRuntime.plan()`、分岐別の順序は`UiRenderRuntime.execute()`を使う。`ui.js`はlive game readとcallback配線を所有し、winner branchでpersistしないこと、active branchでrender後にpersistすることを維持する。
- 現在のscoped gateは188 ESLint maintenance files / 187 checkJs runtime files。残るcheckJs除外は`appShell.js`、`main.js`、`online.js`、`storage.js`、`ui.js`の5つで変わらない。
- 次バッチも3〜5テーマを1テーマ1commitで進め、effectだけに限定せずdomain transition、selection policy、runtime composition、state/view、contractから安全な組合せを選ぶ。docsは最後の1commit、`npm run test:batch`・push・exact-HEAD CIはバッチ末尾に一度だけ行う。


## 2026-08-04 Batch 25 handoff

- dice roll/select/reroll/Harborの判定と結果整形は`GameDicePolicy`を正本にする。`GameManager`はRNG消費、live state適用、income/card effect、structured log、public methodを所有する。lazy factの読出順やTuna用dice flowを先読みへ変えない。
- 単一keyの昇順・降順rankingは`CPUSelection.stableRankAscending()` / `stableRankDescending()`を使う。selector評価は各候補1回、非finite差分と完全tieは従来どおり入力順を保持する。opponent threat/profile計測を含むsortは機械移行せず、追加時はdecision baselineと2〜10人self-play baselineを必須とする。
- ロビー表示名、human slot、開始名、shuffle、client version、reconnect token hash、hostless capability metadataは`server/roomProjection.js`がownerである。TTL、rate limit、room admission、connected-player、host epochは`roomLifecycle.js`へ残し、Socket.IO event/payloadやhostless authorityをprojectionへ持ち込まない。
- 現在のscoped gateは190 ESLint maintenance files / 189 checkJs runtime files。残るcheckJs除外は`appShell.js`、`main.js`、`online.js`、`storage.js`、`ui.js`の5つで変わらない。
- 次バッチもeffectだけに限定せず、共有Engine、CPU strategy、online state/effect authority、server composition、UI state/viewから3〜5個の責務境界を再監査する。各themeは独立commit、docs・`npm run test:batch`・push・exact-HEAD CIはバッチ末尾に一度だけ行う。

## 2026-08-04 Batch 26 handoff

- CPU build selection should flow through `CPU.chooseBuildAction()` and execution through `CPU.executeBuildAction()`. Keep `CPU.build()` as the compatibility API and preserve the scheduler fallback for non-production CPU doubles. Any further migration must match fixed decision, RNG/action trace, and 2–10 player self-play baselines.
- Online action-log append/compaction policy and effect order belong to `OnlineActionLog`. `online.js` still owns live objects, snapshot creation, sequence allocation, storage adapters, ACK/reconnect, and Socket transport. Do not change existing localStorage keys, record shapes, or patch/write order when extending this seam.
- Restored-room activation/delivery/completion orchestration belongs to `server/restoredRoomRuntime.js`; validation/rank/mirror/payload construction remain outside it. Keep both effect-authority flags default-OFF, preserve hostless rejection before effects, and return the legacy public failure shape from `handleRecreateRoom()`.
- Current scoped gate is 192 ESLint maintenance files / 191 checkJs runtime files. The remaining checkJs exclusions are still `appShell.js`, `main.js`, `online.js`, `storage.js`, and `ui.js`.
- Continue in batches of 3–5 independently rollbackable themes. Do not limit theme selection to visible behavior or effect extraction: include safe domain policy, pure transition, strategy, state/view, runtime composition, and contract boundaries. Keep one theme per commit; perform docs sync, `npm run test:batch`, one push, and exact-HEAD CI once at the batch end.

## 2026-08-04 Batch 27 handoff

- Expert profile/preset/simulation-mode composition belongs to `resolveExpertProfileTuning()` in `cpuTuning.js`. `CPU._syncExpertTuningForGame()` only selects the profile and assigns the result. Preserve preset overwrite order and realtime → fast/lite rounding exactly; require fixed-decision and 2–10 player self-play parity for changes.
- Dormant dice eligibility belongs to `GameCardActivationPolicy.eligibleDormantCards()`. `GameManager` still owns `player.revive()`, logs, red → blue → green → purple order, Tuna RNG, income, pending effects, City Hall, and phase transition. Do not move rule effects into the eligibility policy.
- Online completion/reset order belongs to `OnlineSessionLifecycle`; `online.js` supplies every live callback. Preserve the pre-reset room ID used by pending cleanup and the final reconnect event observation. This is not permission to change Socket, storage, retry, queue, or reconnect authority.
- Current scoped gate is 194 ESLint maintenance files / 193 checkJs runtime files. The remaining checkJs exclusions stay `appShell.js`, `main.js`, `online.js`, `storage.js`, and `ui.js`.
- For efficient batches, run changed-file syntax/lint/type and focused contracts per theme. Run the all-repository static scan, full CPU/self-play set, complete unit/simulation suite, Socket E2Es, and release checks once through `npm run test:batch` at the end; do not duplicate an included all-file gate before it.


## 2026-08-04 Batch 28 handoff

- Use `scripts/check-static-files.js` for repository JavaScript/JSON syntax checks. It must continue to include tracked and unignored untracked files, accept shebang scripts, aggregate file-specific failures, and avoid executing source. Do not restore per-file Node spawning without measured evidence.
- Game-start readiness belongs to `gameStartAdmission`, and the `mark → emit → log` effect order belongs to `gameStartRuntime`. `gameStartCoordinator` owns composition and must preserve lazy human-slot counting for missing/already-started rooms plus payload rejection before all effects.
- Tutorial enabled/level/cycle changes belong to `UiTutorialSettings`. Keep `tutorialEnabled` and `tutorialLevel` keys and their exact string values stable; `ui.js` remains the public/live-state/DOM owner, while `UiTutorial` remains the view/message owner.
- Current scoped gate is 198 ESLint maintenance files / 197 checkJs runtime files. The remaining exclusions are still `appShell.js`, `main.js`, `online.js`, `storage.js`, and `ui.js`.
- Continue with 3–5 theme batches selected by architectural value and controllable compatibility risk, not by effect-only scope. Keep one theme per commit, focused tests per theme, and one batch-end full gate/push/exact-HEAD CI.


## 2026-08-04 Batch 29 handoff

- `tests/run-all.js all` defaults to two isolated child processes. Keep output in declared order and run all scheduled files even when one fails. Use `MACHIKORO_TEST_CONCURRENCY=1` to diagnose ordering/resource issues; named groups remain sequential unless explicitly overridden.
- Pending TV/Business/Cleaning/Mover/Renovation admission belongs to `GamePendingResolutionPolicy`. Preserve lazy fact order and reason-specific legacy logging. `GameManager` remains the owner of card identity resolution, mutation, coins, dormancy, logs, queue consumption, and phase authority.
- Runtime dependency declarations are chains, and every adjacent edge is now enforced. Add extracted GameManager dependencies to production, server loader, integration/online/RL/self-play loaders in the same theme.
- Expert lookahead opponent indexes belong to `CPULegalMoves`. Preserve CPU flag precedence and threat comparator behavior; any further change requires fixed-decision and 2–10 player self-play parity.
- Current scoped gate is 199 ESLint maintenance files / 198 checkJs runtime files. The five side-effect client runtime exclusions remain unchanged.

## 2026-08-04 Batch 30 handoff

- Pending resolution completion belongs to `GamePendingResolutionPolicy.completionTransition()`. A non-complete plan must not assign phase; `GameManager` remains the owner of pending counters, queue mutation, logs, and live phase application.
- Multi-player collection/equalization math belongs to `GameCoinTransaction`. Callers compute effect-specific requested amounts, then `GameManager` applies the frozen final balances and preserves activation/log order. Extend this boundary with direct transaction tests plus affected card-rule tests; do not move card activation or mutation authority into the planner.
- ACK-flight flag, start time, and timeout handle belong to `OnlineRetryPolicy.createActionFlightController()`. `onlineActionInFlight` and `onlineActionInFlightAt` remain compatibility projections consumed by app-shell diagnostics. Keep the 15-second timeout, pending outbound storage, ACK matching, reconnect effects, and Socket.IO protocol unchanged.
- Current scoped gate is 200 ESLint maintenance files / 199 checkJs runtime files. The remaining checkJs exclusions are `appShell.js`, `main.js`, `online.js`, `storage.js`, and `ui.js`.
- Continue with 3–5 independently rollbackable themes selected across domain transitions, shared Engine, CPU strategy, online state, server composition, UI state/view, and contracts. Use one theme per commit, one docs commit, one `test:batch`, one push, and exact-HEAD CI per batch.

## 2026-08-04 Batch 31 handoff

- Ordered red-card balance exhaustion belongs to `GameCoinTransaction.sequentialCollectionPlan()`. Preserve per-opponent revival → activation/log ordering in `GameManager`; conditional activation and Mall/Harbor/landmark facts are not transaction concerns.
- One-die/Station two-dice turn-score aggregation belongs to `CPUEvaluation.turnScorePair()`. `CPU._estimatePlayerTurnScorePair()` must restore `currentPlayerIndex` in `finally` and keep its signature cache. Any extension requires callback-order, fixed-decision, and self-play parity.
- Hostless approval composition belongs to `server/hostlessRestoreApproval.js`. It does not own candidate ranking, audit, recreate logic, room mutation, or Socket delivery. Keep `approvedHostless`, `candidateCount`, failure reasons, and provisional confirmation stable.
- Pending modal interaction styles are computed by `UiPendingMenu` and applied by `UiPendingEffects`; `ui.js` owns blocking-modal checks, content writes, re-entry state, and violation reporting. Preserve modal → inner → content application order.
- Current scoped gate is 201 ESLint maintenance files / 200 checkJs runtime files. Remaining checkJs exclusions stay `appShell.js`, `main.js`, `online.js`, `storage.js`, and `ui.js`.
- Continue 3–5-theme batches across shared Engine, CPU strategy, online state, server composition, UI state/view, and contracts. Keep one theme per commit, one docs commit, one `test:batch`, one push, and exact-HEAD CI per batch.

## 2026-08-04 Batch 32 handoff

- Blue-card activation amount/kind belongs to `GameCardActivationPolicy.blueIncomePlan()`. Preserve lazy built-landmark and Tuna-dice reads; `GameManager` remains the owner of revival, color/dice admission, RNG, live coin mutation, logs, and red → blue → green → purple ordering.
- Restore generation, in-progress, and quarantine writes belong to `OnlineRestoreLifecycleState`. Existing globals in `online.js` are compatibility projections only. Preserve GAME_START and REJOIN_DATA call order when extending the controller; do not fold queue, retry, reconnect authority, storage, or Socket transport into it.
- Crash-screen view/focus decisions belong to `CrashScreen`, DOM application belongs to `CrashScreenEffects`, and CPU cancellation/listener lifecycle/saved-game lookup/resume dispatch belong to `appShell.js`. Keep `showCrashScreen`, `crashResume`, and browser-global names compatible.
- Card rule registration checks intentionally scan both direct `GameManager` constants and injected `facts.effects.*` references in `GameCardActivationPolicy`. Add a delegated rule owner explicitly rather than weakening or deleting the omission assertion.
- Current scoped gate is 203 ESLint maintenance files / 202 checkJs runtime files. Remaining checkJs exclusions stay `appShell.js`, `main.js`, `online.js`, `storage.js`, and `ui.js`.
- Continue with 3–5 independently rollbackable themes chosen across domain policy, shared Engine, CPU strategy, online state, server composition, UI state/view/effect, and contracts. Keep one theme per commit, one docs commit, one `test:batch`, one push, and exact-HEAD CI per batch.

## 2026-08-04 Batch 33 handoff

- Green-card activation outcome selection belongs to `GameCardActivationPolicy.greenActivationPlan()`. Keep income and renovation-target facts lazy. `GameManager` remains the owner of live mutation, pending fields, dormancy, logs, and card activation order.
- Restore queue-flush state belongs to `OnlineRestoreLifecycleState`. `_flushingOnlineRestoreEvents` is a compatibility projection, not a second owner. Preserve flush start/finally/reset order and do not move queue, retry, storage, reconnect, or Socket authority into the controller.
- Progress-income eligibility and ordered aggregation belong to `CPUEvaluation`. `CPU.js` owns cache lifecycle and valuation callbacks. Preserve excluded effects, callback order, heuristic values, and fixed decision/action traces.
- Scoped gates remain 203 ESLint maintenance files and 202 checkJs runtime files. Remaining checkJs exclusions stay `appShell.js`, `main.js`, `online.js`, `storage.js`, and `ui.js`.
- Efficiency policy: keep batches at no more than three independently rollbackable themes, use focused checks per theme, then run one `npm run test:batch`, one push, and one exact-HEAD CI check at batch end.

## 2026-08-04 Batch 34 handoff

- Purple-card effect/pending dispatch belongs to `GameCardActivationPolicy.purpleActivationPlan()`. Keep Business Center and Cleaning target facts lazy; all transactions, mutation, logs, revival, and color order remain in `GameManager`.
- Received-card effect dispatch and ownership arithmetic belong to `CPUEvaluation.receivedCardValue()` / `ownedCardValue()`. Keep copy ordinals, income, soft-cap callback, dice frequency, dependency evaluation, cache, and candidate order in `CPU.js`; require fixed-decision and self-play parity for extensions.
- Local resume RL preload generation/pending state belongs to `LocalResumePreloadState`. `storage.js` may project pending state to the button, but stale Promise completion must pass `finish(generation)` before resume or error effects.
- Do not add broad ambient declarations to place `storage.js` in checkJs. Its direct trial exposed more than 100 global-coupling errors; extract typed adapters/controllers first. Scoped gates are 204 ESLint maintenance files and 203 checkJs runtime files, with the same five side-effect runtimes excluded as whole files.
- Continue with at most three rollbackable themes, focused checks per theme, and one batch-end `test:batch`, push, and exact-HEAD CI check.

## 2026-08-04 Batch 35 handoff

- Red-card admission/kind/requested amount belongs to `GameCardActivationPolicy.redActivationPlan()`. Keep landmark/coin/category facts lazy. `GameManager` owns opponent and card order, revival, capped transfer application, balances, and logs.
- Local-save admission and serialize/save exception containment belong to `LocalSaveRuntime`. Keep winner lookup after no-game/online short circuits and do not move payload fields or repository version policy into this executor.
- Watchdog checkpoint → recovery → storage → report ordering belongs to `UiWatchdogReporting`. `appShell.js` owns classification, recovery handlers, adapters, and scheduling. Preserve report key, message, stack construction timing, and recovery-before-serialization semantics.
- Scoped gates are 206 ESLint maintenance files and 205 checkJs runtime files. Whole-file exclusions remain `appShell.js`, `main.js`, `online.js`, `storage.js`, and `ui.js`; continue extracting typed boundaries instead of adding ambient declarations.
- Keep batches at no more than three rollbackable themes, with focused checks per theme and one batch-end `test:batch`, push, and exact-HEAD CI check.

## Batch 36 handoff (2026-08-04)

- Pending TV/Business/Cleaning/Mover/Renovation outcome data belongs to `GamePendingTransition`; `GamePendingResolutionPolicy` still owns admission, and `GameManager` owns mutation, logs, queue consumption, and phase authority. Preserve player/card traversal order and card identity when extending it.
- Rejoin attempt count/exhaustion writes belong to `OnlineRetryPolicy.createRejoinAttemptController()`. Keep `_rejoinRetryCount` and `_rejoinRetryExhausted` as compatibility projections only; do not bypass the semantic controller helpers.
- Server action-log, room, payload, and reporting limits belong to `server/runtimeLimits.js`. Keep `server.js` named exports compatible and change a limit only as an explicit behavior/security decision with boundary tests.
- Scoped gates are 208 ESLint maintenance files and 207 checkJs runtime files. Whole-file exclusions remain `appShell.js`, `main.js`, `online.js`, `storage.js`, and `ui.js`.

## Batch 37 handoff (2026-08-04)

- CPU simulation game reconstruction belongs to `CPUSimulation.cloneGame()`. Keep `CPU._cloneGame()` as the profiling/adapter wrapper and preserve cloned card identity, dormant-card remapping, pending queue fallback, and every legacy default before changing simulation state.
- Pending outbound in-memory ownership belongs to `OnlinePendingOutboundState`; storage dual-write/fallback, normalization, session checks, ACKs, reconnect, and Socket effects remain in `online.js` and existing helpers. Preserve roomless legacy entries by hydrating them under the current-room fallback key.
- Client-error dedupe key/time belongs to `ClientReporting.createAdmissionController()`. Keep the 10-second app-shell suppression interval, suppressed checkpoint, report key, and transport sequence unchanged.
- Scoped gates are 209 ESLint maintenance files and 208 checkJs runtime files. Whole-file exclusions remain `appShell.js`, `main.js`, `online.js`, `storage.js`, and `ui.js`.


## Batch 38 handoff (2026-08-04)

- Card/landmark build outcome data belongs to `GameBuildPolicy.cardBuildTransition()` / `landmarkBuildTransition()`. Keep live mutation, card cloning, Loan Office logging, and structured build logs in `GameManager`; preserve their current order.
- Existing-room recreate admission and rejoin effect sequencing belong to `ExistingRoomRestoreRuntime`. Keep default-OFF effect authority and the legacy fallback until an explicit rollout decision; do not change reconnect identity, host reselection persistence, or Socket event payloads through this boundary.
- Card-select modal interaction state belongs to `UiCardSelect.createSelectionController()`. Because online/local restore still writes legacy Sets, synchronize the controller from globals before an interaction and project its immutable snapshot back afterward.
- Scoped gates are 210 ESLint maintenance files and 209 checkJs runtime files. Whole-file exclusions remain `appShell.js`, `main.js`, `online.js`, `storage.js`, and `ui.js`.
- Continue with small rollbackable themes, focused checks per theme, one batch-end `test:batch`, one push, and one exact-HEAD CI check.


## Batch 39 handoff (2026-08-04)

- Pending/turn reset outcome data belongs to `GameTurnPolicy`. Keep `GameManager` as the mutable adapter and clone `pendingActionQueue` before assigning it; conditional log/dice clearing must remain unchanged.
- Expert positive-income cap arithmetic belongs to `CPUEvaluation.expertPositiveIncomeCap()`. Keep v2simple admission, tuning selection, landmark-name/cost adaptation, and profiling in `CPU.js`; preserve lazy facts and require decision/self-play parity for changes.
- Lifecycle session/start/finish writes belong to `LifecycleNotify.createController()`. Keep storage keys/markers, 60-second reload suppression, metadata reads, transport, checkpoints, and browser-global APIs in app-shell adapters.
- Scoped gates remain 210 ESLint maintenance files and 209 checkJs runtime files. Whole-file exclusions remain `appShell.js`, `main.js`, `online.js`, `storage.js`, and `ui.js`.
- Continue with at most three rollbackable themes, focused checks per theme, then one `test:batch`, one push, and one exact-HEAD CI check.

## Batch 40 handoff (2026-08-04)

- Last-applied online action sequence memory belongs to `OnlineActionSequence.createController()`. Keep storage, snapshot/log reads, ACK/replay, reconnect, and Socket effects in their current adapters; do not introduce a second mutable sequence owner.
- New-room restore prepare/activate/delivery sequencing belongs to `server/newRoomRestoreRuntime.js`. Keep candidate authority, room mutation, persistence, event names/payloads, and existing-room restore behavior in their current owners.
- UI log entries and previous rendered length belong to `UiLogDisplay.createHistoryController()`. Keep log text, DOM effects, scrolling, card filters, and browser-global APIs in `ui.js`.
- Scoped gates are 211 ESLint maintenance files and 210 checkJs runtime files. Whole-file exclusions remain `appShell.js`, `main.js`, `online.js`, `storage.js`, and `ui.js`.
- Continue with at most three rollbackable themes, focused checks per theme, then one `test:batch`, one push, and one exact-HEAD CI check.

## Batch 41 handoff (2026-08-04)

- Income completion belongs to `GameTurnPolicy.incomeCompletionPlan()`. Preserve exact-zero City Hall admission and do not read City Hall ownership unless coins are zero; `GameManager` remains the mutable coin/log/phase adapter.
- Lobby create/join pending flags, request kind/generation, and timeout handle belong to `OnlineLobbyRequestState`. Keep the two legacy pending variables as read projections only and preserve the 15-second timeout, Socket events, notices, disconnect cleanup, and RL preload ordering.
- Crash shown/hidden state belongs to `CrashScreen.createController()`. Keep CPU cancellation, saved-game access, DOM/focus/listener effects, `showCrashScreen`, and `crashResume` in app-shell adapters.
- Scoped gates are 212 ESLint maintenance files and 211 checkJs runtime files. Whole-file exclusions remain `appShell.js`, `main.js`, `online.js`, `storage.js`, and `ui.js`.
- Continue with at most three rollbackable themes, focused checks per theme, then one `test:batch`, one push, and one exact-HEAD CI check.

## Batch 42 handoff (2026-08-04)

- Affordable purchase score composition belongs to `CPUEvaluation.affordablePurchaseScore()`. Keep all feature callbacks lazy, preserve their tested order, and require fixed-decision plus 2–10-player self-play parity for changes. `CPU.js` remains the game/card feature adapter.
- First-winner traversal belongs to `GameTurnPolicy.winnerIndex()`. Preserve player order, per-player enabled-landmark projection, first-match short circuit, original player identity, and post-win Action closure.
- Confirm awaiting state and cancel-handler ownership belong to `UiModalPolicy.createConfirmController()`. Keep DOM/focus/inert/modal admission in `ui.js`, and close the accessible modal before executing a rejected confirmation callback.
- Scoped gates remain 212 ESLint maintenance files and 211 checkJs runtime files. Whole-file exclusions remain `appShell.js`, `main.js`, `online.js`, `storage.js`, and `ui.js`.
- Continue with at most three rollbackable themes, focused checks per theme, then one `test:batch`, one push, and one exact-HEAD CI check.

## Batch 43 handoff (2026-08-04)

- Turn-announcer timer ownership belongs to `UiTurnAnnouncer.createTimerController()`. Keep the 1300/400 ms schedule and replacement cancellation stable; DOM classes/styles/text and `showTurnAnnouncer()` remain `ui.js` responsibilities.
- Hostless-restore pending ownership belongs to `OnlineHostlessRestoreState.createController()`. Keep bundle admission, Socket event names/payloads, reconnect state transitions, terminal reasons, and retry timing in their current owners.
- Do not extract forwarding wrappers around the room projection helpers already delegated from `server.js` to `server/roomProjection.js`; select a boundary with new ownership instead.
- Scoped gates are 213 ESLint maintenance files and 212 checkJs runtime files. Whole-file exclusions remain `appShell.js`, `main.js`, `online.js`, `storage.js`, and `ui.js`.
- Continue with at most three rollbackable themes, focused checks per theme, then one `test:batch`, one push, and one exact-HEAD CI check.

## Batch 44 handoff (2026-08-04)

- Turn advancement belongs to `GameTurnPolicy.turnAdvancePlan()`. Preserve the frozen reset options, Amusement Park repeat admission, zero turn-count delta on repeat, cyclic next-player index, and exact GameManager log/effect order.
- Negotiated schema selection state belongs to `OnlineSchemaTransport.createSelectionController()`. Keep GAME_START and REJOIN_DATA validation, runtime flags, codecs, Socket payloads, and default legacy transport outside the controller.
- Recreate-room admission and existing/new routing belong to `server/recreateRoomRuntime.js`. Keep validation, identity, room mutation, persistence, hostless policy, and Socket delivery in the injected owners; `handleRecreateRoom` is only the public compatibility wrapper.
- Scoped gates are 214 ESLint maintenance files and 213 checkJs runtime files. Whole-file exclusions remain `appShell.js`, `main.js`, `online.js`, `storage.js`, and `ui.js`.
- New modules must be registered in production/SW where applicable, lint, checkJs, test groups, every partial VM loader, and runtime-dependency contracts within the same theme.

## Batch 45 handoff (2026-08-04)

- Expert card penalty values and branch order belong to `CPUEvaluation.expertCardPenalty()`. Keep the built-landmark callback lazy and require direct table, fixed-decision, and self-play parity for changes.
- Build-menu filter state belongs to `UiBuildMenu.createFilterController()`. Keep all requested values compatible, including unknown future filters, and preserve render-on-repeat behavior.
- App-shell binding state belongs to `ClientEventRuntime.createBindingController()` and its frozen keys. Mark a binding only after its existing effect succeeds; repeated online-status binding calls must still refresh the current status.
- Do not combine Airport and IT Startup `nextTurn` facts into a pre-effect plan: legacy order awards/logs Airport income before reading the active IT card. Introduce an explicit staged plan if this boundary is revisited.
- Scoped gates remain 214 ESLint maintenance files and 213 checkJs runtime files. Whole-file exclusions remain `appShell.js`, `main.js`, `online.js`, `storage.js`, and `ui.js`.

## Batch 46 handoff (2026-08-04)

- Business-exchange and Cleaning Company target-availability traversal belongs to `GamePendingResolutionPolicy`. Preserve current-player-first and nested player/card short-circuit order; `GameManager` retains mutation, logs, pending queue, card identity, and dormancy behavior.
- Expert four-player normal-plan admission belongs to `CPUEvaluation.expertCrowdNormalPlan()`. Preserve the exact `remaining > 1 || stableIncome < 10` thresholds and fact order, and require fixed-decision plus 2–10-player self-play parity for changes.
- Previous-player index for active-game turn presentation belongs to `UiGameStatusEffects.createTurnStateController()`. Keep controller initialization lazy for partial UI runtimes; `ui.js` remains responsible for view construction, DOM effects, and reset orchestration.
- Scoped gates remain 214 ESLint maintenance files and 213 checkJs runtime files. Whole-file exclusions remain `appShell.js`, `main.js`, `online.js`, `storage.js`, and `ui.js`.
- Continue with at most three rollbackable themes, focused checks per theme, then one `test:batch`, one push, and one exact-HEAD CI check.

## Batch 47 handoff (2026-08-04)

- Pending minor-card reference resolution belongs to `GamePendingResolutionPolicy.resolveMinorCardRef()`. Preserve integer-index versus first-name-match behavior, major-card rejection, original card identity, and missing-player short circuit.
- Expert self-race disruption multipliers belong to `CPUEvaluation.expertDisruptionScale()`. Keep feature reads lazy after difficulty/flag/distance gates and require fixed-decision plus 2–10-player self-play parity for changes.
- Post-build stabilizer pending and remaining-task state belongs to `UiWatchdogMonitor.createPendingBatchController()`. Keep its controller private to app-shell orchestration and preserve the 0/250/1500/3500 ms effect schedule and fallback loop.
- Scoped gates remain 214 ESLint maintenance files and 213 checkJs runtime files. Whole-file exclusions remain `appShell.js`, `main.js`, `online.js`, `storage.js`, and `ui.js`.
- Continue with at most three rollbackable themes, focused checks per theme, then one `test:batch`, one push, and one exact-HEAD CI check.

## Batch 48 handoff (2026-08-04)

- Restore-queue diagnostic selection state belongs to `OnlineRestoreQueueState.createDiagnosticController()` and its frozen five-key registry. Keep actual queue/store ownership, authority flags, transition/effect execution, public getters, and the module-unavailable fallback in their current boundaries.
- Renovation target availability belongs to `GamePendingResolutionPolicy.hasRenovationTarget()`. Preserve the excluded City Hall landmark and use the same query for activation and consecutive pending skips.
- Expert lookahead terminal score composition belongs to `CPUEvaluation.lookaheadTerminalHeuristic()`. Preserve focus/best distance reads, race flag/facts, threat flag, player-index traversal, and threat-before-distance callback order; require fixed-decision and 2–10-player self-play parity for changes.
- Scoped gates remain 214 ESLint maintenance files and 213 checkJs runtime files. Whole-file exclusions remain `appShell.js`, `main.js`, `online.js`, `storage.js`, and `ui.js`.
- Continue with at most three rollbackable themes, focused checks per theme, then one `test:batch`, one push, and one exact-HEAD CI check.

## Batch 49 handoff (2026-08-04)

- The legacy reconnect-completed projection belongs to `OnlineReconnectState.createCompletionController()`. Keep Socket event authority, timers, side effects, and transition ordering in `online.js` until a separately guarded authority cutover.
- Active effect lookup belongs to `GameTurnPolicy.hasActiveCardEffect()`. Preserve the exact post-Airport lookup point and lazy dormancy callback; `GameManager` still owns all `nextTurn()` mutation and logs.
- Expert choice score composition belongs to `CPUEvaluation.expertChoiceScore()`. Preserve winner short-circuiting, optional lookahead admission, and the `min(0.35, lookaheadWeight * 0.5)` coefficient; require fixed-decision and 2–10-player self-play parity for changes.
- Scoped gates remain 214 ESLint maintenance files and 213 checkJs runtime files. Whole-file exclusions remain `appShell.js`, `main.js`, `online.js`, `storage.js`, and `ui.js`.
- Continue with at most three rollbackable themes, focused checks per theme, then one `test:batch`, one push, and one exact-HEAD CI check.

## Batch 50 handoff (2026-08-04)

- Reconnect attempt count and exhaustion belong exclusively to `OnlineRetryPolicy.createRejoinAttemptController()`. Do not reintroduce parallel booleans/counters; keep timeout, callback, Socket emit, status, and scheduling authority in `online.js`.
- Loan repayment admission and amount belong to `GameCardActivationPolicy.loanRepaymentPlan()`. Preserve lazy loan-card counting outside dice 5/6, active/dormant filtering in `GameManager`, the coin cap, and exact log text.
- Multiplayer threat-ratio bonuses belong to `CPUEvaluation.crowdLeaderBonus()` and `crowdCleaningBonus()`. Preserve current-player exclusion, max-threat first pass, second-pass threat/card reads, and all weights; require fixed-decision and 2–10-player self-play parity for changes.
- Scoped gates remain 214 ESLint maintenance files and 213 checkJs runtime files. Whole-file exclusions remain `appShell.js`, `main.js`, `online.js`, `storage.js`, and `ui.js`.
- Continue with at most three rollbackable themes, focused checks per theme, then one `test:batch`, one push, and one exact-HEAD CI check.

## Batch 51 handoff (2026-08-04)

- Restore generation, in-progress, quarantine, and flushing state belong exclusively to `OnlineRestoreLifecycleState.createController()`. Do not reintroduce parallel variables; preserve queue, Socket callback, replay, and abort effect ordering in `online.js`.
- Strong choice score composition belongs to `CPUEvaluation.strongChoiceScore()`. Preserve the exact coefficients and keep feature acquisition/profiling order in `CPU.js`; require fixed-decision and 2–10-player self-play parity for changes.
- Pending-modal update reentrancy belongs to `UiPendingEffects.createUpdateController()`. Preserve the pre-controller blocking-modal denial path and the HTML-before-interaction DOM effect order in `ui.js`.
- Scoped gates remain 214 ESLint maintenance files and 213 checkJs runtime files. Whole-file exclusions remain `appShell.js`, `main.js`, `online.js`, `storage.js`, and `ui.js`.
- Continue with at most three rollbackable themes, focused checks per theme, then one `test:batch`, one push, and one exact-HEAD CI check.

## Batch 52 handoff (2026-08-04)

- Online action-flight state and start time belong exclusively to `OnlineRetryPolicy.createActionFlightController()`. Keep ACK matching, timeout/retry scheduling, Socket effects, and public compatibility projection in their current adapters; do not reintroduce writable parallel state.
- Purchase-plan score selection belongs to `CPUEvaluation.purchasePlanValue()`. Preserve card-before-landmark comparison, the exact urgency/surplus coefficients, candidate/ranking/cache order, and require fixed-decision plus 2–10-player self-play parity for changes.
- Active modal ID, last focus, and inert restoration entries belong to `UiModalPolicy.createRuntimeController()`. Preserve open/close effect order and keep policy decisions plus DOM/focus/inert effects in `ui.js`.
- Do not move the main CPU scheduler token piecemeal: invalidation currently crosses `main.js`, `online.js`, `storage.js`, and `appShell.js`. A future migration needs explicit effect-order contracts across all four runtimes.
- Scoped gates remain 214 ESLint maintenance files and 213 checkJs runtime files. Whole-file exclusions remain `appShell.js`, `main.js`, `online.js`, `storage.js`, and `ui.js`.
- Continue with at most three rollbackable themes, focused checks per theme, then one `test:batch`, one push, and one exact-HEAD CI check.

## Batch 53 handoff (2026-08-04)

- Local-game start pending state belongs exclusively to `LocalGameStart.createPendingController()`. Preserve duplicate admission and clear pending before readiness rendering plus success/error effects.
- Auto-skip pending and timer ownership belongs to `AutoSkipPolicy.createScheduleController()`. Preserve the 1500 ms delay, availability traversal, callback-time human/phase/build revalidation, and clear state before dispatch.
- Delayed roll/select pending, token, action snapshot, and timer ownership belongs to `DelayedHumanActionPolicy.createScheduleController()`. Preserve stale-token rejection, immutable renewed snapshots, original deadline on page resume, default 600 ms delay, and random dice generation only inside the accepted callback.
- The main CPU scheduler token still crosses `main.js`, `online.js`, `storage.js`, and `appShell.js`; do not migrate one writer in isolation.
- Scoped gates remain 214 ESLint maintenance files and 213 checkJs runtime files. Whole-file exclusions remain `appShell.js`, `main.js`, `online.js`, `storage.js`, and `ui.js`.
- Continue with at most three rollbackable themes, focused checks per theme, then one `test:batch`, one push, and one exact-HEAD CI check.

## Batch 54 handoff (2026-08-04)

- Local-resume pending belongs exclusively to `LocalResumePreloadState`; read it from a controller snapshot and keep generation-gated Promise completion. Do not reintroduce a `storage.js` projection boolean.
- Static/delegated handler binding belongs to `UiEventDelegation.createBindingController()`. Mark a binding only after all existing listener registration effects for that group complete.
- Online create/join pending belongs exclusively to `OnlineLobbyRequestState`. Keep `onlineCreateRoomPending` and `onlineJoinRoomPending` as read-only browser compatibility getters because the inline PWA update flow reads them.
- Preserve the 15-second lobby timeout, generation checks, timer cancellation, readiness rendering, and create/join Socket payloads.
- Scoped gates remain 214 ESLint maintenance files and 213 checkJs runtime files. Whole-file exclusions remain `appShell.js`, `main.js`, `online.js`, `storage.js`, and `ui.js`.
- Continue with at most three rollbackable themes, focused checks per theme, then one `test:batch`, one push, and one exact-HEAD CI check.

## Batch 55 handoff (2026-08-04)

- Stadium, Publisher, Tax Office, and IT Startup collection request arrays belong to `GameCardActivationPolicy`. Preserve player order, current-player zeroing, Publisher active-card filtering, Tax Office threshold/flooring, and frozen outputs.
- Strongest-CPU TV target score belongs to `CPUEvaluation.v2SimpleTvTargetScore()`. Preserve the `2.2`/`2.5` base coefficients, both landmark-denial branches, target order, and first-max tie behavior; require fixed-decision and 2–10-player self-play parity for changes.
- Socket.IO-unavailable diagnostic admission belongs to `OnlineSocketRegistry.createUnavailableReportController()`. Keep user notice/status effects on every failed initialization and checkpoint/client-error effects only on the first claim.
- Scoped gates remain 214 ESLint maintenance files and 213 checkJs runtime files. Whole-file exclusions remain `appShell.js`, `main.js`, `online.js`, `storage.js`, and `ui.js`.
- Continue with at most three rollbackable themes, focused checks per theme, then one `test:batch`, one push, and one exact-HEAD CI check.

## Batch 56 handoff (2026-08-04)

- The 37 online plan/effect/shadow diagnostic selections belong to `OnlineDiagnosticState.createController()`. Keep its projection private to `online.js`; preserve every public getter, assignment point, authority flag, fallback, and Socket effect order.
- Card-selection modal handler admission belongs to `UiCardSelect.createBindingController()`. Preserve the existing behavior that the one-time claim occurs before DOM lookup.
- Red/blue/green/purple candidate admission belongs to `GameCardActivationPolicy.isActivationCandidate()`. Preserve short-circuit order: revived identity, dormancy, color, then dice; keep all traversal, mutation, effects, and logs in `GameManager`.
- Scoped gates are now 215 ESLint maintenance files and 214 checkJs runtime files. Whole-file exclusions remain `appShell.js`, `main.js`, `online.js`, `storage.js`, and `ui.js`.
- Continue with at most three rollbackable themes, focused checks per theme, then one `test:batch`, one push, and one exact-HEAD CI check.

## Batch 57 handoff (2026-08-04)

- Rejoin timer handle/deadline belong exclusively to `OnlineRetryPolicy.createRejoinTimerController()`. Do not reintroduce parallel legacy variables; preserve source labels, callback decision gates, hostless fallback, Socket emit order, and all default-OFF authority flags.
- Page-activation binding and hidden timestamp belong to `PageActivationPolicy.createLifecycleController()`. Preserve claim-before-listener behavior and the existing RL load → delayed action → online reconnect → CPU resume → checkpoint sequence.
- The last local Engine shadow result belongs to `GameEngineClientShadow.createOutcomeController()`. Preserve determinism admission, mutable-first execution, parity report, optional default-OFF adoption, render, and CPU scheduling order.
- Scoped gates remain 215 ESLint maintenance files and 214 checkJs runtime files. Whole-file exclusions remain `appShell.js`, `main.js`, `online.js`, `storage.js`, and `ui.js`.
- Continue with at most three rollbackable themes, focused checks per theme, then one `test:batch`, one push, and one exact-HEAD CI check.

## Batch 58 handoff (2026-08-04)

- Restore-event queue mutation belongs exclusively to `OnlineRestoreQueueState.createStore()`. Keep all access inside the three `online.js` adapters, preserve the transition/effect flags and diagnostic labels, and do not reintroduce a raw mirror or dual writes.
- Expert/strong build-candidate assembly belongs to `CPULegalMoves`. Preserve affordability and ranking before the helper call, skip/landmark/card order, candidate cap counting (including landmark entries), early multiplayer filters, and the empty-result first-card fallback; require fixed CPU decisions for changes.
- Card/landmark selection and the main CPU scheduler still cross multiple browser scripts. Do not move one ambient writer in isolation; first define a compatibility projection and effect-order contract spanning every writer.
- Scoped gates remain 215 ESLint maintenance files and 214 checkJs runtime files. Whole-file exclusions remain `appShell.js`, `main.js`, `online.js`, `storage.js`, and `ui.js`.
- Continue with at most three rollbackable themes, focused checks per theme, then one `test:batch`, one push, and one exact-HEAD CI check.

## Batch 59 handoff (2026-08-04)

- CPU scheduling token, pending token, and lease deadline belong exclusively to `CpuSchedulerState.createController()`. Preserve the distinction between invalidate (token only) and cancel (token plus pending/lease clear), and keep timeout/CPU effects in `main.js`.
- Turn-state, turn-announcer timer, and build-filter controllers are eager, side-effect-free UI state owners. Do not reintroduce nullable controller projections or lazy getters.
- Replace complete card/landmark selections only through `replaceEnabledCardSelection()` and `replaceEnabledLandmarkSelection()`. The compatibility `Set` values and card-select controller must change together for local start, online start/rejoin, restore, and modal flows.
- The next selection-state step is a neutral runtime owner for reads and projections; do not remove compatibility globals or alter `index.html` script order piecemeal.
- Scoped gates remain 215 ESLint maintenance files and 214 checkJs runtime files. Whole-file exclusions remain `appShell.js`, `main.js`, `online.js`, `storage.js`, and `ui.js`.
- Continue with at most three rollbackable themes, focused checks per theme, then one `test:batch`, one push, and one exact-HEAD CI check.

## Batch 60 handoff (2026-08-04)

- Enabled card/landmark selection belongs exclusively to `GameSelectionState.runtime`. Use detached `snapshot()`, `cards()`, or `landmarks()` reads and the existing replacement functions; do not recreate ambient mutable `enabledCards` / `enabledLandmarks` globals.
- `UiCardSelect.createSelectionController()` is a modal-edit draft, not persistent authority. Synchronize it from `GameSelectionState.runtime` when rendering and apply its snapshot through the neutral replacement boundary.
- Landmark-saving admission belongs to `CPUEvaluation.shouldHoldForLandmark()`. Preserve enabled/built/cost/shortfall/urgency read order, urgency-first then shortfall tie selection, `urgency >= 6`, and the exact `1.2` threshold; require fixed-decision and CPU parity checks for changes.
- Reroll reset belongs to `GameDicePolicy.rerollResetState()`. Keep RNG, mutable effects, and old/new dice log composition in `GameManager` after the reset plan is applied.
- Scoped gates are 216 ESLint maintenance files and 215 checkJs runtime files. Whole-file exclusions remain `appShell.js`, `main.js`, `online.js`, `storage.js`, and `ui.js`.
- Continue with at most three rollbackable themes, focused checks per theme, then one `test:batch`, one push, and one exact-HEAD CI check.

## Batch 61 handoff (2026-08-04)

- Online session fields belong exclusively to `OnlineRuntimeState.runtime`. Do not add `let socket`, `let isOnlineGame`, host/player/room/token fields, or replay/reconnect flags back to `online.js`; compatibility names are controller-backed projections for cross-script migration.
- Online room-creation count/settings/speed belong to `OnlineSetupState`. Use controller snapshots for render, RL readiness, preload, and create payloads; do not recreate parallel setup variables.
- Local/shared player count/settings/CPU speed belong to `GameSetupState.runtime`. Preserve the compatibility array's in-place update behavior until main, storage, online, and app-shell consumers all use named transitions.
- A future transition should add named session operations (join, activate, rejoin, leave/reset) and then remove compatibility setters. Do not collapse these effects before Socket callback and storage ordering contracts exist.
- Scoped gates are 219 ESLint maintenance files and 218 checkJs runtime files. Whole-file exclusions remain `appShell.js`, `main.js`, `online.js`, `storage.js`, and `ui.js`.
- Continue with at most three rollbackable themes, focused checks per theme, then one `test:batch`, one push, and one exact-HEAD CI check.

## Batch 62 handoff (2026-08-04)

- Use `OnlineRuntimeState.runtime` named transitions for all production session writes. Do not reintroduce direct assignments in `online.js`; room acceptance and stored-session restoration have distinct operations because their field sets and ordering differ. Compatibility setters are temporary projections, not a second owner.
- Live `game`, `cpuPlayers`, `prevCoins`, and `undoState` references belong to `GameRuntimeState.runtime`. Its frozen snapshot only freezes the envelope: it deliberately preserves live object and array identity. Do not treat it as a serializable Game Engine snapshot or canonical authority.
- Tutorial enabled/level state belongs to `UiTutorialSettings.runtime`. Preserve the `tutorialEnabled` / `tutorialLevel` storage keys and exact state → persistence → control sync → tutorial render sequence.
- A future batch may migrate remaining live-game assignments to named operations and make compatibility projections read-only only after main, online, storage, UI, app-shell, isolated runtimes, and inline PWA consumers are contract-covered.
- Scoped gates are 220 ESLint maintenance files and 219 checkJs runtime files. Whole-file exclusions remain `appShell.js`, `main.js`, `online.js`, `storage.js`, and `ui.js`.
- Continue with at most three rollbackable themes, focused checks per theme, then one `test:batch`, one push, and one exact-HEAD CI check.

## Batch 63 handoff (2026-08-04)

- Production live-game writes must use `GameRuntimeState.runtime` named operations. Preserve the exact assignment/effect position, especially Engine shadow adoption (`game` → shop stock → `undoState`), restore hydration, Undo capture/clear, and render coin baselines.
- `GameTurnPolicy.planNextTurnAirport()` is the Airport transition authority for award and `coinDelta`. Keep `GameManager.nextTurn()` staged as admission → current player/Airport application and log → active IT lookup/continuation; do not pre-read IT cards before the Airport effect.
- Winner streak state belongs to `UiWinner.streakRuntime`. Record only on first winner presentation, then persist `winStreak` before `lastWinnerName`; repeated renders must reuse the snapshot without incrementing.
- Compatibility setters for live game and winner streak are temporary classic-script/test projections. Remove or make them read-only only after every cross-script consumer and inline PWA path is migrated and contract-covered.
- Scoped gates remain 220 ESLint maintenance files and 219 checkJs runtime files. Continue with at most three independent themes and one batch-level integration gate/push/CI.

## Batch 64 handoff (2026-08-04)

- Update shared local player count/settings/CPU speed only through `GameSetupState.runtime` named operations. Preserve full-array copy behavior, individual entry/name update positions, and the existing DOM/save/RL preload order.
- In a real browser, `GameRuntimeState` and `OnlineRuntimeState` compatibility globals are read-only projections. Do not reintroduce setters or generic public `write()` methods; use the domain-named operations. The writable binding default exists only for isolated Node/VM fixture compatibility.
- `GameSetupState.playerSettings` still exposes a live compatibility array for existing readers. Do not make that projection read-only or detached until main/storage/online/UI consumers and editing semantics are contract-covered.
- Winner streak compatibility projections remain a separate audit; do not combine their removal with winner DOM or persistence changes.
- Scoped gates remain 220 ESLint maintenance files and 219 checkJs runtime files. Continue with at most three independent themes and one batch-level integration gate/push/CI.

## Batch 65 handoff (2026-08-04)

- Winner streak compatibility globals are read-only in an actual browser. Update winner state only through `UiWinner.streakRuntime.replace()` or `recordWinner()`; writable bindings exist only for isolated Node/VM fixture compatibility.
- Distributed RL model definitions belong to `RLModelCatalog`. Keep `RLModelPortfolio` and server admission derived from that catalog, preserve the catalog-before-portfolio script order, and include the catalog in the Service Worker asset contract.
- Strong-landmark board feature assembly belongs to `CPUEvaluation.strongLandmarkUrgencyFeatures()`. Preserve card traversal, stable-income evaluation timing, tuna-boat count calls, coefficients, branch order, and all RNG points; require fixed-decision and 2–10-player self-play parity for changes.
- Scoped gates are 221 ESLint maintenance files and 220 checkJs runtime files. Continue with at most three independent themes and one batch-level integration gate/push/CI.

## Batch 66 handoff (2026-08-04)

- Actual-browser setup and tutorial compatibility properties are getter-only. Update them through `GameSetupState.runtime` and `UiTutorialSettings.runtime` named operations. The setup settings-array getter is intentionally live for current editing compatibility; do not introduce new direct production mutation.
- App-shell DOM observation belongs to `UiDomSnapshot.createRuntime()`. Keep its document/style/text dependencies injected, preserve action-HTML fallback matching and exception fallbacks, and leave all recovery mutations, focus/inert effects, classification, and reporting in their existing owners.
- Strong landmark threshold feature assembly belongs to `CPUEvaluation.strongLandmarkThresholdFeatures()`. Preserve opponent order, two card scans per opponent, dormancy calls, built/count/remaining read order, penalty coefficients, and every RNG point; require fixed decisions and 2–10-player self-play parity for changes.
- Scoped gates are 222 ESLint maintenance files and 221 checkJs runtime files. Continue with at most three independent themes and one batch-level integration gate/push/CI.


## Batch 67 handoff (2026-08-04)

- `GameSetupState` player-setting projections are no longer live. Treat `read('playerSettings')` and `snapshot().playerSettings` as frozen detached values; update state only with `setPlayerSettings()`, `setPlayerSetting()`, `setPlayerName()`, or `replace()`.
- App-shell DOM observation belongs to `UiDomSnapshot`; lock/display/pointer/body-class mutations belong to `UiRecoveryEffects`. Keep watchdog recovery decisions, modal/focus coordination, checkpoints, and call ordering in `appShell.js` until a separately contract-covered orchestration boundary exists.
- Expert-v2 Cleaning feature traversal belongs to `CPUEvaluation.expertV2SimpleCleaningFeatures()`, and its numeric formula belongs to `expertV2SimpleCleaningScore()`. Preserve player/card order, name-before-dormancy short-circuiting, the `0.2` floor, the self `1.2` multiplier, tie behavior, and every RNG point.
- Scoped gates are 223 ESLint maintenance files and 222 checkJs runtime files. Whole-file exclusions remain `appShell.js`, `main.js`, `online.js`, `storage.js`, and `ui.js`.
- Continue with at most three independent themes, focused checks per theme, then one `test:batch`, one push, and one exact-HEAD CI check.


## Batch 68 handoff (2026-08-04)

- Production setup consumers read `GameSetupState.runtime.snapshot()`; do not reintroduce bare `selectedCount`, `playerSettings`, or `cpuSpeed` reads. Compatibility properties remain getter-only browser projections and are not a second state owner.
- Production tutorial consumers read `UiTutorialSettings.runtime.snapshot()` and mutate through named operations. Preserve the existing `tutorialEnabled` / `tutorialLevel` keys and state → persistence → controls → render sequence.
- Strong dice-tempo board features belong to `CPUEvaluation.strongTempoValueFeatures()`. Preserve wrapper admission order, card dice-array reads, player order, Station checks, coefficients, and every RNG point.
- Scoped gates are 223 ESLint maintenance files and 222 checkJs runtime files. Whole-file exclusions remain `appShell.js`, `main.js`, `online.js`, `storage.js`, and `ui.js`.
- Continue with at most three independent themes, focused checks per theme, then one `test:batch`, one push, and one exact-HEAD CI check.

## Batch 69 handoff (2026-08-05)

- `appShell.js` and `storage.js` read live game/CPU/Undo/session fields through `GameRuntimeState.runtime.snapshot()` and `OnlineRuntimeState.runtime.snapshot()`. Do not reintroduce ambient production reads; preserve one snapshot per admission/serialization/diagnostic operation where a consistent envelope matters.
- `GameRuntimeState` snapshots deliberately retain live object identity. They are not canonical Game Engine snapshots, save payloads, or immutable deep copies. Resume hydration must continue to install the game through the named operation before applying mutable hydration.
- Moving Company candidate traversal belongs to `CPUEvaluation.moverValueFeatures()` and its numeric formula to `moverValue()`. Preserve card-major/target-minor order, per-target owned/received/built/dormant callback order, all coefficients, max/zero behavior, and every RNG point.
- Scoped gates remain 223 ESLint maintenance files and 222 checkJs runtime files. Whole-file exclusions remain `appShell.js`, `main.js`, `online.js`, `storage.js`, and `ui.js`.
- Continue with at most three independent themes, focused checks per theme, then one `test:batch`, one push, and one exact-HEAD CI check.

## Batch 70 handoff (2026-08-05)

- `ui.js` and `main.js` must read shared game/online state through the runtime snapshot controllers. Do not reintroduce bare compatibility-global reads.
- Use one snapshot for a synchronous admission/decision; take a fresh snapshot inside delayed CPU or dice callbacks where host, connection, replay, or turn identity may have changed.
- Runtime snapshots are live-reference envelopes, not save/canonical-state formats. Keep DOM effects in UI owners and preserve Socket.IO, reconnect, CPU, save, and PWA contracts.
- Continue with macro batches: a small number of substantive themes, focused tests per theme, then one batch integration gate, push, and exact-HEAD CI check.

## Batch 71 handoff (2026-08-05)

- All production side-effect clients (`appShell.js`, `storage.js`, `ui.js`, `online.js`, and `main.js`) read game/CPU/Undo state through `GameRuntimeState.runtime.snapshot()`. Do not reintroduce ambient `game`, `cpuPlayers`, or `undoState` reads.
- Use one envelope for a synchronous admission/serialization/decision. Refresh inside delayed callbacks and Socket-driven effects where the installed game, turn, CPU ownership, or Undo state may have changed.
- The envelope intentionally retains live object identity. Canonical Engine snapshots and persisted snapshots remain the responsibility of `GameSnapshot` and schema adapters.
- Continue with macro batches; the next high-impact client boundary is `online.js` internal session-state reads, followed by staged type-check expansion after ambient dependencies are removed.

## Batch 72 handoff (2026-08-05)

- `online.js` must read shared Socket/session/identity/reconnect state through `onlineSessionSnapshot()` and write through `OnlineRuntimeState.runtime` named transitions. Do not reintroduce bare compatibility-global reads.
- Capture one session envelope for synchronous plans and payload construction. Refresh it inside timeout, Socket, confirmation, replay, and resend callbacks because connection, host, room, or identity may have changed.
- Socket.IO names/payloads, ACK/retry timing, storage keys/shapes, restore order, feature flags, and legacy fallbacks were not changed.
- ESLint/checkJs inclusion for `online.js` remains deferred until its remaining classic-script dependencies are injected or grouped; a direct ESLint audit currently reports 373 undefined dependency names, and these must not be silenced with a bulk globals list.

## Batch 73 handoff (2026-08-05)

- Route online render/scheduler/notice/resume/UI-lock/lifecycle effects through `onlineClientEffects`; do not add direct calls back to `render`, `scheduleCPU`, `invalidateCpuScheduleChain`, `showNotice`, `updateResumeButton`, `resetUiLocksForGameReset`, or `notifyGameLifecycleStart` in `online.js`.
- Lifecycle session/dedupe/payload/storage orchestration belongs to `LifecycleRuntime`. Keep `appShell.js` as dependency wiring plus the existing public wrappers, and preserve both lifecycle opt-out keys and the start-marker format.
- `OnlineClientEffects` deliberately resolves functions lazily because `online.js` loads before UI/main in the classic-script order. Do not eagerly capture those functions or reorder UI/main ahead of online.
- Scoped gates cover 225 ESLint files and 224 checkJs runtimes. The five large side-effect files remain excluded as whole files; continue reducing real dependencies before expanding their lint/type scope.
- Continue in macro batches with a few substantive boundaries, targeted tests per theme, then one `npm run test:batch`, one push, and one exact-HEAD CI check.

## Batch 74 handoff (2026-08-05)

- Keep watchdog recovery decisions, effect ordering, render retries, checkpoints, CPU scheduling, and online resync in `appShell.js`; add reusable DOM unlock/query/insertion mechanics to `UiRecoveryEffects` instead of duplicating attribute/style mutations.
- `online.js` must not call `document.getElementById`. Route status, lobby button, input, settings HTML, and title/game-screen operations through `onlineDomEffects`; extend its frozen ID registry and direct tests when a new online element is needed.
- `OnlineDomEffects` is a DOM adapter only. Do not move Socket callbacks, reconnect state, restore authority, storage, protocol payloads, or lobby request state into it.
- Scoped gates cover 226 ESLint files and 225 checkJs runtimes. The five orchestration files remain whole-file exclusions; continue removing real dependencies rather than declaring broad ambient globals.
- Continue with macro batches: a few substantive boundaries, focused checks, then one `npm run test:batch`, one push, and one exact-HEAD CI check.

## Batch 75 handoff (2026-08-05)

- `online.js` must send outbound Socket.IO events through `onlineSocketEffects`; do not add direct `.emit()` calls. Add fixed application events to its frozen registry and keep hostless event names injected from `OnlinePayload`.
- `appShell.js` must invoke render/build/resume/settings/preload/skyline/scheduler/online-timeout effects through `appShellRuntimeEffects`. Resolution must remain lazy because `main.js` loads after the shell.
- Keep policy and ordering in the orchestrators: the adapters invoke effects but do not decide reconnect authority, watchdog classification, recovery eligibility, CPU strategy, or PWA flow.
- Scoped gates cover 228 ESLint files and 227 checkJs runtimes. Continue macro batches and reduce real dependencies before attempting whole-file activation of the five orchestration files.
