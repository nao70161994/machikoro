'use strict';
const assert = require('assert');
const { runTest } = require('./helpers/test-utils');
const UiCardBoard = require('../js/uiCardBoard');
const { loadGameRuntime } = require('./helpers/runtime-loaders');
const { createCardByName } = loadGameRuntime();
const forest = createCardByName('森林');
const dormant = createCardByName('森林');
const player = { name: '<街の主>', coins: 9, cards: [forest, dormant], dormantCards: [dormant],
    landmarks: { '駅': true, '港': false, '役所': true } };
const options = { index: 1, selfIndex: 1, currentIndex: 0, enabledLandmarks: new Set(['駅', '港', '役所']),
    landmarkNames: ['駅', '港'], renderFacilityArt: (name, landmark) => `<svg data-test-art="${landmark ? 'landmark' : 'facility'}"></svg>` };

runTest('所有を種類で集約し出目・色分類・休業・正しい詳細actionを表示する', () => {
    const before = JSON.stringify(player);
    const html = UiCardBoard.buildPlayerHtml(player, options);
    assert.strictEqual((html.match(/data-card-name="森林"/g) || []).length, 1);
    assert.ok(html.includes('所有 ×2'));
    assert.ok(html.includes('休業 1枚 / 稼働 1枚'));
    assert.ok(html.includes('cardboard-card-blue'));
    assert.ok(html.includes('aria-label="森林。青、工業。青：全員の手番に発動。出目 5。所有 2枚。休業 1枚、稼働 1枚。詳しい効果を表示"'));
    assert.ok(html.includes('青 · 工業'));
    assert.ok(html.includes('class="visually-hidden">工業。青：全員の手番に発動。詳しい効果を開く。'));
    assert.ok(html.includes('data-action="showLandmarkDetail" data-landmark-name="駅"'));
    assert.ok(html.includes('建設済'));
    assert.ok(html.includes('aria-label="駅、建設済。詳細を表示"'));
    assert.match(html, /class="cardboard-landmark-copy"><span class="cardboard-name">[^<]+<\/span><span class="cardboard-landmark-status">/);
    assert.ok(html.includes('未建設'));
    assert.ok(!html.includes('data-landmark-name="役所"'));
    assert.ok(html.includes('目標 1/2'));
    assert.ok(html.includes('class="cardboard-landmark-scroll-hint" aria-hidden="true" hidden>横にスクロール →</span>'));
    assert.ok(html.includes('&lt;街の主&gt;'));
    assert.strictEqual(JSON.stringify(player), before);
});
runTest('建設通知は施設枚数・目標進捗・詳細操作を安全に示し未所有を表示しない', () => {
    const name = '<施設"名>';
    const landmarkName = '<目標"名>';
    const fixture = { ...player, cards: [{ name, category: '工業' }, { name, category: '工業' }],
        landmarks: { [landmarkName]: true, '港': false } };
    const before = JSON.stringify(fixture);
    const presentation = { ...options, name,
        enabledLandmarks: new Set([landmarkName, '港']), landmarkNames: [landmarkName, '港'] };
    const facility = UiCardBoard.buildConstructionReceiptHtml(fixture, presentation);
    assert.ok(facility.includes('plaza-important-event plaza-important-build'));
    assert.ok(facility.includes('data-kind="facility" data-action="showCardDetail" data-card-name="&lt;施設&quot;名&gt;"'));
    assert.ok(facility.includes('data-test-art="facility"'));
    assert.ok(facility.includes('class="cardboard-build-receipt-name">&lt;施設&quot;名&gt;</strong>'));
    assert.ok(facility.includes('&lt;街の主&gt;の街に'));
    assert.ok(facility.includes('建設完了 · 現在の所有 ×2'));
    assert.ok(!facility.includes(name));
    const landmark = UiCardBoard.buildConstructionReceiptHtml(fixture, { ...presentation, name: landmarkName, landmark: true });
    assert.ok(landmark.includes('plaza-important-event plaza-important-landmark'));
    assert.ok(landmark.includes('data-kind="landmark" data-action="showLandmarkDetail" data-landmark-name="&lt;目標&quot;名&gt;"'));
    assert.ok(landmark.includes('data-test-art="landmark"'));
    assert.ok(landmark.includes('ランドマーク完成 · 目標 1/2'));
    assert.ok(landmark.includes('<span class="cardboard-build-receipt-detail">ランドマーク完成</span>'));
    assert.ok(landmark.includes('<span class="cardboard-build-receipt-progress"><span>目標</span><strong>1/2</strong></span>'));
    assert.ok(!landmark.includes(landmarkName));
    assert.strictEqual(UiCardBoard.buildConstructionReceiptHtml(fixture, { ...presentation, name: '森林' }), '');
    assert.strictEqual(UiCardBoard.buildConstructionReceiptHtml(fixture, { ...presentation, name: '港', landmark: true }), '');
    assert.strictEqual(JSON.stringify(fixture), before);
});

runTest('PC景観は注入された少数施設だけを描き密集時と未注入時は生成しない', () => {
    const before = JSON.stringify(player);
    const calls = [];
    const sceneryOptions = { ...options, renderTownScenery: (owned, enabled) => {
        calls.push({ owned, enabled: [...enabled] });
        return '<svg data-test-town="true"></svg>';
    } };
    const sparse = UiCardBoard.buildPlayerHtml(player, sceneryOptions);
    assert.ok(sparse.includes('class="cardboard-town-vignette" aria-hidden="true"'));
    assert.ok(sparse.includes('<svg data-test-town="true"></svg>'));
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].owned, player);
    assert.deepStrictEqual(calls[0].enabled, ['駅', '港']);
    const crowded = [
        { ...player, cards: ['森林', '麦畑', 'パン屋'].map(createCardByName) },
        { ...player, cards: Array.from({ length: 5 }, () => createCardByName('森林')) },
    ];
    for (const fixture of crowded) {
        const original = JSON.stringify(fixture);
        assert.ok(!UiCardBoard.buildPlayerHtml(fixture, sceneryOptions).includes('cardboard-town-vignette'));
        assert.strictEqual(JSON.stringify(fixture), original);
    }
    assert.ok(!UiCardBoard.buildPlayerHtml(player, options).includes('cardboard-town-vignette'));
    assert.strictEqual(calls.length, 1, '密集時・renderer未注入時は景観を生成しない');
    assert.strictEqual(JSON.stringify(player), before);
});

runTest('共通効果の表示文をカードと読み上げへ安全に渡し状態を変えない', () => {
    const before = JSON.stringify(player);
    const html = UiCardBoard.buildPlayerHtml(player, {
        ...options, getEffectText: () => '工場 <2> ごとに3コイン',
    });
    assert.ok(html.includes('class="cardboard-effect" title="工場 &lt;2&gt; ごとに3コイン"'));
    assert.ok(html.includes('所有 2枚。工場 &lt;2&gt; ごとに3コイン。休業'));
    assert.ok(!html.includes('工場 <2>'));
    assert.strictEqual(JSON.stringify(player), before);
});
runTest('施設棚は出目の昇順で並び元のゲームカード配列は変更しない', () => {
    const cards = ['森林', '麦畑', 'パン屋', '牧場'].map(createCardByName);
    const before = cards.map(card => card.name);
    const html = UiCardBoard.buildPlayerHtml({ ...player, cards }, options);
    const displayedNames = [...html.matchAll(/data-card-name="([^"]+)"/g)].map(match => match[1]);
    assert.deepStrictEqual(displayedNames, ['麦畑', '牧場', 'パン屋', '森林']);
    assert.deepStrictEqual(cards.map(card => card.name), before);
});
runTest('出目順の表示でも発動アニメーションは実際の解決順を保つ', () => {
    const cards = ['森林', '麦畑'].map(createCardByName);
    const events = { activations: [
        { facility: true, subject: '森林', owner: 1, from: null, to: 1, amount: 1, count: 1 },
        { facility: true, subject: '麦畑', owner: 1, from: null, to: 1, amount: 1, count: 1 },
    ] };
    const html = UiCardBoard.buildPlayerHtml({ ...player, cards }, { ...options, events });
    const wheatIndex = html.indexOf('data-card-name="麦畑"');
    const forestIndex = html.indexOf('data-card-name="森林"');
    assert.ok(wheatIndex >= 0 && forestIndex > wheatIndex, 'カードは出目の昇順で並ぶ');
    assert.ok(html.indexOf('style="--cardboard-activation-delay:80ms"', wheatIndex) > wheatIndex);
    assert.ok(html.indexOf('style="--cardboard-activation-delay:0ms"', forestIndex) > forestIndex);
});
runTest('全色・複数出目と全休業でも施設詳細を使える', () => {
    const cards = ['麦畑', 'パン屋', 'カフェ', 'スタジアム', 'マグロ漁船'].map(createCardByName);
    const html = UiCardBoard.buildPlayerHtml({ ...player, cards, dormantCards: cards }, options);
    for (const color of ['blue', 'green', 'red', 'purple']) assert.ok(html.includes(`cardboard-card-${color}`));
    assert.ok(html.includes('cardboard-card-dormant'));
    assert.ok(html.includes('12・13・14'));
    assert.ok(!html.includes(' disabled'));
});
runTest('確認できた施設発動だけを一致した所有者へ示し0を推測しない', () => {
    const events = { activations: [
        { facility: true, subject: '森林', from: null, to: 1, amount: 3, count: 2 },
        { facility: true, subject: '森林', from: 1, to: 2, amount: 1, count: 1 },
        { facility: true, subject: '森林', from: null, to: 3, amount: 50, count: 1 },
        { facility: false, subject: '森林', from: null, to: 1, amount: 99, count: 1 },
        { facility: true, subject: '森林の別施設', from: null, to: 1, amount: 99, count: 1 },
    ] };
    const before = JSON.stringify(events);
    const html = UiCardBoard.buildPlayerHtml(player, { ...options, events });
    assert.ok(html.includes('data-cardboard-activation-net="3"'));
    assert.ok(html.includes('data-cardboard-activation-count="2"'));
    assert.ok(html.includes('今回、施設連鎖の1番目、確認できた純収支 +3コイン、発動 2回'));
    assert.ok(html.includes('data-short-label="#1 +3·2"'));
    assert.ok(html.includes('data-short-label="休1 稼1"'));
    assert.ok(!UiCardBoard.buildPlayerHtml(player, options).includes('cardboard-activation'));
    const zero = UiCardBoard.buildPlayerHtml(player, { ...options, events: { activations: [
        { facility: true, subject: '森林', from: 1, to: null, amount: 0, count: 1 },
    ], incomplete: true } });
    assert.ok(zero.includes('確認済み：0コイン'));
    assert.ok(zero.includes('確認できた分のみ'));
    assert.strictEqual(JSON.stringify(events), before);
});
runTest('カード連鎖の強調順は最初の該当ログ位置に対応する', () => {
    const events = { activations: [
        { facility: true, subject: 'パン屋', from: null, to: 1, amount: 1, count: 1 },
        { facility: true, subject: '森林', from: null, to: 1, amount: 1, count: 1 },
        { facility: true, subject: '森林', from: null, to: 1, amount: 2, count: 1 },
    ] };
    const html = UiCardBoard.buildPlayerHtml(player, { ...options, events });
    assert.ok(html.includes('cardboard-card-activated cardboard-activation-step-1'));
    assert.ok(html.includes('data-cardboard-activation-order="2"'));
});
runTest('席・名前の同一性と選択/現在/自分を分離し10席に制限する', () => {
    const players = Array.from({ length: 12 }, () => ({ ...player }));
    const html = UiCardBoard.buildRosterHtml(players, { ...options, selectedIndex: 2 });
    assert.ok(html.includes('aria-label="表示するプレイヤー。席が隠れている場合は横にスクロールして選べます。キーボードでは左右矢印、Home、Endで席を移動できます。選ぶと街のカードを大きく表示"'));
    assert.strictEqual((html.match(/class="cardboard-roster-seat(?:\s|")/g) || []).length, 10);
    assert.strictEqual((html.match(/aria-pressed="true"/g) || []).length, 1);
    assert.strictEqual((html.match(/aria-current="true"/g) || []).length, 1);
    assert.strictEqual((html.match(/class="cardboard-roster-badge cardboard-roster-turn-badge">手番<\/span>/g) || []).length, 1);
    assert.strictEqual((html.match(/class="cardboard-roster-badge cardboard-roster-self-badge">あなた<\/span>/g) || []).length, 1);
    assert.ok(html.includes('席10・&lt;街の主&gt;'));
    assert.ok(!html.includes('席11'));
    assert.strictEqual((html.match(/class="cardboard-color-count cardboard-color-count-blue"/g) || []).length, 10);
    assert.ok(html.includes('cardboard-color-count-blue">青 2</span>'));
    assert.ok(html.includes('cardboard-color-count-green">緑 0</span>'));
    assert.ok(html.includes('cardboard-color-count-red">赤 0</span>'));
    assert.ok(html.includes('cardboard-color-count-purple">紫 0</span>'));
});
runTest('ロスターが人/CPUアイコンを共有しスクリーンリーダーへ種別を伝える', () => {
    const html = UiCardBoard.buildRosterHtml([
        { ...player, name: '自分の街' }, { ...player, name: 'CPUの街' },
    ], { ...options, playerSettings: [{ type: 'human' }, { type: 'cpu', difficulty: 'strong' }],
        renderPlayerKindIcon: setting => `<svg data-kind="${setting.type}"></svg>`,
        playerKindAccessibleLabel: setting => setting.type === 'cpu' ? 'CPU（強）' : '人間',
    });
    assert.ok(html.includes('<span class="cardboard-roster-kind" aria-hidden="true"><svg data-kind="human"></svg></span>'));
    assert.ok(html.includes('<span class="cardboard-roster-kind" aria-hidden="true"><svg data-kind="cpu"></svg></span>'));
    assert.ok(html.includes('自分の街、現在の手番、人間、9コイン'));
    assert.ok(html.includes('CPUの街、あなた、CPU（強）、9コイン'));
});
runTest('選択した街の見出しにも所有者の人/CPU種別を示す', () => {
    const html = UiCardBoard.buildPlayerHtml(player, { ...options, index: 1,
        playerSettings: [null, { type: 'cpu', difficulty: 'expert' }],
        renderPlayerKindIcon: () => '<svg data-owner-kind="cpu"></svg>',
        playerKindAccessibleLabel: () => 'CPU（最強）',
    });
    assert.ok(html.includes('<h2 class="cardboard-player-heading"'));
    assert.ok(html.includes('<span class="cardboard-player-kind" aria-hidden="true"><svg data-owner-kind="cpu"></svg></span>'));
    assert.ok(html.includes('<span class="visually-hidden">CPU（最強）。</span>'));
});
runTest('街フォーカスでは選択した1席だけを描画し不正な席は自分へ戻す', () => {
    for (let count = 2; count <= 10; count++) {
        assert.deepStrictEqual(UiCardBoard.selectDetailIndices(count, {
            focusOnly: true, selfIndex: 0, currentIndex: 1, selectedIndex: count - 1,
        }), [count - 1]);
        assert.deepStrictEqual(UiCardBoard.selectDetailIndices(count, {
            focusOnly: true, selfIndex: 0, selectedIndex: -1,
        }), [0]);
    }
    assert.deepStrictEqual(UiCardBoard.selectDetailIndices(0, { focusOnly: true }), []);
});
runTest('2〜4人は全員、5〜10人は役割を優先し重複時も必ず3人を比較できる', () => {
    for (let count = 2; count <= 4; count++) {
        assert.deepStrictEqual(UiCardBoard.selectDetailIndices(count, { selfIndex: 1, currentIndex: 1, selectedIndex: 1 }),
            Array.from({ length: count }, (_, index) => index));
    }
    for (let count = 5; count <= 10; count++) {
        for (let self = 0; self < count; self++) {
            for (let current = 0; current < count; current++) {
                for (let selected = 0; selected < count; selected++) {
                    const roles = { selfIndex: self, currentIndex: current, selectedIndex: selected };
                    const indices = UiCardBoard.selectDetailIndices(count, roles);
                    assert.strictEqual(indices.length, 3);
                    assert.strictEqual(new Set(indices).size, 3);
                    assert.strictEqual(indices[0], self);
                    assert.ok(indices.includes(current));
                    assert.ok(indices.includes(selected));
                    assert.deepStrictEqual(UiCardBoard.selectDetailIndices(count, roles), indices);
                    if (self === current && self === selected) {
                        assert.deepStrictEqual(indices.slice(1), Array.from({ length: count }, (_, index) => index)
                            .filter(index => index !== self).slice(0, 2));
                    }
                }
            }
        }
    }
});
runTest('2〜4人戦でも発動・建設した街へ詳細表示を自動フォーカスする', () => {
    for (const count of [2, 4]) {
        assert.strictEqual(UiCardBoard.eventFocusSeatIndex(count, [], [
            { facility: true, owner: count - 1, from: 0, to: 1 },
        ]), count - 1);
        assert.strictEqual(UiCardBoard.eventFocusSeatIndex(count, [{ playerIndex: 1 }], []), 1);
        assert.strictEqual(UiCardBoard.eventFocusSeatIndex(count, [], []), null);
    }
    assert.strictEqual(UiCardBoard.eventFocusSeatIndex(0, [], [{ facility: true, owner: 0 }]), null);
});
runTest('不正な席は詳細表示へ持ち込まず入力を変更しない', () => {
    const roles = { selfIndex: 9, currentIndex: -1, selectedIndex: '1' };
    assert.deepStrictEqual(UiCardBoard.selectDetailIndices(5, roles), [0, 1, 2]);
    assert.deepStrictEqual(roles, { selfIndex: 9, currentIndex: -1, selectedIndex: '1' });
    assert.deepStrictEqual(UiCardBoard.selectDetailIndices(0, roles), []);
});
runTest('空状態と任意アダプタ不在でも安全なHTMLを返す', () => {
    const html = UiCardBoard.buildPlayerHtml({ name: '"<script>', coins: 0, cards: [], landmarks: {} });
    assert.ok(html.includes('所有施設なし'));
    assert.ok(!html.includes('<script>'));
    assert.ok(html.includes('対象ランドマークなし'));
});
runTest('contentOnlyは外枠だけを除外し同一の中身を返す', () => {
    const wrapped = UiCardBoard.buildPlayerHtml(player, options);
    const content = UiCardBoard.buildPlayerHtml(player, { ...options, contentOnly: true });
    assert.ok(content.startsWith('<header class="cardboard-header">'));
    assert.ok(!content.includes('<section'));
    assert.strictEqual(wrapped.slice(wrapped.indexOf('>') + 1, -'</section>'.length), content);
});
runTest('同じ赤施設を双方が持っていても支払側施設を誤発動させない', () => {
    const cafe = createCardByName('カフェ');
    const players = [0, 1].map(index => ({ name: `街${index + 1}`, cards: [cafe], coins: 3, landmarks: {} }));
    const events = { activations: [{ facility: true, subject: 'カフェ', from: 0, to: 1, amount: 1, count: 1 }] };
    assert.ok(!UiCardBoard.buildPlayerHtml(players[0], { ...options, index: 0, events }).includes('cardboard-card-activated'));
    const receiver = UiCardBoard.buildPlayerHtml(players[1], { ...options, index: 1, events });
    assert.ok(receiver.includes('cardboard-card-activated'));
    assert.ok(receiver.includes('確認済み：+1コイン'));
    const bankPayment = { activations: [{ facility: true, subject: 'カフェ', from: 0, to: null, amount: 2, count: 1 }] };
    assert.ok(UiCardBoard.buildPlayerHtml(players[0], { ...options, index: 0, events: bankPayment }).includes('確認済み：-2コイン'));
    const majorIncome = { activations: [{ facility: true, subject: 'カフェ', from: null, to: 0, amount: 5, count: 1 }] };
    const majorIncomeHtml = UiCardBoard.buildPlayerHtml(players[0], { ...options, index: 0, events: majorIncome });
    assert.ok(majorIncomeHtml.includes('cardboard-card-major-income'));
    assert.ok(!UiCardBoard.buildPlayerHtml(players[0], { ...options, index: 0, events: bankPayment }).includes('cardboard-card-major-income'));
});
