'use strict';

function buildTurnStatusText(current) {
    return `👤 ${current.name}のターン　🪙 ${current.coins}コイン`;
}

function buildRollButtonView(canRoll) {
    return Object.freeze({ disabled: !canRoll });
}

function buildSkipButtonView({ canNextTurn, pendingRenovation, builtThisTurn }) {
    return Object.freeze({
        disabled: !canNextTurn || pendingRenovation > 0,
        textContent: builtThisTurn ? '建設完了・ターン終了' : '建設しないでターン終了',
    });
}

function selectDiceValues({ lastDice1, lastDice2, lastDiceResult }) {
    if (lastDice1 > 0 && lastDice2 > 0) return Object.freeze([lastDice1, lastDice2]);
    if (lastDiceResult > 0) return Object.freeze([lastDiceResult]);
    return null;
}

function buildTurnTransitionView({
    phase,
    rollPhase,
    currentPlayerIndex,
    previousPlayerIndex,
    currentTurnCount,
    previousTurnCount,
    previousPhase,
    isReplaying,
    currentName,
    isCpuTurn,
}) {
    const isRollPhase = phase === rollPhase;
    const indexChanged = currentPlayerIndex !== previousPlayerIndex;
    const hasTurnCounts = Number.isInteger(currentTurnCount) &&
        Number.isInteger(previousTurnCount) && previousTurnCount >= 0;
    const turnCountChanged = hasTurnCounts && currentTurnCount !== previousTurnCount;
    const enteredRollPhase = isRollPhase && typeof previousPhase === 'string' &&
        previousPhase !== '' && previousPhase !== rollPhase;
    const changed = isRollPhase && (indexChanged || turnCountChanged || enteredRollPhase);
    return Object.freeze({
        announce: changed && previousPlayerIndex !== -1 && isReplaying !== true,
        name: currentName,
        isCpuTurn: isCpuTurn === true,
        playerIndex: currentPlayerIndex,
        nextPreviousPlayerIndex: changed ? currentPlayerIndex : previousPlayerIndex,
        nextPreviousTurnCount: isRollPhase && Number.isInteger(currentTurnCount)
            ? currentTurnCount
            : previousTurnCount,
        nextPreviousPhase: phase,
    });
}

function buildCoinChangeAnnouncement({
    coinChanges,
    players,
    cpuPlayerIndexes,
    isOnlineGame,
    myPlayerIndex,
    isReplaying,
}) {
    if (isReplaying === true) return '';
    const playerList = Array.isArray(players) ? players : [];
    const cpuIndexes = new Set(Array.isArray(cpuPlayerIndexes) ? cpuPlayerIndexes : []);
    return (Array.isArray(coinChanges) ? coinChanges : [])
        .filter(change => Number.isInteger(change.playerIndex) &&
            Number.isFinite(change.diff) && change.diff !== 0 &&
            !cpuIndexes.has(change.playerIndex) &&
            (isOnlineGame !== true || change.playerIndex === myPlayerIndex))
        .map(change => {
            const player = playerList[change.playerIndex];
            if (!player || typeof player.name !== 'string' || !player.name) return '';
            const sign = change.diff > 0 ? '+' : '';
            return `${player.name} ${sign}${change.diff}コイン`;
        })
        .filter(Boolean)
        .join('、');
}

function buildNextActionGuidance(facts = {}) {
    const phases = facts.phases || {};
    const labels = new Map([
        [phases.ROLL, 'サイコロを振ってください'],
        [phases.SELECT_DICE, '振るサイコロの個数を選んでください'],
        [phases.REROLL_CONFIRM, '振り直すか、そのまま進むか選んでください'],
        [phases.HARBOR_CHOICE, '港のボーナスを使うか選んでください'],
        [phases.PENDING, '追加効果の対象を選んでください'],
        [phases.BUILD, '施設を建設するか、ターンを終了してください'],
    ]);
    return labels.get(facts.phase) || '画面の操作を選んでください';
}

function buildConnectionQualityView(facts = {}, now = Date.now()) {
    if (!facts.isOnlineGame) return Object.freeze({ visible: false, kind: 'good', label: '' });
    if (facts.isReconnecting || facts.socketConnected === false) {
        return Object.freeze({ visible: true, kind: 'reconnecting', label: '通信：再接続中' });
    }
    if (facts.isReplaying) {
        return Object.freeze({ visible: true, kind: 'waiting', label: '通信：状態を同期中' });
    }
    if (facts.actionInFlight) {
        const startedAt = Number.isFinite(facts.actionStartedAt) && facts.actionStartedAt > 0
            ? Math.max(facts.actionStartedAt, Number.isFinite(facts.minimumObservedAt) ? facts.minimumObservedAt : 0)
            : 0;
        const elapsed = startedAt > 0
            ? Math.max(0, now - startedAt)
            : 0;
        return elapsed >= 5000
            ? Object.freeze({ visible: true, kind: 'delayed', label: '通信：遅延しています' })
            : Object.freeze({ visible: true, kind: 'waiting', label: '通信：応答待ち' });
    }
    return Object.freeze({ visible: true, kind: 'good', label: '通信：良好' });
}

function buildActivityStatusView(facts = {}) {
    if (!facts.hasGame || facts.hasWinner) {
        return Object.freeze({ visible: false, identity: 'hidden', kind: 'ready', label: '', detail: '', startedAt: 0 });
    }
    if (facts.isReconnecting) {
        return Object.freeze({ visible: true, identity: 'reconnecting', kind: 'waiting', label: 'オンライン再接続中', detail: '接続を回復しています', startedAt: 0 });
    }
    if (facts.isReplaying) {
        return Object.freeze({ visible: true, identity: 'replaying', kind: 'waiting', label: 'ゲーム状態を復元中', detail: '保存された進行を反映しています', startedAt: 0 });
    }
    if (facts.isOnlineGame && facts.socketConnected === false) {
        return Object.freeze({ visible: true, identity: 'socket-disconnected', kind: 'checking', label: '通信状態を確認中', detail: '自動再接続を待っています', startedAt: 0 });
    }
    if (facts.actionInFlight) {
        return Object.freeze({ visible: true, identity: 'online-action:' + (facts.actionStartedAt || 0), kind: 'waiting', label: 'サーバーの応答待ち', detail: '15秒で自動的に再同期します', startedAt: facts.actionStartedAt || 0 });
    }
    if (facts.isCpuTurn) {
        const activeStep = facts.cpuHealth && facts.cpuHealth.activeStep;
        return Object.freeze({
            visible: true,
            identity: 'cpu:' + facts.currentPlayerIndex + ':' +
                (activeStep && activeStep.stepExecutionId || facts.cpuHealth && facts.cpuHealth.token || ''),
            kind: 'waiting',
            label: `${facts.currentName || 'CPU'}が処理中`,
            detail: facts.cpuActionExplanation || '次の行動を検討しています',
            startedAt: activeStep && activeStep.startedAt || 0,
        });
    }
    const isOwnOnlineTurn = facts.isOnlineGame && facts.myPlayerIndex === facts.currentPlayerIndex;
    const isHumanTurn = !facts.isOnlineGame || isOwnOnlineTurn;
    const waitsForOwnPendingInput = facts.phase === facts.pendingPhase &&
        (isOwnOnlineTurn || !facts.isOnlineGame);
    const guidance = buildNextActionGuidance(facts);
    const actorName = facts.currentName || (facts.isOnlineGame ? '相手' : 'プレイヤー');
    const label = isHumanTurn
        ? `あなたの操作：${guidance}`
        : `${actorName}の操作待ち：${guidance}`;
    return Object.freeze({
        visible: true,
        identity: 'ready:' + facts.currentPlayerIndex + ':' + facts.phase,
        kind: 'ready',
        label,
        detail: waitsForOwnPendingInput ? '追加効果を解決するとゲームが進みます' : '',
        startedAt: 0,
    });
}

function createActivityStatusController(options = {}) {
    const checkingAfterMs = Number.isFinite(options.checkingAfterMs) ? Math.max(0, options.checkingAfterMs) : 10000;
    let identity = '';
    let observedAt = 0;
    let announcedLabel = '';
    let minimumObservedAt = 0;

    function transition(view = {}, now = Date.now()) {
        const safeNow = Number.isFinite(now) ? now : 0;
        if (view.identity !== identity) {
            identity = view.identity || '';
            observedAt = Number.isFinite(view.startedAt) && view.startedAt > 0
                ? Math.max(minimumObservedAt, Math.min(view.startedAt, safeNow))
                : safeNow;
        }
        const elapsedMs = view.visible && view.kind !== 'ready' ? Math.max(0, safeNow - observedAt) : 0;
        const checking = view.visible && view.kind === 'waiting' && elapsedMs >= checkingAfterMs;
        const label = checking ? `${view.label}（応答を確認中）` : view.label || '';
        const result = Object.freeze({
            visible: view.visible === true,
            kind: checking ? 'checking' : view.kind || 'ready',
            label,
            announceLabel: label !== announcedLabel ? label : '',
            detail: checking ? '停止を検知した場合は自動復旧します' : view.detail || '',
            elapsedText: elapsedMs > 0 ? `・${Math.floor(elapsedMs / 1000)}秒` : '',
        });
        announcedLabel = label;
        return result;
    }

    function reset() {
        identity = '';
        observedAt = 0;
        announcedLabel = '';
        minimumObservedAt = 0;
    }
    function resumeAt(now = Date.now()) {
        reset();
        minimumObservedAt = Number.isFinite(now) ? Math.max(0, now) : 0;
    }
    return Object.freeze({ transition, reset, resumeAt });
}

function createWatchdogActivityController(options = {}) {
    const minimumRecoveringMs = Number.isFinite(options.minimumRecoveringMs)
        ? Math.max(0, options.minimumRecoveringMs)
        : 750;
    const recoveredVisibleMs = Number.isFinite(options.recoveredVisibleMs)
        ? Math.max(0, options.recoveredVisibleMs)
        : 5000;
    const failedVisibleMs = Number.isFinite(options.failedVisibleMs)
        ? Math.max(0, options.failedVisibleMs)
        : 10000;
    let recoveringAt = 0;
    let pendingResult = null;
    let announcedStage = '';

    function observe(status = {}, now = Date.now()) {
        const safeNow = Number.isFinite(now) ? now : 0;
        if (status.stage === 'recovering') {
            recoveringAt = safeNow;
            pendingResult = null;
            return true;
        }
        if ((status.stage === 'recovered' || status.stage === 'failed') && recoveringAt > 0) {
            pendingResult = Object.freeze({
                stage: status.stage,
                availableAt: recoveringAt + minimumRecoveringMs,
                expiresAt: recoveringAt + minimumRecoveringMs +
                    (status.stage === 'recovered' ? recoveredVisibleMs : failedVisibleMs),
            });
            return true;
        }
        return false;
    }

    function project(baseActivity, now = Date.now()) {
        const safeNow = Number.isFinite(now) ? now : 0;
        if (!recoveringAt) return baseActivity;
        if (!pendingResult || safeNow < pendingResult.availableAt) {
            const announceLabel = announcedStage === 'recovering' ? '' : '停止を検知：自動復旧中';
            announcedStage = 'recovering';
            return Object.freeze({
                visible: true,
                kind: 'checking',
                label: '停止を検知：自動復旧中',
                announceLabel,
                detail: 'ゲーム状態を確認して操作を戻しています',
                elapsedText: '',
            });
        }
        if (safeNow >= pendingResult.expiresAt) {
            reset();
            return Object.freeze({ ...baseActivity, announceLabel: baseActivity.label || '' });
        }
        const failed = pendingResult.stage === 'failed';
        const stage = failed ? 'failed' : 'recovered';
        const label = failed ? '自動復旧できませんでした' : '自動復旧しました';
        const announceLabel = announcedStage === stage ? '' : label;
        announcedStage = stage;
        return Object.freeze({
            visible: true,
            kind: stage,
            label,
            announceLabel,
            detail: failed
                ? '画面を再読み込みするか、保存データから再開してください'
                : '操作を続けられます',
            elapsedText: '',
        });
    }

    function reset() {
        recoveringAt = 0;
        pendingResult = null;
        announcedStage = '';
    }
    return Object.freeze({ observe, project, reset });
}

function buildActiveGameView(facts) {
    const players = Array.isArray(facts.players) ? facts.players : [];
    const previousCoins = facts.previousCoins;
    const coinChanges = previousCoins
        ? players.map((player, playerIndex) => Object.freeze({
            playerIndex,
            diff: player.coins - previousCoins[playerIndex],
        })).filter(change => change.diff !== 0)
        : [];
    return Object.freeze({
        statusText: buildTurnStatusText(facts.current),
        rollButton: buildRollButtonView(facts.canRoll),
        skipButton: buildSkipButtonView({
            canNextTurn: facts.canNextTurn,
            pendingRenovation: facts.pendingRenovation,
            builtThisTurn: facts.builtThisTurn,
        }),
        diceValues: selectDiceValues(facts),
        turnTransition: buildTurnTransitionView(facts),
        coinChanges: Object.freeze(coinChanges),
        coinChangeAnnouncement: buildCoinChangeAnnouncement({
            coinChanges,
            players,
            cpuPlayerIndexes: facts.cpuPlayerIndexes,
            isOnlineGame: facts.isOnlineGame,
            myPlayerIndex: facts.myPlayerIndex,
            isReplaying: facts.isReplaying,
        }),
        nextCoins: Object.freeze(players.map(player => player.coins)),
    });
}

const UiGameStatusView = Object.freeze({
    buildTurnStatusText,
    buildRollButtonView,
    buildSkipButtonView,
    selectDiceValues,
    buildTurnTransitionView,
    buildCoinChangeAnnouncement,
    buildActivityStatusView,
    createActivityStatusController,
    createWatchdogActivityController,
    buildNextActionGuidance,
    buildConnectionQualityView,
    buildActiveGameView,
});
if (typeof module !== 'undefined' && module.exports) module.exports = UiGameStatusView;
if (typeof window !== 'undefined') window.UiGameStatusView = UiGameStatusView;
if (typeof globalThis !== 'undefined') globalThis.UiGameStatusView = UiGameStatusView;
