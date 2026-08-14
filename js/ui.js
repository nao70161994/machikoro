const LOG_TYPE_DISPLAY = UiLogDisplay.makeLogTypeDisplay(LOG_TYPES);
const uiClientStorageFacade = ClientStorage.createFacade();
const pendingModalUpdateController = UiPendingEffects.createUpdateController();
const pendingModalFocusController = UiPendingEffects.createFocusController();
const diceChoiceFocusController = UiDiceChoice.createFocusController();
const diceResultAnnouncementController = UiDiceDisplay.createAnnouncementController();
const buildActionFocusController = UiBuildMenu.createActionFocusController();
let logRelatedHighlightTimer = null;

function uiGameRuntimeSnapshot() {
    return GameRuntimeState.runtime.snapshot();
}

function uiOnlineRuntimeSnapshot() {
    return OnlineRuntimeState.runtime.snapshot();
}

function safeUiStorageSet(key, value) {
    try {
        if (typeof safeStorageSet === 'function') return safeStorageSet(key, value);
        return uiClientStorageFacade.set(key, value);
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
        uiClientStorageFacade.remove(key);
    } catch (_) {}
}

function currentCpuPlayerAt(index) {
    try {
        const cpuPlayers = uiGameRuntimeSnapshot().cpuPlayers;
        if (!Array.isArray(cpuPlayers)) return null;
        return cpuPlayers[index] || null;
    } catch (_) {
        return null;
    }
}

function tutorialSettingsSnapshot() {
    return UiTutorialSettings.runtime.snapshot();
}

function triggerUiHaptic(kind) {
    const kindToggle = document.getElementById(kind === 'win' ? 'hapticWinEnabled' : 'hapticTurnEnabled');
    const enabled = !!document.getElementById('accessibilityHaptics')?.checked &&
        (!kindToggle || kindToggle.checked === true);
    const reducedMotion = !!document.body?.classList.contains('accessibility-reduced-motion');
    return UiTurnPrivacy.vibrate(kind, {
        enabled,
        reducedMotion,
        vibrate: typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
            ? pattern => navigator.vibrate(pattern) : null,
    });
}

function applyHotseatHandoff(view) {
    return UiTurnPrivacy.applyHandoffView(view, {
        overlay: document.getElementById('hotseatHandoffOverlay'),
        name: document.getElementById('hotseatHandoffName'),
        button: document.getElementById('hotseatHandoffButton'),
    });
}

function acceptHotseatHandoff() {
    applyHotseatHandoff(hotseatHandoffController.dismiss());
    if (typeof ensureCurrentScreenFocus === 'function') ensureCurrentScreenFocus();
    return true;
}

function renderLog() {
    const logEl = document.getElementById("log");
    const titleEl = document.getElementById("logTitle");
    const summaryEl = document.getElementById("logSummary");
    if (!logEl || !titleEl || !summaryEl) return;

    const currentGame = uiGameRuntimeSnapshot().game;
    const cur = currentGame.log || [];

    const history = logHistoryController.append(cur);
    titleEl.textContent = `📋 ログ (${history.entryCount})`;

    logEl.innerHTML = UiLogDisplay.buildLogEntriesHtml(
        history.entries,
        LOG_TYPE_DISPLAY,
        escapeHtml
    );
    summaryEl.innerHTML = UiLogDisplay.buildLogSummaryHtml(cur, LOG_TYPE_DISPLAY, escapeHtml);
    logEl.scrollTop = logEl.scrollHeight;
}

function highlightLogEntry(playerName = '', targetName = '', cardName = '', logMessage = '') {
    const highlighted = Array.from(document.querySelectorAll('.log-related-highlight'));
    highlighted.forEach(element => element.classList.remove('log-related-highlight'));
    if (logRelatedHighlightTimer !== null) {
        clearTimeout(logRelatedHighlightTimer);
        logRelatedHighlightTimer = null;
    }
    const currentGame = uiGameRuntimeSnapshot().game;
    if (!currentGame || !Array.isArray(currentGame.players)) return false;
    const relatedNames = new Set([playerName, targetName].filter(Boolean));
    const matches = [];
    currentGame.players.forEach((player, index) => {
        if (!player || (!relatedNames.has(player.name) && !String(logMessage).includes(player.name))) return;
        const box = document.getElementById(`playerBox${index}`);
        if (!box) return;
        if (box.tagName === 'DETAILS') box.open = true;
        box.classList.add('log-related-highlight');
        matches.push(box);
    });
    if (cardName) {
        const roots = matches.length > 0 ? matches : [document.getElementById('players')];
        roots.filter(Boolean).forEach(root => {
            Array.from(root.querySelectorAll('[data-card-name]')).forEach(card => {
                if (card.dataset.cardName !== cardName) return;
                card.classList.add('log-related-highlight');
                matches.push(card);
            });
        });
    }
    const first = matches[0];
    if (!first) return false;
    if (typeof first.scrollIntoView === 'function') {
        const reduceMotion = document.body && document.body.classList.contains('accessibility-reduced-motion');
        first.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
    }
    logRelatedHighlightTimer = setTimeout(() => {
        matches.forEach(element => element.classList.remove('log-related-highlight'));
        logRelatedHighlightTimer = null;
    }, 2200);
    return true;
}

function tutorialOptions() {
    const tutorial = tutorialSettingsSnapshot();
    const gameState = uiGameRuntimeSnapshot();
    const onlineState = uiOnlineRuntimeSnapshot();
    return {
        cards: CARDS,
        enabledCards: getEnabledCardSelection(),
        getShopStockCount,
        shopStock: SHOP_STOCK,
        enabledLandmarks: getEnabledLandmarkSelection(),
        landmarkNames: LANDMARK_NAMES,
        landmarkCost: Player.landmarkCost,
        game: gameState.game,
        isOnlineGame: onlineState.isOnlineGame,
        myPlayerIndex: onlineState.myPlayerIndex,
        currentCpuPlayerAt,
        tutorialLevel: tutorial.tutorialLevel,
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
    const tutorial = tutorialSettingsSnapshot();
    const currentGame = uiGameRuntimeSnapshot().game;
    if (!tutorial.tutorialEnabled || !currentGame || currentGame.checkWinner()) {
        box.style.display = "none";
        box.innerHTML = "";
        return;
    }
    const message = getTutorialMessage();
    box.style.display = "block";
    box.innerHTML = UiTutorial.buildHtml(message, escapeHtml);
}

function applyTutorialSettingChange(plan) {
    UiTutorialSettings.executeChange(plan, {
        setEnabled(value) { UiTutorialSettings.runtime.setEnabled(value); },
        setLevel(value) { UiTutorialSettings.runtime.setLevel(value); },
        persist: safeUiStorageSet,
        syncControls: syncTutorialControls,
        renderTutorial,
    });
}

function setTutorialEnabled(enabled) {
    applyTutorialSettingChange(UiTutorialSettings.planEnabledChange(enabled));
}

function onToggleTutorial(enabled) {
    setTutorialEnabled(enabled);
}

function toggleTutorial() {
    setTutorialEnabled(!tutorialSettingsSnapshot().tutorialEnabled);
}

function onChangeTutorialLevel(level) {
    applyTutorialSettingChange(UiTutorialSettings.planLevelChange(level));
}

function cycleTutorialLevel() {
    applyTutorialSettingChange(UiTutorialSettings.planLevelCycle(tutorialSettingsSnapshot().tutorialLevel));
}

function syncTutorialControls() {
    const tutorial = tutorialSettingsSnapshot();
    const view = UiTutorial.buildControlView(tutorial.tutorialEnabled, tutorial.tutorialLevel);
    const checkbox = document.getElementById("tutorialEnabled");
    if (checkbox) checkbox.checked = view.enabled;
    const select = document.getElementById("tutorialLevel");
    if (select) select.value = view.selectedLevel;
    const btn = document.getElementById("btnTutorialToggle");
    if (btn) {
        btn.textContent = view.toggleText;
        btn.classList.toggle("active", view.active);
        btn.setAttribute("aria-pressed", view.toggleAriaPressed);
    }
    const levelBtn = document.getElementById("btnTutorialLevel");
    if (levelBtn) {
        levelBtn.textContent = view.levelText;
        levelBtn.classList.toggle("active", view.active);
        levelBtn.setAttribute("aria-label", view.levelAriaLabel);
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
    const currentGame = uiGameRuntimeSnapshot().game;
    const renderPlan = !currentGame
        ? UiRenderRuntime.plan()
        : UiRenderRuntime.plan({
            hasGame: true,
            current: currentGame.currentPlayer(),
            winner: currentGame.checkWinner(),
        });
    UiRenderRuntime.execute(renderPlan, {
        syncTutorialControls,
        renderWinnerState,
        renderActiveGameState,
        persistAfterRender,
    });
    if (typeof updateGameActivityStatus === 'function') updateGameActivityStatus();
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
    const gameState = uiGameRuntimeSnapshot();
    const currentGame = gameState.game;
    const winnerIdx = currentGame.players.indexOf(winner);
    const turnTimeline = document.getElementById('turnTimeline');
    if (turnTimeline) turnTimeline.style.display = 'none';
    const isCPUWinner = !!currentCpuPlayerAt(winnerIdx);
    let streakState = UiWinner.streakRuntime.snapshot();
    if (!winSoundPlayed) {
        streakState = UiWinner.streakRuntime.recordWinner(winner.name);
        safeUiStorageSet('winStreak', streakState.winStreak);
        safeUiStorageSet('lastWinnerName', streakState.lastWinnerName);
    }
    let resultAdSlot = '';
    try {
        resultAdSlot = typeof renderAdSlot === 'function' ? renderAdSlot('result-bottom') : '';
    } catch (error) {
        resultAdSlot = '';
    }
    const firstPresentation = !winSoundPlayed;
    if (firstPresentation) UiWinner.gameOriginRuntime.record(uiOnlineRuntimeSnapshot().isOnlineGame);
    const statusHtml = UiWinner.buildWinnerScreenHtml({
        winner,
        players: currentGame.players,
        isCpuWinner: isCPUWinner,
        turnCount: currentGame.turnCount,
        winStreak: streakState.winStreak,
        logEntries: logHistoryController.snapshot().entries,
        logTypes: LOG_TYPES,
        reviewSummary: currentGame.reviewSummary,
        canRematch: !UiWinner.gameOriginRuntime.wasOnline(),
        canOnlineRematch: UiWinner.gameOriginRuntime.wasOnline() &&
            !!uiOnlineRuntimeSnapshot().socket,
        resultAdSlot,
        escapeHtml,
    });
    const winnerStatusText = UiWinner.buildWinnerStatusText({
        winner,
        isCpuWinner: isCPUWinner,
        turnCount: currentGame.turnCount,
    });
    UiWinnerEffects.execute({ statusHtml, winnerStatusText, firstPresentation }, {
        setStatusHtml(html) {
            const status = document.getElementById('status');
            if (status.innerHTML !== html) status.innerHTML = html;
        },
        announceWinner(text) {
            const status = document.getElementById("turnStatusAnnouncer");
            if (status) status.textContent = text;
        },
        markPresented() {
            winSoundPlayed = true;
            triggerUiHaptic('win');
        },
        playWinSound() {
            playSound('win');
        },
        recordStats() {
            const cpuList = Array.isArray(gameState.cpuPlayers) ? gameState.cpuPlayers : [];
            recordGameStats(winner, currentGame, cpuList);
        },
        notifyFinish() {
            if (typeof notifyGameLifecycleFinish === 'function') notifyGameLifecycleFinish(winner);
        },
        clearSavedGame() {
            safeUiStorageRemove('savedGame');
            safeUiStorageRemove('savedGameV1');
            safeUiStorageRemove('savedGameHistoryV1');
        },
        clearOnlineSession() {
            if (!UiWinner.gameOriginRuntime.wasOnline()) clearOnlineSessionAfterWin();
        },
        markOnlineFinished() {
            if (!UiWinner.gameOriginRuntime.wasOnline() &&
                    typeof markOnlineGameFinished === 'function') {
                markOnlineGameFinished();
            }
        },
        refreshPwaUpdateState() {
            if (typeof refreshPwaUpdateState === 'function') refreshPwaUpdateState();
        },
        updateResumeButton,
        startConfetti,
        applyTerminalControls(controls) {
            document.getElementById("btnRoll").disabled = controls.rollDisabled;
            const btnSkip = document.getElementById("btnSkip");
            btnSkip.disabled = controls.skipDisabled;
            btnSkip.textContent = controls.skipText;
            document.getElementById("btnReroll").style.display = controls.rerollDisplay;
            document.getElementById("diceChoose").innerHTML = controls.diceChooseHtml;
            document.getElementById("buildMenu").innerHTML = controls.buildMenuHtml;
            renderBuildShortcut(true);
        },
        renderTutorial,
        renderLog,
        renderPlayers,
        focusWinnerAction() {
            const action = document.getElementById('winnerRestartButton');
            if (action && typeof action.focus === 'function') action.focus();
        },
    });
}

async function shareGameResult() {
    const currentGame = uiGameRuntimeSnapshot().game;
    const winner = currentGame && currentGame.checkWinner();
    const text = currentGame && UiWinner.buildShareText({
        winner,
        players: currentGame.players,
        turnCount: currentGame.turnCount,
    });
    if (!text || typeof navigator === 'undefined' || !navigator.clipboard ||
            typeof navigator.clipboard.writeText !== 'function') {
        showNotice('この端末では結果をコピーできませんでした');
        return false;
    }
    try {
        await navigator.clipboard.writeText(text);
        showNotice('対戦結果をコピーしました。共有先へ貼り付けてください');
        return true;
    } catch (_) {
        showNotice('この端末では結果をコピーできませんでした');
        return false;
    }
}

async function shareGameResultImage() {
    const currentGame = uiGameRuntimeSnapshot().game;
    const winner = currentGame && currentGame.checkWinner();
    const model = currentGame && UiWinner.buildResultCardModel({
        winner,
        players: currentGame.players,
        turnCount: currentGame.turnCount,
    });
    if (!model || typeof document === 'undefined') return false;
    const canvas = document.createElement('canvas');
    if (!UiWinner.drawResultCard(canvas, model)) {
        showNotice('結果画像を作成できませんでした');
        return false;
    }
    const blob = await new Promise(resolve => {
        if (typeof canvas.toBlob === 'function') canvas.toBlob(resolve, 'image/png');
        else resolve(null);
    });
    if (!blob) {
        showNotice('結果画像を作成できませんでした');
        return false;
    }
    const file = typeof File === 'function'
        ? new File([blob], 'dice-city-result.png', { type: 'image/png' }) : null;
    try {
        if (file && navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
            await navigator.share({ files: [file], title: 'ダイスシティ 対戦結果' });
            showNotice('対戦結果を共有しました');
            return true;
        }
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'dice-city-result.png';
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        showNotice('対戦結果の画像を保存しました');
        return true;
    } catch (_) {
        showNotice('結果画像を共有できませんでした');
        return false;
    }
}

function renderActiveGameState(current) {
    UiWinner.gameOriginRuntime.reset();
    const gameState = uiGameRuntimeSnapshot();
    const onlineState = uiOnlineRuntimeSnapshot();
    const currentGame = gameState.game;
    const isCPUTurn = !!currentCpuPlayerAt(currentGame.currentPlayerIndex);
    const previousTurnState = activeGameTurnStateController.snapshot();
    const view = UiGameStatusView.buildActiveGameView({
        current,
        players: currentGame.players,
        phase: currentGame.phase,
        phases: GAME_PHASES,
        rollPhase: GAME_PHASES.ROLL,
        currentPlayerIndex: currentGame.currentPlayerIndex,
        previousPlayerIndex: previousTurnState.previousPlayerIndex,
        currentTurnCount: currentGame.turnCount,
        previousTurnCount: previousTurnState.previousTurnCount,
        previousPhase: previousTurnState.previousPhase,
        isReplaying: onlineState.isReplaying,
        currentName: current.name,
        isCpuTurn: isCPUTurn,
        canRoll: canShowUiAction('rollDice'),
        canNextTurn: canShowUiAction('nextTurn'),
        pendingRenovation: currentGame.pendingRenovation,
        pendingIT: currentGame.pendingIT,
        builtThisTurn: currentGame.builtThisTurn,
        previousCoins: gameState.prevCoins,
        cpuPlayerIndexes: currentGame.players
            .map((player, playerIndex) => currentCpuPlayerAt(playerIndex) ? playerIndex : -1)
            .filter(playerIndex => playerIndex >= 0),
        isOnlineGame: onlineState.isOnlineGame,
        myPlayerIndex: onlineState.myPlayerIndex,
        lastDice1: currentGame.lastDice1,
        lastDice2: currentGame.lastDice2,
        lastDiceResult: currentGame.lastDiceResult,
    });
    UiGameStatusEffects.execute(view, {
        setStatusText(text) {
            document.getElementById("status").textContent = text;
        },
        renderTurnTimeline(timeline) {
            const container = document.getElementById('turnTimeline');
            if (container) container.style.display = 'block';
            UiGameStatusEffects.applyTurnTimeline(
                timeline,
                document.getElementById('turnTimelineList')
            );
        },
        announceTurn(name, isCpuTurn, playerIndex) {
            showTurnAnnouncer(name, isCpuTurn, playerIndex);
            if (!isCpuTurn) triggerUiHaptic('turn');
        },
        setPreviousPlayerIndex(playerIndex, turnCount, phase) {
            activeGameTurnStateController.set(playerIndex, turnCount, phase);
        },
        setRollDisabled(disabled) {
            document.getElementById("btnRoll").disabled = disabled;
        },
        setSkipButton(skipButton) {
            const btnSkip = document.getElementById("btnSkip");
            btnSkip.disabled = skipButton.disabled;
            btnSkip.textContent = skipButton.textContent;
        },
        hideReroll() {
            document.getElementById("btnReroll").style.display = "none";
        },
        updateDiceDisplay(diceValues) {
            updateDiceDisplay(diceValues);
            const diceKey = [
                currentGame.turnCount,
                currentGame.currentPlayerIndex,
                currentGame.usedReroll ? 1 : 0,
                ...(diceValues || []),
            ].join(':');
            const announcementPlan = diceResultAnnouncementController.transition(diceValues, {
                eligible: diceResultAnnouncementEligible(),
                rerolled: currentGame.usedReroll === true,
                resultKey: UiDiceDisplay.resultIdentity(
                    currentGame.diceResolutionSequence,
                    diceKey
                ),
            });
            UiDiceDisplay.applyAnnouncementPlan(
                announcementPlan,
                document.getElementById('diceResultAnnouncer')
            );
        },
        runRenderStep(name, callback) {
            safeRenderStep(name, callback);
        },
        renderDiceChoose() {
            renderDiceChoose();
        },
        renderPending() {
            renderPending();
        },
        renderTutorial() {
            renderTutorial();
        },
        renderLog() {
            renderLog();
        },
        renderPlayers() {
            renderPlayers();
        },
        showCoinAnimation(playerIndex, diff) {
            showCoinAnimation(playerIndex, diff);
        },
        announceCoinChanges(text) {
            const announcer = document.getElementById('coinChangeAnnouncer');
            if (!announcer) return;
            announcer.textContent = '';
            announcer.textContent = text;
        },
        setPreviousCoins(coins) {
            GameRuntimeState.runtime.setPreviousCoins(coins);
        },
        renderBuildMenu() {
            renderBuildMenu();
        },
        syncUiInteractabilityAfterRender() {
            if (typeof syncUiInteractabilityAfterRender === 'function') syncUiInteractabilityAfterRender('render-active-game-state');
        },
        schedulePostBuildUiStabilizer() {
            if (typeof schedulePostBuildUiStabilizer === 'function') schedulePostBuildUiStabilizer('render-active-game-state');
        },
        checkAutoSkip() {
            checkAutoSkip();
        },
    });
    const handoff = hotseatHandoffController.observe({
        turnChanged: view.turnTransition.announce &&
            previousTurnState.previousPlayerIndex !== currentGame.currentPlayerIndex,
        isOnlineGame: onlineState.isOnlineGame,
        isCpuTurn: isCPUTurn,
        playerIndex: currentGame.currentPlayerIndex,
        playerName: current.name,
    });
    if (handoff.visible) applyHotseatHandoff(handoff);
}

function persistAfterRender() {
    saveGameState();
}

function currentUiAllowedActions() {
    const currentGame = uiGameRuntimeSnapshot().game;
    if (!currentGame) return new Set();
    try {
        if (typeof currentGame.allowedActions === 'function') return currentGame.allowedActions();
        if (typeof GameManager !== 'undefined' && GameManager && typeof GameManager.allowedActionsFor === 'function') return GameManager.allowedActionsFor(currentGame);
    } catch (_) {}
    return new Set();
}

function uiOnlineActionFlightState() {
    try {
        if (typeof getOnlineActionFlightState === 'function') return getOnlineActionFlightState();
    } catch (_) {}
    return {
        inFlight: typeof onlineActionInFlight !== 'undefined' && !!onlineActionInFlight,
        startedAt: typeof onlineActionInFlightAt !== 'undefined' ? onlineActionInFlightAt : 0,
    };
}

function isOnlineUiInputBlocked() {
    const onlineState = uiOnlineRuntimeSnapshot();
    const isReconnecting = typeof isOnlineReconnectInputBlocked === 'function'
        ? isOnlineReconnectInputBlocked()
        : onlineState.isReconnectingOnline;
    const socketAvailable = !!onlineState.socket;
    return UiInputPolicy.onlineBlockReason({
        isOnlineGame: onlineState.isOnlineGame,
        isReconnecting,
        actionInFlight: uiOnlineActionFlightState().inFlight,
        socketAvailable,
        socketConnected: socketAvailable ? onlineState.socket.connected : false,
    }) !== '';
}

function isCurrentHumanUiTurn() {
    const currentGame = uiGameRuntimeSnapshot().game;
    const onlineState = uiOnlineRuntimeSnapshot();
    const hasGame = !!currentGame;
    const currentPlayerIndex = hasGame ? currentGame.currentPlayerIndex : -1;
    return UiInputPolicy.isHumanTurn({
        hasGame,
        isCpuTurn: hasGame && !!currentCpuPlayerAt(currentPlayerIndex),
        isOnlineGame: onlineState.isOnlineGame,
        onlineBlockReason: isOnlineUiInputBlocked() ? 'blocked' : '',
        currentPlayerIndex,
        myPlayerIndex: onlineState.myPlayerIndex,
    });
}

function canShowUiAction(action) {
    const humanTurn = !!action && isCurrentHumanUiTurn();
    return UiInputPolicy.canShowAction(
        action,
        humanTurn,
        humanTurn ? currentUiAllowedActions() : null
    );
}

function uiActionDisabledAttr(action) {
    return canShowUiAction(action) ? '' : ' disabled';
}

function setDiceChooseContent(el, html, identity = '') {
    if (!el) return;
    const nextHtml = html || "";
    const active = document.activeElement;
    const activeWithin = !!active && (active === el ||
        (typeof el.contains === 'function' && el.contains(active)));
    const focusPlan = diceChoiceFocusController.transition(
        !!nextHtml,
        diceChoiceFocusEligible(),
        nextHtml ? identity : '',
        activeWithin
    );
    if (el.innerHTML !== nextHtml) el.innerHTML = nextHtml;
    if (el.style) el.style.display = nextHtml ? "block" : "none";
    UiDiceChoice.applyFocusPlan(focusPlan, el, {
        restorePrimaryFocus: () => UiScreenFocus.focusGamePrimary(document),
    });
}

function diceChoiceFocusEligible() {
    return uiOnlineRuntimeSnapshot().isReplaying !== true && isCurrentHumanUiTurn();
}

function diceResultAnnouncementEligible() {
    const currentGame = uiGameRuntimeSnapshot().game;
    const onlineState = uiOnlineRuntimeSnapshot();
    if (!currentGame || onlineState.isReplaying === true ||
            !!currentCpuPlayerAt(currentGame.currentPlayerIndex)) return false;
    return !onlineState.isOnlineGame ||
        currentGame.currentPlayerIndex === onlineState.myPlayerIndex;
}

function renderDiceChoose() {
    const el = document.getElementById("diceChoose");
    if (!el) return;
    if (!isCurrentHumanUiTurn()) { setDiceChooseContent(el, ""); return; }
    const currentGame = uiGameRuntimeSnapshot().game;
    const options = {
        phase: currentGame.phase,
        lastDiceResult: currentGame.lastDiceResult,
        allowedActions: currentUiAllowedActions(),
        disabledAttr: uiActionDisabledAttr,
        phases: GAME_PHASES,
    };
    const html = UiDiceChoice.buildHtml(options);
    setDiceChooseContent(el, html, UiDiceChoice.choiceIdentity(options));
}

function shouldShowPendingForCurrentPlayer() {
    const currentGame = uiGameRuntimeSnapshot().game;
    const state = {
        phase: currentGame.phase,
        pendingPhase: GAME_PHASES.PENDING,
        pendingIT: currentGame.pendingIT,
        pendingRenovation: currentGame.pendingRenovation,
    };
    if (!UiPendingMenu.isPendingDisplayCandidate(state)) return false;
    return UiPendingMenu.shouldShowForCurrentPlayer({
        ...state,
        isHumanTurn: isCurrentHumanUiTurn(),
    });
}

function normalizePendingModalInteraction(el, modal, hasContent) {
    UiPendingEffects.applyModalInteraction(
        UiPendingMenu.pendingModalInteractionView(hasContent),
        { body: document.body, modal, content: el }
    );
}

function pendingModalFocusEligible() {
    const onlineState = uiOnlineRuntimeSnapshot();
    return onlineState.isReplaying !== true && isCurrentHumanUiTurn();
}

function updatePendingModalContent(el, modal, html) {
    if (!el || !modal) return false;
    let nextHtml = html || "";
    if (nextHtml) {
        const blockingIds = visibleBlockingModalIds().filter(id => id !== 'pendingModal');
        if (blockingIds.length > 0) {
            recordModalPolicyViolation('pending-modal-open-denied', { parentModalId: blockingIds[0], childModalId: 'pendingModal', visibleBlockingModalIds: blockingIds });
            nextHtml = '';
        }
    }
    return pendingModalUpdateController.run(() => {
        const documentRef = typeof document !== 'undefined' ? document : null;
        const activeElement = documentRef && documentRef.activeElement;
        const focusPlan = pendingModalFocusController.transition(!!nextHtml, {
            activeWithin: UiPendingEffects.containsActiveElement(modal, el, activeElement),
            focusEligible: pendingModalFocusEligible(),
        });
        if (el.innerHTML !== nextHtml) el.innerHTML = nextHtml;
        normalizePendingModalInteraction(el, modal, !!nextHtml);
        UiPendingEffects.applyFocusPlan(focusPlan, {
            content: el,
            restoreGameFocus: () => UiScreenFocus.focusGame(documentRef),
        });
        return true;
    });
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
    const currentGame = uiGameRuntimeSnapshot().game;
    const nextPending = typeof GameManager !== 'undefined' && GameManager.nextPendingActionFor
        ? GameManager.nextPendingActionFor(currentGame)
        : null;
    const allowedActions = currentUiAllowedActions();
    const html = buildPendingMenuHtml(currentGame, allowedActions, nextPending);
    updatePendingModalContent(el, modal, html);
}

function renderPlayerDifficultyLabel(difficulty) {
    return UiPlayerDisplay.difficultyLabel(difficulty);
}

function validRenderCpuDifficulty(value) {
    return UiPlayerDisplay.normalizeCpuDifficulty(value);
}

function getPlayerSettingForRender(index, player) {
    const setup = GameSetupState.runtime.snapshot();
    const gameState = uiGameRuntimeSnapshot();
    const settings = setup.playerSettings;
    const cpus = Array.isArray(gameState.cpuPlayers) ? gameState.cpuPlayers : [];
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
            playersLength: gameState.game && Array.isArray(gameState.game.players)
                ? gameState.game.players.length : 0,
        });
    }
    return resolved;
}

function renderPlayers() {
    const currentGame = uiGameRuntimeSnapshot().game;
    const onlineState = uiOnlineRuntimeSnapshot();
    const settings = currentGame.players.map((player, index) => getPlayerSettingForRender(index, player));
    const html = UiPlayerDisplay.buildPlayersHtml(currentGame.players, {
        settings,
        currentPlayerIndex: currentGame.currentPlayerIndex,
        compactInactive: currentGame.players.length >= 5,
        myPlayerIndex: onlineState.isOnlineGame
            ? onlineState.myPlayerIndex
            : -1,
        enabledLandmarks: getEnabledLandmarkSelection(),
        getLandmarkEmoji,
        compareCardNames: compareCardNamesForDisplay,
        escapeHtml,
        loanEffect: CARD_EFFECTS.LOAN,
    });
    const navigation = document.getElementById('playerNavigation');
    const navigationHtml = UiPlayerDisplay.buildPlayerNavigationHtml(currentGame.players, {
        currentPlayerIndex: currentGame.currentPlayerIndex,
        myPlayerIndex: onlineState.isOnlineGame ? onlineState.myPlayerIndex : -1,
        escapeHtml,
    });
    if (navigation) {
        navigation.innerHTML = navigationHtml;
        navigation.style.display = navigationHtml ? 'flex' : 'none';
    }
    document.getElementById("players").innerHTML = html;
}

function getEffectText(card) {
    return UiCardDetail.cardEffectText(card, CARD_EFFECT_DESCRIPTIONS);
}

function landmarkPresentation(name) {
    return UiCardDetail.landmarkPresentation(name, Player._LANDMARK_DEFS, LANDMARK_NAMES.YAKUSHO);
}

function getLandmarkEffectText(name) {
    return landmarkPresentation(name).effectText;
}

function getLandmarkEmoji(name) {
    return landmarkPresentation(name).emoji;
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
    return UiBuildMenu.buildCardFilterBarHtml(buildMenuFilterController.get());
}

function buildVisibleCardButtonsHtml(current, canBuildCardAction) {
    return UiBuildMenu.buildVisibleCardButtonsHtml({
        cards: CARDS,
        cardFilter: buildMenuFilterController.get(),
        enabledCards: getEnabledCardSelection(),
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
        enabledLandmarks: getEnabledLandmarkSelection(),
        currentCoins: current.coins,
        canBuildLandmarkAction,
        landmarkCost: Player.landmarkCost,
        renderLandmarkBuildButton,
    });
}

function currentUndoBuildActionState() {
    const gameState = uiGameRuntimeSnapshot();
    const currentGame = gameState.game;
    if (!gameState.undoState || !currentGame || !currentGame.builtThisTurn) {
        return UiBuildMenu.undoBuildActionState({
            hasUndoState: !!gameState.undoState,
            hasGame: !!currentGame,
            builtThisTurn: !!(currentGame && currentGame.builtThisTurn),
        });
    }
    try {
        const allowedActions = currentUiAllowedActions();
        const visibleState = UiBuildMenu.undoBuildActionState({
            hasUndoState: true,
            hasGame: true,
            builtThisTurn: true,
            allowedActions,
        });
        return UiBuildMenu.undoBuildActionState({
            hasUndoState: true,
            hasGame: true,
            builtThisTurn: true,
            allowedActions,
            isHumanTurn: visibleState.visible && isCurrentHumanUiTurn(),
        });
    } catch (_) {
        return UiBuildMenu.undoBuildActionState({});
    }
}

function canRenderUndoBuildAction() {
    return currentUndoBuildActionState().visible;
}

function buildUndoBuildButtonHtml() {
    return UiBuildMenu.buildUndoBuildButtonHtml(currentUndoBuildActionState());
}

function buildBuildMenuHtml(current, canBuildCardAction, canBuildLandmarkAction) {
    const filterBtnsHtml = buildCardFilterBarHtml();
    const cardHtml = buildVisibleCardButtonsHtml(current, canBuildCardAction) ||
        UiBuildMenu.buildCardEmptyStateHtml(buildMenuFilterController.get());
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

function hasPendingBuildChoice(currentGame) {
    if (!currentGame) return false;
    return UiPendingMenu.isPendingDisplayCandidate({
        phase: currentGame.phase,
        pendingPhase: GAME_PHASES.PENDING,
        pendingIT: currentGame.pendingIT,
        pendingRenovation: currentGame.pendingRenovation,
    });
}

function renderBuildShortcut(forceHidden = false) {
    const button = document.getElementById('btnBuildShortcut');
    const currentGame = uiGameRuntimeSnapshot().game;
    const onlineState = uiOnlineRuntimeSnapshot();
    const view = !forceHidden && currentGame
        ? UiBuildMenu.buildShortcutView({
            phase: currentGame.phase,
            buildPhase: GAME_PHASES.BUILD,
            hasPending: hasPendingBuildChoice(currentGame),
            builtThisTurn: currentGame.builtThisTurn,
            isHumanTurn: isCurrentHumanUiTurn(),
            isReplaying: onlineState.isReplaying,
            inputBlocked: isOnlineUiInputBlocked(),
            allowedActions: currentUiAllowedActions(),
        })
        : UiBuildMenu.buildShortcutView({});
    return UiBuildMenu.applyBuildShortcutView(button, view);
}

function focusBuildMenu() {
    return UiBuildMenu.focusAndScrollToBuildMenu(document.getElementById('buildMenu'));
}

function renderBuildMenu() {
    const buildMenu = document.getElementById("buildMenu");
    const currentGame = uiGameRuntimeSnapshot().game;
    renderBuildShortcut();
    if (!buildMenu || !currentGame) return;
    const activeElement = document.activeElement;
    let activeWithinBuildMenu = false;
    let ancestor = activeElement;
    while (ancestor) {
        if (ancestor === buildMenu) {
            activeWithinBuildMenu = true;
            break;
        }
        ancestor = ancestor.parentElement;
    }
    const actionElement = activeWithinBuildMenu && typeof activeElement?.closest === 'function'
        ? activeElement.closest('[data-action]')
        : activeElement;
    const focusPlan = buildActionFocusController.plan(activeWithinBuildMenu ? {
        action: actionElement?.dataset?.action,
        cardName: actionElement?.dataset?.cardName,
        landmarkName: actionElement?.dataset?.landmarkName,
    } : {}, uiOnlineRuntimeSnapshot().isReplaying !== true && isCurrentHumanUiTurn());
    const current = currentGame.currentPlayer();
    const buildState = {
        phase: currentGame.phase,
        buildPhase: GAME_PHASES.BUILD,
        pendingRenovation: currentGame.pendingRenovation,
        builtThisTurn: currentGame.builtThisTurn,
    };
    const buildGateOpen = UiBuildMenu.isBuildGateOpen(buildState);
    const actionState = UiBuildMenu.buildActionState({
        ...buildState,
        isHumanTurn: buildGateOpen && isCurrentHumanUiTurn(),
        allowedActions: buildGateOpen ? currentUiAllowedActions() : new Set(),
    });
    buildMenu.innerHTML = buildBuildMenuHtml(current, actionState.canBuildCardAction, actionState.canBuildLandmarkAction);
    UiBuildMenu.applyBuildActionFocusPlan(focusPlan, {
        findIdentity(identity) {
            if (!identity || typeof buildMenu.querySelectorAll !== 'function') return null;
            return Array.from(buildMenu.querySelectorAll(`[data-action="${identity.action}"]`))
                .find(element => identity.action === 'buildCard'
                    ? element.dataset?.cardName === identity.name
                    : element.dataset?.landmarkName === identity.name) || null;
        },
        focusIdentity: focusBuildActionElement,
        focusFallback() {
            const btnSkip = document.getElementById('btnSkip');
            return focusBuildActionElement(btnSkip) || UiScreenFocus.focusGame(document);
        },
    });
}

function focusBuildActionElement(element) {
    if (!element || typeof element.focus !== 'function' ||
            !UiBuildMenu.canRestoreCardFilterFocus(cardFilterFocusFacts(element))) return false;
    try {
        element.focus({ preventScroll: true });
    } catch (_) {
        try {
            element.focus();
        } catch (_) {
            return false;
        }
    }
    return true;
}

function cardFilterFocusFacts(element) {
    let ancestor = element;
    let ancestorHidden = false;
    while (ancestor) {
        const style = ancestor.style || {};
        const view = document.defaultView;
        const computed = view && typeof view.getComputedStyle === 'function'
            ? view.getComputedStyle(ancestor)
            : null;
        if (ancestor.hidden || ancestor.inert || ancestor.getAttribute?.('aria-hidden') === 'true' ||
            style.display === 'none' || style.visibility === 'hidden' ||
            computed?.display === 'none' || computed?.visibility === 'hidden') {
            ancestorHidden = true;
            break;
        }
        ancestor = ancestor.parentElement;
    }
    return {
        connected: element?.isConnected !== false,
        hidden: !!element?.hidden,
        disabled: !!element?.disabled,
        ancestorHidden,
    };
}

function restoreCardFilterFocus(plan) {
    if (!plan.restore) return false;
    const buildMenu = document.getElementById('buildMenu');
    if (!buildMenu || typeof buildMenu.querySelectorAll !== 'function') return false;
    const target = Array.from(buildMenu.querySelectorAll('[data-action="setCardFilter"]'))
        .find(button => button.dataset?.cardFilter === plan.cardFilter);
    if (!target || typeof target.focus !== 'function') return false;
    if (!UiBuildMenu.canRestoreCardFilterFocus(cardFilterFocusFacts(target))) return false;
    try {
        target.focus({ preventScroll: true });
    } catch (_) {
        try {
            target.focus();
        } catch (_) {
            return false;
        }
    }
    return true;
}

function setCardFilter(color, sourceElement = null) {
    const focusPlan = UiBuildMenu.cardFilterFocusPlan(color, {
        action: sourceElement?.dataset?.action,
        cardFilter: sourceElement?.dataset?.cardFilter,
    });
    const transition = buildMenuFilterController.set(color);
    if (transition.shouldRender) renderBuildMenu();
    restoreCardFilterFocus(focusPlan);
}

function bcSelectCard(btn, inputId) {
    if (!btn) return false;
    const group = typeof btn.closest === 'function' ? btn.closest('.bc-chip-group') : null;
    const groupButtons = group && typeof group.querySelectorAll === 'function'
        ? group.querySelectorAll('.bc-chip')
        : [];
    const view = UiPendingMenu.businessCardSelectionView(groupButtons.length, btn.dataset?.idx ?? '');
    return UiPendingEffects.applyBusinessCardSelection(view, {
        groupButtons,
        selectedButton: btn,
        findInput: () => document.getElementById(inputId),
    });
}

function showTurnAnnouncer(name, isCPU, playerIndex) {
    const el = document.getElementById("turnAnnouncer");
    const text = document.getElementById("turnAnnouncerText");
    if (!el || !text) return;
    el.classList.remove("hiding");
    const view = UiTurnAnnouncer.buildView(name, isCPU);
    el.style.display = view.display;
    text.textContent = view.text;
    const status = document.getElementById("turnStatusAnnouncer");
    if (status) status.textContent = UiTurnAnnouncer.buildStatusText(name, isCPU, playerIndex);
    turnAnnouncerTimerController.start(view, {
        beginHide() { el.classList.add("hiding"); },
        finishHide() {
            el.style.display = "none";
            el.classList.remove("hiding");
        },
    });
}

function switchTab(tab) {
    const view = UiTabView.buildMainTabView(tab);
    UiTabEffects.applyMainTabView({
        localContent: document.getElementById("tabContentLocal"),
        onlineContent: document.getElementById("tabContentOnline"),
        tournamentContent: document.getElementById("tabContentTournament"),
        statsContent: document.getElementById("tabContentStats"),
        localButton: document.getElementById("tabLocal"),
        onlineButton: document.getElementById("tabOnline"),
        tournamentButton: document.getElementById("tabTournament"),
        statsButton: document.getElementById("tabStats"),
    }, view);
    if (view.renderStats) renderStats();
}

function switchOnlineTab(tab) {
    const view = UiTabView.buildOnlineTabView(tab);
    UiTabEffects.applyOnlineTabView({
        createContent: document.getElementById("onlineCreate"),
        joinContent: document.getElementById("onlineJoin"),
        createButton: document.getElementById("onlineTabCreate"),
        joinButton: document.getElementById("onlineTabJoin"),
    }, view);
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

const cardSelectState = UiCardSelect.createSelectionController(GameSelectionState.runtime.snapshot());
const uiCardSelectEffects = UiCardSelectEffects.create({
    getElementById: id => document.getElementById(id),
    getActiveElement: () => document.activeElement,
    getWindow: () => typeof window !== 'undefined' ? window : null,
    findToggle(identity) {
        const modal = document.getElementById('cardSelectModal');
        if (!modal || typeof modal.querySelectorAll !== 'function') return null;
        return Array.from(modal.querySelectorAll('[data-action]')).find(element => {
            if (!element || !element.dataset || element.dataset.action !== identity.action) {
                return false;
            }
            return identity.action === 'toggleCard'
                ? element.dataset.cardName === identity.name
                : element.dataset.landmarkName === identity.name;
        }) || null;
    },
});

function syncCardSelectStateFromRuntime() {
    const snapshot = GameSelectionState.runtime.snapshot();
    cardSelectState.replaceCards(snapshot.enabledCards);
    return cardSelectState.replaceLandmarks(snapshot.enabledLandmarks);
}

function applyCardSelectStateSnapshot() {
    const snapshot = cardSelectState.snapshot();
    replaceEnabledCardSelection(snapshot.enabledCards);
    replaceEnabledLandmarkSelection(snapshot.enabledLandmarks);
}
const logHistoryController = UiLogDisplay.createHistoryController();
const activeGameTurnStateController = UiGameStatusEffects.createTurnStateController();
const hotseatHandoffController = UiTurnPrivacy.createHandoffController();
const turnAnnouncerTimerController = UiTurnAnnouncer.createTimerController();
const buildMenuFilterController = UiBuildMenu.createFilterController();
const modalRuntimeController = UiModalPolicy.createRuntimeController();

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
    const gameState = uiGameRuntimeSnapshot();
    const onlineState = uiOnlineRuntimeSnapshot();
    const currentGame = gameState.game;
    const pendingActions = currentGame && typeof GameManager !== 'undefined' && typeof GameManager.pendingActionsFor === 'function'
        ? GameManager.pendingActionsFor(currentGame)
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
    return UiRuntimeSnapshot.build({
        reason,
        timestamp: new Date().toISOString(),
        game: currentGame,
        isCpuTurn: !!(currentGame && currentCpuPlayerAt(currentGame.currentPlayerIndex)),
        online: {
            isOnlineGame: !!onlineState.isOnlineGame,
            myPlayerIndex: onlineState.myPlayerIndex,
        },
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
    });
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
        const stored = safeUiStorageSet('machikoroLastFlowTrace', JSON.stringify(trace).slice(0, 4000));
        if (stored && typeof markClientFlowCheckpoint === 'function') markClientFlowCheckpoint(event, details);
    } catch (_) {}
    return trace;
}

function reportRenderStepError(step, error) {
    const currentGame = uiGameRuntimeSnapshot().game;
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
            phase: currentGame && currentGame.phase,
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

function resetFullLog() {
    logHistoryController.reset();
    activeGameTurnStateController.reset();
    applyHotseatHandoff(hotseatHandoffController.reset());
    buildMenuFilterController.clear();
}

const uiModalDomEffects = UiModalDomEffects.createRuntime({
    controller: modalRuntimeController,
    getDocument: () => typeof document === 'undefined' ? null : document,
    getVisibleBlockingIds: () => visibleBlockingModalIds(),
    getWindow: () => typeof window === 'undefined' ? null : window,
    inertRootIds: MODAL_INERT_ROOT_IDS,
    policy: UiModalPolicy,
    recordTrace: (event, details) => {
        if (typeof recordFlowTrace === 'function') recordFlowTrace(event, details);
    },
});

function isVisibleFocusableElement(element) {
    return uiModalDomEffects.isVisibleFocusable(element);
}

function getFocusableElements(root) {
    return uiModalDomEffects.focusableElements(root);
}

function focusModal(modal) {
    uiModalDomEffects.focusModal(modal);
}

function clearOrphanAccessibleModalLocks() {
    return uiModalDomEffects.clearOrphanLocks();
}

function setAppInertForModal(enabled) {
    uiModalDomEffects.setAppInert(enabled);
}

function resetAccessibleModalRuntimeState() {
    buildActionFocusController.reset();
    diceChoiceFocusController.reset();
    diceResultAnnouncementController.reset();
    pendingModalFocusController.reset();
    return uiModalDomEffects.resetRuntimeState();
}

function modalPolicyFor(id) {
    return UiModalPolicy.policyFor(id);
}

function isModalVisibleById(id) {
    return uiModalDomEffects.isModalVisible(id);
}

function modalStackExceptionKey(parentId, childId) {
    return UiModalPolicy.stackExceptionKey(parentId, childId);
}

function hasRegisteredModalStackException(parentId, childId) {
    return UiModalPolicy.hasStackException(parentId, childId);
}

function recordModalPolicyViolation(type, details = {}) {
    return uiModalRuntime.recordViolation(type, details);
}

function visibleBlockingModalIds() {
    return uiModalRuntime.visibleBlockingIds();
}

function canOpenBlockingModal(id) {
    return uiModalRuntime.canOpen(id);
}

function normalizeModalVisualStateForOpen(modal) {
    uiModalDomEffects.normalizeForOpen(modal);
}

const uiModalRuntime = UiModalRuntime.createRuntime({
    appendViolation: entry => {
        try {
            const root = typeof window !== 'undefined' ? window : globalThis;
            if (!root) return;
            const list = Array.isArray(root.__machikoroModalPolicyViolations)
                ? root.__machikoroModalPolicyViolations
                : [];
            list.push(entry);
            while (list.length > 20) list.shift();
            root.__machikoroModalPolicyViolations = list;
        } catch (_) {}
    },
    buildSnapshot: reason => buildRuntimeStateSnapshot(reason),
    canRenderPending: () => typeof renderPending === 'function',
    canTrace: () => typeof recordFlowTrace === 'function',
    closePlan: UiModalClose,
    controller: modalRuntimeController,
    domEffects: uiModalDomEffects,
    getCloseHandler: id => MODAL_CLOSE_HANDLERS[id] || null,
    getDocument: () => typeof document === 'undefined' ? null : document,
    isCloseAuthorityEnabled: () => isUiModalCloseEffectAuthorityEnabled(),
    isOpenAuthorityEnabled: () => isUiModalOpenEffectAuthorityEnabled(),
    nowIso: () => new Date().toISOString(),
    openPlan: UiModalOpen,
    policy: UiModalPolicy,
    recordTrace: (event, details) => recordFlowTrace(event, details),
    renderPending: () => renderPending(),
    warn: (...args) => {
        if (typeof console !== 'undefined' && typeof console.warn === 'function') {
            console.warn(...args);
        }
    },
});

function isUiModalOpenEffectAuthorityEnabled() {
    try {
        const root = typeof window !== 'undefined' ? window : globalThis;
        const value = root && root.MACHIKORO_UI_MODAL_OPEN_EFFECT_AUTHORITY_ENABLED;
        return value === true || value === 1 || value === '1';
    } catch (_) {
        return false;
    }
}

function legacyUiModalOpenPlan(id) {
    return uiModalRuntime.legacyOpenPlan(id);
}

function uiModalOpenPlanSelection(id) {
    return uiModalRuntime.selectOpenPlan(id);
}

function runUiModalOpenEffectsLegacy(modal, id) {
    uiModalRuntime.runOpenLegacy(modal, id);
}

function runUiModalOpenEffects(modal, id) {
    uiModalRuntime.runOpen(modal, id);
}

function openAccessibleModal(id) {
    return uiModalRuntime.open(id);
}

function isUiModalCloseEffectAuthorityEnabled() {
    try {
        const root = typeof window !== 'undefined' ? window : globalThis;
        const value = root && root.MACHIKORO_UI_MODAL_CLOSE_EFFECT_AUTHORITY_ENABLED;
        return value === true || value === 1 || value === '1';
    } catch (_) {
        return false;
    }
}

function uiModalClosePlanInput(id, options, visibleBlockingIds, nextActiveModalId) {
    return uiModalRuntime.closePlanInput(
        id,
        options,
        visibleBlockingIds,
        nextActiveModalId
    );
}

function legacyUiModalClosePlan(id, options, visibleBlockingIds, nextActiveModalId) {
    return uiModalRuntime.legacyClosePlan(
        id,
        options,
        visibleBlockingIds,
        nextActiveModalId
    );
}

function uiModalClosePlanSelection(id, options, visibleBlockingIds, nextActiveModalId) {
    return uiModalRuntime.selectClosePlan(
        id,
        options,
        visibleBlockingIds,
        nextActiveModalId
    );
}

function runUiModalCloseEffectsLegacy(id, options, beforeSnapshot,
        visibleBlockingIds, nextActiveModalId) {
    uiModalRuntime.runCloseLegacy(
        id,
        options,
        beforeSnapshot,
        visibleBlockingIds,
        nextActiveModalId
    );
}

function runUiModalCloseEffects(id, options, beforeSnapshot,
        visibleBlockingIds, nextActiveModalId) {
    uiModalRuntime.runClose(
        id,
        options,
        beforeSnapshot,
        visibleBlockingIds,
        nextActiveModalId
    );
}

function closeAccessibleModal(id, options = {}) {
    uiModalRuntime.close(id, options);
}

function setConfirmModalAwaitingChoice(value) {
    try {
        const root = typeof window !== 'undefined' ? window : globalThis;
        if (root) root.__machikoroConfirmModalOpen = !!value;
    } catch (_) {}
}

const confirmModalController = UiModalPolicy.createConfirmController(
    setConfirmModalAwaitingChoice
);

function closeConfirmModal(accepted) {
    const transition = confirmModalController.close(accepted);
    closeAccessibleModal('confirmModal');
    if (transition.cancelHandler) transition.cancelHandler();
}

function handleModalKeydown(event) {
    uiModalRuntime.handleKeydown(event);
}

if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('keydown', handleModalKeydown);
}

const cardSelectModalBindingController = UiCardSelect.createBindingController();

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
    if (!cardSelectModalBindingController.claim()) return;
    const modal = document.getElementById('cardSelectModal');
    if (modal && typeof modal.addEventListener === 'function') {
        modal.addEventListener('click', handleCardSelectModalClick);
    }

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
    const selection = syncCardSelectStateFromRuntime();
    const view = UiCardSelect.buildCardSelectViewModel({
        cardSets: CARD_SETS,
        enabledCards: selection.enabledCards,
        enabledLandmarks: selection.enabledLandmarks,
        landmarkNames: Player.landmarkNames(),
        compareCardNames: compareCardNamesForDisplay,
        buildCardHtml: buildCardSelectToggleButtonHtml,
        buildLandmarkHtml: buildLandmarkSelectToggleButtonHtml,
    });
    uiCardSelectEffects.apply(view);
}

function toggleCard(name) {
    syncCardSelectStateFromRuntime();
    const result = cardSelectState.toggleCard(name);
    if (!result.changed) return;
    applyCardSelectStateSnapshot();
    renderCardSelectModal();
}

function toggleSet(set) {
    const cards = CARD_SETS[set];
    if (!cards) return;
    syncCardSelectStateFromRuntime();
    cardSelectState.toggleSet(cards);
    applyCardSelectStateSnapshot();
    renderCardSelectModal();
}

function toggleLandmark(name) {
    syncCardSelectStateFromRuntime();
    const result = cardSelectState.toggleLandmark(name);
    if (!result.changed) return;
    applyCardSelectStateSnapshot();
    renderCardSelectModal();
}

function toggleLog() {
    const log = document.getElementById("log");
    const summary = document.getElementById("logSummary");
    const icon = document.getElementById("logToggleIcon");
    const header = document.querySelector(".log-header");
    if (!log || !icon || !header || !log.classList || !header.classList) return false;
    const collapsed = log.classList.toggle("collapsed");
    const view = UiLogDisplay.buildLogToggleView(collapsed);
    if (summary && summary.classList) summary.classList.toggle("collapsed", view.collapsed);
    icon.textContent = view.iconText;
    header.classList.toggle("collapsed", view.collapsed);
    if (typeof header.setAttribute === 'function') header.setAttribute('aria-expanded', view.ariaExpanded);
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
    confirmModalController.open(onCancel);
    okBtn.onclick = () => {
        closeConfirmModal(true);
        try {
            onOk();
        } finally {
            UiScreenFocus.ensureCurrentScreenFocus(document);
        }
    };
    cancelBtn.onclick = () => {
        closeConfirmModal(false);
    };
    return true;
}
