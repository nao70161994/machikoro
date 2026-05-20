const LOG_TYPE_DISPLAY = {
    [LOG_TYPES.DICE]:    { cls: "log-dice",    label: "ダイス" },
    [LOG_TYPES.GAIN]:    { cls: "log-gain",    label: "収入"   },
    [LOG_TYPES.LOSE]:    { cls: "log-lose",    label: "支払い" },
    [LOG_TYPES.BUILD]:   { cls: "log-build",   label: "建設"   },
    [LOG_TYPES.SPECIAL]: { cls: "log-special", label: "特殊"   },
    [LOG_TYPES.SYSTEM]:  { cls: "log-system",  label: "進行"   },
    [LOG_TYPES.ERROR]:   { cls: "log-error",   label: "エラー" },
};
let isUpdatingPendingModalContent = false;

function classifyLogEntry(entry) {
    return LOG_TYPE_DISPLAY[entry.type] || { cls: "log-system", label: "進行" };
}

function extractLogDetails(entry) {
    const detail = { actor: '', target: '', amount: '', subject: '' };
    if (!entry) return detail;
    const entry_msg = entry.message || entry;
    const amountMatch = entry_msg.match(/([+-]?\d+)コイン/);
    if (amountMatch) detail.amount = amountMatch[1];

    const actorPatterns = [
        /^(?:🌾|🏪|🐟|💸|🍸|🍽️|📰|🏛️)\s+([^の\s]+)の/,
        /^(?:📺|🚚)\s+([^か\s]+)から/,
        /^(?:🔄)\s+([^ ]+)/,
        /^(?:👤)\s+([^の]+)のターン/
    ];
    for (const pattern of actorPatterns) {
        const match = entry_msg.match(pattern);
        if (match) {
            detail.actor = match[1];
            break;
        }
    }

    const targetMatch = entry_msg.match(/(?:から|を)([^に\s]+)(?:に|の)?/);
    if (targetMatch && !detail.target) detail.target = targetMatch[1];

    const subjectPatterns = [
        /の([^発動\s]+)発動/,
        /^(?:🏗️|🔨|🚚|🧹|🍷|📺|🏢)\s*([^を⇔ ]+)/,
        /^(?:🌾|🏪|🐟|💸|🍸|🍽️)\s+[^の]+の([^発動\s]+)/
    ];
    for (const pattern of subjectPatterns) {
        const match = entry_msg.match(pattern);
        if (match) {
            detail.subject = match[1];
            break;
        }
    }
    return detail;
}

function renderLog() {
    const logEl = document.getElementById("log");
    const titleEl = document.getElementById("logTitle");
    const summaryEl = document.getElementById("logSummary");
    if (!logEl || !titleEl || !summaryEl) return;

    const cur = game.log || [];

    // ターン切り替えやリロール時に game.log がリセットされる
    if (cur.length < prevLogLength) {
        const isReroll = cur.length > 0 && cur[0]?.message?.startsWith("📡");
        if (!isReroll && fullLog.length > 0 && cur.length > 0) fullLog.push("__SEP__");
        fullLog.push(...cur);
    } else {
        fullLog.push(...cur.slice(prevLogLength));
    }
    prevLogLength = cur.length;

    // 最大件数を超えたら古いエントリを切り捨て
    const MAX_FULL_LOG = 300;
    if (fullLog.length > MAX_FULL_LOG) {
        fullLog = fullLog.slice(fullLog.length - MAX_FULL_LOG);
        while (fullLog.length > 0 && fullLog[0] === "__SEP__") fullLog.shift();
    }

    const entryCount = fullLog.filter(e => e !== "__SEP__").length;
    titleEl.textContent = `📋 ログ (${entryCount})`;

    // 最後の実エントリのインデックスを求める
    let lastEntryIdx = -1;
    for (let i = fullLog.length - 1; i >= 0; i--) {
        if (fullLog[i] !== "__SEP__") { lastEntryIdx = i; break; }
    }

    logEl.innerHTML = fullLog.map((entry, index) => {
        if (entry === "__SEP__") return `<div class="log-separator"></div>`;
        const { cls } = classifyLogEntry(entry);
        const latestCls = index === lastEntryIdx ? " log-latest" : "";
        return `<div class="log-item ${cls}${latestCls}">${escapeHtml(entry.message)}</div>`;
    }).join("");

    // サマリーは現在ターンのログのみ使用
    const recent = cur.slice(-8);
    const counts = { "収入": 0, "支払い": 0, "建設": 0, "特殊": 0, "ダイス": 0 };
    recent.forEach(entry => {
        const { label } = classifyLogEntry(entry);
        if (counts[label] !== undefined) counts[label]++;
    });
    const summaryParts = [];
    const latest = cur[cur.length - 1];
    if (latest) {
        summaryParts.push(`<span class="log-chip highlight">最新: ${escapeHtml(latest.message)}</span>`);
        const details = extractLogDetails(latest);
        const detailCards = [];
        if (details.actor) detailCards.push(`<span class="log-detail-card"><span class="log-detail-label">主体</span><span class="log-detail-value">${escapeHtml(details.actor)}</span></span>`);
        if (details.subject) detailCards.push(`<span class="log-detail-card"><span class="log-detail-label">対象カード</span><span class="log-detail-value">${escapeHtml(details.subject)}</span></span>`);
        if (details.target) detailCards.push(`<span class="log-detail-card"><span class="log-detail-label">相手/対象</span><span class="log-detail-value">${escapeHtml(details.target)}</span></span>`);
        if (details.amount) {
            const amountText = `${details.amount.startsWith('-') ? '' : '+'}${details.amount}コイン`;
            detailCards.push(`<span class="log-detail-card"><span class="log-detail-label">コイン変動</span><span class="log-detail-value">${escapeHtml(amountText)}</span></span>`);
        }
        if (detailCards.length > 0) summaryParts.push(`<div class="log-detail-row">${detailCards.join("")}</div>`);
    } else {
        summaryParts.push(`<span class="log-chip">ログはまだありません</span>`);
    }
    Object.entries(counts).forEach(([label, count]) => {
        if (count > 0) summaryParts.push(`<span class="log-chip">${label} ${count}</span>`);
    });
    summaryEl.innerHTML = summaryParts.join("");
    logEl.scrollTop = logEl.scrollHeight;
}

function getTutorialHints(current) {
    const affordableCards = CARDS.filter(card =>
        SHOP_STOCK[card.name] > 0 &&
        current.coins >= card.cost &&
        !(card.color === "purple" && current.countCardIncludingDormant(card.name) > 0)
    ).sort((a, b) => a.cost - b.cost);
    const affordableLandmarks = Object.entries(current.landmarks)
        .filter(([name, built]) =>
            enabledLandmarks.has(name) &&
            !built &&
            name !== LANDMARK_NAMES.YAKUSHO &&
            current.coins >= Player.landmarkCost(name)
        )
        .sort((a, b) => Player.landmarkCost(a[0]) - Player.landmarkCost(b[0]));
    return { affordableCards, affordableLandmarks };
}

function getTutorialMessage() {
    if (!game) return { title: "", body: "", tags: [] };
    const current = game.currentPlayer();
    const isMyTurn = !isOnlineGame || game.currentPlayerIndex === myPlayerIndex;
    const isCPUTurn = cpuPlayers[game.currentPlayerIndex] !== null;
    const levelText = tutorialLevel === 'advanced' ? '上級者向け' : '初心者向け';
    if (!isMyTurn) {
        return {
            title: `${levelText}ガイド`,
            body: tutorialLevel === 'advanced'
                ? `${current.name}の操作待ちです。相手の次ターン購入圏と、現在のログから発動帯の偏りを確認してください。`
                : `${current.name}の操作待ちです。ログと盤面を見ながら次の購入候補を確認してください。`,
            tags: [current.name, '待機中']
        };
    }
    if (isCPUTurn) return { title: `${levelText}ガイド`, body: `${current.name}はCPUです。処理が終わるまで待ちます。ログで収入差を確認してください。`, tags: ['CPUターン'] };
    if (game.phase === GAME_PHASES.ROLL) return { title: `${levelText}ガイド`, body: tutorialLevel === 'advanced' ? "サイコロ前です。自分の発動帯と相手の赤カード帯を見て、今回は安全重視か上振れ狙いかを決めます。" : "サイコロを振って収入処理を開始します。赤・青・緑・紫の順に効果が解決されます。", tags: ['サイコロ前', `所持 ${current.coins}コイン`] };
    if (game.phase === GAME_PHASES.SELECT_DICE) return { title: `${levelText}ガイド`, body: tutorialLevel === 'advanced' ? "駅の選択です。2個は高コスト緑や港・遊園地と相性が良い一方、赤カード帯にも入りやすくなります。" : "駅の効果です。1個なら安全、2個なら高い出目や港・遊園地を狙えます。", tags: ['駅', '1個/2個選択'] };
    if (game.phase === GAME_PHASES.REROLL_CONFIRM) return { title: `${levelText}ガイド`, body: tutorialLevel === 'advanced' ? `電波塔です。現在 ${game.lastDiceResult}。自分の緑紫発動と相手の赤発動の損得差で判断します。` : `電波塔の効果です。現在の出目 ${game.lastDiceResult} を使うか、振り直すか決めてください。`, tags: ['電波塔', `現在 ${game.lastDiceResult}`] };
    if (game.phase === GAME_PHASES.HARBOR_CHOICE) return { title: `${levelText}ガイド`, body: tutorialLevel === 'advanced' ? `港の選択です。合計 ${game.lastDiceResult} を ${game.lastDiceResult + 2} に寄せることで、発動する青緑赤の帯がどう変わるか確認します。` : `港の効果です。合計 ${game.lastDiceResult} に +2 して有利な発動帯へ寄せられるか確認してください。`, tags: ['港', `候補 ${game.lastDiceResult}/${game.lastDiceResult + 2}`] };
    if (game.pendingTV > 0) return { title: `${levelText}ガイド`, body: tutorialLevel === 'advanced' ? "テレビ局です。最多所持コインだけでなく、次ターンに大型建設へ届く相手を崩すと効果的です。" : "テレビ局です。所持コインが多い相手を選ぶと効率が高いです。", tags: ['テレビ局'] };
    if (game.pendingBusiness > 0) return { title: `${levelText}ガイド`, body: tutorialLevel === 'advanced' ? "ビジネスセンターです。休業中カードを押し付けるか、高コスト施設を奪うかで盤面差を作れます。" : "ビジネスセンターです。同名カードでも個別に選べます。休業中カードを渡すかも含めて選んでください。", tags: ['ビジネスセンター', '個別選択'] };
    if (game.pendingCleaning > 0) return { title: `${levelText}ガイド`, body: tutorialLevel === 'advanced' ? "清掃業です。枚数が多い施設名を止めると収入差を広げやすいです。次の出目帯も意識してください。" : "清掃業です。選んだ名前の施設は全員分まとめて休業になります。枚数が多い施設を狙うと得です。", tags: ['清掃業'] };
    if (game.pendingMover > 0) return { title: `${levelText}ガイド`, body: tutorialLevel === 'advanced' ? "引越し屋です。低効率施設や休業中施設を渡して+4しつつ、相手の次ターン期待値を調整できます。" : "引越し屋です。休業中カードも渡せます。渡した先でも休業状態はそのまま残ります。", tags: ['引越し屋', '+4コイン'] };
    if (game.pendingRenovation > 0) return { title: `${levelText}ガイド`, body: tutorialLevel === 'advanced' ? "改装屋です。建て直し優先度の低いランドマークを戻して、今ターンの購入効率を優先します。" : "改装屋です。今すぐ8コインが欲しいときに、優先度の低いランドマークを戻します。", tags: ['改装屋', '+8コイン'] };
    if (game.pendingIT) return { title: `${levelText}ガイド`, body: tutorialLevel === 'advanced' ? "ITベンチャーです。奪取予定人数と次巡の安全性を見て、積立を厚くするか判断します。" : "ITベンチャーです。1コイン積み立てると、次回以降の奪取額が増えます。", tags: ['ITベンチャー'] };
    if (game.phase === GAME_PHASES.BUILD) {
        if (game.builtThisTurn) return { title: `${levelText}ガイド`, body: tutorialLevel === 'advanced' ? "建設済みです。ログ要約を見て、このターンの収支が狙い通りだったか確認してから終了します。" : "このターンの建設は終わっています。問題なければターン終了してください。", tags: ['建設済み'] };
        const { affordableCards, affordableLandmarks } = getTutorialHints(current);
        if (!affordableCards.length && !affordableLandmarks.length) {
            return { title: `${levelText}ガイド`, body: tutorialLevel === 'advanced' ? "建設不可です。次に欲しい帯の施設を決め、相手の赤カードを踏みにくい出目戦略を意識します。" : "今の所持コインでは建設できません。建設せずにターン終了して次の収入を狙います。", tags: ['建設不可'] };
        }
        const hints = [];
        if (affordableCards[0]) hints.push(`施設 ${affordableCards[0].name}（${affordableCards[0].cost}コイン）`);
        if (affordableLandmarks[0]) hints.push(`ランドマーク ${affordableLandmarks[0][0]}（${Player.landmarkCost(affordableLandmarks[0][0])}コイン）`);
        return {
            title: `${levelText}ガイド`,
            body: tutorialLevel === 'advanced'
                ? `建設フェーズです。最安候補は ${hints.join(" / ")} です。直近ログで伸びた帯をさらに太らせるか、弱い帯を補うかで選びます。`
                : `建設フェーズです。${hints.join("、")} が候補です。ログを見て不足している収入帯を補ってください。`,
            tags: [`所持 ${current.coins}コイン`, `候補 ${affordableCards.length + affordableLandmarks.length}件`]
        };
    }
    return { title: `${levelText}ガイド`, body: "盤面を確認して次の行動を選んでください。", tags: [] };
}

function renderTutorial() {
    syncTutorialControls();
    const box = document.getElementById("tutorialBox");
    if (!box) return;
    if (!tutorialEnabled || !game || game.checkWinner()) {
        box.style.display = "none";
        box.innerHTML = "";
        return;
    }
    const message = getTutorialMessage();
    box.style.display = "block";
    box.innerHTML = `
        <div class="tutorial-title">${escapeHtml(message.title || "GUIDE")}</div>
        <div class="tutorial-body">${escapeHtml(message.body || "")}</div>
        ${message.tags && message.tags.length ? `<div class="tutorial-meta">${message.tags.map(tag => `<span class="tutorial-tag">${escapeHtml(tag)}</span>`).join("")}</div>` : ""}
    `;
}

function setTutorialEnabled(enabled) {
    tutorialEnabled = !!enabled;
    try {
        localStorage.setItem('tutorialEnabled', tutorialEnabled ? 'true' : 'false');
    } catch (e) {}
    syncTutorialControls();
    renderTutorial();
}

function onToggleTutorial(enabled) {
    setTutorialEnabled(enabled);
}

function toggleTutorial() {
    setTutorialEnabled(!tutorialEnabled);
}

function onChangeTutorialLevel(level) {
    tutorialLevel = level === 'advanced' ? 'advanced' : 'beginner';
    try {
        localStorage.setItem('tutorialLevel', tutorialLevel);
    } catch (e) {}
    syncTutorialControls();
    renderTutorial();
}

function cycleTutorialLevel() {
    onChangeTutorialLevel(tutorialLevel === 'beginner' ? 'advanced' : 'beginner');
}

function syncTutorialControls() {
    const checkbox = document.getElementById("tutorialEnabled");
    if (checkbox) checkbox.checked = tutorialEnabled;
    const select = document.getElementById("tutorialLevel");
    if (select) select.value = tutorialLevel;
    const btn = document.getElementById("btnTutorialToggle");
    if (btn) {
        btn.textContent = tutorialEnabled ? "💡 ガイド ON" : "💡 ガイド OFF";
        btn.classList.toggle("active", tutorialEnabled);
    }
    const levelBtn = document.getElementById("btnTutorialLevel");
    if (levelBtn) {
        levelBtn.textContent = tutorialLevel === 'advanced' ? "🧠 上級者" : "🌱 初心者";
        levelBtn.classList.toggle("active", tutorialEnabled);
    }
}

function render() {
    try {
        _render();
    } catch (err) {
        if (typeof showCrashScreen === 'function') showCrashScreen(err);
    }
}

function _render() {
    if (!game) return;
    const current = game.currentPlayer();
    const winner = game.checkWinner();
    syncTutorialControls();

    if (winner) {
        renderWinnerState(winner);
        return;
    }

    renderActiveGameState(current);
    persistAfterRender();
}

function renderWinnerState(winner) {
    const winnerIdx = game.players.indexOf(winner);
    const isCPUWinner = cpuPlayers[winnerIdx] !== null;
    if (!winSoundPlayed) {
        if (winner.name === lastWinnerName) winStreak++;
        else { winStreak = 1; lastWinnerName = winner.name; }
        localStorage.setItem('winStreak', winStreak);
        localStorage.setItem('lastWinnerName', lastWinnerName);
    }
    const scoreRows = game.players.slice().sort((a, b) => b.coins - a.coins).map(p => {
        const isW = p === winner;
        return `<div class="winner-stats-row ${isW ? 'highlight' : ''}"><span>${isW ? '🏆 ' : ''}${escapeHtml(p.name)}</span><span>🪙 ${p.coins}</span></div>`;
    }).join('');
    const streakHtml = winStreak >= 2 ? `<div class="win-streak">🔥 ${escapeHtml(winner.name)} ${winStreak}連勝中！</div>` : '';
    let resultAdSlot = '';
    try {
        resultAdSlot = typeof renderAdSlot === 'function' ? renderAdSlot('result-bottom') : '';
    } catch (error) {
        resultAdSlot = '';
    }
    document.getElementById("status").innerHTML = `<div class="winner-screen"><div class="winner-emoji">🏆</div><div class="winner-title">${escapeHtml(winner.name)}の勝利！</div><div class="winner-sub">${isCPUWinner ? '🤖 CPU' : '👤 人間'}プレイヤーが勝ちました　${game.turnCount}ターン</div>${streakHtml}<div class="winner-stats">${scoreRows}</div>${resultAdSlot}</div>`;
    if (!winSoundPlayed) { winSoundPlayed = true; playSound('win'); recordGameStats(winner, game, cpuPlayers); }
    localStorage.removeItem('savedGame');
    localStorage.removeItem('onlineSession');
    updateResumeButton();
    startConfetti();
    document.getElementById("btnRoll").disabled = true;
    const btnSkip = document.getElementById("btnSkip");
    btnSkip.disabled = true;
    btnSkip.textContent = "建設しないでターン終了";
    document.getElementById("btnReroll").style.display = "none";
    document.getElementById("diceChoose").innerHTML = "";
    document.getElementById("buildMenu").innerHTML = "";
    renderTutorial();
    renderLog();
    renderPlayers();
}

function renderActiveGameState(current) {
    document.getElementById("status").textContent = `👤 ${current.name}のターン　🪙 ${current.coins}コイン`;
    const isCPUTurn = cpuPlayers[game.currentPlayerIndex] !== null;
    if (game.phase === GAME_PHASES.ROLL && game.currentPlayerIndex !== prevPlayerIndex) {
        if (prevPlayerIndex !== -1 && !isReplaying) showTurnAnnouncer(current.name, isCPUTurn);
        prevPlayerIndex = game.currentPlayerIndex;
    }
    const isMyTurn = !isOnlineGame || game.currentPlayerIndex === myPlayerIndex;
    document.getElementById("btnRoll").disabled = game.phase !== GAME_PHASES.ROLL || isCPUTurn || !isMyTurn;
    const btnSkip = document.getElementById("btnSkip");
    btnSkip.disabled = game.phase !== GAME_PHASES.BUILD || isCPUTurn || game.pendingRenovation > 0 || !isMyTurn;
    btnSkip.textContent = game.builtThisTurn ? "建設完了・ターン終了" : "建設しないでターン終了";
    document.getElementById("btnReroll").style.display = "none";

    if (game.lastDice1 > 0 && game.lastDice2 > 0) updateDiceDisplay([game.lastDice1, game.lastDice2]);
    else if (game.lastDiceResult > 0) updateDiceDisplay([game.lastDiceResult]);
    else updateDiceDisplay(null);

    renderDiceChoose();
    renderPending();
    renderTutorial();
    renderLog();
    renderPlayers();

    if (prevCoins) {
        game.players.forEach((p, i) => {
            const diff = p.coins - prevCoins[i];
            if (diff !== 0) showCoinAnimation(i, diff);
        });
    }
    prevCoins = game.players.map(p => p.coins);
    renderBuildMenu();
    checkAutoSkip();
}

function persistAfterRender() {
    saveGameState();
}

function renderDiceChoose() {
    const el = document.getElementById("diceChoose");
    if (!el) return;
    const isMyTurn = !isOnlineGame || game.currentPlayerIndex === myPlayerIndex;
    if (!isMyTurn) { el.innerHTML = ""; return; }
    if (game.phase === GAME_PHASES.SELECT_DICE) {
        el.innerHTML = `<div class="dice-choose"><p>🚉 駅：何個振りますか？</p><button data-action="selectDiceCount" data-use-two="false">🎲 1個</button><button data-action="selectDiceCount" data-use-two="true">🎲🎲 2個（合計を使う）</button></div>`;
        return;
    }
    if (game.phase === GAME_PHASES.REROLL_CONFIRM) {
        el.innerHTML = `<div class="dice-choose"><p>📡 電波塔：🎲${game.lastDiceResult} を振り直しますか？</p><button data-action="rerollDice">振り直す</button><button data-action="skipReroll">このまま使う</button></div>`;
        return;
    }
    if (game.phase === GAME_PHASES.HARBOR_CHOICE) {
        el.innerHTML = `<div class="dice-choose"><p>⚓ 港効果：合計${game.lastDiceResult}に+2しますか？</p><button data-action="resolveHarbor" data-use-bonus="true">+2する（→${game.lastDiceResult + 2}）</button><button data-action="resolveHarbor" data-use-bonus="false">そのまま使う（${game.lastDiceResult}）</button></div>`;
        return;
    }
    el.innerHTML = "";
}

function shouldShowPendingForCurrentPlayer() {
    if (game.phase !== GAME_PHASES.PENDING && !game.pendingIT && game.pendingRenovation <= 0) return false;
    const isCPUTurn = cpuPlayers[game.currentPlayerIndex] !== null;
    return (!isOnlineGame && !isCPUTurn) || (isOnlineGame && game.currentPlayerIndex === myPlayerIndex);
}

function updatePendingModalContent(el, modal, html) {
    if (!el || !modal) return false;
    if (isUpdatingPendingModalContent) return false;
    isUpdatingPendingModalContent = true;
    try {
        const nextHtml = html || "";
        if (el.innerHTML !== nextHtml) el.innerHTML = nextHtml;
        if (modal.style) modal.style.display = nextHtml ? "flex" : "none";
        return true;
    } finally {
        isUpdatingPendingModalContent = false;
    }
}

function hidePendingModalContent(el, modal) {
    updatePendingModalContent(el, modal, "");
}

function renderPending() {
    const el = document.getElementById("pendingMenu");
    const modal = document.getElementById("pendingModal");
    if (!shouldShowPendingForCurrentPlayer()) { hidePendingModalContent(el, modal); return; }
    let html = "";
    const inspectHint = `<p class="pending-inspect-hint">盤面確認中もこのパネルは開いたままです。カード名を押すと詳細を見られます。</p>`;
    if (game.pendingTV > 0) {
        const others = game.players.map((p, i) => ({ p, i })).filter(({ i }) => i !== game.currentPlayerIndex);
        html += `<div class="pending-box"><p>📺 テレビ局：コインを奪う相手を選んでください</p>${inspectHint}${others.map(({ p, i }) => `<button data-action="resolveTV" data-target-index="${i}">${escapeHtml(p.name)}（🪙${p.coins}）</button>`).join("")}</div>`;
    }
    if (game.pendingBusiness > 0) {
        const current = game.currentPlayer();
        const myCards = current.getMinorCards().map(card => ({ card, index: current.cards.indexOf(card) }));
        const others = game.players.map((p, i) => ({ p, i })).filter(({ i }) => i !== game.currentPlayerIndex);
        const myDefaultIdx = myCards[0]?.index ?? 0;
        const myChips = myCards.map(({ card, index }, j) =>
            `<button class="bc-chip${j === 0 ? ' selected' : ''}" data-action="selectBusinessCard" data-idx="${index}" data-input-id="myCardSelect">${escapeHtml(card.name)}${current.isDormant(card) ? ' 💤' : ''}</button>`
        ).join("");
        const othersHtml = others.map(({ p, i }) => {
            const theirCards = p.getMinorCards().map(card => ({ card, index: p.cards.indexOf(card) }));
            const theirDefaultIdx = theirCards[0]?.index ?? 0;
            const theirChips = theirCards.map(({ card, index }, j) =>
                `<button class="bc-chip${j === 0 ? ' selected' : ''}" data-action="selectBusinessCard" data-idx="${index}" data-input-id="theirCardSelect_${i}">${escapeHtml(card.name)}${p.isDormant(card) ? ' 💤' : ''}</button>`
            ).join("");
            return `<p class="bc-label">${escapeHtml(p.name)}の施設：</p><div class="bc-chip-group">${theirChips}</div><input type="hidden" id="theirCardSelect_${i}" value="${theirDefaultIdx}"><button class="bc-exchange-btn" data-action="resolveBusiness" data-target-index="${i}">⇄ ${escapeHtml(p.name)}と交換</button>`;
        }).join("");
        html += `<div class="pending-box"><p>🏢 ビジネスセンター：施設を交換します</p><p class="bc-label">自分の施設：</p><div class="bc-chip-group">${myChips}</div><input type="hidden" id="myCardSelect" value="${myDefaultIdx}">${othersHtml}</div>`;
    }
    if (game.pendingCleaning > 0) {
        const allCardNames = [...new Set(game.players.flatMap(p => p.getMinorCards().filter(c => !p.isDormant(c)).map(c => c.name)))];
        html += `<div class="pending-box"><p>🧹 清掃業：休業にする施設を選んでください</p>${allCardNames.map(name => `<button data-action="resolveCleaning" data-card-name="${escapeHtml(name)}">${escapeHtml(name)}</button>`).join("")}</div>`;
    }
    if (game.pendingMover > 0) {
        const current = game.currentPlayer();
        const myCards = current.getMinorCards().map(card => ({ card, index: current.cards.indexOf(card) }));
        const others = game.players.map((p, i) => ({ p, i })).filter(({ i }) => i !== game.currentPlayerIndex);
        html += `<div class="pending-box"><p>🚚 引越し屋：渡す施設と相手を選んでください</p><p>渡す施設：</p><select id="moverCardSelect">${myCards.map(({ card, index }) => `<option value="${index}">${escapeHtml(card.name)}${current.isDormant(card) ? '（休業中）' : ''}</option>`).join("")}</select>${others.map(({ p, i }) => `<button data-action="resolveMover" data-target-index="${i}">${escapeHtml(p.name)}に渡す</button>`).join("")}</div>`;
    }
    if (game.pendingRenovation > 0) {
        const current = game.currentPlayer();
        const builtLandmarks = Object.entries(current.landmarks).filter(([name, built]) => built && name !== LANDMARK_NAMES.YAKUSHO).map(([name]) => name);
        html += `<div class="pending-box"><p>🔨 改装屋：取り壊すランドマークを選んでください（+8コイン）</p>${builtLandmarks.length > 0 ? builtLandmarks.map(name => `<button data-action="resolveRenovation" data-landmark-name="${escapeHtml(name)}">${escapeHtml(name)}</button>`).join("") : "<p>建設済みのランドマークがありません</p>"}</div>`;
    }
    if (game.pendingIT) {
        const cur = game.currentPlayer();
        const canSave = cur.coins >= 1;
        html += `<div class="pending-box"><p>💻 ITベンチャー：1コイン積立しますか？</p><p>現在の積立：${cur.itVentureCoins}コイン　所持：🪙${cur.coins}</p><button data-action="resolveIT" data-do-save="true" ${canSave ? "" : "disabled"}>積立する（→積立${cur.itVentureCoins + 1}コイン）</button><button data-action="resolveIT" data-do-save="false">スキップ</button></div>`;
    }
    updatePendingModalContent(el, modal, html);
}

function renderPlayers() {
    const html = game.players.map((p, idx) => {
        const isActive = idx === game.currentPlayerIndex;
        const isCPU = cpuPlayers[idx] !== null;
        const cpuLabel = isCPU ? `🤖${cpuPlayers[idx].difficulty === 'weak' ? '弱' : cpuPlayers[idx].difficulty === 'normal' ? '普' : cpuPlayers[idx].difficulty === 'strong' ? '強' : cpuPlayers[idx].difficulty === 'rl' ? '深' : 'AI'}` : '👤';
        const landmarks = Object.entries(p.landmarks)
            .filter(([name]) => enabledLandmarks.has(name))
            .map(([name, built]) => `<span class="landmark-badge ${built ? 'built' : ''}">${getLandmarkEmoji(name)} ${name}</span>`)
            .join("");
        const cards = {};
        for (const c of p.cards) {
            if (!cards[c.name]) cards[c.name] = { count: 0, dormant: 0, color: c.color };
            cards[c.name].count++;
            if (p.isDormant(c)) cards[c.name].dormant++;
        }
        const colorDot = { blue: "#3b82f6", green: "#22c55e", red: "#ef4444", purple: "#a855f7" };
        const cardHtml = Object.entries(cards).sort(([a], [b]) => compareCardNamesForDisplay(a, b)).map(([name, info]) => {
            const dormantText = info.dormant > 0 ? `（休${info.dormant}）` : '';
            const safeName = escapeHtml(name);
            return `<button type="button" class="card-badge" style="border-left:2px solid ${colorDot[info.color]}" data-action="showCardDetail" data-card-name="${safeName}">${safeName}×${info.count}${dormantText}</button>`;
        }).join("");
        const itCoins = p.itVentureCoins > 0 ? `<span class="it-badge">💻${p.itVentureCoins}</span>` : "";
        const loanCount = p.cards.filter(c => c.effect === CARD_EFFECTS.LOAN).length;
        const loanBadge = loanCount > 0 ? `<span class="loan-badge">💳×${loanCount}</span>` : "";
        return `<div class="player-box ${isActive ? 'active' : ''}"><div class="player-header"><div class="player-name-row"><span class="player-icon">${cpuLabel}</span><span class="player-name">${isActive ? '▶ ' : ''}${escapeHtml(p.name)}</span></div><div class="player-coin-row"><span class="player-coins">🪙 ${p.coins}</span>${itCoins}${loanBadge}</div></div><div class="player-landmarks">${landmarks}</div><div class="player-cards">${cardHtml}</div></div>`;
    }).join("");
    document.getElementById("players").innerHTML = html;
}

function getEffectText(card) {
    const fn = CARD_EFFECT_DESCRIPTIONS[card.effect];
    if (fn) return fn(card.income);
    if (card.color === "red") return "相手から" + card.income + "コイン奪う";
    return "+" + card.income + "コイン";
}

function getLandmarkEffectText(name) {
    return (Player._LANDMARK_DEFS.find(d => d.name === name) || {}).effect || "";
}

function getLandmarkEmoji(name) {
    if (name === LANDMARK_NAMES.YAKUSHO) return "🏛️";
    return (Player._LANDMARK_DEFS.find(d => d.name === name) || {}).emoji || "🏛️";
}

function renderBuildCardButton(card, stock, canBuildThis) {
    const safeName = escapeHtml(card.name);
    return `<div class="card-wrapper"><button class="card-btn card-color-${card.color} ${canBuildThis ? 'can-afford' : ''}" data-action="buildCard" data-card-name="${safeName}" ${canBuildThis ? "" : "disabled"}><div class="card-top-strip"><span class="card-dice-num">🎲 ${card.diceNums.join("・")}</span><span class="card-category-tag">${escapeHtml(card.category)}</span></div><div class="card-body"><div class="card-btn-top"><span class="card-name">${safeName}</span><span class="card-cost">💰${card.cost}</span></div><div class="card-effect">${getEffectText(card)}</div></div><div class="card-footer">残り${stock}枚</div></button><button class="card-detail-btn" data-action="showCardDetail" data-card-name="${safeName}">ℹ</button></div>`;
}

function renderLandmarkBuildButton(name, built, cost, canBuildThis) {
    const safeName = escapeHtml(name);
    return `<div class="card-wrapper"><button class="card-btn card-color-landmark ${canBuildThis ? 'can-afford' : ''}" data-action="buildLandmark" data-landmark-name="${safeName}" ${canBuildThis ? "" : "disabled"}><div class="card-top-strip"><span class="card-dice-num">${getLandmarkEmoji(name)}</span><span class="card-category-tag">ランドマーク</span></div><div class="card-body"><div class="card-btn-top"><span class="card-name">${safeName}</span><span class="card-cost">${built ? "✅済" : "💰" + cost}</span></div><div class="card-effect">${getLandmarkEffectText(name)}</div></div></button><button class="card-detail-btn" data-action="showLandmarkDetail" data-landmark-name="${safeName}">ℹ</button></div>`;
}

function renderBuildMenu() {
    const buildMenu = document.getElementById("buildMenu");
    if (!buildMenu || !game) return;
    const current = game.currentPlayer();
    const isMyTurn = !isOnlineGame || game.currentPlayerIndex === myPlayerIndex;
    const isCPUTurn = cpuPlayers[game.currentPlayerIndex] !== null;
    const canBuild = game.phase === GAME_PHASES.BUILD && isMyTurn && !isCPUTurn && game.pendingRenovation <= 0 && !game.builtThisTurn;
    const sortedCards = [...CARDS].sort(compareCardsForDisplay);
    const filterDefs = [['', '全て'], ['blue', '青'], ['green', '緑'], ['red', '赤'], ['purple', '紫']];
    const filterBtnsHtml = filterDefs.map(([c, label]) =>
        `<button class="card-filter-btn${cardFilter === c ? ' active' : ''}" data-action="setCardFilter" data-card-filter="${c}">${label}</button>`
    ).join('');
    const visibleCards = cardFilter ? sortedCards.filter(c => c.color === cardFilter) : sortedCards;
    const cardHtml = visibleCards.map(card => {
        const stock = SHOP_STOCK[card.name];
        if (stock <= 0) return "";
        const canBuildThis = canBuild && current.coins >= card.cost && !(card.color === "purple" && current.countCardIncludingDormant(card.name) > 0);
        return renderBuildCardButton(card, stock, canBuildThis);
    }).join("");
    const landmarkHtml = Object.entries(current.landmarks).filter(([name]) => enabledLandmarks.has(name)).map(([name, built]) => {
        const cost = Player.landmarkCost(name);
        const canBuildThis = canBuild && !built && current.coins >= cost;
        return renderLandmarkBuildButton(name, built, cost, canBuildThis);
    }).join("");
    const undoBtn = (undoState && game.builtThisTurn && isMyTurn && !isCPUTurn) ? `<button class="undo-btn" data-action="undoBuild">↩ 建設を取り消す</button>` : '';
    buildMenu.innerHTML = `<h3>🏗️ ${canBuild ? "建設する施設を選んでください" : "施設一覧"}</h3>${undoBtn}<div class="build-section"><h4>施設カード</h4><div class="card-filter-bar">${filterBtnsHtml}</div><div class="card-grid">${cardHtml}</div></div><div class="build-section"><h4>ランドマーク</h4><div class="card-grid">${landmarkHtml}</div></div>`;
}

function setCardFilter(color) {
    cardFilter = color;
    renderBuildMenu();
}

function bcSelectCard(btn, inputId) {
    if (!btn) return false;
    const group = typeof btn.closest === 'function' ? btn.closest('.bc-chip-group') : null;
    if (group && typeof group.querySelectorAll === 'function') group.querySelectorAll('.bc-chip').forEach(b => b.classList.remove('selected'));
    if (btn.classList && typeof btn.classList.add === 'function') btn.classList.add('selected');
    const input = document.getElementById(inputId);
    if (!input) return false;
    input.value = btn.dataset?.idx ?? '';
    return true;
}

function showTurnAnnouncer(name, isCPU) {
    const el = document.getElementById("turnAnnouncer");
    const text = document.getElementById("turnAnnouncerText");
    if (!el || !text) return;
    if (announcerTimer) { clearTimeout(announcerTimer); announcerTimer = null; }
    el.classList.remove("hiding");
    el.style.display = "flex";
    text.textContent = `${isCPU ? "🤖" : "👤"} ${name} のターン`;
    announcerTimer = setTimeout(() => {
        el.classList.add("hiding");
        announcerTimer = setTimeout(() => {
            el.style.display = "none";
            el.classList.remove("hiding");
            announcerTimer = null;
        }, 400);
    }, 1300);
}

function switchTab(tab) {
    document.getElementById("tabContentLocal").style.display  = tab === "local"   ? "flex"  : "none";
    document.getElementById("tabContentOnline").style.display = tab === "online"  ? "flex"  : "none";
    document.getElementById("tabContentStats").style.display  = tab === "stats"   ? "block" : "none";
    document.getElementById("tabLocal").className  = `tab-btn ${tab === "local"  ? "active" : ""}`;
    document.getElementById("tabOnline").className = `tab-btn ${tab === "online" ? "active" : ""}`;
    document.getElementById("tabStats").className  = `tab-btn ${tab === "stats"  ? "active" : ""}`;
    if (tab === "stats") renderStats();
}

function switchOnlineTab(tab) {
    document.getElementById("onlineCreate").style.display = tab === "create" ? "block" : "none";
    document.getElementById("onlineJoin").style.display = tab === "join" ? "block" : "none";
    document.getElementById("onlineTabCreate").className = `online-tab-btn ${tab === "create" ? "active" : ""}`;
    document.getElementById("onlineTabJoin").className = `online-tab-btn ${tab === "join" ? "active" : ""}`;
}

function showRules() {
    openAccessibleModal("rulesModal");
}

function closeRules() {
    closeAccessibleModal("rulesModal");
}

const CARD_SETS = {
    basic: ["麦畑","牧場","パン屋","カフェ","コンビニ","森林","スタジアム","チーズ工場","家具工場","鉱山","ファミレス","リンゴ園","青果市場","テレビ局","ビジネスセンター"],
    plus: ["花畑","サンマ漁船","マグロ漁船","フラワーショップ","食品倉庫","寿司屋","ピザ屋","バーガーショップ","出版社","税務署"],
    sharp: ["コーン畑","ブドウ園","雑貨屋","改装屋","貸金業","ワイナリー","引越し屋","ドリンク工場","高級フレンチ","会員制BAR","清掃業","ITベンチャー","公園"],
};

let enabledCards = new Set(CARDS.map(c => c.name));
let enabledLandmarks = new Set(Player.landmarkNames());
let fullLog = [];
let prevLogLength = 0;
let prevPlayerIndex = -1;
let announcerTimer = null;
let cardFilter = '';
let activeModalId = null;
let lastModalFocus = null;
let noticeTimer = null;

const MODAL_CLOSE_HANDLERS = Object.freeze({
    rulesModal: closeRules,
    cardSelectModal: closeCardSelect,
    cardDetailModal: closeCardDetail,
    confirmModal: () => closeConfirmModal(false),
});

const CARD_COLOR_ORDER = Object.freeze({ blue: 0, green: 1, red: 2, purple: 3 });

function compareCardsForDisplay(a, b) {
    const colorDiff = (CARD_COLOR_ORDER[a.color] ?? 9) - (CARD_COLOR_ORDER[b.color] ?? 9);
    if (colorDiff !== 0) return colorDiff;
    const diceDiff = Math.min(...a.diceNums) - Math.min(...b.diceNums);
    if (diceDiff !== 0) return diceDiff;
    const costDiff = a.cost - b.cost;
    if (costDiff !== 0) return costDiff;
    return a.name.localeCompare(b.name, 'ja');
}

function compareCardNamesForDisplay(a, b) {
    const cardA = CARDS.find(card => card.name === a);
    const cardB = CARDS.find(card => card.name === b);
    if (cardA && cardB) return compareCardsForDisplay(cardA, cardB);
    if (cardA) return -1;
    if (cardB) return 1;
    return a.localeCompare(b, 'ja');
}

function resetFullLog() { fullLog = []; prevLogLength = 0; prevPlayerIndex = -1; cardFilter = ''; }

function getFocusableElements(root) {
    if (!root || typeof root.querySelectorAll !== 'function') return [];
    return Array.from(root.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
        .filter(el => !el.disabled && el.getAttribute('aria-hidden') !== 'true');
}

function focusModal(modal) {
    const focusable = getFocusableElements(modal);
    const target = focusable[0] || modal;
    if (target && typeof target.focus === 'function') target.focus();
}

function openAccessibleModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    if (typeof document !== 'undefined') lastModalFocus = document.activeElement || lastModalFocus;
    activeModalId = id;
    modal.style.display = 'flex';
    if (typeof modal.setAttribute === 'function') {
        modal.setAttribute('role', modal.getAttribute('role') || 'dialog');
        modal.setAttribute('aria-modal', 'true');
    }
    setTimeout(() => focusModal(modal), 0);
}

function closeAccessibleModal(id, options = {}) {
    const modal = document.getElementById(id);
    if (modal) modal.style.display = 'none';
    if (activeModalId === id) activeModalId = null;
    if (options.restoreFocus !== false && lastModalFocus && typeof lastModalFocus.focus === 'function') {
        lastModalFocus.focus();
    }
    lastModalFocus = null;
}

function closeConfirmModal(accepted) {
    closeAccessibleModal('confirmModal');
}

function handleModalKeydown(event) {
    if (!activeModalId) return;
    const modal = document.getElementById(activeModalId);
    if (!modal || modal.style.display === 'none') return;
    if (event.key === 'Escape') {
        const closeHandler = MODAL_CLOSE_HANDLERS[activeModalId];
        if (closeHandler) {
            event.preventDefault();
            closeHandler();
        }
        return;
    }
    if (event.key !== 'Tab') return;
    const focusable = getFocusableElements(modal);
    if (focusable.length === 0) {
        event.preventDefault();
        focusModal(modal);
        return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
    }
}

if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('keydown', handleModalKeydown);
}

let cardSelectModalHandlersBound = false;

function cardSelectActionFromEvent(event) {
    const target = event && event.target;
    if (!target) return null;
    if (typeof target.closest === 'function') return target.closest('[data-action]');
    return target.dataset && target.dataset.action ? target : null;
}

function handleCardSelectModalClick(event) {
    const button = cardSelectActionFromEvent(event);
    if (!button || button.disabled) return;
    const action = button.dataset.action;
    if (!action) return;
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    if (action === 'toggleCard') toggleCard(button.dataset.cardName);
    else if (action === 'toggleLandmark') toggleLandmark(button.dataset.landmarkName);
    else if (action === 'toggleSet') toggleSet(button.dataset.set);
    else if (action === 'closeCardSelect') closeCardSelect();
}

function bindCardSelectModalHandlers() {
    if (cardSelectModalHandlersBound) return;
    const modal = document.getElementById('cardSelectModal');
    if (modal && typeof modal.addEventListener === 'function') {
        modal.addEventListener('click', handleCardSelectModalClick);
    }
    cardSelectModalHandlersBound = true;
}

function showCardSelect() {
    bindCardSelectModalHandlers();
    renderCardSelectModal();
    openAccessibleModal("cardSelectModal");
}

function closeCardSelect() {
    closeAccessibleModal("cardSelectModal");
}

function renderCardSelectModal() {
    for (const [set, cards] of Object.entries(CARD_SETS)) {
        const suffix = set.charAt(0).toUpperCase() + set.slice(1);
        const el = document.getElementById(`cardList${suffix}`);
        if (el) {
            el.innerHTML = [...cards].sort(compareCardNamesForDisplay).map(name => {
                const on = enabledCards.has(name);
                const safeName = escapeHtml(name);
                return `<button class="card-toggle-btn ${on ? 'on' : 'off'}" data-action="toggleCard" data-card-name="${safeName}" id="cardToggle_${safeName}">${safeName}</button>`;
            }).join("");
        }
        const allOn = cards.every(n => enabledCards.has(n));
        const btn = document.getElementById(`btnSet${suffix}`);
        if (btn) {
            btn.textContent = allOn ? "ON" : "OFF";
            btn.className = `set-toggle ${allOn ? 'on' : 'off'}`;
        }
    }
    const landmarkList = document.getElementById("landmarkList");
    if (landmarkList) {
        landmarkList.innerHTML = Player.landmarkNames().map(name => {
            const on = enabledLandmarks.has(name);
            const safeName = escapeHtml(name);
            return `<button class="card-toggle-btn ${on ? 'on' : 'off'}" data-action="toggleLandmark" data-landmark-name="${safeName}">${getLandmarkEmoji(name)} ${safeName}</button>`;
        }).join("");
    }
}

function toggleCard(name) {
    if (enabledCards.has(name)) {
        if (name === "麦畑" || name === "パン屋") return;
        enabledCards.delete(name);
    } else {
        enabledCards.add(name);
    }
    renderCardSelectModal();
}

function toggleSet(set) {
    const cards = CARD_SETS[set];
    if (!cards) return;
    const allOn = cards.every(n => enabledCards.has(n));
    for (const name of cards) {
        if (name === "麦畑" || name === "パン屋") continue;
        if (allOn) enabledCards.delete(name);
        else enabledCards.add(name);
    }
    renderCardSelectModal();
}

function toggleLandmark(name) {
    if (enabledLandmarks.has(name)) {
        if (enabledLandmarks.size === 1) return;
        enabledLandmarks.delete(name);
    } else {
        enabledLandmarks.add(name);
    }
    renderCardSelectModal();
}

function toggleLog() {
    const log = document.getElementById("log");
    const summary = document.getElementById("logSummary");
    const icon = document.getElementById("logToggleIcon");
    const header = document.querySelector(".log-header");
    if (!log || !icon || !header || !log.classList || !header.classList) return false;
    const collapsed = log.classList.toggle("collapsed");
    if (summary && summary.classList) summary.classList.toggle("collapsed", collapsed);
    icon.textContent = collapsed ? "▶" : "▼";
    header.classList.toggle("collapsed", collapsed);
    return true;
}

function showCardDetail(name, isLandmark = false) {
    const modal = document.getElementById('cardDetailModal');
    const title = document.getElementById('cardDetailTitle');
    const body = document.getElementById('cardDetailBody');
    if (!modal || !title || !body) return false;
    if (isLandmark) {
        const emoji = getLandmarkEmoji(name);
        const cost = Player.landmarkCost(name);
        const effect = getLandmarkEffectText(name);
        title.textContent = `${emoji} ${name}`;
        body.innerHTML = `<div class="card-detail-section"><div class="card-detail-row"><span>コスト</span><span>💰 ${cost}</span></div><div class="card-detail-row"><span>種別</span><span>ランドマーク</span></div></div><div class="card-detail-effect">${effect}</div>`;
    } else {
        const card = CARDS.find(c => c.name === name);
        if (!card) return false;
        const colorNames = { blue:'青', green:'緑', red:'赤', purple:'紫' };
        const colorBadges = { blue:'blue-badge', green:'green-badge', red:'red-badge', purple:'purple-badge' };
        title.textContent = card.name;
        body.innerHTML = `<div class="card-detail-section"><div class="card-detail-row"><span>コスト</span><span>💰 ${card.cost}</span></div><div class="card-detail-row"><span>ダイス</span><span>🎲 [${card.diceNums.join(', ')}]</span></div><div class="card-detail-row"><span>種別</span><span><span class="color-badge ${colorBadges[card.color]}">${colorNames[card.color]}</span> ${card.category}</span></div></div><div class="card-detail-effect">${getEffectText(card)}</div>`;
    }
    openAccessibleModal('cardDetailModal');
}

function closeCardDetail() {
    closeAccessibleModal('cardDetailModal');
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function hideNotice() {
    const toast = document.getElementById('noticeToast');
    if (noticeTimer) {
        clearTimeout(noticeTimer);
        noticeTimer = null;
    }
    if (toast) toast.style.display = 'none';
}

function showNotice(message) {
    const text = String(message || '');
    const toast = document.getElementById('noticeToast');
    const body = document.getElementById('noticeToastMessage');
    if (!toast || !body) {
        if (typeof alert === 'function') alert(text);
        return;
    }
    body.textContent = text;
    toast.style.display = 'flex';
    if (noticeTimer) clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => {
        toast.style.display = 'none';
        noticeTimer = null;
    }, 4500);
}

function showConfirm(message, onOk) {
    const modal = document.getElementById('confirmModal');
    const messageEl = document.getElementById('confirmMessage');
    const okBtn = document.getElementById('confirmOkBtn');
    const cancelBtn = document.getElementById('confirmCancelBtn');
    if (!modal || !messageEl || !okBtn || !cancelBtn) {
        showNotice('確認ダイアログを表示できません');
        return false;
    }
    messageEl.textContent = message;
    openAccessibleModal('confirmModal');
    okBtn.onclick = () => {
        closeAccessibleModal('confirmModal');
        onOk();
    };
    cancelBtn.onclick = () => {
        closeAccessibleModal('confirmModal');
    };
    return true;
}
