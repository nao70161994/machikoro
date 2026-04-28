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

function getLocalCpuLabel(difficulty) {
    if (difficulty === 'weak') return 'CPU（弱）';
    if (difficulty === 'normal') return 'CPU（普通）';
    if (difficulty === 'strong') return 'CPU（強）';
    if (difficulty === 'rl') return 'AI（深層学習）';
    return 'CPU（最強）';
}

function getRlCpuSettingNote(playerCount) {
    if (playerCount > 4) {
        return 'AI（深層学習）は別系統の学習CPUで、現在2〜4人戦のみ対応です。5人以上では安定したルールベースのCPU（最強）を使ってください。';
    }
    if (playerCount >= 3) {
        return 'AI（深層学習・ランダム）は3〜4人用の深層学習モデルからランダムに選びます。CPU（最強）は安定したルールベースの基準CPUです。';
    }
    return 'AI（深層学習・ランダム）は2人用の複数モデルからランダムに選びます。CPU（最強）は安定したルールベースの基準CPUです。';
}

function createCpuPlayer(difficulty, options = {}) {
    const resolvedOptions = Object.assign({}, options);
    if (difficulty === 'expert' && resolvedOptions.expertPurpose === "live" && !resolvedOptions.expertPreset) {
        resolvedOptions.expertPreset = "v2simple";
        if (!resolvedOptions.expertDiceMode) resolvedOptions.expertDiceMode = "ev";
        if (!resolvedOptions.expertRerollMode) resolvedOptions.expertRerollMode = "simple";
        if (!resolvedOptions.expertBuildMode) resolvedOptions.expertBuildMode = "random";
        if (!resolvedOptions.expertInvestMode) resolvedOptions.expertInvestMode = "always";
        if (!resolvedOptions.expertTvMode) resolvedOptions.expertTvMode = "simple";
        if (!resolvedOptions.expertBusinessMode) resolvedOptions.expertBusinessMode = "random";
        if (!resolvedOptions.expertCleaningMode) resolvedOptions.expertCleaningMode = "random";
        if (!resolvedOptions.expertHarborMode) resolvedOptions.expertHarborMode = "simple";
        if (!resolvedOptions.expertMoverMode) resolvedOptions.expertMoverMode = "simple";
        if (!resolvedOptions.expertRenovationMode) resolvedOptions.expertRenovationMode = "simple";
    }
    if (difficulty === 'rl') {
        try {
            return RLModelPortfolio.createRandomCpu(resolvedOptions);
        } catch (error) {
            console.error(error);
            alert("深層学習AIモデルを読み込めませんでした。CPU（最強）で代替します。");
            return new CPU('expert', resolvedOptions);
        }
    }
    return new CPU(difficulty, resolvedOptions);
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
    playerSettings = playerSettings.slice(0, selectedCount).map((setting, index) => ({
        type: setting.type === "cpu" ? "cpu" : "human",
        difficulty: selectedCount > 4 && setting.difficulty === "rl" ? "expert" : setting.difficulty || "normal",
        name: normalizeLocalPlayerName(setting.name, index),
    }));
    const rlDisabled = selectedCount > 4 ? "disabled" : "";
    const rlNotice = `<div class="player-setting-note">${getRlCpuSettingNote(selectedCount)}</div>`;
    const html = playerSettings.map((s, i) => `
        <div class="player-setting">
            <div class="player-setting-row">
                <span class="player-setting-name">プレイヤー${i + 1}</span>
                <select onchange="onChangePlayerType(${i}, this.value)" class="player-setting-select">
                    <option value="human" ${s.type === "human" ? "selected" : ""}>人間</option>
                    <option value="weak"  ${s.type === "cpu" && s.difficulty === "weak"   ? "selected" : ""}>CPU（弱）</option>
                    <option value="normal" ${s.type === "cpu" && s.difficulty === "normal" ? "selected" : ""}>CPU（普通）</option>
                    <option value="strong" ${s.type === "cpu" && s.difficulty === "strong" ? "selected" : ""}>CPU（強）</option>
                    <option value="expert" ${s.type === "cpu" && s.difficulty === "expert" ? "selected" : ""}>CPU（最強）</option>
                    <option value="rl" ${rlDisabled} ${s.type === "cpu" && s.difficulty === "rl" ? "selected" : ""}>AI（深層学習・ランダム）</option>
                </select>
            </div>
            ${s.type === "human" ? `
                <input
                    type="text"
                    maxlength="12"
                    class="text-input player-name-input"
                    placeholder="${defaultLocalPlayerName(i)}"
                    value="${escapeAttribute(s.name)}"
                    oninput="onChangePlayerName(${i}, this.value)"
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
        localStorage.removeItem('onlineSession');
        cpuScheduleToken++;
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
        SHOP_STOCK[card.name] = enabledCards.has(card.name) ? getInitialCardStock(card, playerCount) : 0;
    }

    // ターン順をランダムにシャッフル
    const order = playerSettings.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
    }

    // プレイヤー名とCPU設定をシャッフル順に再設定
    const shuffledCpuPlayers = [];
    for (let i = 0; i < playerCount; i++) {
        const originalIndex = order[i];
        const setting = playerSettings[originalIndex] || {};
        game.players[i].name = setting.type === "cpu"
            ? getLocalCpuLabel(setting.difficulty)
            : normalizeLocalPlayerName(setting.name, originalIndex);
        shuffledCpuPlayers.push(
            setting.type === "cpu"
                ? createCpuPlayer(setting.difficulty, { expertPurpose: "live", playerCount })
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
    }
    fallback();
    render();
    scheduleCPU();
}

function queueCPUStep(token, delay, fn) {
    setTimeout(() => {
        if (token !== cpuScheduleToken) return;
        fn();
    }, delay);
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
            cpuDo('selectDice', { useTwo, d1, d2, tunaDice }, () => game.selectDiceCount(useTwo, d1, d2, tunaDice));
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
            if (game.pendingTV > 0) {
                const targetIndex = cpu.chooseTVTarget(game);
                cpuDo('resolveTV', { targetIndex }, () => game.resolveTV(targetIndex));
            }
            if (game.pendingBusiness > 0) {
                const move = cpu.chooseBusinessMove(game);
                if (move) {
                    cpuDo('resolveBusiness', move,
                        () => game.resolveBusiness(move.myCard, move.targetIndex, move.theirCard));
                }
            }
            if (game.pendingCleaning > 0) {
                const cardName = cpu.chooseCleaningTarget(game);
                if (cardName) {
                    cpuDo('resolveCleaning', { cardName }, () => game.resolveCleaning(cardName));
                }
            }
            if (game.pendingMover > 0) {
                const move = cpu.chooseMoverMove(game);
                if (move) {
                    cpuDo('resolveMover', move, () => game.resolveMover(move.cardIndex, move.targetIndex));
                }
            }
            if (game.pendingRenovation > 0) {
                const landmarkName = cpu.chooseRenovationTarget(game);
                if (landmarkName) {
                    cpuDo('resolveRenovation', { landmarkName }, () => game.resolveRenovation(landmarkName));
                }
            }
        },
    },
    {
        name: "build",
        run(cpu) {
            if (game.phase !== GAME_PHASES.BUILD) return;
            cpu.build(game, SHOP_STOCK);
            render();
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
            step.run(cpu);
            runNextStep();
        });
    }

    runNextStep();
}

function onRoll() {
    playSound('dice');
    if (game.currentPlayer().landmarks[LANDMARK_NAMES.STATION]) {
        // 駅あり：アニメーションなしで即座に選択肢を表示
        game.rollDice(null, null);
        sendAction('rollDice', { forceDice: null, tunaDice: null });
        render();
        scheduleCPU();
    } else {
        // 駅なし：アニメーションあり
        updateDiceDisplay(null, true);
        setTimeout(() => {
            const forceDice = rollRandomDie();
            const tunaDice = [rollRandomDie(), rollRandomDie()];
            game.rollDice(forceDice, tunaDice);
            sendAction('rollDice', { forceDice, tunaDice });
            render();
            scheduleCPU();
        }, 600);
    }
}

function onSelectDiceCount(useTwo) {
    playSound('dice');
    updateDiceDisplay(null, true);
    setTimeout(() => {
        const d1 = rollRandomDie();
        const d2 = useTwo ? rollRandomDie() : 0;
        const tunaDice = [rollRandomDie(), rollRandomDie()];
        game.selectDiceCount(useTwo, d1, d2, tunaDice);
        sendAction('selectDice', { useTwo, d1, d2, tunaDice });
        render();
        scheduleCPU();
    }, 600);
}

function onReroll() {
    const forceDice = rollRandomDie();
    const tunaDice = [rollRandomDie(), rollRandomDie()];
    game.rerollDice(forceDice, tunaDice);
    sendAction('rerollDice', { forceDice, tunaDice });
    render();
    scheduleCPU();
}

function onSkipReroll() {
    game.skipReroll();
    sendAction('skipReroll');
    render();
    scheduleCPU();
}

function onResolveHarbor(useBonus) {
    game.resolveHarbor(useBonus);
    sendAction('resolveHarbor', { useBonus });
    render();
    scheduleCPU();
}

function onResolveTV(i) {
    game.resolveTV(i);
    sendAction('resolveTV', { targetIndex: i });
    render();
    scheduleCPU();
}

function onResolveBusiness(targetIndex) {
    const myCard = parseInt(document.getElementById("myCardSelect").value, 10);
    const theirCard = parseInt(document.getElementById(`theirCardSelect_${targetIndex}`).value, 10);
    game.resolveBusiness(myCard, targetIndex, theirCard);
    sendAction('resolveBusiness', { myCard, targetIndex, theirCard });
    render();
    scheduleCPU();
}

function onResolveCleaning(cardName) {
    game.resolveCleaning(cardName);
    sendAction('resolveCleaning', { cardName });
    render();
    scheduleCPU();
}

function onResolveMover(targetIndex) {
    const cardIndex = parseInt(document.getElementById("moverCardSelect").value, 10);
    game.resolveMover(cardIndex, targetIndex);
    sendAction('resolveMover', { cardIndex, targetIndex });
    render();
    scheduleCPU();
}

function onResolveRenovation(landmarkName) {
    game.resolveRenovation(landmarkName);
    sendAction('resolveRenovation', { landmarkName });
    render();
    scheduleCPU();
}

function onResolveIT(doSave) {
    game.resolveIT(doSave);
    sendAction('resolveIT', { doSave });
    render();
    scheduleCPU();
}

function onBuildCard(name) {
    const card = CARDS.find(c => c.name === name);
    if (!card) return;
    showConfirm(`${card.name}を建設しますか？\n💰 ${card.cost}コイン`, () => {
        saveUndoState();
        cancelAutoSkip();
        if (game.buildCard(card)) {
            SHOP_STOCK[name]--;
            sendAction('buildCard', { cardName: name });
            playSound('build');
        }
        render();
        scheduleCPU();
    });
}

function onBuildLandmark(name) {
    const cost = Player.landmarkCost(name);
    showConfirm(`${getLandmarkEmoji(name)} ${name}を建設しますか？\n💰 ${cost}コイン`, () => {
        saveUndoState();
        cancelAutoSkip();
        if (game.buildLandmark(name)) {
            sendAction('buildLandmark', { name });
            playSound('build');
        }
        render();
        scheduleCPU();
    });
}

function onSkip() {
    let msg;
    if (game.builtThisTurn) {
        msg = "建設完了・ターン終了しますか？";
    } else if (game.currentPlayer().landmarks[LANDMARK_NAMES.AIRPORT]) {
        msg = "建設せずにターン終了しますか？\n✈️ 空港効果で+10コイン獲得します";
    } else {
        msg = "建設せずにターン終了しますか？";
    }
    showConfirm(msg, () => {
        cancelAutoSkip();
        undoState = null;
        game.nextTurn();
        sendAction('nextTurn');
        render();
        scheduleCPU();
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
        SHOP_STOCK[card.name] > 0 &&
        current.coins >= card.cost &&
        card.cost > 0 &&
        !(card.color === "purple" && current.countCard(card.name) > 0)
    );
    const canAffordLandmark = Object.entries(current.landmarks)
        .some(([name, built]) =>
            enabledLandmarks.has(name) &&
            !built &&
            name !== LANDMARK_NAMES.YAKUSHO &&
            current.coins >= Player.landmarkCost(name)
        );

    if (!canAffordCard && !canAffordLandmark) {
        autoSkipPending = true;
        autoSkipTimeout = setTimeout(() => {
            autoSkipPending = false;
            autoSkipTimeout = null;
            if (game && game.phase === "build" && !game.builtThisTurn) {
                game.nextTurn();
                sendAction('nextTurn');
                render();
                scheduleCPU();
            }
        }, 1500);
    }
}

// 初期表示
initMainView();
