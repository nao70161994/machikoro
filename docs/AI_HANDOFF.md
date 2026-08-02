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

- app shell/storage: `js/clientCheckpoint.js`、`js/clientReporting.js`、`js/clientReportingTransport.js`、`js/lifecycleNotify.js`、`js/lifecycleTransport.js`、`js/uiWatchdog.js` にsnapshot失敗fallback・80件のmemory trace・5,000文字の永続化を持つ診断checkpoint記録、URL query/hash除去・runtime context・report整形、注入fetchによるclient-error POST/checkpoint transport、lifecycle payload/start/dedupe・通知設定state・runtime人数/CPU数/mode/version・session/start/finish/reset immutable state遷移・完了通知metadata・勝者CPU難易度投影と注入clock/RNGからのsession ID生成、注入fetchによるlifecycle POST/checkpoint transport、freeze分類、trace/root-cause整形、element可用性/lock理由、主要/pending/phase復旧可否、stale modal判定、保存用診断圧縮を分離。`js/clientStorage.js`を唯一の直接`localStorage` ownerとし、app shell/main/online/onlineStorage/storage/ui/statsはfacade経由へ移行済み。`js/appShellStorage.js`は既存契約の互換wrapper、`js/pwaShell.js`はinstall prompt/banner controllerを所有する。既存key/value/JSON形式、DOM snapshot/recovery、fetch、timer、SW更新副作用は不変。
- CPU: 既存pure helperに加えて`js/cpuActionProposal.js`へ全Action Contract variantのcanonical・detached・deep-frozen proposal生成、`js/cpuBuildExecution.js`へlocal/online建設実行、`js/cpuSimulation.js`へ2〜10人lookahead在庫生成、`js/cpuEvaluation.js`へ勝利距離・相手脅威度・盤面score合成・ランドマーク不足額・TVランドマーク妨害・expertロール収入上限/超過ペナルティ・strong条件付き赤カード/ランドマーク圧力・出目テンポ/ランドマーク相乗・strong紫カード補正/購入準備・ランドマーク優先度・多人数購入補正・多人数妨害の希釈/解禁・出版社・ITベンチャー・条件付き赤・貸金業・カード依存のpure価値計算、`js/cpuBusinessMoves.js`へ交換候補列挙・安定rank・スコア合成・random/simple選択を分離。localのrule-based CPU actionはbuildを含めて共有mutable Game Engineへ適用し、online buildは既存authority/send経路を維持する。`CPU.chooseBuildAction()`は盤面/在庫を変えずproposalだけを返し、executorが一度だけ適用する。9 fixture×全difficultyの36 decision snapshotと、2〜10人×全difficultyの36完走self-playでheuristic値、difficulty、乱数消費、行動選択は未変更。
- server: `server/reportingPolicy.js`がtrust proxy、ntfy topic、rate key、debug endpoint許可/payload、lifecycle dedupe keyのpure policyを所有する。`server/reportThrottle.js`はclient-error/lifecycleごとのlimits・bucket・dedupe cache・dedupe keyを一つのadmission境界へ束縛する。`server/clientErrorReporting.js`は重複keyのfield集合・stack 600文字境界も注入hash越しに所有する。`server/clientErrorGateway.js`と`server/gameLifecycleGateway.js`がrequest判定順とHTTP statusを、`server/reportDelivery.js`が注入ntfy optionを所有し、HTTP route/catch wiringは`server.js`に維持。`server/lobbySocketHandlers.js`、`server/rejoinSocketHandler.js`、`server/actionSocketHandler.js`、`server/disconnectSocketHandler.js`へcreate/join/rejoin/action/disconnect familyを分離し、effect/emit順、hostless先行、古いsocket無視、host移譲を固定。`server/gameStartPayload.js`はschema gate、player順、version/token/capabilityを含む開始payload組立を所有し、room readinessとemit timingは`server.js`に維持する。`server/restoreGateway.js`はcanonical recordとclient bundleのsource選択、および既存roomのreplace/reject/rejoin判定だけを所有する。`server/restoredRoom.js`は検証済み入力からhost/sequence/hostless metadata、新規/置換/拒否、有効mirror結果、匿名化済み完了log/戻り値を入力非破壊で計画し、mutable room shellを決定的に組み立てる。既存roomのdetach→delete→installは既定OFFの`RESTORED_ROOM_ACTIVATION_EFFECT_AUTHORITY_ENABLED`で順序固定executorを選べ、inline legacyへ即時rollbackできる。続くpersist→Socket join→socket identity→`rejoinData`も別の既定OFF `RESTORED_ROOM_DELIVERY_EFFECT_AUTHORITY_ENABLED`とinline legacy fallbackで順序固定済み。validation/signing/sanitizeの呼出順、Socket effect、mirror/persistence順は`server.js`に維持。`server/hostlessRestoreDiagnostics.js`はroom IDを12桁hashへ変換し、coordinator診断を集計値だけへ限定する。`server/canonicalStateRepository.js`はrecord生成・save/load・schema/room検証・例外隔離を注入境界にし、store実装を`server.js`配線から分離する。`server/restoreAuditPayload.js`はsnapshot/actionの署名対象整形とcanonical action data適用だけをpureな注入境界として所有し、署名・keyring・検証順・authorityは`server.js`に維持する。`server/staticAssets.js`はBUILD_HASH環境値→Git短縮hash→時刻fallbackの解決、index/public-root response handler、公開asset注入を所有し、Express route登録順は`server.js`に維持する。`server/socketPayload.js`は通常/restore上限判定と、専用`appError` eventへ既存拒否文言を送る注入gatewayを所有する。canonical store capability、restore keyring、authority priorityのpure契約はあるが、既定storeはnoopでproduction authorityは未切替。
- server runtime loader: `server/gameRuntimeLoader.js`がCard → Player → Action Contract → GameManagerのVM source順とserver mirror公開symbolをfrozen契約として所有する。既存`loadGameRuntime` APIと起動配線は`server.js`に維持する。
- server reconnect identity: `server/reconnectIdentity.js`がtoken生成/hash/期待hash判定に加え、token一致後の既存・復元player activationを所有する。不一致時のroom非変更、legacy hash補完、socket ID更新は直接testで固定し、Socket callback順とprotocolは不変。
- server action acceptance: `server/actionAcceptance.js`がduplicate lookup、100件ACK cache/ref、restore rank fallback付きroom action採番と`gameStartPayload.actionSeq`同期を所有する。採番済みroomではfallbackを呼ばず、ACK/broadcast/compaction順は不変。
- server action validation gateway: `server/actionValidationGateway.js`がmirror取得→勝利済み拒否→actor authority→phase/action gate→server dice canonicalization→payload検証の順を所有する。早期拒否では乱数・payload検証を呼ばず、Undoはroom値をmirror値より優先する。event、payload、rule、authorityは不変。
- server restore audit runtime: `server/restoreAuditRuntime.js`が毎回のkeyring config読取、active secret/key ID、署名生成option、検証keyring/freshness optionを所有する。secretをcacheせず、署名・検証本体、authority、wireは既存ownerのまま。
- server compacted restore attachment: `server/restoreSnapshotAttachment.js`が圧縮前log上限超過、圧縮後残差log空、署名成功を確認してからaction entryへSnapshot/auditを同一参照で添付する。失敗時はentry非変更。圧縮・署名・Socket・authorityは不変。
- server game-start lifecycle: `server/gameStartLifecycle.js`がroom初期化→canonical mirror reset→時刻公開→永続化の順序を注入executorとして所有する。readiness、payload生成、Socket emit、logは`server.js`に維持する。
- server game-start coordinator: `server/gameStartCoordinator.js`がmissing/started/not-ready終了とpayload生成→room activation→`gameStart` emit→log順を所有する。event名とpayload identityは不変。
- server canonical mirror runtime: `server/canonicalMirrorRuntime.js`がmarker/hash同期、stale rebuild診断、build前Undo、Undo/turn後clear、accepted action採用を注入adapterとして所有する。Engine authority・wire・persistence policyは不変。
- server room socket policy: `server/roomLifecycle.js`が再接続後のcurrent socket本人性とhost接続有無をread-onlyに判定する。`server.js`は実Socket mapの配線だけを保持し、join/emit/host移譲順は不変。
- online: 復元room indexの最大actionSeq集約は`js/onlineStorage.js`の既定pure policyへ移し、注入overrideとkey/value形式を維持する。保存済み再接続sessionの必須field検証・空白除去・room ID正規化、rejoin pendingのreplay log/旧snapshot圧縮/accepted ID/未受理の根拠付き判定、署名なしsnapshot時のローカル完全action log保護、復元event queueの世代/snapshot-seq除外・元index保持planは`js/onlinePayload.js`へ統合済み。pending判定とaction log保存判定は各production未注入flagでlegacy完全一致時だけpure planを選ぶ。clear/resendはdefault-OFF executorとinline legacy fallbackを持ち、storage write effectは`online.js`に維持する。独立legacy planを既定とし、test-onlyの`MACHIKORO_ONLINE_RECONNECT_QUEUE_PLAN_AUTHORITY_ENABLED`はidentity/indexが完全一致する場合だけpure planを選び、不一致時はlegacyへ戻る。`js/onlineRestoreQueue.js`へ注入handlerの順次実行と失敗元index返却を分離し、別のtest-only queue-effect flagはpure plan採用時だけこのexecutorを選ぶ。例外伝播、失敗event以降の保持、legacy既定を固定済み。`js/onlineRestoreQueueState.js`はenqueue/上限判定・再join時の世代carry・flush開始時のdrain・適用失敗位置からのsuffix保持・disconnect/reset/gameStartのclearを入力非破壊のpure transitionとして所有し、production未注入flagかつinline legacy完全一致時だけ選択する。queueのraw read・replacement・legacy appendは`online.js`内の3つのowner helperに限定する。`OnlineRestoreQueueState.createStore()`は分離配列をshadow同期し、production未注入のstore-read flagはraw mirrorとの完全一致時だけread authorityを選ぶ。独立したstore-write flagはreplacement/appendをstore先行にし、完全一致時だけraw rollback mirrorへ反映する。各不一致・helper欠落時は同じ操作内でlegacy writeへ戻る。queue変数のproduction mirror/write owner・abort・handler実行・callbackは`online.js`に残し、`storage.js`は共通facade越しの永続化調停とUI effectを保持する。`js/onlineReconnectState.js`はreconnect/disconnect/restore/replay/activation/retry-exhausted/completed/reset eventを履歴化し、pure reducerとlegacy projection契約を所有する。`ONLINE_RECONNECT_EVENT_AUTHORITY_ENABLED=1`時だけ、履歴が完全一致する場合にUI/send/CPU/human input gateがevent stateを読む。別の`MACHIKORO_ONLINE_RECONNECT_EFFECT_AUTHORITY_ENABLED`はclean parity時だけ`isReconnectingOnline`互換booleanをevent stateから選び、timer flagはrejoin timer handle/deadline、callback flagはtimeoutのignore/rejoin/exhaust判断、request-plan flagは資格情報拒否/socket待機/8回上限/送信と次attempt countをpure/legacy完全一致時だけ選び、request-effect flagはpure plan採用時だけ`js/onlineReconnectRequest.js`のclear/count/emit/arm executorを選ぶ。`rejoinRoom`実送信は1関数へ集約済み。cleanup flagはterminal appError時のcleanup実行可否を選び、別のcleanup-effect flagはclean parity時だけ`js/onlineReconnectCleanup.js`の固定6-step executorを選ぶ。status-effect flagはsocket切断、restore開始、replay開始、restore完了、通常rejoin 8回上限の表示だけを段階的に選ぶ。restore lifecycleの表示はflag未注入時にDOM書込みを増やさない。各段階は不一致・不正履歴・未対応eventでlegacy ownerへ戻る。開始→切断→再join→復元・8回上限失敗と、status/parity fallbackを統合固定済み。effect/status/timer/callback/request-plan/request-effect/queue-plan/queue-effect/queue-state/cleanup-effect、およびgameAction/actionAccepted decode-effect flagはtest runtime専用でproduction HTMLへ注入しない。`js/onlineDecodeFailure.js`はactionAcceptedだけ先にACK flightを解除し、その後のreconnect/rejoin/retry順を共有する。clean reconnect shadowでない場合はinline legacyへ戻る。`js/onlineActionApplyFailure.js`はapply例外のreport/reconnect/CPU token/rejoin/retry順を共有し、restore queue flush中はrejoinをqueue ownerへ委ねる。authoritative pure apply planでない場合はinline legacyへ戻る。`js/onlineActionGap.js`はgap時のreconnect/CPU-token/受信側だけのstatus/rejoin/retry順を、`js/onlineActionNoGame.js`はincomingのstatus+rejoinとacceptedのstatus-only差を固定する。どちらもauthoritative pure decisionでない場合はinline legacyへ戻る。`js/onlineActionCommit.js`は成功時のsequence/log/acceptedだけのpending解除/render/CPU予約順を固定し、restore queue flush中はrender/CPU予約を省く。handler別のproduction未注入flagとauthoritative pure APPLY planが揃う場合だけexecutorを選び、それ以外はinline legacyへ戻る。`js/onlineSocketConnect.js`は待機表示解除/rejoin資格とcleanup→reconnect→rejoin順を、`js/onlineSocketDisconnect.js`はactive/restore中断判定とlobby解除→必要時restore隔離→reconnect/flight/CPU/event/status順を固定する。両者ともproduction未注入のplan/effect flag、legacy完全一致、clean shadow historyを要求し、それ以外はinline legacyへ戻る。`js/onlineHostChanged.js`はrestore queue通過後のhost所有判定とhost状態/log/render/CPU予約または無効化/persist順を固定し、別のproduction未注入plan/effect flagが揃う場合だけexecutorを選ぶ。`js/onlineRejoinPersistence.js`はreplay前のaction flight/pending/retry/settings/player index/host/restore bundle/session/CPU token/UI lock順をpure planとexecutorへ固定し、別のproduction未注入plan/effect flagとlegacy完全一致時だけ選択する。`js/onlinePendingResend.js`はrestore activation後のnone/clear/resend判定とstale pending消去またはACK flight設定→同一`gameAction` payload送信順を固定し、別のproduction未注入plan/effect flagとpending参照一致時だけ選択する。`js/onlineRestoreReplay.js`は入力参照を保持したままreplay mode開始→event/status→game初期化→Snapshot→残差Action→暫定log→必ずreplay mode解除の順を固定し、別のproduction未注入plan/effect flagと完全参照一致時だけ選択する。`js/onlineRestoreActivation.js`は復元済みsequence planと、reconnect完了解除→online有効化→互換flag解除→前回coin解除→適用seq公開→queue flush→activation event/statusの順を固定する。全handlerをeffect前に検証し、flush失敗時はactivation通知前に停止する。別のproduction未注入plan/effect flagと完全一致時だけexecutorを選び、inline legacyを既定/fallbackに維持する。`js/onlineRetryPolicy.js`は既存3秒/8回/15秒契約、timer controller、pure timeout decisionを所有。元host local bundle再提示は`js/onlineRestoreRank.js`のproduction未注入flagでlegacy完全一致時だけpure planを選び、recreate送信は既存ownerに維持する。production Socket emit authority、session read、hostless分岐、Restore queue変数・abort・flush authority、rejoin callback effect、ACK timing、socket切断・restore lifecycle・通常retry上限以外のstatus、storage、protocolは既存authorityで、production挙動は未変更。
- online runtime flags: `js/onlineRuntimeFlags.js`がschema/reconnect/engineの53 flag名とstrict boolean readを正本化する。`online.js`の既存reader名、schema negotiation前提、各legacy fallbackは維持し、production HTMLはauthority flagを引き続き注入しない。
- UI/app shell: `js/onlinePlayerSettings.js`へオンライン設定正規化、option HTML、RL model固定/readiness文言、create/join button viewを分離し、`online.js`はDOM、preload、timeout、Socket送信を保持する。`js/uiModalPolicy.js`がdeny-by-defaultのpure policy/stateを所有。`js/uiModalOpen.js`はmodal identity planとcapture focus→active owner→body class→visual→dialog属性→focus→inertの順序を所有する。`js/uiModalClose.js`はhide後のactive owner→inert復元→orphan lock解除→pending描画→focus復元→trace plan/effect順を所有する。各production未注入flag・legacy完全一致時だけexecutorを選び、inline legacyが既定/fallback。modal hide、activeAfterClose入力、focus trap、inert/pointer handlerは`ui.js`に維持する。`js/uiTabView.js`はlocal/online/stats、create/join、online/offline可用性のdisplay/class/ARIA/disabledとstats描画effect条件をpureに所有し、`ui.js`/`appShell.js`はDOM書込みを保持する。`js/uiGameStatusView.js`は手番文言、roll/skip状態、出目選択をpureに所有し、`ui.js`は手番通知timerとDOM effectを保持する。`js/uiWinner.js`、ログHTML/要約/開閉viewを持つ`js/uiLogDisplay.js`、案内HTMLと操作control viewを持つ`js/uiTutorial.js`、`js/uiDiceChoice.js`、`js/uiDiceDisplay.js`、`js/uiTurnAnnouncer.js`、player panel HTMLとコイン増減animation viewを持つ`js/uiPlayerDisplay.js`までexact HTML/view生成を分離し、`js/uiCardSelect.js`は必須カード/最低1ランドマークを守るinput-nonmutating reducerとsorted view modelを所有する。`js/localPlayerSettings.js`はlocal設定の正規化、CPU/RL表示、速度表示、snapshot、escape、設定HTML、RL readiness文言、pending優先の開始button viewを所有する。`js/autoSkipPolicy.js`は既存順の在庫・コイン・紫重複・有効ランドマーク条件から購入可否だけをpureに判定する。`js/pageActivationPolicy.js`はページ復帰時のCPU scheduler outcomeと非表示時間だけをpureに分類する。`js/delayedHumanActionPolicy.js`はページ復帰時の遅延操作をidle/cancel/run/rescheduleへpureに分類する。`js/uiEventDelegation.js`はdelegated eventの対象要素、dataset key、role buttonのEnter/Space起動判定を所有する。`js/citySkyline.js`はタイトル画面Canvas描画を所有し、viewport上限・描画命令・乱数注入契約を固定する。`main.js`はcanvas取得、サイコロ表示を含むDOM反映・preload・保存・game start、1.5秒timer・手番再検証・`nextTurn` effect、遅延操作のtoken/timer/callback/`Date.now()`、UI listener/action dispatch/DOM effect、およびvisibility/CPU再予約/checkpoint effectを保持する。`js/uiDiceDisplay.js`は出目HTMLとopacity viewだけを所有し、rolling中に既存opacityを変えない契約を固定する。`js/uiTurnAnnouncer.js`は人間/CPU文言と1300ms表示・400ms遷移policyを所有し、`ui.js`はDOMとtimer effectを維持する。DOM/focus/inert/pointer/event/SW更新effects、ログ履歴は既存ownerに残す。
- contracts/engine: `js/actionContract.js`が15 actionのmetadata正本、`js/gameSnapshot.js`がclient/server/local-save/Undoのserializeと共有hydrate mechanics、`js/gameEngine.js`が共有dispatchを所有する。client replay、server mirror、localの全rule-based CPU actionが共有dispatchへ委譲済み。online CPUは既存authority/send経路を維持する。全action・全Action/Snapshot v0/v1組合せparityに加え、roll生成multi-pending、休業カード交換、Harbor/IT拒否、空港の建設なし収入、空港→IT積立pending、遊園地ゾロ目継続、貸金業の休業復帰、ワイナリー休業、出版社・税務署・ITベンチャー・公園の多人数コイン移動を2/3/5/10人で固定。Snapshot roundtripは復元後のpending action authority、10人時のcurrent player、Undo保持、勝利後のaction閉鎖も意味契約として固定する。`GAME_SCHEMA_WIRE_ENABLED`はlive Action、`GAME_SCHEMA_SNAPSHOT_WIRE_ENABLED`はrejoin responseと圧縮action metadataだけを独立した既定OFF gateでv1化できる。`GAME_SCHEMA_RECREATE_WIRE_ENABLED`は`recreateRoom`の外枠とnegotiated Snapshot/action logを独立してv1化する。`js/gameSchemaRecreateWire.js`がseq/client/audit metadataを保持し、serverは署名・sanitize・authorityより前にlegacy形へ戻す。同じflag下でもunwrapped legacyは内部選択versionに関係なく無変換で受理し、unknown/malformed nested versionを副作用前に拒否する。`js/savedGameValidation.js`へ保存検証・旧CPU設定正規化・pending整合・旧card ID在庫解決を分離し、local `savedGame`とlocal Undo生成、local/server mirrorのUndo復元は共有serializer/hydrateへ委譲済み。`js/storageSettings.js`は保存済み人数・player設定・tutorial値のpure正規化を所有する。`savedGame`読取は共有Snapshot adapterでlegacy/v1 envelopeを受理し、unknown schemaをfail closedにする。`js/gameEngineAuthority.js`がclient/server共通のfail-closed authority選択を所有し、`server/gameEngineAuthority.js`は環境flag解釈だけを残す。serverは`GAME_ENGINE_TRANSITION_AUTHORITY_ENABLED=1`時でもtransition成功・shadow完全一致・snapshot再構築成功の全条件を満たす場合だけ内部canonical mirrorへpure結果を採用する。`js/gameEngineClientShadow.js`はonline replayのdetached transition比較と採用判定を所有し、production未注入のshadow/authority 2 flagが揃いparity一致・別runtime再構築成功時だけpure snapshotを採用する。`js/gameEngineRuntimeAdapter.js`はonline/local callerのhydrate・serialize・Undo互換adapterを共有し、`js/gameEngineDeterminism.js`は未確定乱数payloadをshadow対象外にする。local human action、CPU proposal、card/landmark build、Undoは独立したproduction未注入shadow/authority flagを持ち、完全一致と別runtime再構築成功時だけpure snapshotを採用する。全15 Action Contract entryについて、dice/Harbor、全pending resolver、build、Undo、turn transitionを実local adapterでlegacy最終snapshot一致に固定し、各失敗時は直前のmutable結果を維持する。production flag、ACK/broadcast/protocolは変えない。`js/localSaveRepository.js`は既存`savedGame`をrollback authorityとして維持し、独立した既定OFFの`LOCAL_SAVE_SCHEMA_WRITE_ENABLED=1`時だけ`savedGameV1`へ併記する。v1はlegacy存在時かつschema/内容検証成功時だけ採用し、破損・書込み失敗・旧版でのlegacy削除時はfallback/非復活になる。既定のlegacy JSON書込み形、Undoのログ全件保持、DOM更新順は不変。recreateのproduction flag、restore authority/timing、永続化shape、既定wireはlegacy/OFFのまま。
- tooling: scoped ESLint 10.7.0は151個のmaintenance fileをbug-detection rulesだけで検査する。TypeScript 5.9.3のno-emit checkJsを151個のbrowser/server runtime（`CPU.js`、`RLCPU.js`、`server.js`、`server/*.js`全件を含む）へ限定導入し、`npm run test:types`を`test:static`へ統合済み。allowlistと残る5つのside-effect client runtime除外はcontract testで固定し、style rules、`--fix`、全repository lint/checkJs、TypeScript移行は禁止。

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
- UI: `renderPending()` の表示可否、modal content 更新、pending 種別 HTML 生成を helper / `PENDING_MENU_RENDERERS` registry に分離した。pending 追加時は renderer registry と HTML assertion を一緒に更新する。
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

- UI: pure表示helperはwinner/log/tutorial/dice choice/full player panelまで実施済み。modal deny-by-default は実装済みで、既定OFFのmodal-openとpost-hide modal-close plan/effect境界も実装済み。次は具体的なUI変更に伴うexact-output helperだけを対象にし、両gateのproduction有効化やmodal hide/focus trap/inert handlerは実機matrixなしで移動しない。
- CPU: buildとlive pendingのaction-only strategy/executor境界、ランドマーク不足額・TV妨害価値・expertロール収入上限/超過ペナルティ・strong条件付き赤カード/ランドマーク圧力・出目テンポ/ランドマーク相乗・strong紫カード補正/購入準備・ランドマーク優先度・多人数購入補正・多人数妨害の希釈/解禁のpure evaluation境界は実装済み。pendingの旧resolution APIはsimulation互換のため残す。残る大きなscoring/candidate orchestrationは、具体的な安定境界がない限り機械的に分割しない。変更時はdecision/self-play baseline、候補順、乱数消費の完全一致を要求する。
- GameManager / Server / Online: action/payload変更時は既存cross-layer contractを先に拡張する。timer/callback/handler/state-machine移動、hostless authority、signed/durable restore、複数room UIはdesign/manual required。
- Docs / Tooling: script load order、storage key、release pseudo-E2E、CI dependency の drift detection は強化済み。新しい helper script を足す場合は `index.html`、`sw.js`、integration runtime、`tests/main.test.js` の script/asset drift test を同時に更新する。運用docsを触る場合は `docs/OPERATIONS.md` と `docs/NTFY_ERROR_REPORTING.md` の通知分類、Render環境変数、stale-client対応も同期する。

## 変更時の最低確認

```sh
npm run test:static
npm run test:smoke
npm test
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
