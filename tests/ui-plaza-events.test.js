'use strict';
const assert = require('assert');
const { runTest } = require('./helpers/test-utils');
const UiLogDisplay = require('../js/uiLogDisplay');
const UiPlazaEvents = require('../js/uiPlazaEvents');
const UiTurnEvents = require('../js/uiTurnEvents');
const UiTurnReceipt = require('../js/uiTurnReceipt');
runTest('両ビューと互換APIは同じ投影・receipt実装を共有する', () => {
    assert.strictEqual(UiPlazaEvents.project, UiTurnEvents.project);
    assert.strictEqual(UiPlazaEvents.buildReceiptHtml, UiTurnReceipt.buildHtml);
});
runTest('共通投影は構造化された出目を表示文言に依存せず扱う', () => {
    const receipt = UiTurnEvents.project([{ type: 'dice', message: 'Localized roll result',
        diceResolution: { dice1: 5, dice2: 1, result: 6, turn: 1, actor: 0, rerolled: true } }], {
        players: [{ name: 'A', cards: [] }], logTypes: { DICE: 'dice' },
    });
    assert.deepStrictEqual(receipt.dice, { values: [5, 1], base: 6, effective: 6, rerolled: true, harbor: false });
    assert.match(UiTurnReceipt.buildHtml(receipt, String), /出目 5\+1=6（振り直し）/u);
});
const types = Object.freeze({ DICE: 'dice', GAIN: 'gain', LOSE: 'lose', BUILD: 'build', SPECIAL: 'special', SYSTEM: 'system', ERROR: 'error' });
const display = UiLogDisplay.makeLogTypeDisplay(types);
const players = [
    { name: 'あなたの街', cards: [{ name: '森林' }, { name: 'パン屋' }] },
    { name: 'CPU', cards: [{ name: '寿司屋' }] },
];
const entry = (type, message) => ({ type, message });
const project = (logs, extra = {}) => UiPlazaEvents.project(logs, { players, turnPlayerIndex: 0,
    display, logDisplay: UiLogDisplay, landmarkNames: ['駅', '港'], ...extra });
const escape = value => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));

runTest('領収投影は施設の複数発動と支払元先を集約しrawログを変更しない', () => {
    const logs = [entry('system', '👤 あなたの街のターン'), entry('dice', '🎲 5 が出ました'),
        entry('gain', '🌾 あなたの街の森林発動 → +3コイン'), entry('gain', '🌾 あなたの街の森林発動 → +3コイン'),
        entry('lose', '💸 CPUの寿司屋発動 → 2コイン獲得')];
    const original = JSON.stringify(logs);
    logs.forEach(Object.freeze); Object.freeze(logs);
    const receipt = project(logs);
    assert.deepStrictEqual(receipt.dice.values, [5]);
    assert.strictEqual(receipt.activations[0].amount, 6);
    assert.strictEqual(receipt.activations[0].count, 2);
    assert.deepStrictEqual(receipt.activations[1], { from: 0, to: 1, subject: '寿司屋', facility: true, amount: 2, count: 1 });
    assert.strictEqual(receipt.balances[0].facilityNet, 4);
    assert.strictEqual(receipt.balances[1].facilityNet, 2);
    assert.strictEqual(JSON.stringify(logs), original);
    assert.ok(UiPlazaEvents.buildReceiptHtml(receipt, escape).includes('あなたの街 → CPU'));
});

runTest('港選択は出目だけ更新しマグロ内部ダイスとpendingは新区間にしない', () => {
    const receipt = project([entry('dice', '🎲 3+3=6'), entry('dice', '⚓ 港効果：合計6に+2しますか？'),
        entry('dice', '⚓ 港効果+2 → 8'), entry('gain', '🐟 あなたの街のマグロ漁船発動 → 🎲3+4=7コイン'),
        entry('special', '📺 テレビ局の対象を選んでください')], { cardNames: ['マグロ漁船'] });
    assert.strictEqual(receipt.dice.base, 6);
    assert.strictEqual(receipt.dice.effective, 8);
    assert.strictEqual(receipt.dice.harbor, true);
    assert.strictEqual(receipt.activations[0].amount, 7);
    assert.strictEqual(receipt.important[0].kind, 'special');
});

runTest('振り直しは旧収入を除外し新出目と新収入だけを示す', () => {
    const receipt = project([entry('dice', '🎲 5 が出ました'), entry('gain', '🌾 あなたの街の森林発動 → +3コイン'),
        entry('dice', '🎲 2+3=5'), entry('dice', '📡 電波塔で振り直し: 5 → 2+3=5'),
        entry('gain', '🌾 あなたの街の森林発動 → +8コイン')]);
    assert.deepStrictEqual(receipt.dice.values, [2, 3]);
    assert.strictEqual(receipt.dice.rerolled, true);
    assert.strictEqual(receipt.activations[0].amount, 8);
    assert.strictEqual(receipt.balances[0].income, 8);
});

runTest('新しい手番では前手番の出目収支と重要建設を持ち越さない', () => {
    const receipt = project([entry('dice', '🎲 5 が出ました'), entry('gain', '🌾 あなたの街の森林発動 → +3コイン'),
        entry('build', '🏆 駅を建設！'), entry('system', '👤 CPUのターン')]);
    assert.strictEqual(receipt.dice, null);
    assert.deepStrictEqual(receipt.balances, []);
    assert.deepStrictEqual(receipt.important, []);
});

runTest('重要ランドマークと追加手番は通常末尾4件から押し流されない', () => {
    const receipt = project([entry('system', '👤 あなたの街のターン'), entry('dice', '🎲 5 が出ました'),
        entry('build', '🏆 駅を建設！'), entry('system', '🎡 遊園地効果！ゾロ目でもう一度ターン'),
        ...Array.from({ length: 10 }, () => entry('gain', '🌾 あなたの街の森林発動 → +1コイン'))]);
    assert.deepStrictEqual(receipt.important.map(event => event.kind), ['landmark', 'extra-turn']);
    const html = UiPlazaEvents.buildReceiptHtml(receipt, escape);
    assert.ok(html.indexOf('駅を建設') < html.indexOf('<p class="plaza-receipt-dice">'));
});

runTest('重複名は断定せず原文へ戻し「の」を含む前方一致名も正しく分ける', () => {
    const ambiguous = project([entry('gain', '🌾 CPUの森林発動 → +3コイン')], {
        players: [{ name: 'CPU', cards: [{ name: '森林' }] }, { name: 'CPU', cards: [] }],
    });
    assert.deepStrictEqual(ambiguous.balances, []);
    assert.strictEqual(ambiguous.unparsed.length, 1);
    const names = [{ name: '街', cards: [] }, { name: '街の人', cards: [{ name: '森林' }] }];
    const precise = project([entry('gain', '🌾 街の人の森林発動 → +3コイン')], { players: names });
    assert.strictEqual(precise.balances[0].index, 1);
    assert.strictEqual(precise.activations[0].subject, '森林');
});

runTest('確認できない収入は原文で保持し空港効果は施設収支に含めない', () => {
    const receipt = project([entry('gain', '✈️ 空港効果！建設なしで+10コイン'),
        entry('gain', '意味不明 +3コイン'), entry('gain', '🌾 unknownの森林発動 → +4コイン')]);
    assert.strictEqual(receipt.balances[0].facilityNet, 0);
    assert.strictEqual(receipt.balances[0].otherLogNet, 10);
    assert.strictEqual(receipt.unparsed.length, 2);
    assert.ok(UiPlazaEvents.buildReceiptHtml(receipt, escape).includes('ログ確認分'));
});

runTest('HTMLは名前施設原文をescapeし10人と集約件数のDOM上限を保つ', () => {
    const people = Array.from({ length: 12 }, (_, index) => ({ name: `人${index}`, cards: [] }));
    people[0].name = '<img onerror="x">';
    const logs = [entry('dice', '🎲 1 が出ました'),
        ...Array.from({ length: 20 }, (_, index) => entry('gain', `🌾 ${people[index % 10].name}の施設${index}発動 → +1コイン`)),
        entry('gain', '<script>無効</script>')];
    const receipt = project(logs, { players: people });
    assert.ok(receipt.balances.length <= 10);
    assert.strictEqual(receipt.activations.length, 12);
    assert.strictEqual(receipt.omittedActivations, 8);
    const html = UiPlazaEvents.buildReceiptHtml(receipt, escape);
    assert.ok(!html.includes('<img') && !html.includes('<script>'));
    assert.ok(html.includes('&lt;img') && html.includes('&lt;script&gt;'));
    assert.strictEqual((html.match(/class="plaza-receipt-activation"/g) || []).length, 12);
});

runTest('追加手番の直後の同じ人のターン見出しでも重要な追加手番を維持する', () => {
    const receipt = project([entry('dice', '🎲 3+3=6'), entry('gain', '🌾 あなたの街の森林発動 → +3コイン'),
        entry('system', '🎡 遊園地効果！ゾロ目でもう一度ターン'), entry('system', '👤 あなたの街のターン')]);
    assert.strictEqual(receipt.dice, null);
    assert.deepStrictEqual(receipt.balances, []);
    assert.strictEqual(receipt.important[0].kind, 'extra-turn');
});

runTest('実GameManagerの非駅電波塔は新収入の後のmetadataでも両者の収入を失わない', () => {
    const { GameManager, createCardByName, LOG_TYPES, Player } = require('./helpers/runtime-loaders').loadGameRuntime();
    const game = new GameManager(2);
    game.players[0].name = 'あなたの街'; game.players[1].name = 'CPU';
    game.currentPlayerIndex = 0;
    game.players[0].landmarks['電波塔'] = true;
    game.players[0].landmarks['駅'] = false;
    game.players.forEach(player => { player.cards = [createCardByName('麦畑')]; });
    game.rollDice(4);
    game.rerollDice(1);
    assert.ok(game.log[game.log.length - 1].message.startsWith('📡'));
    const receipt = UiPlazaEvents.project(game.log, { players: game.players, turnPlayerIndex: 0,
        logTypes: LOG_TYPES, landmarkNames: Player.landmarkNames() });
    assert.strictEqual(receipt.dice.rerolled, true);
    assert.strictEqual(receipt.dice.effective, 1);
    assert.strictEqual(receipt.activations.length, 2);
    assert.strictEqual(receipt.balances.find(balance => balance.index === 0).income, 1);
    assert.strictEqual(receipt.balances.find(balance => balance.index === 1).income, 1);
});

runTest('実スタジアムSPECIAL金銭を消さず原文と未集計表示を残す', () => {
    const { GameManager, createCardByName, LOG_TYPES } = require('./helpers/runtime-loaders').loadGameRuntime();
    const game = new GameManager(2);
    game.currentPlayerIndex = 0;
    game.players[0].cards = [createCardByName('スタジアム')];
    game.players[1].cards = [];
    game.rollDice(6);
    assert.ok(game.log.some(log => log.type === LOG_TYPES.SPECIAL && log.message.includes('スタジアム')));
    const receipt = UiPlazaEvents.project(game.log, { players: game.players, turnPlayerIndex: 0, logTypes: LOG_TYPES });
    assert.strictEqual(receipt.incomplete, true);
    assert.ok(receipt.unparsed.some(message => message.includes('スタジアム')));
    assert.strictEqual(receipt.balances.length, 0);
    const html = UiPlazaEvents.buildReceiptHtml(receipt, escape);
    assert.ok(html.includes('未集計の記録1件'));
    assert.ok(html.includes('スタジアム発動'));
});

runTest('特殊な個別送金と合計ログを二重集計せず原文注記に保持する', () => {
    const receipt = project([entry('dice', '🎲 6 が出ました'), entry('special', '📰 CPUから2コイン'),
        entry('special', '📰 出版社発動 → 合計+2コイン'), entry('gain', '🌾 あなたの街の森林発動 → +3コイン')]);
    assert.strictEqual(receipt.incomplete, true);
    assert.strictEqual(receipt.unparsedCount, 2);
    assert.strictEqual(receipt.balances[0].income, 3);
    assert.strictEqual(receipt.balances[0].facilityNet, 3);
    assert.ok(UiPlazaEvents.buildReceiptHtml(receipt, escape).includes('確認済み施設差引+3'));
});

runTest('残高不足で0コインの赤発動でも支払元と先を表示する', () => {
    const { GameManager, createCardByName, LOG_TYPES } = require('./helpers/runtime-loaders').loadGameRuntime();
    const game = new GameManager(3);
    game.currentPlayerIndex = 0;
    game.players.forEach((player, index) => {
        player.name = `街${index + 1}`;
        player.cards = index ? [createCardByName('カフェ')] : [];
        player.coins = index ? 30 : 0;
    });
    game.rollDice(3);
    const receipt = UiPlazaEvents.project(game.log, { players: game.players, turnPlayerIndex: 0, logTypes: LOG_TYPES });
    assert.ok(receipt.activations.some(event => event.amount === 0));
    const html = UiPlazaEvents.buildReceiptHtml(receipt, escape);
    assert.ok(html.includes('街1 → 街3'));
    assert.ok(html.includes('街1 → 街2'));
    assert.ok(!html.includes('-0コイン'));
    assert.ok(!html.includes(' → ：'));
});
