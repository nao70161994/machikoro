let game;
const SHOP_STOCK = {};
let selectedCount = 2;
let playerSettings = [];
let cpuPlayers = [];
let cpuSpeed = 1500;

// コインアニメーション用
let prevCoins = null;

// 連勝記録
let winStreak = parseInt(localStorage.getItem('winStreak') || '0');
let lastWinnerName = localStorage.getItem('lastWinnerName') || '';

// オートスキップ
let autoSkipPending = false;
let autoSkipTimeout = null;
let delayedHumanActionPending = false;
let delayedHumanActionTimeout = null;
let delayedHumanActionToken = 0;

// 取り消し
let undoState = null;
let tutorialEnabled = localStorage.getItem('tutorialEnabled') !== 'false';
let tutorialLevel = localStorage.getItem('tutorialLevel') || 'beginner';

// CPU進行チェーン制御
let cpuScheduleToken = 0;

function escapeAttribute(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function defaultLocalPlayerName(index) {
    return `プレイヤー${index + 1}`;
}

function normalizeLocalPlayerName(name, index) {
    const trimmed = String(name || '').trim();
    return trimmed || defaultLocalPlayerName(index);
}

function normalizeLocalPlayerSetting(setting, index, playerCount) {
    const current = setting || {};
    return {
        type: current.type === "cpu" ? "cpu" : "human",
        difficulty: current.difficulty || "normal",
        name: normalizeLocalPlayerName(current.name, index),
    };
}

function getLocalCpuLabel(difficulty) {
    if (difficulty === 'weak') return 'CPU（弱）';
    if (difficulty === 'normal') return 'CPU（普通）';
    if (difficulty === 'strong') return 'CPU（強）';
    if (difficulty === 'rl') return 'AI（深層学習）';
    return 'CPU（最強）';
}

function getRlCpuSettingNote(playerCount) {
    if (playerCount >= 3) {
        return 'AI（深層学習・ランダム）は多人数用の深層学習モデルから選び、5人以上では脅威度上位3人の相手を見て判断します。CPU（最強）は安定したルールベースの基準CPUです。';
    }
    return 'AI（深層学習・ランダム）は2人用の複数モデルからランダムに選びます。CPU（最強）は安定したルールベースの基準CPUです。';
}

function createCpuPlayer(difficulty, options = {}) {
    const resolvedOptions = Object.assign({}, options);
    const resolvedDifficulty = difficulty;
    const applyLiveExpertDefaults = () => {
        if (!resolvedOptions.expertPreset) {
            resolvedOptions.expertPreset = "v2simple";
        }
        if (resolvedOptions.expertPreset === "v2simple") {
            if (!resolvedOptions.expertDiceMode) resolvedOptions.expertDiceMode = "strongCrowdThreshold";
            if (!resolvedOptions.expertRerollMode) resolvedOptions.expertRerollMode = "simple";
            if (!resolvedOptions.expertBuildMode) resolvedOptions.expertBuildMode = "ev";
            if (!resolvedOptions.expertInvestMode) resolvedOptions.expertInvestMode = "always";
            if (!resolvedOptions.expertTvMode) resolvedOptions.expertTvMode = "simple";
            if (!resolvedOptions.expertBusinessMode) resolvedOptions.expertBusinessMode = "simple";
            if (!resolvedOptions.expertCleaningMode) resolvedOptions.expertCleaningMode = "simple";
            if (!resolvedOptions.expertHarborMode) resolvedOptions.expertHarborMode = "simple";
            if (!resolvedOptions.expertMoverMode) resolvedOptions.expertMoverMode = "simple";
            if (!resolvedOptions.expertRenovationMode) resolvedOptions.expertRenovationMode = "simple";
            if (!resolvedOptions.expertComboMode) resolvedOptions.expertComboMode = "core";
            if (!Number.isFinite(resolvedOptions.expertBuildTempoWeight)) resolvedOptions.expertBuildTempoWeight = 0.03;
            if (!resolvedOptions.expertAirportSkipMode) resolvedOptions.expertAirportSkipMode = "whenNoLandmark";
        }
    };
    const isLiveExpert = resolvedDifficulty === 'expert' && resolvedOptions.expertPurpose === "live";
    if (isLiveExpert && !resolvedOptions.expertPreset) {
        applyLiveExpertDefaults();
    }
    if (isLiveExpert && resolvedOptions.expertPreset === "v2simple") {
        applyLiveExpertDefaults();
    }
    if (resolvedDifficulty === 'rl') {
        try {
            return RLModelPortfolio.createRandomCpu(resolvedOptions);
        } catch (error) {
            console.error(error);
            showNotice("深層学習AIモデルを読み込めませんでした。CPU（最強）で代替します。");
            if (resolvedOptions.expertPurpose === "live") {
                applyLiveExpertDefaults();
            }
            return new CPU('expert', resolvedOptions);
        }
    }
    return new CPU(resolvedDifficulty, resolvedOptions);
}

function cpuOpponentDifficultiesFromSettings(settings) {
    return settings.map(setting => {
        if (!setting || setting.type !== "cpu") return "human";
        return setting.difficulty || "normal";
    });
}

function formatCpuSpeedLabel(value) {
    const speed = parseInt(value, 10);
    if (speed <= 100) return '超高速';
    return (speed / 1000) + '秒';
}

function changeCount(delta) {
    selectedCount = Math.min(10, Math.max(2, selectedCount + delta));
    document.getElementById("playerCount").textContent = selectedCount;
    renderPlayerSettings();
    saveSettings();
}

function renderPlayerSettings() {
    while (playerSettings.length < selectedCount) {
        const index = playerSettings.length;
        playerSettings.push({ type: "human", difficulty: "normal", name: defaultLocalPlayerName(index) });
    }
    playerSettings = playerSettings
        .slice(0, selectedCount)
        .map((setting, index) => normalizeLocalPlayerSetting(setting, index, selectedCount));
    const rlNotice = `<div class="player-setting-note">${getRlCpuSettingNote(selectedCount)}</div>`;
    const html = playerSettings.map((s, i) => `
        <div class="player-setting">
            <div class="player-setting-row">
                <span class="player-setting-name">プレイヤー${i + 1}</span>
                <select data-ui-change="localPlayerType" data-player-index="${i}" class="player-setting-select" aria-label="プレイヤー${i + 1}の種類">
                    <option value="human" ${s.type === "human" ? "selected" : ""}>人間</option>
                    <option value="weak"  ${s.type === "cpu" && s.difficulty === "weak"   ? "selected" : ""}>CPU（弱）</option>
                    <option value="normal" ${s.type === "cpu" && s.difficulty === "normal" ? "selected" : ""}>CPU（普通）</option>
                    <option value="strong" ${s.type === "cpu" && s.difficulty === "strong" ? "selected" : ""}>CPU（強）</option>
                    <option value="expert" ${s.type === "cpu" && s.difficulty === "expert" ? "selected" : ""}>CPU（最強）</option>
                    <option value="rl" ${s.type === "cpu" && s.difficulty === "rl" ? "selected" : ""}>AI（深層学習・ランダム）</option>
                </select>
            </div>
            ${s.type === "human" ? `
                <input
                    type="text"
                    maxlength="12"
                    class="text-input player-name-input"
                    placeholder="${defaultLocalPlayerName(i)}"
                    value="${escapeAttribute(s.name)}"
                    data-ui-input="localPlayerName"
                    data-player-index="${i}"
                >
            ` : `<div class="player-setting-cpu-label">${getLocalCpuLabel(s.difficulty)}として統計を記録</div>`}
        </div>
    `).join("") + rlNotice;
    document.getElementById("playerSettings").innerHTML = html;
}

function onChangePlayerType(index, value) {
    if (value === "human") {
        playerSettings[index] = {
            type: "human",
            difficulty: "normal",
            name: normalizeLocalPlayerName(playerSettings[index]?.name, index),
        };
    } else {
        playerSettings[index] = {
            type: "cpu",
            difficulty: value,
            name: normalizeLocalPlayerName(playerSettings[index]?.name, index),
        };
    }
    renderPlayerSettings();
    saveSettings();
}

function onChangePlayerName(index, value) {
    if (!playerSettings[index]) {
        playerSettings[index] = { type: "human", difficulty: "normal", name: defaultLocalPlayerName(index) };
    }
    playerSettings[index].name = value;
    saveSettings();
}

function startGame() {
    cpuSpeed = parseInt(document.getElementById("cpuSpeed").value);
    saveSettings();
    resetStatsRecorded();
    document.getElementById("titleScreen").style.display = "none";
    document.getElementById("gameScreen").style.display = "block";
    init(selectedCount);
}

function restartGame() {
    showConfirm("最初からやり直しますか？\n現在のゲームは終了します", () => {
        localStorage.removeItem('savedGame');
        if (typeof clearOnlineSessionStorage === 'function') clearOnlineSessionStorage();
        else localStorage.removeItem('onlineSession');
        cpuScheduleToken++;
        cancelDelayedHumanAction();
        resetOnlineState();
        document.getElementById("gameScreen").style.display = "none";
        document.getElementById("titleScreen").style.display = "block";
        selectedCount = 2;
        playerSettings = [];
        cpuPlayers = [];
        document.getElementById("playerCount").textContent = 2;
        renderPlayerSettings();
        updateResumeButton();
        drawCitySkyline();
    });
}

function init(playerCount) {
    cpuScheduleToken++;
    cancelDelayedHumanAction();
    prevCoins = null;
    stopConfetti();
    winSoundPlayed = false;
    cancelAutoSkip();
    undoState = null;
    resetFullLog();
    game = new GameManager(playerCount);
    if (enabledLandmarks.size === 0) enabledLandmarks = new Set(Player.landmarkNames());
    game.enabledLandmarks = new Set(enabledLandmarks);
    for (const card of CARDS) {
        setShopStockCount(SHOP_STOCK, card, enabledCards.has(card.name) ? getInitialCardStock(card, playerCount) : 0);
    }
    playerSettings = Array.from({ length: playerCount }, (_, index) =>
        normalizeLocalPlayerSetting(playerSettings[index], index, playerCount)
    );

    // ターン順をランダムにシャッフル
    const order = playerSettings.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
    }

    const shuffledSettings = order.map(originalIndex => playerSettings[originalIndex] || {});
    const opponentDifficulties = cpuOpponentDifficultiesFromSettings(shuffledSettings);

    // プレイヤー名とCPU設定をシャッフル順に再設定
    const shuffledCpuPlayers = [];
    for (let i = 0; i < playerCount; i++) {
        const originalIndex = order[i];
        const setting = shuffledSettings[i];
        game.players[i].name = setting.type === "cpu"
            ? getLocalCpuLabel(setting.difficulty)
            : normalizeLocalPlayerName(setting.name, originalIndex);
        shuffledCpuPlayers.push(
            setting.type === "cpu"
                ? createCpuPlayer(setting.difficulty, { expertPurpose: "live", playerCount, expertOpponentDifficulties: opponentDifficulties })
                : null
        );
    }
    cpuPlayers = shuffledCpuPlayers;
    game.addLog(LOG_TYPES.SYSTEM, `👤 ${game.currentPlayer().name}のターン`);
    render();
    scheduleCPU();
}

// CPUアクションをローカル・オンライン両対応で実行
function cpuDo(action, data, fallback) {
    if (isOnlineGame) {
        sendAction(action, data);
        return;
    }
    fallback();
    render();
    scheduleCPU();
}

function runLocalOrSendOnline(action, data, fallback) {
    if (isOnlineGame) {
        return sendAction(action, data);
    }
    const result = fallback();
    if (result === false) return false;
    render();
    scheduleCPU();
    return true;
}

const MAIN_ACTIONS = (typeof GAME_ACTIONS !== 'undefined') ? GAME_ACTIONS : Object.freeze({
    ROLL_DICE: 'rollDice',
    SELECT_DICE: 'selectDice',
    REROLL_DICE: 'rerollDice',
    SKIP_REROLL: 'skipReroll',
    RESOLVE_HARBOR: 'resolveHarbor',
    RESOLVE_TV: 'resolveTV',
    RESOLVE_BUSINESS: 'resolveBusiness',
    RESOLVE_CLEANING: 'resolveCleaning',
    RESOLVE_MOVER: 'resolveMover',
    RESOLVE_RENOVATION: 'resolveRenovation',
    RESOLVE_IT: 'resolveIT',
    BUILD_CARD: 'buildCard',
    BUILD_LANDMARK: 'buildLandmark',
    NEXT_TURN: 'nextTurn',
    UNDO_BUILD: 'undoBuild',
});

function canRunAction(action) {
    if (!game || !action) return false;
    if (typeof game.allowedActions === 'function') return game.allowedActions().has(action);
    if (typeof GameManager !== 'undefined' && GameManager && typeof GameManager.allowedActionsFor === 'function') {
        return GameManager.allowedActionsFor(game).has(action);
    }
    return true;
}

function queueCPUStep(token, delay, fn) {
    setTimeout(() => {
        if (token !== cpuScheduleToken) return;
        fn();
    }, delay);
}

function isMinorCardForCpuFallback(card) {
    return !!card && card.category !== "大施設";
}

function isDormantForCpuFallback(player, card) {
    return !!player && typeof player.isDormant === 'function' && player.isDormant(card);
}

function findCardForCpuFallback(player, ref) {
    if (!player || !Array.isArray(player.cards)) return null;
    const card = Number.isInteger(ref)
        ? player.cards[ref]
        : player.cards.find(entry => entry && entry.name === ref);
    return isMinorCardForCpuFallback(card) ? card : null;
}

function isValidCpuOpponentIndex(index) {
    return game && Number.isInteger(index) && index >= 0 && index < game.players.length && index !== game.currentPlayerIndex;
}

function fallbackCpuOpponentIndex() {
    if (!game) return null;
    for (let i = 0; i < game.players.length; i++) {
        if (i !== game.currentPlayerIndex) return i;
    }
    return null;
}

function isValidCpuBusinessMove(move) {
    if (!game || !move || !isValidCpuOpponentIndex(move.targetIndex)) return false;
    const current = game.currentPlayer();
    const target = game.players[move.targetIndex];
    return !!findCardForCpuFallback(current, move.myCard) && !!findCardForCpuFallback(target, move.theirCard);
}

function fallbackCpuBusinessMove() {
    if (!game) return null;
    const current = game.currentPlayer();
    const myCard = current.cards.findIndex(isMinorCardForCpuFallback);
    if (myCard < 0) return null;
    for (let i = 0; i < game.players.length; i++) {
        if (i === game.currentPlayerIndex) continue;
        const theirCard = game.players[i].cards.findIndex(isMinorCardForCpuFallback);
        if (theirCard >= 0) return { myCard, targetIndex: i, theirCard };
    }
    return null;
}

function fallbackCpuCleaningTarget() {
    if (!game) return null;
    for (const player of game.players) {
        const card = player.cards.find(entry => isMinorCardForCpuFallback(entry) && !isDormantForCpuFallback(player, entry));
        if (card) return card.name;
    }
    return null;
}

function isValidCpuMoverMove(move) {
    if (!game || !move || !isValidCpuOpponentIndex(move.targetIndex)) return false;
    return !!findCardForCpuFallback(game.currentPlayer(), move.cardIndex ?? move.cardName);
}

function fallbackCpuMoverMove() {
    if (!game) return null;
    const current = game.currentPlayer();
    const cardIndex = current.cards.findIndex(isMinorCardForCpuFallback);
    const targetIndex = fallbackCpuOpponentIndex();
    if (cardIndex < 0 || targetIndex === null) return null;
    return { cardIndex, targetIndex };
}

function fallbackCpuRenovationTarget() {
    if (!game) return null;
    const current = game.currentPlayer();
    const built = Object.entries(current.landmarks || {})
        .find(([name, value]) => value === true && name !== LANDMARK_NAMES.YAKUSHO);
    return built ? built[0] : null;
}

function chooseCpuPendingResolution(cpu) {
    if (typeof CPU.choosePendingResolution === "function") {
        return CPU.choosePendingResolution(game, cpu, {
            clearFallback: false,
            fallbackTvTarget: fallbackCpuOpponentIndex,
            fallbackBusinessMove: fallbackCpuBusinessMove,
            fallbackMoverMove: fallbackCpuMoverMove,
            fallbackRenovationTarget: fallbackCpuRenovationTarget,
        });
    }
    const nextPending = GameManager.nextPendingActionFor(game);
    const pendingAction = nextPending && nextPending.action;
    if (pendingAction === GAME_ACTIONS.RESOLVE_TV) {
        let targetIndex = cpu.chooseTVTarget(game);
        if (!isValidCpuOpponentIndex(targetIndex)) targetIndex = fallbackCpuOpponentIndex();
        if (targetIndex !== null) {
            return {
                action: 'resolveTV',
                payload: { targetIndex },
                apply: () => game.resolveTV(targetIndex),
            };
        }
    }
    if (pendingAction === GAME_ACTIONS.RESOLVE_BUSINESS) {
        let move = cpu.chooseBusinessMove(game);
        if (!isValidCpuBusinessMove(move)) move = fallbackCpuBusinessMove();
        if (move) {
            return {
                action: 'resolveBusiness',
                payload: move,
                apply: () => game.resolveBusiness(move.myCard, move.targetIndex, move.theirCard),
            };
        }
    }
    if (pendingAction === GAME_ACTIONS.RESOLVE_CLEANING) return null;
    if (pendingAction === GAME_ACTIONS.RESOLVE_MOVER) {
        let move = cpu.chooseMoverMove(game);
        if (!isValidCpuMoverMove(move)) move = fallbackCpuMoverMove();
        if (move) {
            return {
                action: 'resolveMover',
                payload: move,
                apply: () => game.resolveMover(move.cardIndex, move.targetIndex),
            };
        }
    }
    if (pendingAction === GAME_ACTIONS.RESOLVE_RENOVATION) {
        let landmarkName = cpu.chooseRenovationTarget(game);
        if (!landmarkName) landmarkName = fallbackCpuRenovationTarget();
        if (landmarkName) {
            return {
                action: 'resolveRenovation',
                payload: { landmarkName },
                apply: () => game.resolveRenovation(landmarkName),
            };
        }
    }
    return null;
}

// フェーズごとの CPU ハンドラテーブル。
// 新フェーズを追加するときはここに1エントリ追加するだけでよい。
const CPU_PHASE_HANDLERS = [
    {
        name: "roll",
        run(cpu) {
            if (game.phase !== GAME_PHASES.ROLL) return;
            const forceDice = rollRandomDie();
            const tunaDice = [rollRandomDie(), rollRandomDie()];
            cpuDo('rollDice', { forceDice, tunaDice }, () => game.rollDice(forceDice, tunaDice));
        },
    },
    {
        name: "selectDice",
        run(cpu) {
            if (game.phase !== GAME_PHASES.SELECT_DICE) return;
            const useTwo = cpu.chooseDiceCount(game);
            const d1 = rollRandomDie();
            const d2 = rollRandomDie();
            const tunaDice = [rollRandomDie(), rollRandomDie()];
            cpuDo('selectDice', { useTwo, diceCount: useTwo ? 2 : 1, d1, d2, tunaDice }, () => game.selectDiceCount(useTwo, d1, d2, tunaDice));
        },
    },
    {
        name: "rerollConfirm",
        run(cpu) {
            if (game.phase !== GAME_PHASES.REROLL_CONFIRM) return;
            if (cpu.chooseReroll(game)) {
                const forceDice = rollRandomDie();
                const tunaDice = [rollRandomDie(), rollRandomDie()];
                cpuDo('rerollDice', { forceDice, tunaDice }, () => game.rerollDice(forceDice, tunaDice));
            } else {
                cpuDo('skipReroll', {}, () => game.skipReroll());
            }
        },
    },
    {
        name: "harborChoice",
        run(cpu) {
            if (game.phase !== GAME_PHASES.HARBOR_CHOICE) return;
            const useBonus = cpu.chooseHarbor(game);
            cpuDo('resolveHarbor', { useBonus }, () => game.resolveHarbor(useBonus));
        },
    },
    {
        name: "pending",
        run(cpu) {
            if (game.phase !== GAME_PHASES.PENDING) return;
            const pendingResolution = chooseCpuPendingResolution(cpu);
            if (pendingResolution) {
                cpuDo(pendingResolution.action, pendingResolution.payload, () => pendingResolution.apply());
                return;
            }
            const nextPending = GameManager.nextPendingActionFor(game);
            if (nextPending && nextPending.action === GAME_ACTIONS.RESOLVE_CLEANING) {
                let cardName = cpu.chooseCleaningTarget(game);
                if (!cardName) cardName = fallbackCpuCleaningTarget();
                if (cardName) {
                    cpuDo('resolveCleaning', { cardName }, () => game.resolveCleaning(cardName));
                    return;
                }
            }
        },
    },
    {
        name: "build",
        run(cpu) {
            if (game.phase !== GAME_PHASES.BUILD) return;
            const buildResult = cpu.build(game, SHOP_STOCK);
            if (buildResult === false) return false;
            render();
            return true;
        },
    },
    {
        name: "nextTurn",
        run(cpu) {
            if (game.phase !== GAME_PHASES.BUILD || game.pendingIT) return;
            cpuDo('nextTurn', {}, () => game.nextTurn());
        },
    },
    {
        name: "resolveIT",
        run(cpu) {
            if (!game.pendingIT) return;
            const doSave = cpu.chooseITInvest(game);
            cpuDo('resolveIT', { doSave }, () => game.resolveIT(doSave));
        },
    },
];

function scheduleCPU() {
    if (isReplaying) return;
    if (isOnlineGame && !isRoomHost) return;
    if (isOnlineGame && (
        (typeof isReconnectingOnline !== 'undefined' && isReconnectingOnline) ||
        (typeof onlineActionInFlight !== 'undefined' && onlineActionInFlight) ||
        (typeof socket === 'undefined' || !socket || socket.connected === false)
    )) return;
    if (!game || game.checkWinner()) return;
    const ci = game.currentPlayerIndex;
    if (!cpuPlayers[ci]) return;
    const cpu = cpuPlayers[ci];
    const token = ++cpuScheduleToken;
    let stepIndex = 0;

    function runNextStep() {
        if (token !== cpuScheduleToken) return;
        if (stepIndex >= CPU_PHASE_HANDLERS.length) {
            queueCPUStep(token, 500, () => { if (!game.checkWinner()) scheduleCPU(); });
            return;
        }
        const step = CPU_PHASE_HANDLERS[stepIndex++];
        queueCPUStep(token, cpuSpeed, () => {
            if (isReplaying) return;
            if (isOnlineGame && !isRoomHost) return;
            if (isOnlineGame && (
                (typeof isReconnectingOnline !== 'undefined' && isReconnectingOnline) ||
                (typeof onlineActionInFlight !== 'undefined' && onlineActionInFlight) ||
                (typeof socket === 'undefined' || !socket || socket.connected === false)
            )) return;
            if (!game || game.checkWinner()) return;
            if (!cpuPlayers[game.currentPlayerIndex]) return;
            const stepResult = step.run(cpu);
            if (stepResult === false) return;
            runNextStep();
        });
    }

    runNextStep();
}

function canRunLocalHumanAction(expectedPlayerIndex = null) {
    if (!game || game.checkWinner()) return false;
    if (expectedPlayerIndex !== null && game.currentPlayerIndex !== expectedPlayerIndex) return false;
    if (cpuPlayers[game.currentPlayerIndex]) return false;
    if (isOnlineGame && game.currentPlayerIndex !== myPlayerIndex) return false;
    if (isOnlineGame && (
        (typeof isReconnectingOnline !== 'undefined' && isReconnectingOnline) ||
        (typeof onlineActionInFlight !== 'undefined' && onlineActionInFlight) ||
        (typeof socket === 'undefined' || !socket || socket.connected === false)
    )) return false;
    return true;
}

function canRunHumanAction(action, expectedPlayerIndex = null) {
    return canRunLocalHumanAction(expectedPlayerIndex) && canRunAction(action);
}

function cancelDelayedHumanAction() {
    delayedHumanActionToken++;
    delayedHumanActionPending = false;
    if (delayedHumanActionTimeout !== null) {
        clearTimeout(delayedHumanActionTimeout);
        delayedHumanActionTimeout = null;
    }
}

function onRoll() {
    if (!canRunHumanAction(MAIN_ACTIONS.ROLL_DICE)) return;
    playSound('dice');
    if (game.currentPlayer().landmarks[LANDMARK_NAMES.STATION]) {
        // 駅あり：アニメーションなしで即座に選択肢を表示
        runLocalOrSendOnline('rollDice', { forceDice: null, tunaDice: null }, () => game.rollDice(null, null));
    } else {
        // 駅なし：アニメーションあり
        if (delayedHumanActionPending) return;
        delayedHumanActionPending = true;
        const scheduledToken = ++delayedHumanActionToken;
        const scheduledPlayerIndex = game.currentPlayerIndex;
        updateDiceDisplay(null, true);
        delayedHumanActionTimeout = setTimeout(() => {
            if (scheduledToken !== delayedHumanActionToken) return;
            delayedHumanActionPending = false;
            delayedHumanActionTimeout = null;
            if (!canRunHumanAction(MAIN_ACTIONS.ROLL_DICE, scheduledPlayerIndex)) return;
            if (isOnlineGame) {
                runLocalOrSendOnline('rollDice', { forceDice: null, tunaDice: null }, () => game.rollDice(null, null));
                return;
            }
            const forceDice = rollRandomDie();
            const tunaDice = [rollRandomDie(), rollRandomDie()];
            runLocalOrSendOnline('rollDice', { forceDice, tunaDice }, () => game.rollDice(forceDice, tunaDice));
        }, 600);
    }
}

function onSelectDiceCount(useTwo) {
    if (!canRunHumanAction(MAIN_ACTIONS.SELECT_DICE)) return;
    if (delayedHumanActionPending) return;
    delayedHumanActionPending = true;
    const scheduledToken = ++delayedHumanActionToken;
    playSound('dice');
    const scheduledPlayerIndex = game.currentPlayerIndex;
    updateDiceDisplay(null, true);
    delayedHumanActionTimeout = setTimeout(() => {
        if (scheduledToken !== delayedHumanActionToken) return;
        delayedHumanActionPending = false;
        delayedHumanActionTimeout = null;
        if (!canRunHumanAction(MAIN_ACTIONS.SELECT_DICE, scheduledPlayerIndex)) return;
        if (isOnlineGame) {
            runLocalOrSendOnline('selectDice', { useTwo, diceCount: useTwo ? 2 : 1 },
                () => game.selectDiceCount(useTwo, 1, useTwo ? 1 : 0, null));
            return;
        }
        const d1 = rollRandomDie();
        const d2 = useTwo ? rollRandomDie() : 0;
        const tunaDice = [rollRandomDie(), rollRandomDie()];
        runLocalOrSendOnline('selectDice', { useTwo, diceCount: useTwo ? 2 : 1, d1, d2, tunaDice },
            () => game.selectDiceCount(useTwo, d1, d2, tunaDice));
    }, 600);
}

function onReroll() {
    if (!canRunHumanAction(MAIN_ACTIONS.REROLL_DICE)) return;
    if (isOnlineGame) {
        runLocalOrSendOnline('rerollDice', {}, () => game.rerollDice(1, null));
        return;
    }
    const forceDice = rollRandomDie();
    const tunaDice = [rollRandomDie(), rollRandomDie()];
    runLocalOrSendOnline('rerollDice', { forceDice, tunaDice }, () => game.rerollDice(forceDice, tunaDice));
}

function onSkipReroll() {
    if (!canRunHumanAction(MAIN_ACTIONS.SKIP_REROLL)) return;
    runLocalOrSendOnline('skipReroll', {}, () => game.skipReroll());
}

let delegatedUiHandlersBound = false;
let staticUiHandlersBound = false;

function actionButtonFromEvent(event) {
    const target = event && event.target;
    if (!target) return null;
    if (typeof target.closest === 'function') return target.closest('[data-action]');
    return target.dataset && target.dataset.action ? target : null;
}

function uiActionElementFromEvent(event, attributeName) {
    const target = event && event.target;
    if (!target) return null;
    const selector = '[' + attributeName + ']';
    if (typeof target.closest === 'function') return target.closest(selector);
    return target.dataset && target.dataset[attributeName.replace(/^data-/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase())] ? target : null;
}

function reloadCurrentPage() {
    if (typeof window !== 'undefined' && window.location && typeof window.location.reload === 'function') {
        window.location.reload();
    } else if (typeof location !== 'undefined' && typeof location.reload === 'function') {
        location.reload();
    }
}

function handleStaticUiClick(event) {
    const element = uiActionElementFromEvent(event, 'data-ui-action');
    if (!element || element.disabled) return;
    const action = element.dataset.uiAction;
    if (!action) return;
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    if (action === 'showRules') showRules();
    else if (action === 'showCardSelect') showCardSelect();
    else if (action === 'reconnectOnline') reconnectOnline();
    else if (action === 'deleteOnlineSession') deleteOnlineSession();
    else if (action === 'switchTab') switchTab(element.dataset.tab);
    else if (action === 'changeCount') changeCount(parseInt(element.dataset.delta, 10));
    else if (action === 'startGame') startGame();
    else if (action === 'resumeGame') resumeGame();
    else if (action === 'deleteSavedGame') deleteSavedGame();
    else if (action === 'switchOnlineTab') switchOnlineTab(element.dataset.onlineTab);
    else if (action === 'changeOnlineCount') changeOnlineCount(parseInt(element.dataset.delta, 10));
    else if (action === 'showCreateRoom') showCreateRoom();
    else if (action === 'joinRoom') joinRoom();
    else if (action === 'toggleTutorial') toggleTutorial();
    else if (action === 'cycleTutorialLevel') cycleTutorialLevel();
    else if (action === 'onRoll') onRoll();
    else if (action === 'onReroll') onReroll();
    else if (action === 'onSkip') onSkip();
    else if (action === 'toggleLog') toggleLog();
    else if (action === 'restartGame') restartGame();
    else if (action === 'closeRules') closeRules();
    else if (action === 'closeCardDetail') closeCardDetail();
    else if (action === 'hideNotice') hideNotice();
    else if (action === 'reloadPage') reloadCurrentPage();
    else if (action === 'crashResume') crashResume();
    else if (action === 'pwaApplyUpdate') {
        if (typeof pwaApplyUpdate === 'function') pwaApplyUpdate();
        else reloadCurrentPage();
    }
    else if (action === 'hidePwaUpdateBanner') {
        const banner = document.getElementById('pwaUpdateBanner');
        if (banner) banner.style.display = 'none';
        if (typeof maybeShowPwaInstallBanner === 'function') maybeShowPwaInstallBanner();
        else {
            const installBanner = document.getElementById('pwaInstallBanner');
            const stillVisible = installBanner && installBanner.style.display === 'block';
            if (!stillVisible && document.body && document.body.classList) document.body.classList.remove('pwa-banner-open');
        }
    }
    else if (action === 'pwaInstallPrompt') pwaInstallPrompt();
    else if (action === 'pwaInstallDismiss') pwaInstallDismiss();
}

function handleStaticUiInput(event) {
    const element = uiActionElementFromEvent(event, 'data-ui-input');
    if (!element) return;
    if (element.dataset.uiInput === 'cpuSpeed') {
        const label = document.getElementById('speedLabel');
        if (label) label.textContent = formatCpuSpeedLabel(element.value);
    } else if (element.dataset.uiInput === 'onlineCpuSpeed') {
        const label = document.getElementById('onlineSpeedLabel');
        if (label) label.textContent = formatCpuSpeedLabel(element.value);
    } else if (element.dataset.uiInput === 'localPlayerName') {
        onChangePlayerName(parseInt(element.dataset.playerIndex, 10), element.value);
    }
}

function handleStaticUiChange(event) {
    const element = uiActionElementFromEvent(event, 'data-ui-change');
    if (!element) return;
    if (element.dataset.uiChange === 'toggleTutorialEnabled') onToggleTutorial(element.checked);
    else if (element.dataset.uiChange === 'tutorialLevel') onChangeTutorialLevel(element.value);
    else if (element.dataset.uiChange === 'localPlayerType') onChangePlayerType(parseInt(element.dataset.playerIndex, 10), element.value);
    else if (element.dataset.uiChange === 'onlinePlayerType') onChangeOnlinePlayerType(parseInt(element.dataset.playerIndex, 10), element.value);
}

function handleStaticUiKeydown(event) {
    if (!event || (event.key !== 'Enter' && event.key !== ' ')) return;
    const element = uiActionElementFromEvent(event, 'data-ui-action');
    if (!element || element.disabled || element.getAttribute('role') !== 'button') return;
    handleStaticUiClick(event);
}

function bindStaticUiHandlers() {
    if (staticUiHandlersBound) return;
    if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') return;
    document.addEventListener('click', handleStaticUiClick);
    document.addEventListener('input', handleStaticUiInput);
    document.addEventListener('change', handleStaticUiChange);
    document.addEventListener('keydown', handleStaticUiKeydown);
    staticUiHandlersBound = true;
}

function handleDiceChoiceClick(event) {
    const button = actionButtonFromEvent(event);
    if (!button || button.disabled) return;
    const action = button.dataset.action;
    if (!action) return;
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    if (action === 'selectDiceCount') onSelectDiceCount(button.dataset.useTwo === 'true');
    else if (action === 'rerollDice') onReroll();
    else if (action === 'skipReroll') onSkipReroll();
    else if (action === 'resolveHarbor') onResolveHarbor(button.dataset.useBonus === 'true');
}

function handlePendingActionClick(event) {
    const button = actionButtonFromEvent(event);
    if (!button || button.disabled) return;
    const action = button.dataset.action;
    if (!action) return;
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    if (action === 'selectBusinessCard') { bcSelectCard(button, button.dataset.inputId); return; }
    if (action === 'resolveTV') onResolveTV(parseInt(button.dataset.targetIndex, 10));
    if (action === 'resolveBusiness') onResolveBusiness(parseInt(button.dataset.targetIndex, 10));
    if (action === 'resolveCleaning') onResolveCleaning(button.dataset.cardName);
    if (action === 'resolveMover') onResolveMover(parseInt(button.dataset.targetIndex, 10));
    if (action === 'resolveRenovation') onResolveRenovation(button.dataset.landmarkName);
    if (action === 'resolveIT') onResolveIT(button.dataset.doSave === 'true');
}

function handleBuildMenuClick(event) {
    const button = actionButtonFromEvent(event);
    if (!button || button.disabled) return;
    const action = button.dataset.action;
    if (!action) return;
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    if (action === 'buildCard') onBuildCard(button.dataset.cardName);
    if (action === 'buildLandmark') onBuildLandmark(button.dataset.landmarkName);
    if (action === 'showCardDetail') showCardDetail(button.dataset.cardName);
    if (action === 'showLandmarkDetail') showCardDetail(button.dataset.landmarkName, true);
    if (action === 'setCardFilter') setCardFilter(button.dataset.cardFilter || '');
    if (action === 'undoBuild') doUndo();
}

function handlePlayerPanelClick(event) {
    const button = actionButtonFromEvent(event);
    if (!button || button.disabled) return;
    if (button.dataset.action !== 'showCardDetail') return;
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    showCardDetail(button.dataset.cardName);
}

function bindDelegatedUiHandlers() {
    if (delegatedUiHandlersBound) return;
    const diceChoose = document.getElementById('diceChoose');
    const pendingMenu = document.getElementById('pendingMenu');
    const buildMenu = document.getElementById('buildMenu');
    const players = document.getElementById('players');
    if (diceChoose && typeof diceChoose.addEventListener === 'function') diceChoose.addEventListener('click', handleDiceChoiceClick);
    if (pendingMenu && typeof pendingMenu.addEventListener === 'function') pendingMenu.addEventListener('click', handlePendingActionClick);
    if (buildMenu && typeof buildMenu.addEventListener === 'function') buildMenu.addEventListener('click', handleBuildMenuClick);
    if (players && typeof players.addEventListener === 'function') players.addEventListener('click', handlePlayerPanelClick);
    bindStaticUiHandlers();
    delegatedUiHandlersBound = true;
}

function onResolveHarbor(useBonus) {
    if (!canRunHumanAction(MAIN_ACTIONS.RESOLVE_HARBOR)) return;
    runLocalOrSendOnline('resolveHarbor', { useBonus }, () => game.resolveHarbor(useBonus));
}

function onResolveTV(i) {
    if (!canRunHumanAction(MAIN_ACTIONS.RESOLVE_TV)) return;
    runLocalOrSendOnline('resolveTV', { targetIndex: i }, () => game.resolveTV(i));
}

function onResolveBusiness(targetIndex) {
    if (!canRunHumanAction(MAIN_ACTIONS.RESOLVE_BUSINESS)) return;
    const myCard = parseInt(document.getElementById("myCardSelect").value, 10);
    const theirCard = parseInt(document.getElementById(`theirCardSelect_${targetIndex}`).value, 10);
    runLocalOrSendOnline('resolveBusiness', { myCard, targetIndex, theirCard },
        () => game.resolveBusiness(myCard, targetIndex, theirCard));
}

function onResolveCleaning(cardName) {
    if (!canRunHumanAction(MAIN_ACTIONS.RESOLVE_CLEANING)) return;
    runLocalOrSendOnline('resolveCleaning', { cardName }, () => game.resolveCleaning(cardName));
}

function onResolveMover(targetIndex) {
    if (!canRunHumanAction(MAIN_ACTIONS.RESOLVE_MOVER)) return;
    const cardIndex = parseInt(document.getElementById("moverCardSelect").value, 10);
    runLocalOrSendOnline('resolveMover', { cardIndex, targetIndex }, () => game.resolveMover(cardIndex, targetIndex));
}

function onResolveRenovation(landmarkName) {
    if (!canRunHumanAction(MAIN_ACTIONS.RESOLVE_RENOVATION)) return;
    runLocalOrSendOnline('resolveRenovation', { landmarkName }, () => game.resolveRenovation(landmarkName));
}

function onResolveIT(doSave) {
    if (!canRunHumanAction(MAIN_ACTIONS.RESOLVE_IT)) return;
    runLocalOrSendOnline('resolveIT', { doSave }, () => game.resolveIT(doSave));
}

function onBuildCard(name) {
    if (!canRunHumanAction(MAIN_ACTIONS.BUILD_CARD)) return;
    const card = CARDS.find(c => c.name === name);
    if (!card) return;
    const scheduledPlayerIndex = game.currentPlayerIndex;
    showConfirm(`${card.name}を建設しますか？\n💰 ${card.cost}コイン`, () => {
        if (!canRunHumanAction(MAIN_ACTIONS.BUILD_CARD, scheduledPlayerIndex)) return;
        if (getShopStockCount(SHOP_STOCK, card) <= 0) return;
        saveUndoState();
        cancelAutoSkip();
        if (isOnlineGame) {
            sendAction('buildCard', { cardName: name });
            return;
        }
        if (game.buildCard(card)) {
            decrementShopStock(SHOP_STOCK, card);
            playSound('build');
            render();
            scheduleCPU();
        }
    });
}

function onBuildLandmark(name) {
    if (!canRunHumanAction(MAIN_ACTIONS.BUILD_LANDMARK)) return;
    const cost = Player.landmarkCost(name);
    const scheduledPlayerIndex = game.currentPlayerIndex;
    showConfirm(`${getLandmarkEmoji(name)} ${name}を建設しますか？\n💰 ${cost}コイン`, () => {
        if (!canRunHumanAction(MAIN_ACTIONS.BUILD_LANDMARK, scheduledPlayerIndex)) return;
        saveUndoState();
        cancelAutoSkip();
        if (isOnlineGame) {
            sendAction('buildLandmark', { name });
            return;
        }
        if (game.buildLandmark(name)) {
            playSound('build');
            render();
            scheduleCPU();
        }
    });
}

function onSkip() {
    if (!canRunHumanAction(MAIN_ACTIONS.NEXT_TURN)) return;
    let msg;
    if (game.builtThisTurn) {
        msg = "建設完了・ターン終了しますか？";
    } else if (game.currentPlayer().landmarks[LANDMARK_NAMES.AIRPORT]) {
        msg = "建設せずにターン終了しますか？\n✈️ 空港効果で+10コイン獲得します";
    } else {
        msg = "建設せずにターン終了しますか？";
    }
    const scheduledPlayerIndex = game.currentPlayerIndex;
    showConfirm(msg, () => {
        if (!canRunHumanAction(MAIN_ACTIONS.NEXT_TURN, scheduledPlayerIndex)) return;
        cancelAutoSkip();
        undoState = null;
        runLocalOrSendOnline('nextTurn', {}, () => game.nextTurn());
    });
}

// サイコロの目を描画
function renderDiceFace(num) {
    // 9マスのドット配置（1=中央, 2=左上+右下 など）
    const layouts = {
        1: [0,0,0, 0,1,0, 0,0,0],
        2: [1,0,0, 0,0,0, 0,0,1],
        3: [1,0,0, 0,1,0, 0,0,1],
        4: [1,0,1, 0,0,0, 1,0,1],
        5: [1,0,1, 0,1,0, 1,0,1],
        6: [1,0,1, 1,0,1, 1,0,1],
    };
    const dots = layouts[num] || layouts[1];
    return `<div class="dice-face">
        ${dots.map(d => `<div class="dot ${d ? '' : 'hidden'}"></div>`).join('')}
    </div>`;
}

function updateDiceDisplay(nums, rolling = false) {
    const el = document.getElementById("diceResult");
    if (rolling) {
        el.innerHTML = `<div class="dice-display">
            <div class="dice-face rolling">
                ${[0,0,0,0,0,0,0,0,0].map(() => `<div class="dot"></div>`).join('')}
            </div>
        </div>`;
        return;
    }
    if (!nums || nums.length === 0) {
        el.innerHTML = `<div class="dice-display">${renderDiceFace(1).replace('dice-face', 'dice-face' )}</div>`;
        el.style.opacity = "0.2";
        return;
    }
    el.style.opacity = "1";
    el.innerHTML = `<div class="dice-display">
        ${nums.map(n => renderDiceFace(n)).join('')}
    </div>`;
}

function drawCitySkyline() {
    const canvas = document.getElementById("cityCanvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = window.innerWidth > 480 ? 480 : window.innerWidth;
    const H = 220;
    canvas.width = W;
    canvas.height = H;
    canvas.style.width = "100%";
    canvas.style.height = H + "px";

    ctx.clearRect(0, 0, W, H);

    // 夕焼けグラデーション空
    const skyGrad = ctx.createLinearGradient(0, 0, 0, H);
    skyGrad.addColorStop(0,   "#0a0a2a");
    skyGrad.addColorStop(0.3, "#1a1040");
    skyGrad.addColorStop(0.6, "#3a1020");
    skyGrad.addColorStop(0.8, "#6a2010");
    skyGrad.addColorStop(1,   "#2a0a00");
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, W, H);

    // 月
    const moonX = W * 0.8;
    const moonY = H * 0.2;
    const moonGlow = ctx.createRadialGradient(moonX, moonY, 0, moonX, moonY, 35);
    moonGlow.addColorStop(0,   "rgba(255,240,180,0.3)");
    moonGlow.addColorStop(1,   "rgba(255,240,180,0)");
    ctx.fillStyle = moonGlow;
    ctx.beginPath();
    ctx.arc(moonX, moonY, 35, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(moonX, moonY, 12, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,240,200,0.9)";
    ctx.fill();

    // 星
    for (let i = 0; i < 40; i++) {
        const sx = Math.random() * W;
        const sy = Math.random() * H * 0.6;
        const sr = Math.random() * 1.2;
        const alpha = 0.3 + Math.random() * 0.7;
        ctx.beginPath();
        ctx.arc(sx, sy, sr, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.fill();
    }

    // 雲（薄く）
    for (let i = 0; i < 3; i++) {
        const cx = Math.random() * W;
        const cy = H * 0.1 + Math.random() * H * 0.3;
        const cw = 40 + Math.random() * 60;
        const cloudGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, cw);
        cloudGrad.addColorStop(0,   "rgba(100,60,80,0.15)");
        cloudGrad.addColorStop(1,   "rgba(100,60,80,0)");
        ctx.fillStyle = cloudGrad;
        ctx.beginPath();
        ctx.ellipse(cx, cy, cw, cw * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    // ビル（遠景・薄い）
    const farBuildings = [
        {x:0, w:30, h:80}, {x:25, w:20, h:100}, {x:40, w:35, h:70},
        {x:70, w:25, h:90}, {x:90, w:40, h:110}, {x:125, w:20, h:75},
        {x:140, w:30, h:95}, {x:165, w:45, h:120}, {x:205, w:25, h:80},
        {x:225, w:35, h:105}, {x:255, w:20, h:70}, {x:270, w:40, h:115},
        {x:305, w:30, h:85}, {x:330, w:25, h:100}, {x:350, w:45, h:130},
        {x:390, w:20, h:75}, {x:405, w:35, h:95}, {x:435, w:30, h:110},
        {x:460, w:25, h:80},
    ];

    farBuildings.forEach(b => {
        const bx = (b.x / 500) * W;
        const bw = (b.w / 500) * W;
        ctx.fillStyle = "rgba(20,10,30,0.6)";
        ctx.fillRect(bx, H - b.h, bw, b.h);
        // 窓
        const cols = Math.floor(bw / 6);
        const rows = Math.floor(b.h / 10);
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (Math.random() > 0.4) {
                    const lit = Math.random();
                    if (lit > 0.5) {
                        ctx.fillStyle = lit > 0.8
                            ? `rgba(255,220,100,${0.2 + Math.random() * 0.3})`
                            : `rgba(150,200,255,${0.15 + Math.random() * 0.2})`;
                        ctx.fillRect(bx + c * 6 + 1, H - b.h + r * 10 + 2, 3, 5);
                    }
                }
            }
        }
    });

    // ビル（近景・濃い）
    const nearBuildings = [
        {x:0,   w:50,  h:150},
        {x:45,  w:65,  h:180},
        {x:105, w:40,  h:130},
        {x:140, w:60,  h:170},
        {x:195, w:35,  h:120},
        {x:225, w:70,  h:160},
        {x:290, w:45,  h:140},
        {x:330, w:60,  h:190},
        {x:385, w:40,  h:125},
        {x:420, w:55,  h:165},
        {x:470, w:35,  h:135},
    ];

    nearBuildings.forEach(b => {
        const bx = (b.x / 510) * W;
        const bw = (b.w / 510) * W;

        // ビル本体グラデーション
        const bGrad = ctx.createLinearGradient(bx, H - b.h, bx + bw, H);
        bGrad.addColorStop(0, "#0d0820");
        bGrad.addColorStop(1, "#180d30");
        ctx.fillStyle = bGrad;
        ctx.fillRect(bx, H - b.h, bw, b.h);

        // 輪郭
        ctx.strokeStyle = "rgba(80,50,120,0.4)";
        ctx.lineWidth = 0.5;
        ctx.strokeRect(bx, H - b.h, bw, b.h);

        // アンテナ
        if (Math.random() > 0.6) {
            ctx.strokeStyle = "rgba(150,100,200,0.5)";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(bx + bw / 2, H - b.h);
            ctx.lineTo(bx + bw / 2, H - b.h - 15);
            ctx.stroke();
            // アンテナ先端の赤ランプ
            ctx.beginPath();
            ctx.arc(bx + bw / 2, H - b.h - 15, 2, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(255,50,50,0.8)";
            ctx.fill();
        }

        // 窓
        const cols = Math.floor(bw / 8);
        const rows = Math.floor(b.h / 12);
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (Math.random() > 0.3) {
                    const lit = Math.random();
                    if (lit > 0.25) {
                        const alpha = 0.4 + Math.random() * 0.5;
                        ctx.fillStyle = lit > 0.7
                            ? `rgba(255,230,100,${alpha})`
                            : `rgba(100,180,255,${alpha * 0.7})`;
                        ctx.fillRect(bx + c * 8 + 2, H - b.h + r * 12 + 3, 4, 6);
                    }
                }
            }
        }
    });

    // 地面・道路
    const groundGrad = ctx.createLinearGradient(0, H - 15, 0, H);
    groundGrad.addColorStop(0, "#1a0a30");
    groundGrad.addColorStop(1, "#0a0518");
    ctx.fillStyle = groundGrad;
    ctx.fillRect(0, H - 15, W, 15);

    // 道路の反射
    ctx.fillStyle = "rgba(255,150,50,0.1)";
    ctx.fillRect(0, H - 5, W, 5);

    // 水面反射効果
    nearBuildings.forEach(b => {
        const bx = (b.x / 510) * W;
        const bw = (b.w / 510) * W;
        const reflGrad = ctx.createLinearGradient(0, H - 15, 0, H - 5);
        reflGrad.addColorStop(0, "rgba(255,200,50,0.05)");
        reflGrad.addColorStop(1, "rgba(255,200,50,0)");
        ctx.fillStyle = reflGrad;
        ctx.fillRect(bx, H - 15, bw, 10);
    });
}

// ===== コイン獲得アニメーション =====
function showCoinAnimation(playerIndex, diff) {
    if (diff > 0) playSound('coin');
    const boxes = document.querySelectorAll('.player-box');
    if (!boxes[playerIndex]) return;
    const box = boxes[playerIndex];
    box.style.position = 'relative';
    const el = document.createElement('div');
    el.className = `coin-float ${diff > 0 ? 'coin-gain' : 'coin-lose'}`;
    el.textContent = (diff > 0 ? '+' : '') + diff + '🪙';
    box.appendChild(el);
    setTimeout(() => el.remove(), 1000);
}

// ===== オートスキップ =====
function cancelAutoSkip() {
    if (autoSkipTimeout) { clearTimeout(autoSkipTimeout); autoSkipTimeout = null; }
    autoSkipPending = false;
}

function checkAutoSkip() {
    if (autoSkipPending) return;
    if (!game || game.checkWinner()) return;
    if (game.phase !== GAME_PHASES.BUILD) { cancelAutoSkip(); return; }
    if (cpuPlayers[game.currentPlayerIndex]) return;
    if (isOnlineGame && game.currentPlayerIndex !== myPlayerIndex) return;
    if (game.pendingRenovation > 0) return;
    if (game.builtThisTurn) { cancelAutoSkip(); return; }

    const current = game.currentPlayer();
    const canAffordCard = CARDS.some(card =>
        getShopStockCount(SHOP_STOCK, card) > 0 &&
        current.coins >= card.cost &&
        card.cost > 0 &&
        !(card.color === "purple" && current.countCardIncludingDormant(card.name) > 0)
    );
    const canAffordLandmark = Object.entries(current.landmarks)
        .some(([name, built]) =>
            enabledLandmarks.has(name) &&
            !built &&
            name !== LANDMARK_NAMES.YAKUSHO &&
            current.coins >= Player.landmarkCost(name)
        );

    if (!canAffordCard && !canAffordLandmark) {
        const scheduledPlayerIndex = game.currentPlayerIndex;
        autoSkipPending = true;
        autoSkipTimeout = setTimeout(() => {
            autoSkipPending = false;
            autoSkipTimeout = null;
            if (
                canRunLocalHumanAction(scheduledPlayerIndex) &&
                game.phase === GAME_PHASES.BUILD &&
                !game.builtThisTurn
            ) {
                runLocalOrSendOnline('nextTurn', {}, () => game.nextTurn());
            }
        }, 1500);
    }
}

// 初期表示
initMainView();
bindDelegatedUiHandlers();
