const LOG_TYPE_DISPLAY = UiLogDisplay.makeLogTypeDisplay(LOG_TYPES);
const uiClientStorageFacade = ClientStorage.createFacade();
let isUpdatingPendingModalContent = false;

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

function applyTutorialSettingChange(plan) {
    UiTutorialSettings.executeChange(plan, {
        setEnabled(value) { tutorialEnabled = value; },
        setLevel(value) { tutorialLevel = value; },
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
    setTutorialEnabled(!tutorialEnabled);
}

function onChangeTutorialLevel(level) {
    applyTutorialSettingChange(UiTutorialSettings.planLevelChange(level));
}

function cycleTutorialLevel() {
    applyTutorialSettingChange(UiTutorialSettings.planLevelCycle(tutorialLevel));
}

function syncTutorialControls() {
    const view = UiTutorial.buildControlView(tutorialEnabled, tutorialLevel);
    const checkbox = document.getElementById("tutorialEnabled");
    if (checkbox) checkbox.checked = view.enabled;
    const select = document.getElementById("tutorialLevel");
    if (select) select.value = view.selectedLevel;
    const btn = document.getElementById("btnTutorialToggle");
    if (btn) {
        btn.textContent = view.toggleText;
        btn.classList.toggle("active", view.active);
    }
    const levelBtn = document.getElementById("btnTutorialLevel");
    if (levelBtn) {
        levelBtn.textContent = view.levelText;
        levelBtn.classList.toggle("active", view.active);
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
    const renderPlan = !game
        ? UiRenderRuntime.plan()
        : UiRenderRuntime.plan({
            hasGame: true,
            current: game.currentPlayer(),
            winner: game.checkWinner(),
        });
    UiRenderRuntime.execute(renderPlan, {
        syncTutorialControls,
        renderWinnerState,
        renderActiveGameState,
        persistAfterRender,
    });
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
    const statusHtml = UiWinner.buildWinnerScreenHtml({
        winner,
        players: game.players,
        isCpuWinner: isCPUWinner,
        turnCount: game.turnCount,
        winStreak,
        resultAdSlot,
        escapeHtml,
    });
    const firstPresentation = !winSoundPlayed;
    UiWinnerEffects.execute({ statusHtml, firstPresentation }, {
        setStatusHtml(html) {
            document.getElementById("status").innerHTML = html;
        },
        markPresented() {
            winSoundPlayed = true;
        },
        playWinSound() {
            playSound('win');
        },
        recordStats() {
            const cpuList = typeof cpuPlayers !== 'undefined' && Array.isArray(cpuPlayers) ? cpuPlayers : [];
            recordGameStats(winner, game, cpuList);
        },
        notifyFinish() {
            if (typeof notifyGameLifecycleFinish === 'function') notifyGameLifecycleFinish(winner);
        },
        clearSavedGame() {
            safeUiStorageRemove('savedGame');
        },
        clearOnlineSession() {
            clearOnlineSessionAfterWin();
        },
        markOnlineFinished() {
            if (typeof markOnlineGameFinished === 'function') markOnlineGameFinished();
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
        },
        renderTutorial,
        renderLog,
        renderPlayers,
    });
}

function renderActiveGameState(current) {
    const isCPUTurn = !!currentCpuPlayerAt(game.currentPlayerIndex);
    const view = UiGameStatusView.buildActiveGameView({
        current,
        players: game.players,
        phase: game.phase,
        rollPhase: GAME_PHASES.ROLL,
        currentPlayerIndex: game.currentPlayerIndex,
        previousPlayerIndex: prevPlayerIndex,
        isReplaying,
        currentName: current.name,
        isCpuTurn: isCPUTurn,
        canRoll: canShowUiAction('rollDice'),
        canNextTurn: canShowUiAction('nextTurn'),
        pendingRenovation: game.pendingRenovation,
        builtThisTurn: game.builtThisTurn,
        previousCoins: prevCoins,
        lastDice1: game.lastDice1,
        lastDice2: game.lastDice2,
        lastDiceResult: game.lastDiceResult,
    });
    UiGameStatusEffects.execute(view, {
        setStatusText(text) {
            document.getElementById("status").textContent = text;
        },
        announceTurn(name, isCpuTurn) {
            showTurnAnnouncer(name, isCpuTurn);
        },
        setPreviousPlayerIndex(playerIndex) {
            prevPlayerIndex = playerIndex;
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
        setPreviousCoins(coins) {
            prevCoins = coins;
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
    const isReconnecting = typeof isOnlineReconnectInputBlocked === 'function'
        ? isOnlineReconnectInputBlocked()
        : (typeof isReconnectingOnline !== 'undefined' && isReconnectingOnline);
    const socketAvailable = typeof socket !== 'undefined' && !!socket;
    return UiInputPolicy.onlineBlockReason({
        isOnlineGame,
        isReconnecting,
        actionInFlight: typeof onlineActionInFlight !== 'undefined' && onlineActionInFlight,
        socketAvailable,
        socketConnected: socketAvailable ? socket.connected : false,
    }) !== '';
}

function isCurrentHumanUiTurn() {
    const hasGame = !!game;
    const currentPlayerIndex = hasGame ? game.currentPlayerIndex : -1;
    return UiInputPolicy.isHumanTurn({
        hasGame,
        isCpuTurn: hasGame && !!currentCpuPlayerAt(currentPlayerIndex),
        isOnlineGame,
        onlineBlockReason: isOnlineUiInputBlocked() ? 'blocked' : '',
        currentPlayerIndex,
        myPlayerIndex,
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
    const state = {
        phase: game.phase,
        pendingPhase: GAME_PHASES.PENDING,
        pendingIT: game.pendingIT,
        pendingRenovation: game.pendingRenovation,
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
        { modal, content: el }
    );
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
    const settings = game.players.map((player, index) => getPlayerSettingForRender(index, player));
    const html = UiPlayerDisplay.buildPlayersHtml(game.players, {
        settings,
        currentPlayerIndex: game.currentPlayerIndex,
        enabledLandmarks,
        getLandmarkEmoji,
        compareCardNames: compareCardNamesForDisplay,
        escapeHtml,
        loanEffect: CARD_EFFECTS.LOAN,
    });
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

function getBuildMenuFilterController() {
    if (!buildMenuFilterController) {
        buildMenuFilterController = UiBuildMenu.createFilterController();
    }
    return buildMenuFilterController;
}

function buildCardFilterBarHtml() {
    return UiBuildMenu.buildCardFilterBarHtml(getBuildMenuFilterController().get());
}

function buildVisibleCardButtonsHtml(current, canBuildCardAction) {
    return UiBuildMenu.buildVisibleCardButtonsHtml({
        cards: CARDS,
        cardFilter: getBuildMenuFilterController().get(),
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

function currentUndoBuildActionState() {
    if (!undoState || !game || !game.builtThisTurn) {
        return UiBuildMenu.undoBuildActionState({
            hasUndoState: !!undoState,
            hasGame: !!game,
            builtThisTurn: !!(game && game.builtThisTurn),
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
    const buildState = {
        phase: game.phase,
        buildPhase: GAME_PHASES.BUILD,
        pendingRenovation: game.pendingRenovation,
        builtThisTurn: game.builtThisTurn,
    };
    const buildGateOpen = UiBuildMenu.isBuildGateOpen(buildState);
    const actionState = UiBuildMenu.buildActionState({
        ...buildState,
        isHumanTurn: buildGateOpen && isCurrentHumanUiTurn(),
        allowedActions: buildGateOpen ? currentUiAllowedActions() : new Set(),
    });
    buildMenu.innerHTML = buildBuildMenuHtml(current, actionState.canBuildCardAction, actionState.canBuildLandmarkAction);
}

function setCardFilter(color) {
    const transition = getBuildMenuFilterController().set(color);
    if (transition.shouldRender) renderBuildMenu();
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

function showTurnAnnouncer(name, isCPU) {
    const el = document.getElementById("turnAnnouncer");
    const text = document.getElementById("turnAnnouncerText");
    if (!el || !text) return;
    el.classList.remove("hiding");
    const view = UiTurnAnnouncer.buildView(name, isCPU);
    el.style.display = view.display;
    text.textContent = view.text;
    if (!turnAnnouncerTimerController) {
        turnAnnouncerTimerController = UiTurnAnnouncer.createTimerController();
    }
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
        statsContent: document.getElementById("tabContentStats"),
        localButton: document.getElementById("tabLocal"),
        onlineButton: document.getElementById("tabOnline"),
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

let enabledCards = new Set(CARDS.map(c => c.name));
let enabledLandmarks = new Set(Player.landmarkNames());
const cardSelectState = UiCardSelect.createSelectionController({
    enabledCards,
    enabledLandmarks,
});

function syncCardSelectStateFromGlobals() {
    cardSelectState.replaceCards(enabledCards);
    return cardSelectState.replaceLandmarks(enabledLandmarks);
}

function applyCardSelectStateSnapshot() {
    const snapshot = cardSelectState.snapshot();
    enabledCards = new Set(snapshot.enabledCards);
    enabledLandmarks = new Set(snapshot.enabledLandmarks);
}
const logHistoryController = UiLogDisplay.createHistoryController();
let prevPlayerIndex = -1;
let turnAnnouncerTimerController = null;
let buildMenuFilterController = null;
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
        ? GameManager.pendingActionsFor(game)
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
        game,
        isCpuTurn: !!(game && currentCpuPlayerAt(game.currentPlayerIndex)),
        online: {
            isOnlineGame: typeof isOnlineGame !== 'undefined' ? !!isOnlineGame : null,
            myPlayerIndex: typeof myPlayerIndex !== 'undefined' ? myPlayerIndex : null,
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

function resetFullLog() { logHistoryController.reset(); prevPlayerIndex = -1; if (buildMenuFilterController) buildMenuFilterController.clear(); }

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
    return Object.freeze({ modalId: id });
}

function uiModalOpenPlanSelection(id) {
    return UiModalOpen.selectPlan(
        { modalId: id },
        legacyUiModalOpenPlan(id),
        { authorityEnabled: isUiModalOpenEffectAuthorityEnabled() }
    );
}

function runUiModalOpenEffectsLegacy(modal, id) {
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
}

function runUiModalOpenEffects(modal, id) {
    const selection = uiModalOpenPlanSelection(id);
    if (selection.source !== 'pure-plan') {
        runUiModalOpenEffectsLegacy(modal, id);
        return;
    }
    UiModalOpen.execute(selection.plan, {
        captureFocus() {
            if (typeof document !== 'undefined') lastModalFocus = document.activeElement || lastModalFocus;
        },
        setActiveModal(modalId) { activeModalId = modalId; },
        addBodyClass() {
            if (document.body && document.body.classList) document.body.classList.add('modal-open');
        },
        normalizeVisualState() { normalizeModalVisualStateForOpen(modal); },
        setDialogAttributes() {
            if (typeof modal.setAttribute !== 'function') return;
            modal.setAttribute('role', modal.getAttribute('role') || 'dialog');
            modal.setAttribute('aria-modal', 'true');
        },
        focusModal() { focusModal(modal); },
        setAppInert() { setAppInertForModal(true); },
    });
}

function openAccessibleModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return false;
    if (!canOpenBlockingModal(id)) return false;
    runUiModalOpenEffects(modal, id);
    return true;
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
    return {
        modalId: id,
        nextActiveModalId,
        visibleBlockingIds,
        restoreFocus: options.restoreFocus,
        hasRestorableFocus: !!(lastModalFocus && typeof lastModalFocus.focus === 'function'),
        canRenderPending: typeof renderPending === 'function',
        canTrace: typeof recordFlowTrace === 'function',
    };
}

function legacyUiModalClosePlan(id, options, visibleBlockingIds, nextActiveModalId) {
    const shouldUnlockApp = visibleBlockingIds.length <= 0;
    return Object.freeze({
        modalId: id,
        nextActiveModalId: shouldUnlockApp ? null : (nextActiveModalId || null),
        visibleBlockingIds: Object.freeze(visibleBlockingIds.slice()),
        shouldUnlockApp,
        shouldRenderPending: shouldUnlockApp && id !== 'pendingModal' && typeof renderPending === 'function',
        shouldRestoreFocus: options.restoreFocus !== false && !!lastModalFocus && typeof lastModalFocus.focus === 'function',
        shouldTrace: (id === 'rulesModal' || id === 'cardSelectModal') && typeof recordFlowTrace === 'function',
    });
}

function uiModalClosePlanSelection(id, options, visibleBlockingIds, nextActiveModalId) {
    return UiModalClose.selectPlan(
        uiModalClosePlanInput(id, options, visibleBlockingIds, nextActiveModalId),
        legacyUiModalClosePlan(id, options, visibleBlockingIds, nextActiveModalId),
        { authorityEnabled: isUiModalCloseEffectAuthorityEnabled() }
    );
}

function runUiModalCloseEffectsLegacy(id, options, beforeSnapshot, visibleBlockingIds, nextActiveModalId) {
    activeModalId = nextActiveModalId;
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

function runUiModalCloseEffects(id, options, beforeSnapshot, visibleBlockingIds, nextActiveModalId) {
    const selection = uiModalClosePlanSelection(id, options, visibleBlockingIds, nextActiveModalId);
    if (selection.source !== 'pure-plan') {
        runUiModalCloseEffectsLegacy(id, options, beforeSnapshot, visibleBlockingIds, nextActiveModalId);
        return;
    }
    UiModalClose.execute(selection.plan, {
        setActiveModal(plan) { activeModalId = plan.nextActiveModalId; },
        restoreAppInert() { setAppInertForModal(false); },
        clearOrphanLocks() { clearOrphanAccessibleModalLocks(); },
        renderPending() {
            try { renderPending(); } catch (_) {}
        },
        restoreFocus() { lastModalFocus.focus(); },
        clearLastFocus() { lastModalFocus = null; },
        recordTrace(plan) {
            recordFlowTrace('modal-close-ui-state', {
                modalId: plan.modalId,
                before: beforeSnapshot,
                after: buildRuntimeStateSnapshot('modal-close-after-' + plan.modalId),
            });
        },
    });
}

function closeAccessibleModal(id, options = {}) {
    const beforeSnapshot = buildRuntimeStateSnapshot('modal-close-before-' + id);
    const modal = document.getElementById(id);
    if (modal) modal.style.display = 'none';

    const visibleBlockingIds = visibleBlockingModalIds();
    const nextActiveModalId = UiModalPolicy.activeAfterClose(
        id,
        activeModalId,
        visibleBlockingIds,
        isModalVisibleById
    );
    runUiModalCloseEffects(id, options, beforeSnapshot, visibleBlockingIds, nextActiveModalId);
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
    if (!activeModalId) return;
    const modal = document.getElementById(activeModalId);
    if (!modal || modal.style.display === 'none') return;
    const closeHandler = event.key === 'Escape' ? MODAL_CLOSE_HANDLERS[activeModalId] : null;
    const state = {
        active: true,
        visible: true,
        key: event.key,
        hasCloseHandler: !!closeHandler,
    };
    let focusable = [];
    if (event.key === 'Tab') {
        focusable = getFocusableElements(modal);
        state.containsActive = typeof modal.contains !== 'function' || modal.contains(document.activeElement);
        state.focusableCount = focusable.length;
        state.activeIndex = focusable.indexOf(document.activeElement);
        state.shiftKey = !!event.shiftKey;
    }
    const action = UiModalPolicy.keydownAction(state);
    if (action === 'close') {
        event.preventDefault();
        closeHandler();
        return;
    }
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
    const selection = syncCardSelectStateFromGlobals();
    const view = UiCardSelect.buildCardSelectViewModel({
        cardSets: CARD_SETS,
        enabledCards: selection.enabledCards,
        enabledLandmarks: selection.enabledLandmarks,
        landmarkNames: Player.landmarkNames(),
        compareCardNames: compareCardNamesForDisplay,
        buildCardHtml: buildCardSelectToggleButtonHtml,
        buildLandmarkHtml: buildLandmarkSelectToggleButtonHtml,
    });
    for (const setView of view.sets) {
        const el = document.getElementById(`cardList${setView.suffix}`);
        if (el) el.innerHTML = setView.cardListHtml;
        const btn = document.getElementById(`btnSet${setView.suffix}`);
        if (btn) {
            btn.textContent = setView.allOn ? "ON" : "OFF";
            btn.className = `set-toggle ${setView.allOn ? 'on' : 'off'}`;
            if (typeof btn.setAttribute === 'function') btn.setAttribute('aria-pressed', setView.allOn ? 'true' : 'false');
        }
    }
    const landmarkList = document.getElementById("landmarkList");
    if (landmarkList) landmarkList.innerHTML = view.landmarkListHtml;
}

function toggleCard(name) {
    syncCardSelectStateFromGlobals();
    const result = cardSelectState.toggleCard(name);
    if (!result.changed) return;
    applyCardSelectStateSnapshot();
    renderCardSelectModal();
}

function toggleSet(set) {
    const cards = CARD_SETS[set];
    if (!cards) return;
    syncCardSelectStateFromGlobals();
    cardSelectState.toggleSet(cards);
    applyCardSelectStateSnapshot();
    renderCardSelectModal();
}

function toggleLandmark(name) {
    syncCardSelectStateFromGlobals();
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
        onOk();
    };
    cancelBtn.onclick = () => {
        closeConfirmModal(false);
    };
    return true;
}
