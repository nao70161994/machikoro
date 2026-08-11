const assert = require('assert');
const UiTutorial = require('../js/uiTutorial');
const { runTest } = require('./helpers/test-utils');

const PHASES = Object.freeze({
    ROLL: 'roll',
    SELECT_DICE: 'selectDice',
    REROLL_CONFIRM: 'rerollConfirm',
    HARBOR_CHOICE: 'harborChoice',
    BUILD: 'build',
});

function makeOptions(overrides = {}) {
    const { current: _current, game: _game, ...optionOverrides } = overrides;
    const current = overrides.current || {
        name: 'Alice',
        coins: 5,
        landmarks: { 役所: true, 駅: false, 港: false },
        countCardIncludingDormant() { return 0; },
    };
    const game = overrides.game === null ? null : {
        currentPlayerIndex: 0,
        phase: PHASES.ROLL,
        lastDiceResult: 8,
        pendingTV: 0,
        pendingBusiness: 0,
        pendingCleaning: 0,
        pendingMover: 0,
        pendingRenovation: 0,
        pendingIT: false,
        builtThisTurn: false,
        currentPlayer() { return current; },
        ...(overrides.game || {}),
    };
    return {
        cards: [
            { name: '高い施設', cost: 5, color: 'blue' },
            { name: '安い施設', cost: 2, color: 'green' },
            { name: '紫施設', cost: 3, color: 'purple' },
        ],
        enabledCards: new Set(['高い施設', '安い施設', '紫施設']),
        getShopStockCount(_stock, card) { return card.name === '高い施設' ? 0 : 1; },
        shopStock: {},
        enabledLandmarks: new Set(['役所', '駅', '港']),
        landmarkNames: { YAKUSHO: '役所' },
        landmarkCost(name) { return name === '駅' ? 4 : 8; },
        game,
        isOnlineGame: false,
        myPlayerIndex: 0,
        currentCpuPlayerAt() { return null; },
        tutorialLevel: 'beginner',
        phases: PHASES,
        ...optionOverrides,
    };
}

runTest('tutorial候補は在庫・有効化・紫重複・役所を既存順序で絞る', () => {
    const current = {
        name: 'Alice',
        coins: 5,
        landmarks: { 役所: false, 港: false, 駅: false },
        countCardIncludingDormant(name) { return name === '紫施設' ? 1 : 0; },
    };
    const options = makeOptions({ current });

    const hints = UiTutorial.getHints(current, options);

    assert.deepStrictEqual(hints.affordableCards.map(card => card.name), ['安い施設']);
    assert.deepStrictEqual(hints.affordableLandmarks, [['駅', false]]);
});

runTest('tutorial messageはゲーム未開始とオンライン待機を区別する', () => {
    assert.deepStrictEqual(
        UiTutorial.getMessage(makeOptions({ game: null })),
        { title: '', body: '', tags: [] }
    );

    const waiting = UiTutorial.getMessage(makeOptions({
        isOnlineGame: true,
        myPlayerIndex: 1,
        tutorialLevel: 'advanced',
    }));
    assert.deepStrictEqual(waiting, {
        title: '上級者向けガイド',
        body: 'Aliceの操作待ちです。相手の次ターン購入圏と、現在のログから発動帯の偏りを確認してください。',
        tags: ['Alice', '待機中'],
    });
});

runTest('tutorial messageは全選択phaseの既存案内を維持する', () => {
    const cases = [
        [PHASES.ROLL, 'サイコロを振って収入処理を開始します。', ['サイコロ前', '所持 5コイン']],
        [PHASES.SELECT_DICE, '駅の効果です。', ['駅', '1個/2個選択']],
        [PHASES.REROLL_CONFIRM, '電波塔の効果です。現在の出目 8', ['電波塔', '現在 8']],
        [PHASES.HARBOR_CHOICE, '港の効果です。合計 8 に +2', ['港', '候補 8/10']],
    ];

    for (const [phase, bodyPart, tags] of cases) {
        const message = UiTutorial.getMessage(makeOptions({ game: { phase } }));
        assert.ok(message.body.includes(bodyPart), phase);
        assert.deepStrictEqual(message.tags, tags, phase);
    }
});

runTest('tutorial messageはCPUと各pending種別を既存優先順で案内する', () => {
    const cpu = UiTutorial.getMessage(makeOptions({ currentCpuPlayerAt() { return {}; } }));
    assert.deepStrictEqual(cpu.tags, ['CPUターン']);

    const cases = [
        ['pendingTV', 1, 'テレビ局'],
        ['pendingBusiness', 1, 'ビジネスセンター'],
        ['pendingCleaning', 1, '清掃業'],
        ['pendingMover', 1, '引越し屋'],
        ['pendingRenovation', 1, '改装屋'],
        ['pendingIT', true, 'ITベンチャー'],
    ];
    for (const [field, value, tag] of cases) {
        const message = UiTutorial.getMessage(makeOptions({
            game: { phase: 'pending', [field]: value },
        }));
        assert.strictEqual(message.tags[0], tag, field);
        assert.ok(message.body.startsWith(tag), field);
    }
});

runTest('tutorial messageは建設済み・建設不可・最安候補を同じ文面で返す', () => {
    const built = UiTutorial.getMessage(makeOptions({
        game: { phase: PHASES.BUILD, builtThisTurn: true },
    }));
    assert.deepStrictEqual(built.tags, ['建設済み']);

    const poorCurrent = {
        name: 'Alice',
        coins: 0,
        landmarks: { 役所: true, 駅: false },
        countCardIncludingDormant() { return 0; },
    };
    const blocked = UiTutorial.getMessage(makeOptions({
        current: poorCurrent,
        game: { phase: PHASES.BUILD, currentPlayer() { return poorCurrent; } },
    }));
    assert.deepStrictEqual(blocked.tags, ['建設不可']);

    const available = UiTutorial.getMessage(makeOptions({
        game: { phase: PHASES.BUILD },
    }));
    assert.deepStrictEqual(available, {
        title: '初心者向けガイド',
        body: '建設フェーズです。施設 安い施設（2コイン）、ランドマーク 駅（4コイン） が候補です。ログを見て不足している収入帯を補ってください。',
        tags: ['所持 5コイン', '候補 3件'],
    });
});

runTest('tutorial control viewはON/OFFと難易度表示をpureに同期する', () => {
    assert.deepStrictEqual(UiTutorial.buildControlView(true, 'advanced'), {
        enabled: true,
        selectedLevel: 'advanced',
        toggleText: '💡 ガイド ON',
        toggleAriaPressed: 'true',
        levelText: '🧠 上級者',
        levelAriaLabel: 'チュートリアルの詳しさ、現在 上級者向け',
        active: true,
    });
    const disabled = UiTutorial.buildControlView(false, 'beginner');
    assert.deepStrictEqual(disabled, {
        enabled: false,
        selectedLevel: 'beginner',
        toggleText: '💡 ガイド OFF',
        toggleAriaPressed: 'false',
        levelText: '🌱 初心者',
        levelAriaLabel: 'チュートリアルの詳しさ、現在 初心者向け',
        active: false,
    });
    assert.strictEqual(Object.isFrozen(disabled), true);
});

runTest('tutorial HTMLはtitle・body・tagをescapeして既存構造を維持する', () => {
    const escapeHtml = value => String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    assert.strictEqual(
        UiTutorial.buildHtml({
            title: '<案内>',
            body: 'A&B',
            tags: ['<駅>', '1&2'],
        }, escapeHtml),
        `
        <div class="tutorial-title">&lt;案内&gt;</div>
        <div class="tutorial-body">A&amp;B</div>
        <div class="tutorial-meta"><span class="tutorial-tag">&lt;駅&gt;</span><span class="tutorial-tag">1&amp;2</span></div>
    `
    );
});

runTest('tutorial HTMLは空メッセージで既存fallbackとtag省略を維持する', () => {
    const escapeHtml = value => String(value);

    assert.strictEqual(
        UiTutorial.buildHtml({ title: '', body: '', tags: [] }, escapeHtml),
        [
            '',
            '        <div class="tutorial-title">GUIDE</div>',
            '        <div class="tutorial-body"></div>',
            '        ',
            '    ',
        ].join('\n')
    );
});
