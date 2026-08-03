'use strict';

const UiPendingMenu = (() => {
    function isPendingDisplayCandidate(options) {
        return options.phase === options.pendingPhase || !!options.pendingIT || options.pendingRenovation > 0;
    }

    function shouldShowForCurrentPlayer(options) {
        return isPendingDisplayCandidate(options) && !!options.isHumanTurn;
    }

    function pendingModalInteractionView(hasContent) {
        const visible = !!hasContent;
        return Object.freeze({
            modal: Object.freeze({
                display: visible ? 'flex' : 'none',
                visibility: visible ? 'visible' : '',
                opacity: visible ? '1' : '',
                pointerEvents: visible ? 'auto' : '',
                transform: '',
            }),
            content: Object.freeze({
                visibility: visible ? 'visible' : '',
                opacity: visible ? '1' : '',
                pointerEvents: visible ? 'auto' : '',
            }),
            inner: visible ? Object.freeze({
                visibility: 'visible',
                opacity: '1',
                pointerEvents: 'auto',
            }) : null,
        });
    }

    function businessCardSelectionView(groupButtonCount, inputValue) {
        const count = Number.isInteger(groupButtonCount) && groupButtonCount > 0 ? groupButtonCount : 0;
        return Object.freeze({
            groupButtons: Object.freeze(Array.from({ length: count }, () => Object.freeze({
                selected: false,
                ariaPressed: 'false',
            }))),
            selectedButton: Object.freeze({ selected: true, ariaPressed: 'true' }),
            inputValue: inputValue ?? '',
        });
    }

    function pendingInspectHintHtml() {
        return `<p class="pending-inspect-hint">盤面確認中もこのパネルは開いたままです。カード名を押すと詳細を見られます。</p>`;
    }

    function buildPendingTvHtml(game, escapeHtml) {
        const others = game.players.map((p, i) => ({ p, i })).filter(({ i }) => i !== game.currentPlayerIndex);
        return `<div class="pending-box"><p>📺 テレビ局：コインを奪う相手を選んでください</p>${pendingInspectHintHtml()}${others.map(({ p, i }) => `<button data-action="resolveTV" data-target-index="${i}">${escapeHtml(p.name)}（🪙${p.coins}）</button>`).join("")}</div>`;
    }

    function buildBusinessCardChipHtml(player, card, index, inputId, isSelected, escapeHtml) {
        return `<button class="bc-chip${isSelected ? ' selected' : ''}" aria-pressed="${isSelected ? 'true' : 'false'}" data-action="selectBusinessCard" data-idx="${index}" data-input-id="${inputId}">${escapeHtml(card.name)}${player.isDormant(card) ? ' 💤' : ''}</button>`;
    }

    function businessCardOptionsForPlayer(player) {
        return player.getMinorCards().map(card => ({ card, index: player.cards.indexOf(card) }));
    }

    function buildBusinessCardChipGroupHtml(player, cards, inputId, escapeHtml) {
        return cards.map(({ card, index }, j) =>
            buildBusinessCardChipHtml(player, card, index, inputId, j === 0, escapeHtml)
        ).join("");
    }

    function buildBusinessTargetExchangeHtml(player, playerIndex, escapeHtml) {
        const inputId = `theirCardSelect_${playerIndex}`;
        const theirCards = businessCardOptionsForPlayer(player);
        const theirDefaultIdx = theirCards[0]?.index ?? 0;
        const theirChips = buildBusinessCardChipGroupHtml(player, theirCards, inputId, escapeHtml);
        return `<p class="bc-label">${escapeHtml(player.name)}の施設：</p><div class="bc-chip-group">${theirChips}</div><input type="hidden" id="${inputId}" value="${theirDefaultIdx}"><button class="bc-exchange-btn" data-action="resolveBusiness" data-target-index="${playerIndex}">⇄ ${escapeHtml(player.name)}と交換</button>`;
    }

    function buildPendingBusinessHtml(game, escapeHtml) {
        const current = game.currentPlayer();
        const myCards = businessCardOptionsForPlayer(current);
        const others = game.players.map((p, i) => ({ p, i })).filter(({ i }) => i !== game.currentPlayerIndex);
        const myDefaultIdx = myCards[0]?.index ?? 0;
        const myChips = buildBusinessCardChipGroupHtml(current, myCards, 'myCardSelect', escapeHtml);
        const othersHtml = others.map(({ p, i }) => buildBusinessTargetExchangeHtml(p, i, escapeHtml)).join("");
        return `<div class="pending-box"><p>🏢 ビジネスセンター：施設を交換します</p><p class="bc-label">自分の施設：</p><div class="bc-chip-group">${myChips}</div><input type="hidden" id="myCardSelect" value="${myDefaultIdx}">${othersHtml}</div>`;
    }

    function buildPendingCleaningHtml(game, escapeHtml) {
        const allCardNames = [...new Set(game.players.flatMap(p => p.getMinorCards().filter(c => !p.isDormant(c)).map(c => c.name)))];
        return `<div class="pending-box"><p>🧹 清掃業：休業にする施設を選んでください</p>${allCardNames.map(name => `<button data-action="resolveCleaning" data-card-name="${escapeHtml(name)}">${escapeHtml(name)}</button>`).join("")}</div>`;
    }

    function buildPendingMoverHtml(game, escapeHtml) {
        const current = game.currentPlayer();
        const myCards = current.getMinorCards().map(card => ({ card, index: current.cards.indexOf(card) }));
        const others = game.players.map((p, i) => ({ p, i })).filter(({ i }) => i !== game.currentPlayerIndex);
        return `<div class="pending-box"><p>🚚 引越し屋：渡す施設と相手を選んでください</p><p>渡す施設：</p><select id="moverCardSelect">${myCards.map(({ card, index }) => `<option value="${index}">${escapeHtml(card.name)}${current.isDormant(card) ? '（休業中）' : ''}</option>`).join("")}</select>${others.map(({ p, i }) => `<button data-action="resolveMover" data-target-index="${i}">${escapeHtml(p.name)}に渡す</button>`).join("")}</div>`;
    }

    function buildPendingRenovationHtml(game, escapeHtml, landmarkNames) {
        const current = game.currentPlayer();
        const builtLandmarks = Object.entries(current.landmarks).filter(([name, built]) => built && name !== landmarkNames.YAKUSHO).map(([name]) => name);
        return `<div class="pending-box"><p>🔨 改装屋：取り壊すランドマークを選んでください（+8コイン）</p>${builtLandmarks.length > 0 ? builtLandmarks.map(name => `<button data-action="resolveRenovation" data-landmark-name="${escapeHtml(name)}">${escapeHtml(name)}</button>`).join("") : "<p>建設済みのランドマークがありません</p>"}</div>`;
    }

    function buildPendingItHtml(game) {
        const cur = game.currentPlayer();
        const canSave = cur.coins >= 1;
        return `<div class="pending-box"><p>💻 ITベンチャー：1コイン積立しますか？</p><p>現在の積立：${cur.itVentureCoins}コイン　所持：🪙${cur.coins}</p><button data-action="resolveIT" data-do-save="true" ${canSave ? "" : "disabled"}>積立する（→積立${cur.itVentureCoins + 1}コイン）</button><button data-action="resolveIT" data-do-save="false">スキップ</button></div>`;
    }

    const renderers = Object.freeze([
        Object.freeze({ field: 'pendingTV', action: 'resolveTV', isActive: game => game.pendingTV > 0, buildHtml: buildPendingTvHtml }),
        Object.freeze({ field: 'pendingBusiness', action: 'resolveBusiness', isActive: game => game.pendingBusiness > 0, buildHtml: buildPendingBusinessHtml }),
        Object.freeze({ field: 'pendingCleaning', action: 'resolveCleaning', isActive: game => game.pendingCleaning > 0, buildHtml: buildPendingCleaningHtml }),
        Object.freeze({ field: 'pendingMover', action: 'resolveMover', isActive: game => game.pendingMover > 0, buildHtml: buildPendingMoverHtml }),
        Object.freeze({ field: 'pendingRenovation', action: 'resolveRenovation', isActive: game => game.pendingRenovation > 0, buildHtml: buildPendingRenovationHtml }),
        Object.freeze({ field: 'pendingIT', action: 'resolveIT', isActive: game => !!game.pendingIT, buildHtml: buildPendingItHtml }),
    ]);

    function rendererSpecs() {
        return renderers.map(spec => ({ field: spec.field, action: spec.action }));
    }

    function buildMenuHtml(game, allowedActions, nextPending, dependencies) {
        const { escapeHtml, landmarkNames } = dependencies;
        return renderers
            .filter(spec => (!nextPending || nextPending.field === spec.field) && allowedActions.has(spec.action) && spec.isActive(game))
            .map(spec => spec.buildHtml(game, escapeHtml, landmarkNames))
            .join("");
    }

    return Object.freeze({ isPendingDisplayCandidate, shouldShowForCurrentPlayer, pendingModalInteractionView, businessCardSelectionView, pendingInspectHintHtml, buildBusinessCardChipHtml, businessCardOptionsForPlayer, buildBusinessCardChipGroupHtml, buildBusinessTargetExchangeHtml, buildPendingTvHtml, buildPendingBusinessHtml, buildPendingCleaningHtml, buildPendingMoverHtml, buildPendingRenovationHtml, buildPendingItHtml, rendererSpecs, buildMenuHtml });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = UiPendingMenu;
if (typeof window !== 'undefined') window.UiPendingMenu = UiPendingMenu;
if (typeof globalThis !== 'undefined') globalThis.UiPendingMenu = UiPendingMenu;
