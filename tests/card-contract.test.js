const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { runTest } = require('./helpers/test-utils');
const { loadGameRuntime } = require('./helpers/runtime-loaders');

const runtime = loadGameRuntime();
const effectEntries = Object.entries(runtime.CARD_EFFECTS);
const effectValues = effectEntries.map(([, effect]) => effect);
const effectKeyByValue = Object.fromEntries(effectEntries.map(([key, effect]) => [effect, key]));

runTest('card contract は全定義をstable ID・既知effect・一意名で固定する', () => {
    const defs = Array.from(runtime.CARD_DEFS);
    assert.strictEqual(new Set(defs.map(def => def.id)).size, defs.length);
    assert.strictEqual(new Set(defs.map(def => def.name)).size, defs.length);
    assert.deepStrictEqual(
        [...new Set(defs.map(def => def.effect))].sort(),
        effectValues.slice().sort()
    );

    for (const def of defs) {
        assert.ok(Object.isFrozen(def), `card def must be frozen: ${def.name}`);
        assert.ok(runtime.CARD_NAME_BY_ID[def.id] === def.name, `id map mismatch: ${def.id}`);
        assert.ok(runtime.CARD_ID_BY_NAME[def.name] === def.id, `name map mismatch: ${def.name}`);
        assert.ok(effectValues.includes(def.effect), `unknown effect: ${def.name}/${def.effect}`);
        assert.ok(Array.isArray(def.diceNums) && def.diceNums.length > 0, `dice missing: ${def.name}`);
        assert.ok(def.diceNums.every(value => Number.isInteger(value) && value > 0), `invalid dice: ${def.name}`);
    }
});

runTest('card contract は全special effectのUI説明登録を要求する', () => {
    const expected = effectValues.filter(effect => effect !== runtime.CARD_EFFECTS.NORMAL).sort();
    assert.deepStrictEqual(Object.keys(runtime.CARD_EFFECT_DESCRIPTIONS).sort(), expected);

    for (const effect of expected) {
        const text = runtime.CARD_EFFECT_DESCRIPTIONS[effect](3);
        assert.strictEqual(typeof text, 'string', `description type: ${effect}`);
        assert.ok(text.trim(), `description missing: ${effect}`);
    }
});

runTest('card contract はincome metadataとrule handlerを双方向に固定する', () => {
    const expectedIncomeEffects = effectValues
        .filter(effect => runtime.CARD_EFFECT_METADATA[effect].incomeHandler)
        .sort();
    assert.deepStrictEqual(Object.keys(runtime.CARD_INCOME_EFFECT_HANDLERS).sort(), expectedIncomeEffects);

    for (const effect of expectedIncomeEffects) {
        const metadata = runtime.CARD_EFFECT_METADATA[effect];
        assert.strictEqual(metadata.incomeHandler, effect, `income handler id mismatch: ${effect}`);
        assert.strictEqual(typeof runtime.CARD_INCOME_EFFECT_HANDLERS[effect], 'function', `income handler missing: ${effect}`);
    }
});

runTest('card contract はnon-generic effectのrule処理とCPU参照を要求する', () => {
    const gameManagerSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'GameManager.js'), 'utf8');
    const cpuSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'CPU.js'), 'utf8');
    const cpuEvaluationSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'cpuEvaluation.js'), 'utf8');
    const explicitRuleEffects = effectValues.filter(effect => {
        if (effect === runtime.CARD_EFFECTS.NORMAL) return false;
        return !runtime.CARD_EFFECT_METADATA[effect].incomeHandler;
    });
    const cpuEffects = effectValues.filter(effect => effect !== runtime.CARD_EFFECTS.NORMAL);

    for (const effect of explicitRuleEffects) {
        const constant = `CARD_EFFECTS.${effectKeyByValue[effect]}`;
        assert.ok(gameManagerSource.includes(constant), `GameManager rule reference missing: ${constant}`);
    }
    for (const effect of cpuEffects) {
        const constant = `CARD_EFFECTS.${effectKeyByValue[effect]}`;
        const injectedConstant = `effects.${effectKeyByValue[effect]}`;
        assert.ok(
            cpuSource.includes(constant) || cpuEvaluationSource.includes(injectedConstant),
            `CPU effect reference missing: ${constant}/${injectedConstant}`
        );
    }
});
