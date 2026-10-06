'use strict';
const assert = require('assert');
const { runTest } = require('./helpers/test-utils');
const UiIncomePreviewPanel = require('../js/uiIncomePreviewPanel');

function fixture() {
    const game = { currentPlayerIndex: 0, turnCount: 0, phase: 'roll', enabledLandmarks: new Set(['駅', '港']),
        players: [{ name: '<あなた>', coins: 3, cards: [{ name: '麦畑' }], dormantCards: [], landmarks: {} },
            { name: '相手', coins: 6, cards: [], dormantCards: [], landmarks: { 駅: true, 港: true } }] };
    let selected = 0, calls = [], session = {};
    const listeners = {};
    let fields = {};
    const makeFields = () => {
        fields = Object.fromEntries(['target', 'roller', 'dice', 'harbor', 'calculate', 'result'].map(name => [name, {
            value: '', checked: false, disabled: false, innerHTML: '', dataset: { incomeField: name },
            focus() { document.activeElement = this; },
        }]));
    };
    const root = {
        addEventListener(name, fn) { listeners[name] = fn; },
        querySelector(selector) {
            const field = selector.match(/data-income-field="([a-z]+)"/)?.[1] || selector.match(/data-income-([a-z]+)/)?.[1];
            return fields[field];
        },
        contains(element) { return Object.values(fields).includes(element); },
        set innerHTML(value) { this.html = value; makeFields(); },
        get innerHTML() { return this.html; },
    };
    const document = { getElementById: () => root, activeElement: null };
    const panel = UiIncomePreviewPanel.create({ document, getGame: () => game,
        getSelectedPlayerIndex: () => selected, getSession: () => session, stationName: '駅', harborName: '港',
        preview: { evaluate(game, options) {
            calls.push(options);
            return { available: true, rows: [], target: { mean: 2 }, notes: ['試算'] };
        } },
    });
    return { game, panel, root, listeners, document, calls,
        fields: () => fields, select: value => { selected = value; },
        newSession: () => { session = {}; },
        calculate: () => listeners.click({ target: { closest: () => fields.calculate } }) };
}

runTest('出目別パネルはinit/refreshで計算せず明示buttonだけで指定条件を評価する', () => {
    const f = fixture();
    assert.strictEqual(f.panel.init(), true);
    f.panel.refresh(f.game);
    assert.strictEqual(f.calls.length, 0);
    assert.ok(f.root.innerHTML.includes('&lt;あなた&gt;'));
    assert.ok(!f.root.innerHTML.includes('<あなた>'));
    assert.strictEqual(f.fields().harbor.disabled, true);
    assert.ok(!f.fields().dice.innerHTML.includes('value="2"'));
    f.fields().roller.value = '1';
    f.listeners.change();
    assert.ok(f.fields().dice.innerHTML.includes('value="2"'));
    f.fields().dice.value = '2';
    f.listeners.change();
    f.fields().harbor.checked = true;
    f.calculate();
    assert.deepStrictEqual(f.calls, [{ playerIndex: 0, rollerIndex: 1, diceCount: 2, harborBonus: true }]);
    assert.ok(f.fields().result.innerHTML.includes('出目の確率を含む平均'));
    f.fields().roller.value = '0';
    f.listeners.change();
    assert.strictEqual(f.fields().result.innerHTML, '');
    assert.strictEqual(f.fields().harbor.disabled, true);
    assert.strictEqual(f.fields().harbor.checked, false);
});

runTest('所持金/施設/休業/対局/選択した街の変更で古い結果を消しfocusを保つ', () => {
    const f = fixture(); f.panel.init();
    f.calculate();
    const count = f.calls.length;
    assert.strictEqual(f.panel.refresh(f.game), false);
    assert.ok(f.fields().result.innerHTML);
    f.document.activeElement = f.fields().roller;
    f.game.players[0].coins++;
    assert.strictEqual(f.panel.refresh(f.game), true);
    assert.strictEqual(f.fields().result.innerHTML, '');
    assert.strictEqual(f.document.activeElement, f.fields().roller);
    assert.strictEqual(f.calls.length, count);
    f.select(1); f.panel.refresh(f.game);
    assert.strictEqual(f.fields().target.value, '1');
    f.game.players[0].dormantCards.push(f.game.players[0].cards[0]);
    assert.strictEqual(f.panel.refresh(f.game), true);
    const sameStateNewGame = { ...f.game };
    assert.strictEqual(f.panel.refresh(sameStateNewGame), true);
    assert.strictEqual(f.fields().result.innerHTML, '');
});

runTest('平均/別乱数範囲/港/未解決と運用noteを安全なHTMLで区別する', () => {
    const html = UiIncomePreviewPanel.buildResultHtml({ available: true, target: { mean: 1.25 },
        rows: [{ dice: 12, effectiveDice: 14, harborApplied: true, target: { mean: 7, min: 2, max: 12 },
            pending: [{ label: '<TV対象>' }] }], notes: ['選択は未解決 <script>'] });
    assert.ok(html.includes('出目の確率を含む平均：+1.25'));
    assert.ok(html.includes('この出目の平均'));
    assert.ok(html.includes('12 → 14（港）'));
    assert.ok(html.includes('範囲 +2〜+12'));
    assert.ok(html.includes('&lt;TV対象&gt;'));
    assert.ok(!html.includes('<script>'));
    assert.ok(UiIncomePreviewPanel.buildResultHtml({ available: false }).includes('正確に試算できません'));
});

runTest('同対局のimmutable game採用で対象と振る人を維持し対局変更時だけ初期化する', () => {
    const f = fixture(); f.panel.init();
    f.fields().target.value = '1';
    f.fields().roller.value = '1';
    f.listeners.change();
    const adopted = { ...f.game, players: f.game.players.map(player => ({ ...player })) };
    adopted.players[0].coins++;
    f.panel.refresh(adopted);
    assert.strictEqual(f.fields().target.value, '1');
    assert.strictEqual(f.fields().roller.value, '1');
    f.newSession();
    f.panel.refresh(adopted);
    assert.strictEqual(f.fields().target.value, '0');
    assert.strictEqual(f.fields().roller.value, '0');
});

runTest('同対局の所持金や施設変更は有効な2個港選択を保ち不合法時だけ解除する', () => {
    const f = fixture(); f.panel.init();
    f.fields().roller.value = '1'; f.listeners.change();
    f.fields().dice.value = '2'; f.listeners.change();
    f.fields().harbor.checked = true;
    f.calculate();
    f.game.players[0].coins++;
    f.panel.refresh(f.game);
    assert.strictEqual(f.fields().dice.value, '2');
    assert.strictEqual(f.fields().harbor.checked, true);
    assert.strictEqual(f.fields().result.innerHTML, '');
    delete f.game.players[1].landmarks['港'];
    f.panel.refresh(f.game);
    assert.strictEqual(f.fields().dice.value, '2');
    assert.strictEqual(f.fields().harbor.checked, false);
    assert.strictEqual(f.fields().harbor.disabled, true);
    delete f.game.players[1].landmarks['駅'];
    f.panel.refresh(f.game);
    assert.strictEqual(f.fields().dice.value, '1');
    assert.strictEqual(f.fields().harbor.checked, false);
});
