const assert = require('assert');
const UiCardSelect = require('../js/uiCardSelect');
const { runTest } = require('./helpers/test-utils');

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

runTest('ui card select はカードtoggleの属性とescape契約を生成する', () => {
    const html = UiCardSelect.buildCardToggleButtonHtml({
        name: '麦畑"><script>',
        enabled: true,
        escapeHtml,
    });

    assert.ok(html.includes('class="card-toggle-btn on"'));
    assert.ok(html.includes('data-action="toggleCard"'));
    assert.ok(html.includes('aria-pressed="true"'));
    assert.ok(html.includes('麦畑&quot;&gt;&lt;script&gt;'));
    assert.ok(!html.includes('<script>'));
});

runTest('ui card select はランドマークtoggleを既存属性で生成する', () => {
    const html = UiCardSelect.buildLandmarkToggleButtonHtml({
        name: '港', enabled: false, escapeHtml, getLandmarkEmoji: () => '⚓',
    });
    assert.strictEqual(html, '<button class="card-toggle-btn off" data-action="toggleLandmark" data-landmark-name="港" aria-pressed="false">⚓ 港</button>');
});

runTest('ui card select stateは必須カードを外さず入力Setを変更しない', () => {
    const selected = new Set(['麦畑', 'パン屋', '牧場']);
    const required = UiCardSelect.toggleCardSelection(selected, '麦畑');
    assert.deepStrictEqual(required, {
        changed: false,
        selectedNames: ['麦畑', 'パン屋', '牧場'],
    });
    assert.deepStrictEqual(Array.from(selected), ['麦畑', 'パン屋', '牧場']);

    const removed = UiCardSelect.toggleCardSelection(selected, '牧場');
    assert.deepStrictEqual(removed, {
        changed: true,
        selectedNames: ['麦畑', 'パン屋'],
    });
    const added = UiCardSelect.toggleCardSelection(selected, 'コンビニ');
    assert.deepStrictEqual(added.selectedNames, ['麦畑', 'パン屋', '牧場', 'コンビニ']);
    assert.ok(Object.isFrozen(added));
    assert.ok(Object.isFrozen(added.selectedNames));
});

runTest('ui card select stateはset一括切替の順序と必須カードを維持する', () => {
    const current = new Set(['麦畑', 'パン屋', '牧場', 'カフェ']);
    const disabled = UiCardSelect.toggleCardSetSelection(
        current,
        ['麦畑', 'パン屋', '牧場']
    );
    assert.deepStrictEqual(disabled, {
        valid: true,
        allOn: true,
        changed: true,
        selectedNames: ['麦畑', 'パン屋', 'カフェ'],
    });

    const enabled = UiCardSelect.toggleCardSetSelection(
        new Set(['麦畑', 'カフェ']),
        ['麦畑', 'パン屋', '牧場']
    );
    assert.deepStrictEqual(enabled, {
        valid: true,
        allOn: false,
        changed: true,
        selectedNames: ['麦畑', 'カフェ', '牧場'],
    });
    assert.deepStrictEqual(
        UiCardSelect.toggleCardSetSelection(current, null),
        {
            valid: false,
            allOn: false,
            changed: false,
            selectedNames: ['麦畑', 'パン屋', '牧場', 'カフェ'],
        }
    );
});

runTest('ui card select stateはランドマークを最低1件維持する', () => {
    assert.deepStrictEqual(
        UiCardSelect.toggleLandmarkSelection(new Set(['駅']), '駅'),
        { changed: false, selectedNames: ['駅'] }
    );
    assert.deepStrictEqual(
        UiCardSelect.toggleLandmarkSelection(new Set(['駅', '港']), '駅'),
        { changed: true, selectedNames: ['港'] }
    );
    assert.deepStrictEqual(
        UiCardSelect.toggleLandmarkSelection(new Set(['駅']), '港'),
        { changed: true, selectedNames: ['駅', '港'] }
    );
});

runTest('ui card select view modelは表示順・set状態・landmark状態を副作用なしで生成する', () => {
    const cardSets = {
        base: ['パン屋', '麦畑'],
        harbor: ['港', '寿司屋'],
    };
    const enabledCards = new Set(['麦畑', 'パン屋', '港']);
    const enabledLandmarks = new Set(['駅']);
    const view = UiCardSelect.buildCardSelectViewModel({
        cardSets,
        enabledCards,
        enabledLandmarks,
        landmarkNames: ['駅', '港'],
        compareCardNames: (left, right) => left.localeCompare(right, 'ja'),
        buildCardHtml: (name, enabled) => `${name}:${enabled}|`,
        buildLandmarkHtml: (name, enabled) => `${name}:${enabled}|`,
    });

    assert.deepStrictEqual(view, {
        sets: [
            {
                set: 'base',
                suffix: 'Base',
                cardListHtml: 'パン屋:true|麦畑:true|',
                allOn: true,
            },
            {
                set: 'harbor',
                suffix: 'Harbor',
                cardListHtml: '港:true|寿司屋:false|',
                allOn: false,
            },
        ],
        landmarkListHtml: '駅:true|港:false|',
    });
    assert.deepStrictEqual(cardSets.base, ['パン屋', '麦畑']);
    assert.deepStrictEqual(Array.from(enabledCards), ['麦畑', 'パン屋', '港']);
    assert.ok(Object.isFrozen(view));
    assert.ok(Object.isFrozen(view.sets));
    assert.ok(view.sets.every(Object.isFrozen));
});


runTest('ui card select controllerはmutable Setをdetached snapshotとして所有する', () => {
    const sourceCards = new Set(['麦畑', 'パン屋', '牧場']);
    const sourceLandmarks = new Set(['駅', '港']);
    const controller = UiCardSelect.createSelectionController({
        enabledCards: sourceCards,
        enabledLandmarks: sourceLandmarks,
    });

    controller.toggleCard('牧場');
    controller.toggleLandmark('駅');
    assert.deepStrictEqual(controller.snapshot(), {
        enabledCards: ['麦畑', 'パン屋'],
        enabledLandmarks: ['港'],
    });
    assert.deepStrictEqual(Array.from(sourceCards), ['麦畑', 'パン屋', '牧場']);
    assert.deepStrictEqual(Array.from(sourceLandmarks), ['駅', '港']);
    assert.ok(Object.isFrozen(controller.snapshot()));
    assert.ok(Object.isFrozen(controller.snapshot().enabledCards));
});

runTest('ui card select controllerは外部復元値をreplaceして次のtoggleへ反映する', () => {
    const controller = UiCardSelect.createSelectionController();
    controller.replaceCards(['麦畑', 'パン屋', 'カフェ']);
    controller.replaceLandmarks(['駅']);
    controller.toggleSet(['麦畑', 'パン屋', 'カフェ']);
    const blocked = controller.toggleLandmark('駅');

    assert.strictEqual(blocked.changed, false);
    assert.deepStrictEqual(controller.snapshot(), {
        enabledCards: ['麦畑', 'パン屋'],
        enabledLandmarks: ['駅'],
    });
});
