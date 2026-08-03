'use strict';

const assert = require('assert');
const StorageSettings = require('../js/storageSettings');
const { runTest } = require('./helpers/test-utils');

runTest('storage settings は保存済み人数を既存の2..10範囲へ正規化する', () => {
    assert.strictEqual(StorageSettings.normalizePlayerCount(null), 2);
    assert.strictEqual(StorageSettings.normalizePlayerCount('1'), 2);
    assert.strictEqual(StorageSettings.normalizePlayerCount('4'), 4);
    assert.strictEqual(StorageSettings.normalizePlayerCount('11'), 10);
    assert.ok(Number.isNaN(StorageSettings.normalizePlayerCount('invalid')));
});

runTest('storage settings は旧player設定へ既存defaultを補う', () => {
    const value = JSON.stringify([
        { type: 'unknown', difficulty: '', name: '' },
        { type: 'cpu', difficulty: 'strong', name: ' CPU ' },
        { type: 'cpu', difficulty: 'expert', name: 'unused' },
    ]);
    assert.deepStrictEqual(StorageSettings.normalizePlayerSettings(value, 2), [
        { type: 'human', difficulty: 'normal', name: 'プレイヤー1' },
        { type: 'cpu', difficulty: 'strong', name: 'CPU' },
    ]);
});

runTest('storage settings は注入された名前正規化とtutorial契約を維持する', () => {
    const settings = StorageSettings.normalizePlayerSettings(
        JSON.stringify([{ type: 'human', name: '' }]),
        1,
        (name, index) => `local-${index}-${name || 'empty'}`
    );
    assert.strictEqual(settings[0].name, 'local-0-empty');
    assert.strictEqual(StorageSettings.normalizePlayerSettings(null, 2), null);
    assert.strictEqual(StorageSettings.normalizeTutorialEnabled('false'), false);
    assert.strictEqual(StorageSettings.normalizeTutorialEnabled('FALSE'), true);
    assert.strictEqual(StorageSettings.normalizeTutorialLevel('advanced'), 'advanced');
    assert.strictEqual(StorageSettings.normalizeTutorialLevel('other'), 'beginner');
});

runTest('storage settings は既存key向けの保存値形式をpureに組み立てる', () => {
    const values = StorageSettings.serializeSettings({
        selectedCount: 4,
        playerSettings: [{ type: 'cpu', name: 'CPU' }],
        tutorialEnabled: false,
        tutorialLevel: 'advanced',
        cpuSpeed: '500',
    });
    assert.deepStrictEqual(values, {
        selectedCount: 4,
        playerSettings: '[{"type":"cpu","name":"CPU"}]',
        tutorialEnabled: 'false',
        tutorialLevel: 'advanced',
        cpuSpeed: '500',
    });
    assert.ok(Object.isFrozen(values));
    assert.strictEqual(Object.prototype.hasOwnProperty.call(
        StorageSettings.serializeSettings({
            selectedCount: 2,
            playerSettings: [],
            tutorialEnabled: true,
            tutorialLevel: 'beginner',
            cpuSpeed: null,
        }),
        'cpuSpeed'
    ), false);
});

runTest('storage settings は読込値を一度に正規化して未保存値を維持する', () => {
    const values = StorageSettings.normalizeStoredSettings({
        selectedCount: '12',
        playerSettings: JSON.stringify([{ type: 'cpu', difficulty: '', name: '' }]),
        cpuSpeed: null,
        tutorialEnabled: 'false',
        tutorialLevel: 'unknown',
    }, (name, index) => `saved-${index}-${name || 'empty'}`);
    assert.deepStrictEqual(values, {
        selectedCount: 10,
        playerSettings: [{ type: 'cpu', difficulty: 'normal', name: 'saved-0-empty' }],
        cpuSpeed: null,
        tutorialEnabled: false,
        tutorialLevel: 'beginner',
    });
    assert.ok(Object.isFrozen(values));
});
