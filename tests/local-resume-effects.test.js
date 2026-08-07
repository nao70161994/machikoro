'use strict';

const assert = require('assert');
const LocalResumeEffects = require('../js/localResumeEffects');
const { runTest } = require('./helpers/test-utils');

function createElements() {
    return {
        btnResume: { disabled: false, textContent: '続きから再開' },
        resumeSection: { style: { display: '' } },
        onlineResumeSection: { style: { display: '' } },
        onlineResumeDescription: { textContent: '' },
    };
}

runTest('local resume effectsは既存selectorへpreload表示を反映する', () => {
    const elements = createElements();
    const effects = LocalResumeEffects.create({
        getElementById: id => elements[id] || null,
    });

    assert.strictEqual(effects.applyPendingButton({
        disabled: true,
        textContent: 'モデル読み込み中',
    }), true);
    assert.deepStrictEqual(elements.btnResume, {
        disabled: true,
        textContent: 'モデル読み込み中',
    });
});

runTest('local resume effectsはlocalとonlineの表示を同じ順序で反映する', () => {
    const elements = createElements();
    const requestedIds = [];
    const effects = LocalResumeEffects.create({
        getElementById(id) {
            requestedIds.push(id);
            return elements[id] || null;
        },
    });

    effects.applyResumeSections({
        localDisplay: 'flex',
        onlineDisplay: 'block',
        onlineDescription: '🌐 Alice として ABC123 に再接続できます',
    });

    assert.deepStrictEqual(requestedIds, [
        'resumeSection',
        'onlineResumeSection',
        'onlineResumeDescription',
    ]);
    assert.strictEqual(elements.resumeSection.style.display, 'flex');
    assert.strictEqual(elements.onlineResumeSection.style.display, 'block');
    assert.strictEqual(
        elements.onlineResumeDescription.textContent,
        '🌐 Alice として ABC123 に再接続できます'
    );
});

runTest('local resume effectsは対象DOMがなくても安全に終了する', () => {
    const effects = LocalResumeEffects.create({ getElementById: () => null });
    assert.strictEqual(effects.applyPendingButton({
        disabled: false,
        textContent: '続きから再開',
    }), false);
    assert.doesNotThrow(() => effects.applyResumeSections({
        localDisplay: 'none',
        onlineDisplay: 'none',
        onlineDescription: '🌐 オンラインゲームが中断されました',
    }));
});
