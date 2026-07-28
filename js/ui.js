const LOG_TYPE_DISPLAY = UiLogDisplay.makeLogTypeDisplay(LOG_TYPES);
let isUpdatingPendingModalContent = false;

function safeUiStorageSet(key, value) {
    try {
        if (typeof safeStorageSet === 'function') return safeStorageSet(key, value);
        if (typeof localStorage === 'undefined') return false;
        localStorage.setItem(key, value);
        return true;
    } catch (_) {
        return false;
    }
}

function safeUiStorageRemove(key) {
    try {
        if (typeof safeStorageRemove === 'function') {
            safeStorageRemove(key);
            return;
        }
        if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
    } catch (_) {}
}

function currentCpuPlayerAt(index) {
    try {
        if (typeof cpuPlayers === 'undefined' || !Array.isArray(cpuPlayers)) return null;
        return cpuPlayers[index] || null;
    } catch (_) {
        return null;
    }
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

    logEl.innerHTML = UiLogDisplay.buildLogEntriesHtml(fullLog, LOG_TYPE_DISPLAY, escapeHtml);
    summaryEl.innerHTML = UiLogDisplay.buildLogSummaryHtml(cur, LOG_TYPE_DISPLAY, escapeHtml);
    logEl.scrollTop = logEl.scrollHeight;
}

function tutorialOptions() {
    return {
        cards: CARDS,
        enabledCards,
        getShopStockCount,
        shopStock: SHOP_STOCK,
        enabledLandmarks,
        landmarkNames: LANDMARK_NAMES,
        landmarkCost: Player.landmarkCost,
        game,
        isOnlineGame,
        myPlayerIndex,
        currentCpuPlayerAt,
        tutorialLevel,
        phases: GAME_PHASES,
    };
}

function getTutorialHints(current) {
    return UiTutorial.getHints(current, tutorialOptions());
}

function getTutorialMessage() {
    return UiTutorial.getMessage(tutorialOptions());
}

function renderTutorial() {
    safeRenderStep('syncTutorialControls', () => syncTutorialControls());
    const box = document.getElementById("tutorialBox");
    if (!box) return;
    if (!tutorialEnabled || !game || game.checkWinner()) {
        box.style.display = "none";
        box.innerHTML = "";
        return;
    }
    const message = getTutorialMessage();
    box.style.display = "block";
    box.innerHTML = UiTutorial.buildHtml(message, escapeHtml);
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

function clearOnlineSessionAfterWin() {
    const clearOnlineSession = typeof globalThis !== 'undefined' && typeof globalThis.clearOnlineSessionStorage === 'function'
        ? globalThis.clearOnlineSessionStorage
        : (typeof clearOnlineSessionStorage === 'function' ? clearOnlineSessionStorage : null);
    if (clearOnlineSession) {
        clearOnlineSession();
    } else {
        safeUiStorageRemove('onlineSession');
    }
}

function renderWinnerState(winner) {
    const winnerIdx = game.players.indexOf(winner);
    const isCPUWinner = !!currentCpuPlayerAt(winnerIdx);
    if (!winSoundPlayed) {
        if (winner.name === lastWinnerName) winStreak++;
        else { winStreak = 1; lastWinnerName = winner.name; }
        safeUiStorageSet('winStreak', winStreak);
        safeUiStorageSet('lastWinnerName', lastWinnerName);
    }
    let resultAdSlot = '';
    try {
        resultAdSlot = typeof renderAdSlot === 'function' ? renderAdSlot('result-bottom') : '';
    } catch (error) {
        resultAdSlot = '';
    }
    document.getElementById("status").innerHTML = UiWinner.buildWinnerScreenHtml({
        winner,
        players: game.players,
        isCpuWinner: isCPUWinner,
        turnCount: game.turnCount,
        winStreak,
        resultAdSlot,
        escapeHtml,
    });
    if (!winSoundPlayed) {
        winSoundPlayed = true;
        playSound('win');
        const cpuList = typeof cpuPlayers !== 'undefined' && Array.isArray(cpuPlayers) ? cpuPlayers : [];
        recordGameStats(winner, game, cpuList);
        if (typeof notifyGameLifecycleFinish === 'function') notifyGameLifecycleFinish(winner);
    }
    safeUiStorageRemove('savedGame');
    clearOnlineSessionAfterWin();
    if (typeof markOnlineGameFinished === 'function') markOnlineGameFinished();
    if (typeof refreshPwaUpdateState === 'function') refreshPwaUpdateState();
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
    const isCPUTurn = !!currentCpuPlayerAt(game.currentPlayerIndex);
    if (game.phase === GAME_PHASES.ROLL && game.currentPlayerIndex !== prevPlayerIndex) {
        if (prevPlayerIndex !== -1 && !isReplaying) showTurnAnnouncer(current.name, isCPUTurn);
        prevPlayerIndex = game.currentPlayerIndex;
    }
    document.getElementById("btnRoll").disabled = !canShowUiAction('rollDice');
    const btnSkip = document.getElementById("btnSkip");
    btnSkip.disabled = !canShowUiAction('nextTurn') || game.pendingRenovation > 0;
    btnSkip.textContent = game.builtThisTurn ? "建設完了・ターン終了" : "建設しないでターン終了";
    document.getElementById("btnReroll").style.display = "none";

    if (game.lastDice1 > 0 && game.lastDice2 > 0) updateDiceDisplay([game.lastDice1, game.lastDice2]);
    else if (game.lastDiceResult > 0) updateDiceDisplay([game.lastDiceResult]);
    else updateDiceDisplay(null);

    safeRenderStep('renderDiceChoose', () => renderDiceChoose());
    safeRenderStep('renderPending', () => renderPending());
    safeRenderStep('renderTutorial', () => renderTutorial());
    safeRenderStep('renderLog', () => renderLog());
    safeRenderStep('renderPlayers', () => renderPlayers());

    safeRenderStep('coinAnimation', () => {
        if (prevCoins) {
            game.players.forEach((p, i) => {
                const diff = p.coins - prevCoins[i];
                if (diff !== 0) showCoinAnimation(i, diff);
            });
        }
        prevCoins = game.players.map(p => p.coins);
    });
    safeRenderStep('renderBuildMenu', () => renderBuildMenu());
    safeRenderStep('syncUiInteractabilityAfterRender', () => {
        if (typeof syncUiInteractabilityAfterRender === 'function') syncUiInteractabilityAfterRender('render-active-game-state');
        if (typeof schedulePostBuildUiStabilizer === 'function') schedulePostBuildUiStabilizer('render-active-game-state');
    });
    safeRenderStep('checkAutoSkip', () => checkAutoSkip());
}

function persistAfterRender() {
    saveGameState();
}

function currentUiAllowedActions() {
    if (!game) return new Set();
    try {
        if (typeof game.allowedActions === 'function') return game.allowedActions();
        if (typeof GameManager !== 'undefined' && GameManager && typeof GameManager.allowedActionsFor === 'function') return GameManager.allowedActionsFor(game);
    } catch (_) {}
    return new Set();
}

function isOnlineUiInputBlocked() {
    if (!isOnlineGame) return false;
    if (typeof isReconnectingOnline !== 'undefined' && isReconnectingOnline) return true;
    if (typeof onlineActionInFlight !== 'undefined' && onlineActionInFlight) return true;
    if (typeof socket === 'undefined' || !socket || socket.connected === false) return true;
    return false;
}

function isCurrentHumanUiTurn() {
    if (!game) return false;
    const isCPUTurn = !!currentCpuPlayerAt(game.currentPlayerIndex);
    if (isCPUTurn) return false;
    if (isOnlineUiInputBlocked()) return false;
    return !isOnlineGame || game.currentPlayerIndex === myPlayerIndex;
}

function canShowUiAction(action) {
    if (!action || !isCurrentHumanUiTurn()) return false;
    return currentUiAllowedActions().has(action);
}

function uiActionDisabledAttr(action) {
    return canShowUiAction(action) ? '' : ' disabled';
}

function setDiceChooseContent(el, html) {
    if (!el) return;
    el.innerHTML = html || "";
    if (el.style) el.style.display = html ? "block" : "none";
}

function renderDiceChoose() {
    const el = document.getElementById("diceChoose");
    if (!el) return;
    if (!isCurrentHumanUiTurn()) { setDiceChooseContent(el, ""); return; }
    const html = UiDiceChoice.buildHtml({
        phase: game.phase,
        lastDiceResult: game.lastDiceResult,
        allowedActions: currentUiAllowedActions(),
        disabledAttr: uiActionDisabledAttr,
        phases: GAME_PHASES,
    });
    setDiceChooseContent(el, html);
}

function shouldShowPendingForCurrentPlayer() {
    if (game.phase !== GAME_PHASES.PENDING && !game.pendingIT && game.pendingRenovation <= 0) return false;
    return isCurrentHumanUiTurn();
}

function normalizePendingModalInteraction(el, modal, hasContent) {
    if (modal && modal.style) {
        modal.style.display = hasContent ? "flex" : "none";
        modal.style.visibility = hasContent ? "visible" : "";
        modal.style.opacity = hasContent ? "1" : "";
        modal.style.pointerEvents = hasContent ? "auto" : "";
        modal.style.transform = hasContent ? "" : "";
        if (hasContent && typeof modal.querySelector === 'function') {
            const inner = modal.querySelector('.pending-modal-inner');
            if (inner && inner.style) {
                inner.style.visibility = 'visible';
                inner.style.opacity = '1';
                inner.style.pointerEvents = 'auto';
            }
        }
    }
    if (el && el.style) {
        el.style.visibility = hasContent ? "visible" : "";
        el.style.opacity = hasContent ? "1" : "";
        el.style.pointerEvents = hasContent ? "auto" : "";
    }
}

function updatePendingModalContent(el, modal, html) {
    if (!el || !modal) return false;
    if (isUpdatingPendingModalContent) return false;
    const nextHtml = html || "";
    if (nextHtml) {
        const blockingIds = visibleBlockingModalIds().filter(id => id !== 'pendingModal');
        if (blockingIds.length > 0) {
            recordModalPolicyViolation('pending-modal-open-denied', { parentModalId: blockingIds[0], childModalId: 'pendingModal', visibleBlockingModalIds: blockingIds });
            if (el.innerHTML !== '') el.innerHTML = '';
            normalizePendingModalInteraction(el, modal, false);
            return true;
        }
    }
    isUpdatingPendingModalContent = true;
    try {
        if (el.innerHTML !== nextHtml) el.innerHTML = nextHtml;
        normalizePendingModalInteraction(el, modal, !!nextHtml);
        return true;
    } finally {
        isUpdatingPendingModalContent = false;
    }
}

function hidePendingModalContent(el, modal) {
    updatePendingModalContent(el, modal, "");
}

function shouldRenderPendingField(nextPending, allowedActions, field, action) {
    return (!nextPending || nextPending.field === field) && allowedActions.has(action);
}

function pendingInspectHintHtml() {
    return UiPendingMenu.pendingInspectHintHtml();
}

function buildPendingTvHtml(game) {
    return UiPendingMenu.buildPendingTvHtml(game, escapeHtml);
}

function buildBusinessCardChipHtml(player, card, index, inputId, isSelected) {
    return UiPendingMenu.buildBusinessCardChipHtml(player, card, index, inputId, isSelected, escapeHtml);
}

function businessCardOptionsForPlayer(player) {
    return UiPendingMenu.businessCardOptionsForPlayer(player);
}

function buildBusinessCardChipGroupHtml(player, cards, inputId) {
    return UiPendingMenu.buildBusinessCardChipGroupHtml(player, cards, inputId, escapeHtml);
}

function buildBusinessTargetExchangeHtml(player, playerIndex) {
    return UiPendingMenu.buildBusinessTargetExchangeHtml(player, playerIndex, escapeHtml);
}

function buildPendingBusinessHtml(game) {
    return UiPendingMenu.buildPendingBusinessHtml(game, escapeHtml);
}

function buildPendingCleaningHtml(game) {
    return UiPendingMenu.buildPendingCleaningHtml(game, escapeHtml);
}

function buildPendingMoverHtml(game) {
    return UiPendingMenu.buildPendingMoverHtml(game, escapeHtml);
}

function buildPendingRenovationHtml(game) {
    return UiPendingMenu.buildPendingRenovationHtml(game, escapeHtml, LANDMARK_NAMES);
}

function buildPendingItHtml(game) {
    return UiPendingMenu.buildPendingItHtml(game);
}

function pendingMenuRendererSpecs() {
    return UiPendingMenu.rendererSpecs();
}

function shouldRenderPendingMenuSpec(spec, game, allowedActions, nextPending) {
    return shouldRenderPendingField(nextPending, allowedActions, spec.field, spec.action) && spec.isActive(game);
}

function buildPendingMenuHtml(game, allowedActions, nextPending) {
    return UiPendingMenu.buildMenuHtml(game, allowedActions, nextPending, {
        escapeHtml,
        landmarkNames: LANDMARK_NAMES,
    });
}

function renderPending() {
    const el = document.getElementById("pendingMenu");
    const modal = document.getElementById("pendingModal");
    if (!shouldShowPendingForCurrentPlayer()) { hidePendingModalContent(el, modal); return; }
    const nextPending = typeof GameManager !== 'undefined' && GameManager.nextPendingActionFor
        ? GameManager.nextPendingActionFor(game)
        : null;
    const allowedActions = currentUiAllowedActions();
    const html = buildPendingMenuHtml(game, allowedActions, nextPending);
    updatePendingModalContent(el, modal, html);
}

function renderPlayerDifficultyLabel(difficulty) {
    return UiPlayerDisplay.difficultyLabel(difficulty);
}

function validRenderCpuDifficulty(value) {
    return UiPlayerDisplay.normalizeCpuDifficulty(value);
}

function getPlayerSettingForRender(index, player) {
    const settings = typeof playerSettings !== 'undefined' && Array.isArray(playerSettings) ? playerSettings : [];
    const cpus = typeof cpuPlayers !== 'undefined' && Array.isArray(cpuPlayers) ? cpuPlayers : [];
    const resolved = UiPlayerDisplay.resolvePlayerSetting({
        playerSettings: settings,
        cpuPlayers: cpus,
        index,
        player,
    });
    if (resolved.missing) {
        recordFlowTrace('render-player-setting-fallback', {
            playerIndex: index,
            fallbackType: resolved.type,
            fallbackDifficulty: resolved.difficulty,
            playerSettingsLength: settings.length,
            cpuPlayersLength: cpus.length,
            playersLength: game && Array.isArray(game.players) ? game.players.length : 0,
        });
    }
    return resolved;
}

function renderPlayers() {
    const html = game.players.map((p, idx) => {
        const isActive = idx === game.currentPlayerIndex;
        const setting = getPlayerSettingForRender(idx, p);
        const isCPU = setting.type === 'cpu';
        const cpuLabel = isCPU ? `🤖${renderPlayerDifficultyLabel(setting.difficulty)}` : '👤';
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

function safeCardColorName(color) {
    return UiBuildMenu.safeCardColorName(color);
}

function renderBuildCardButton(card, stock, canBuildThis) {
    return UiBuildMenu.renderBuildCardButton({ card, stock, canBuildThis, escapeHtml, getEffectText });
}

function renderLandmarkBuildButton(name, built, cost, canBuildThis) {
    return UiBuildMenu.renderLandmarkBuildButton({ name, built, cost, canBuildThis, escapeHtml, getLandmarkEffectText, getLandmarkEmoji });
}

function buildCardFilterBarHtml() {
    return UiBuildMenu.buildCardFilterBarHtml(cardFilter);
}

function buildVisibleCardButtonsHtml(current, canBuildCardAction) {
    return UiBuildMenu.buildVisibleCardButtonsHtml({
        cards: CARDS,
        cardFilter,
        enabledCards,
        shopStock: SHOP_STOCK,
        current,
        canBuildCardAction,
        compareCardsForDisplay,
        getShopStockCount,
        renderBuildCardButton,
    });
}

function buildLandmarkButtonsHtml(current, canBuildLandmarkAction) {
    return UiBuildMenu.buildLandmarkButtonsHtml({
        landmarks: current.landmarks,
        enabledLandmarks,
        currentCoins: current.coins,
        canBuildLandmarkAction,
        landmarkCost: Player.landmarkCost,
        renderLandmarkBuildButton,
    });
}

function canRenderUndoBuildAction() {
    if (!undoState || !game || !game.builtThisTurn) return false;
    try {
        return currentUiAllowedActions().has('undoBuild');
    } catch (_) {
        return false;
    }
}

function buildUndoBuildButtonHtml() {
    return canRenderUndoBuildAction()
        ? `<button class="undo-btn" data-action="undoBuild"${uiActionDisabledAttr('undoBuild')}>↩ 建設を取り消す</button>`
        : '';
}

function buildBuildMenuHtml(current, canBuildCardAction, canBuildLandmarkAction) {
    const filterBtnsHtml = buildCardFilterBarHtml();
    const cardHtml = buildVisibleCardButtonsHtml(current, canBuildCardAction);
    const landmarkHtml = buildLandmarkButtonsHtml(current, canBuildLandmarkAction);
    const undoBtn = buildUndoBuildButtonHtml();
    return UiBuildMenu.buildBuildMenuHtml({
        canBuildCardAction,
        canBuildLandmarkAction,
        filterBtnsHtml,
        cardHtml,
        landmarkHtml,
        undoBtn,
    });
}

function renderBuildMenu() {
    const buildMenu = document.getElementById("buildMenu");
    if (!buildMenu || !game) return;
    const current = game.currentPlayer();
    const buildGateOpen = game.phase === GAME_PHASES.BUILD && game.pendingRenovation <= 0 && !game.builtThisTurn;
    const canBuildCardAction = buildGateOpen && canShowUiAction('buildCard');
    const canBuildLandmarkAction = buildGateOpen && canShowUiAction('buildLandmark');
    buildMenu.innerHTML = buildBuildMenuHtml(current, canBuildCardAction, canBuildLandmarkAction);
}

function setCardFilter(color) {
    cardFilter = color;
    renderBuildMenu();
}

function bcSelectCard(btn, inputId) {
    if (!btn) return false;
    const group = typeof btn.closest === 'function' ? btn.closest('.bc-chip-group') : null;
    if (group && typeof group.querySelectorAll === 'function') {
        group.querySelectorAll('.bc-chip').forEach(b => {
            if (b.classList && typeof b.classList.remove === 'function') b.classList.remove('selected');
            if (typeof b.setAttribute === 'function') b.setAttribute('aria-pressed', 'false');
        });
    }
    if (btn.classList && typeof btn.classList.add === 'function') btn.classList.add('selected');
    if (typeof btn.setAttribute === 'function') btn.setAttribute('aria-pressed', 'true');
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
    document.getElementById("tabLocal").setAttribute("aria-selected", tab === "local" ? "true" : "false");
    document.getElementById("tabOnline").setAttribute("aria-selected", tab === "online" ? "true" : "false");
    document.getElementById("tabStats").setAttribute("aria-selected", tab === "stats" ? "true" : "false");
    if (tab === "stats") renderStats();
}

function switchOnlineTab(tab) {
    document.getElementById("onlineCreate").style.display = tab === "create" ? "block" : "none";
    document.getElementById("onlineJoin").style.display = tab === "join" ? "block" : "none";
    document.getElementById("onlineTabCreate").className = `online-tab-btn ${tab === "create" ? "active" : ""}`;
    document.getElementById("onlineTabJoin").className = `online-tab-btn ${tab === "join" ? "active" : ""}`;
    document.getElementById("onlineTabCreate").setAttribute("aria-selected", tab === "create" ? "true" : "false");
    document.getElementById("onlineTabJoin").setAttribute("aria-selected", tab === "join" ? "true" : "false");
}

function showRules() {
    return openAccessibleModal("rulesModal");
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
let modalInertRestore = [];

const MODAL_INERT_ROOT_IDS = UiModalPolicy.inertRootIds;
const MODAL_POLICY_REGISTRY = UiModalPolicy.registry;
const MODAL_STACK_EXCEPTION_REGISTRY = UiModalPolicy.exceptions;
const MODAL_CLOSE_HANDLERS = Object.freeze({
    rulesModal: closeRules,
    cardSelectModal: closeCardSelect,
    cardDetailModal: closeCardDetail,
    confirmModal: () => closeConfirmModal(false),
});

const CARD_COLOR_ORDER = Object.freeze({ blue: 0, green: 1, red: 2, purple: 3 });

const FLOW_TRACE_LIMIT = 40;

function buildRuntimeStateSnapshot(reason = '') {
    const pendingActions = game && typeof GameManager !== 'undefined' && typeof GameManager.pendingActionsFor === 'function'
        ? GameManager.pendingActionsFor(game).map(entry => ({
            action: entry && entry.action,
            field: entry && entry.field,
            count: entry && entry.count,
        }))
        : [];
    const elementState = id => {
        const el = typeof document !== 'undefined' && document.getElementById ? document.getElementById(id) : null;
        if (!el) return null;
        return {
            display: el.style ? el.style.display || '' : '',
            disabled: !!el.disabled,
            inert: !!el.inert,
            htmlLength: typeof el.innerHTML === 'string' ? el.innerHTML.length : 0,
        };
    };
    return {
        reason,
        timestamp: new Date().toISOString(),
        phase: game && game.phase,
        builtThisTurn: !!(game && game.builtThisTurn),
        turnCount: game && game.turnCount,
        currentPlayerIndex: game && game.currentPlayerIndex,
        isCpuTurn: !!(game && currentCpuPlayerAt(game.currentPlayerIndex)),
        isOnlineGame: typeof isOnlineGame !== 'undefined' ? !!isOnlineGame : null,
        myPlayerIndex: typeof myPlayerIndex !== 'undefined' ? myPlayerIndex : null,
        pendingFields: game ? {
            pendingTV: game.pendingTV || 0,
            pendingBusiness: game.pendingBusiness || 0,
            pendingCleaning: game.pendingCleaning || 0,
            pendingMover: game.pendingMover || 0,
            pendingRenovation: game.pendingRenovation || 0,
            pendingIT: !!game.pendingIT,
        } : null,
        pendingActions,
        ui: {
            gameScreen: elementState('gameScreen'),
            pendingModal: elementState('pendingModal'),
            pendingMenu: elementState('pendingMenu'),
            buildMenu: elementState('buildMenu'),
            btnSkip: elementState('btnSkip'),
            confirmModal: elementState('confirmModal'),
            rulesModal: elementState('rulesModal'),
            cardSelectModal: elementState('cardSelectModal'),
            cardDetailModal: elementState('cardDetailModal'),
        },
    };
}

function recordFlowTrace(event, details = {}) {
    const trace = {
        event,
        details,
        snapshot: buildRuntimeStateSnapshot(event),
    };
    try {
        const root = typeof window !== 'undefined' ? window : globalThis;
        if (root) {
            const list = Array.isArray(root.__machikoroFlowTrace) ? root.__machikoroFlowTrace : [];
            list.push(trace);
            while (list.length > FLOW_TRACE_LIMIT) list.shift();
            root.__machikoroFlowTrace = list;
        }
    } catch (_) {}
    try {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('machikoroLastFlowTrace', JSON.stringify(trace).slice(0, 4000));
            if (typeof markClientFlowCheckpoint === 'function') markClientFlowCheckpoint(event, details);
        }
    } catch (_) {}
    return trace;
}

function reportRenderStepError(step, error) {
    const message = error && error.message || String(error);
    const stack = error && error.stack || '';
    const trace = recordFlowTrace('render-step-error', {
        step,
        message,
        stack: stack.slice(0, 1200),
        recoverable: true,
    });
    if (typeof console !== 'undefined' && typeof console.warn === 'function') {
        console.warn('[machikoro-render-step-error]', step, trace.snapshot, error);
    }
    if (typeof reportClientError === 'function') {
        let traceSummary = '';
        try {
            traceSummary = JSON.stringify({ event: trace.event, snapshot: trace.snapshot }).slice(0, 1200);
        } catch (_) {}
        reportClientError({
            source: 'render-step',
            phase: game && game.phase,
            message: 'render ' + step + ': ' + message,
            stack: [stack, traceSummary ? 'FLOW_TRACE ' + traceSummary : ''].filter(Boolean).join('\n'),
        });
    }
}

function safeRenderStep(step, fn) {
    try {
        fn();
        return true;
    } catch (error) {
        reportRenderStepError(step, error);
        return false;
    }
}

function compareCardsForDisplay(a, b) {
    return UiCardOrder.compareCardsForDisplay(a, b, CARD_COLOR_ORDER);
}

function compareCardNamesForDisplay(a, b) {
    return UiCardOrder.compareCardNamesForDisplay(a, b, CARDS, CARD_COLOR_ORDER);
}

function resetFullLog() { fullLog = []; prevLogLength = 0; prevPlayerIndex = -1; cardFilter = ''; }

function isVisibleFocusableElement(el) {
    if (!el || el.disabled || el.hidden || el.getAttribute('aria-hidden') === 'true') return false;
    if (typeof el.closest === 'function' && el.closest('[hidden], [aria-hidden="true"]')) return false;
    if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
        const style = window.getComputedStyle(el);
        if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
    }
    return true;
}

function getFocusableElements(root) {
    if (!root || typeof root.querySelectorAll !== 'function') return [];
    return Array.from(root.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
        .filter(isVisibleFocusableElement);
}

function focusModal(modal) {
    const focusable = getFocusableElements(modal);
    const target = focusable[0] || modal;
    if (target && typeof target.focus === 'function') target.focus();
}

function clearOrphanAccessibleModalLocks() {
    if (visibleBlockingModalIds().length > 0) return false;
    let changed = false;
    for (const rootId of MODAL_INERT_ROOT_IDS) {
        const el = document.getElementById(rootId);
        if (!el) continue;
        if (el.inert) {
            el.inert = false;
            changed = true;
        }
        if (el.getAttribute && el.getAttribute('aria-hidden') === 'true') {
            el.removeAttribute('aria-hidden');
            changed = true;
        }
        if (el.style && el.style.pointerEvents === 'none') {
            el.style.pointerEvents = '';
            changed = true;
        }
    }
    if (document.body && document.body.classList && document.body.classList.contains('modal-open')) {
        document.body.classList.remove('modal-open');
        changed = true;
    }
    if (changed && typeof recordFlowTrace === 'function') {
        recordFlowTrace('modal-close-orphan-lock-cleared', { visibleBlockingModalIds: visibleBlockingModalIds() });
    }
    return changed;
}

function setAppInertForModal(enabled) {
    if (typeof document === 'undefined' || typeof document.getElementById !== 'function') return;
    if (!enabled) {
        for (const entry of modalInertRestore) {
            const el = entry && entry.el;
            if (!el) continue;
            el.inert = entry.hadInert ? entry.inert : false;
            if (entry.ariaHidden === null) el.removeAttribute && el.removeAttribute('aria-hidden');
            else el.setAttribute && el.setAttribute('aria-hidden', entry.ariaHidden);
            if (el.style) el.style.pointerEvents = entry.pointerEvents || '';
        }
        modalInertRestore = [];
        return;
    }
    if (modalInertRestore.length > 0) return;
    modalInertRestore = MODAL_INERT_ROOT_IDS
        .map(rootId => document.getElementById(rootId))
        .filter(Boolean)
        .map(el => ({
            el,
            hadInert: Object.prototype.hasOwnProperty.call(el, 'inert'),
            inert: el.inert,
            ariaHidden: el.getAttribute ? el.getAttribute('aria-hidden') : null,
            pointerEvents: el.style ? el.style.pointerEvents || '' : '',
        }));
    for (const { el } of modalInertRestore) {
        el.inert = true;
        if (el.setAttribute) el.setAttribute('aria-hidden', 'true');
        if (el.style) el.style.pointerEvents = 'none';
    }
}

function modalPolicyFor(id) {
    return UiModalPolicy.policyFor(id);
}

function isModalVisibleById(id) {
    if (!id || typeof document === 'undefined' || typeof document.getElementById !== 'function') return false;
    const modal = document.getElementById(id);
    const inline = modal && modal.style || {};
    let computed = null;
    if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
        computed = modal ? window.getComputedStyle(modal) : null;
    }
    return UiModalPolicy.isVisibleState({
        exists: !!modal,
        hidden: !!(modal && modal.hidden),
        inline: {
            display: inline.display || '',
            visibility: inline.visibility || '',
            opacity: inline.opacity || '',
            pointerEvents: inline.pointerEvents || '',
        },
        computed,
    });
}

function modalStackExceptionKey(parentId, childId) {
    return UiModalPolicy.stackExceptionKey(parentId, childId);
}

function hasRegisteredModalStackException(parentId, childId) {
    return UiModalPolicy.hasStackException(parentId, childId);
}

function recordModalPolicyViolation(type, details = {}) {
    const entry = {
        type,
        timestamp: new Date().toISOString(),
        activeModalId,
        ...details,
    };
    try {
        const root = typeof window !== 'undefined' ? window : globalThis;
        if (root) {
            const list = Array.isArray(root.__machikoroModalPolicyViolations) ? root.__machikoroModalPolicyViolations : [];
            list.push(entry);
            while (list.length > 20) list.shift();
            root.__machikoroModalPolicyViolations = list;
        }
    } catch (_) {}
    try {
        if (typeof recordFlowTrace === 'function') recordFlowTrace('modal-policy-violation', entry);
    } catch (_) {}
    if (typeof console !== 'undefined' && typeof console.warn === 'function') {
        console.warn('[machikoro-modal-policy]', type, entry);
    }
    return entry;
}

function visibleBlockingModalIds() {
    if (typeof document === 'undefined' || typeof document.getElementById !== 'function') return [];
    return UiModalPolicy.visibleBlockingIds(isModalVisibleById);
}

function canOpenBlockingModal(id) {
    const decision = UiModalPolicy.canOpen(id, {
        activeModalId,
        isVisible: isModalVisibleById,
    });
    if (decision.ok) return true;
    recordModalPolicyViolation(decision.reason, {
        parentModalId: decision.parentId,
        childModalId: decision.childId,
        visibleBlockingModalIds: decision.blockingIds,
    });
    return false;
}

function normalizeModalVisualStateForOpen(modal) {
    if (!modal || !modal.style) return;
    modal.style.display = 'flex';
    modal.style.visibility = 'visible';
    modal.style.opacity = '1';
    modal.style.pointerEvents = 'auto';
    modal.style.transform = '';
    if (typeof modal.querySelector === 'function') {
        const content = modal.querySelector('.modal-content');
        if (content && content.style) {
            content.style.visibility = 'visible';
            content.style.opacity = '1';
            content.style.pointerEvents = 'auto';
        }
    }
}

function openAccessibleModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return false;
    if (!canOpenBlockingModal(id)) return false;
    if (typeof document !== 'undefined') lastModalFocus = document.activeElement || lastModalFocus;
    activeModalId = id;
    if (document.body && document.body.classList) document.body.classList.add('modal-open');
    normalizeModalVisualStateForOpen(modal);
    if (typeof modal.setAttribute === 'function') {
        modal.setAttribute('role', modal.getAttribute('role') || 'dialog');
        modal.setAttribute('aria-modal', 'true');
    }
    focusModal(modal);
    setAppInertForModal(true);
    return true;
}

function closeAccessibleModal(id, options = {}) {
    const beforeSnapshot = buildRuntimeStateSnapshot('modal-close-before-' + id);
    const modal = document.getElementById(id);
    if (modal) modal.style.display = 'none';

    const visibleBlockingIds = visibleBlockingModalIds();
    activeModalId = UiModalPolicy.activeAfterClose(
        id,
        activeModalId,
        visibleBlockingIds,
        isModalVisibleById
    );
    if (visibleBlockingIds.length <= 0) {
        activeModalId = null;
        setAppInertForModal(false);
        clearOrphanAccessibleModalLocks();
        if (id !== 'pendingModal' && typeof renderPending === 'function') {
            try { renderPending(); } catch (_) {}
        }
    }

    if (options.restoreFocus !== false && lastModalFocus && typeof lastModalFocus.focus === 'function') {
        lastModalFocus.focus();
    }
    lastModalFocus = null;
    if ((id === 'rulesModal' || id === 'cardSelectModal') && typeof recordFlowTrace === 'function') {
        recordFlowTrace('modal-close-ui-state', {
            modalId: id,
            before: beforeSnapshot,
            after: buildRuntimeStateSnapshot('modal-close-after-' + id),
        });
    }
}

function setConfirmModalAwaitingChoice(value) {
    try {
        const root = typeof window !== 'undefined' ? window : globalThis;
        if (root) root.__machikoroConfirmModalOpen = !!value;
    } catch (_) {}
}

let confirmModalCancelHandler = null;

function closeConfirmModal(accepted) {
    const cancelHandler = accepted === true ? null : confirmModalCancelHandler;
    confirmModalCancelHandler = null;
    setConfirmModalAwaitingChoice(false);
    closeAccessibleModal('confirmModal');
    if (cancelHandler) cancelHandler();
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
    const containsActive = typeof modal.contains !== 'function' || modal.contains(document.activeElement);
    const activeIndex = focusable.indexOf(document.activeElement);
    const action = UiModalPolicy.focusTrapAction({
        containsActive,
        focusableCount: focusable.length,
        activeIndex,
        shiftKey: !!event.shiftKey,
    });
    if (action === 'focus-modal') {
        event.preventDefault();
        focusModal(modal);
        return;
    }
    if (action === 'focus-last') {
        event.preventDefault();
        focusable[focusable.length - 1].focus();
        return;
    }
    if (action === 'focus-first') {
        event.preventDefault();
        focusable[0].focus();
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
    if (!canOpenBlockingModal("cardSelectModal")) return false;
    bindCardSelectModalHandlers();
    renderCardSelectModal();
    return openAccessibleModal("cardSelectModal");
}

function closeCardSelect() {
    closeAccessibleModal("cardSelectModal");
}

function buildCardSelectToggleButtonHtml(name, enabled) {
    return UiCardSelect.buildCardToggleButtonHtml({
        name,
        enabled,
        escapeHtml,
    });
}

function buildLandmarkSelectToggleButtonHtml(name, enabled) {
    return UiCardSelect.buildLandmarkToggleButtonHtml({
        name,
        enabled,
        escapeHtml,
        getLandmarkEmoji,
    });
}

function renderCardSelectModal() {
    for (const [set, cards] of Object.entries(CARD_SETS)) {
        const suffix = set.charAt(0).toUpperCase() + set.slice(1);
        const el = document.getElementById(`cardList${suffix}`);
        if (el) {
            el.innerHTML = [...cards].sort(compareCardNamesForDisplay)
                .map(name => buildCardSelectToggleButtonHtml(name, enabledCards.has(name)))
                .join("");
        }
        const allOn = cards.every(n => enabledCards.has(n));
        const btn = document.getElementById(`btnSet${suffix}`);
        if (btn) {
            btn.textContent = allOn ? "ON" : "OFF";
            btn.className = `set-toggle ${allOn ? 'on' : 'off'}`;
            if (typeof btn.setAttribute === 'function') btn.setAttribute('aria-pressed', allOn ? 'true' : 'false');
        }
    }
    const landmarkList = document.getElementById("landmarkList");
    if (landmarkList) {
        landmarkList.innerHTML = Player.landmarkNames()
            .map(name => buildLandmarkSelectToggleButtonHtml(name, enabledLandmarks.has(name)))
            .join("");
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
    if (typeof header.setAttribute === 'function') header.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    return true;
}

function buildLandmarkDetailContent(name) {
    return UiCardDetail.buildLandmarkDetailContent({
        name,
        emoji: getLandmarkEmoji(name),
        cost: Player.landmarkCost(name),
        effectText: getLandmarkEffectText(name),
        escapeHtml,
    });
}

function buildCardDetailContent(card) {
    return UiCardDetail.buildCardDetailContent({ card, escapeHtml, getEffectText, safeCardColorName });
}

function showCardDetail(name, isLandmark = false) {
    const modal = document.getElementById('cardDetailModal');
    const title = document.getElementById('cardDetailTitle');
    const body = document.getElementById('cardDetailBody');
    if (!modal || !title || !body) return false;
    let content;
    if (isLandmark) {
        content = buildLandmarkDetailContent(name);
    } else {
        const card = CARDS.find(c => c.name === name);
        if (!card) return false;
        content = buildCardDetailContent(card);
    }
    if (!canOpenBlockingModal('cardDetailModal')) return false;
    title.textContent = content.title;
    body.innerHTML = content.html;
    return openAccessibleModal('cardDetailModal');
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


function showConfirm(message, onOk, onCancel) {
    const modal = document.getElementById('confirmModal');
    const messageEl = document.getElementById('confirmMessage');
    const okBtn = document.getElementById('confirmOkBtn');
    const cancelBtn = document.getElementById('confirmCancelBtn');
    if (!modal || !messageEl || !okBtn || !cancelBtn) {
        showNotice('確認ダイアログを表示できません');
        return false;
    }
    if (!canOpenBlockingModal('confirmModal')) return false;
    messageEl.textContent = message;
    if (!openAccessibleModal('confirmModal')) return false;
    setConfirmModalAwaitingChoice(true);
    confirmModalCancelHandler = typeof onCancel === 'function' ? onCancel : null;
    okBtn.onclick = () => {
        closeConfirmModal(true);
        onOk();
    };
    cancelBtn.onclick = () => {
        closeConfirmModal(false);
    };
    return true;
}
