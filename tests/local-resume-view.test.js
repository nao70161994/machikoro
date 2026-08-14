'use strict';

const assert = require('assert');
const LocalResumeView = require('../js/localResumeView');
const { runTest } = require('./helpers/test-utils');

runTest('local resume viewはRL preload中の既存button表示を返す', () => {
    assert.deepStrictEqual(LocalResumeView.pendingButton(true), {
        disabled: true,
        textContent: 'モデル読み込み中',
    });
    assert.deepStrictEqual(LocalResumeView.pendingButton(false), {
        disabled: false,
        textContent: '続きから再開',
    });
});

runTest('local resume viewはlocal saveとonline sessionの表示を独立投影する', () => {
    assert.deepStrictEqual(LocalResumeView.resumeSections(true, {
        playerName: 'Alice',
        roomId: 'ABC123',
    }), {
        localDisplay: 'flex',
        onlineDisplay: 'block',
        onlineDescription: '🌐 Alice として ABC123 に再接続できます',
    });
    assert.deepStrictEqual(LocalResumeView.resumeSections(false, null), {
        localDisplay: 'none',
        onlineDisplay: 'none',
        onlineDescription: '🌐 オンラインゲームが中断されました',
    });
});

runTest('local resume viewは最新と最大2つ前までの世代選択肢を生成する', () => {
    assert.deepStrictEqual(LocalResumeView.generationOptions(0), [
        { value: 0, label: '最新の保存' },
    ]);
    assert.deepStrictEqual(LocalResumeView.generationOptions(3), [
        { value: 0, label: '最新の保存' },
        { value: 1, label: '1つ前の保存' },
        { value: 2, label: '2つ前の保存' },
    ]);
    assert.ok(Object.isFrozen(LocalResumeView.generationOptions(2)));
});
