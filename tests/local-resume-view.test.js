'use strict';

const assert = require('assert');
const LocalResumeView = require('../js/localResumeView');
const { runTest } = require('./helpers/test-utils');

runTest('local resume viewはCPU再準備中のbutton状態を返す', () => {
    assert.deepStrictEqual(LocalResumeView.pendingButton(true), {
        disabled: true,
        textContent: '対戦相手を準備中…',
        ariaBusy: true,
    });
    assert.deepStrictEqual(LocalResumeView.pendingButton(false), {
        disabled: false,
        textContent: '続きから再開',
        ariaBusy: false,
    });
});

runTest('local resume viewはlocal saveとonline sessionの表示を独立投影する', () => {
    assert.deepStrictEqual(LocalResumeView.resumeSections(true, {
        playerName: 'Alice',
        roomId: 'ABC123',
    }, { turnCount: 12, players: [{}, {}], marketSupply: {
        mode: 'ten-type', deck: Array(7).fill('パン屋'), refillSequence: 3,
    } }), {
        localDisplay: 'flex',
        localMarketDescription: '🏪 公式10種類市場・2人対戦・参加者 席1 / 席2・12ターン・補充3回・山札7枚・残りわずか',
        onlineDisplay: 'block',
        onlineDescription: '🌐 Alice として ABC123 に再接続できます',
    });
    assert.deepStrictEqual(LocalResumeView.resumeSections(false, null), {
        localDisplay: 'none',
        localMarketDescription: '',
        onlineDisplay: 'none',
        onlineDescription: '🌐 オンラインゲームが中断されました',
    });
});

runTest('local resume viewは通常市場と山札切れを区別する', () => {
    assert.strictEqual(LocalResumeView.marketDetails({}), '🏪 通常市場');
    assert.strictEqual(LocalResumeView.marketDetails({ turnCount: 8 }), '🏪 通常市場・8ターン');
    assert.strictEqual(LocalResumeView.marketDetails({ turnCount: 8, players: [{}, {}, {}] }), '🏪 通常市場・3人対戦・参加者 席1 / 席2 / 席3・8ターン');
    assert.strictEqual(LocalResumeView.marketDetails({ turnCount: 8, currentPlayerIndex: 1, players: [{ name: 'あお' }, { name: 'みどり' }] }), '🏪 通常市場・2人対戦・参加者 あお / みどり・8ターン・みどりの手番');
    assert.strictEqual(LocalResumeView.marketDetails({
        marketSupply: { mode: 'ten-type', deck: [] },
    }), '🏪 公式10種類市場・0ターン・補充0回・山札0枚・山札切れ');
    assert.strictEqual(LocalResumeView.marketDetails({
        currentPlayerIndex: 0,
        players: [{ name: 'あお' }],
        marketSupply: { mode: 'ten-type', deck: [1], refillSequence: 2 },
    }), '🏪 公式10種類市場・1人対戦・参加者 あお・0ターン・あおの手番・補充2回・山札1枚・残りわずか');
    assert.strictEqual(LocalResumeView.marketDetails({
        currentPlayerIndex: 0,
        enabledLandmarksList: ['駅', '遊園地'],
        players: [{ name: 'あお', coins: 7, cards: Array(4).fill('施設'), landmarks: { 駅: true, 遊園地: false } }],
    }), '🏪 通常市場・1人対戦・参加者 あお・あおの手番（7コイン・施設4枚・目標1/2）');
    assert.strictEqual(LocalResumeView.marketDetails({
        currentPlayerIndex: 0,
        players: [{ name: 'あお', landmarks: { 駅: true, 遊園地: false } }],
    }), '🏪 通常市場・1人対戦・参加者 あお・あおの手番（建設済みランドマーク1個）');
});

runTest('local resume viewは最新と最大2つ前までの世代選択肢を生成する', () => {
    assert.deepStrictEqual(LocalResumeView.generationOptions(0), [
        { value: 0, label: '最新の保存データ' },
    ]);
    assert.deepStrictEqual(LocalResumeView.generationOptions(3), [
        { value: 0, label: '最新の保存データ' },
        { value: 1, label: '1回前の保存データ' },
        { value: 2, label: '2回前の保存データ' },
    ]);
    assert.ok(Object.isFrozen(LocalResumeView.generationOptions(2)));
});

runTest('local resume viewは利用可能な旧世代の元の番号を維持する', () => {
    assert.deepStrictEqual(LocalResumeView.generationOptions(2, [2]), [
        { value: 2, label: '2回前の保存データ' },
    ]);
});
