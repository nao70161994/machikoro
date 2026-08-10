const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { runTest } = require('./helpers/test-utils');
const { loadGameRuntime } = require('./helpers/runtime-loaders');

const runtime = loadGameRuntime();
const effectEntries = Object.entries(runtime.CARD_EFFECTS);
const effectValues = effectEntries.map(([, effect]) => effect);
const effectKeyByValue = Object.fromEntries(effectEntries.map(([key, effect]) => [effect, key]));

const OFFICIAL_CARD_DEFINITION_ROWS = Object.freeze([
    ['wheat_field', '麦畑', 1, [1], 1, 'blue', 'normal'],
    ['ranch', '牧場', 1, [2], 1, 'blue', 'normal'],
    ['forest', '森林', 3, [5], 1, 'blue', 'normal'],
    ['mine', '鉱山', 6, [9], 5, 'blue', 'normal'],
    ['apple_orchard', 'リンゴ園', 3, [10], 3, 'blue', 'normal'],
    ['bakery', 'パン屋', 1, [2, 3], 1, 'green', 'normal'],
    ['convenience_store', 'コンビニ', 2, [4], 3, 'green', 'normal'],
    ['cheese_factory', 'チーズ工場', 5, [7], 3, 'green', 'cheese'],
    ['furniture_factory', '家具工場', 3, [8], 3, 'green', 'furniture'],
    ['fruit_market', '青果市場', 2, [11, 12], 2, 'green', 'market'],
    ['cafe', 'カフェ', 2, [3], 1, 'red', 'normal'],
    ['family_restaurant', 'ファミレス', 3, [9, 10], 2, 'red', 'normal'],
    ['stadium', 'スタジアム', 6, [6], 2, 'purple', 'stadium'],
    ['tv_station', 'テレビ局', 7, [6], 5, 'purple', 'tv'],
    ['business_center', 'ビジネスセンター', 8, [6], 0, 'purple', 'business'],
    ['flower_garden', '花畑', 2, [4], 1, 'blue', 'normal'],
    ['mackerel_boat', 'サンマ漁船', 2, [8], 3, 'blue', 'harbor'],
    ['tuna_boat', 'マグロ漁船', 5, [12, 13, 14], 0, 'blue', 'tuna'],
    ['flower_shop', 'フラワーショップ', 1, [6], 1, 'green', 'flower'],
    ['food_warehouse', '食品倉庫', 2, [12, 13], 2, 'green', 'foodwarehouse'],
    ['sushi_bar', '寿司屋', 1, [1], 3, 'red', 'harbor_red'],
    ['pizza_shop', 'ピザ屋', 1, [7], 1, 'red', 'normal'],
    ['burger_shop', 'バーガーショップ', 1, [8], 1, 'red', 'normal'],
    ['publisher', '出版社', 5, [7], 0, 'purple', 'publisher'],
    ['tax_office', '税務署', 4, [8, 9], 0, 'purple', 'taxoffice'],
    ['corn_field', 'コーン畑', 2, [3, 4], 1, 'blue', 'cornfield'],
    ['vineyard', 'ブドウ園', 3, [7], 3, 'blue', 'normal'],
    ['general_store', '雑貨屋', 0, [2], 2, 'green', 'fewlandmark'],
    ['renovation_company', '改装屋', 1, [4], 8, 'green', 'renovation'],
    ['loan_office', '貸金業', 0, [5, 6], 0, 'green', 'loan'],
    ['winery', 'ワイナリー', 3, [9], 6, 'green', 'winery'],
    ['moving_company', '引越し屋', 2, [9, 10], 4, 'green', 'mover'],
    ['drink_factory', 'ドリンク工場', 5, [11], 1, 'green', 'drinkfactory'],
    ['french_restaurant', '高級フレンチ', 3, [5], 5, 'red', 'frenchr'],
    ['members_bar', '会員制BAR', 4, [12, 13, 14], 0, 'red', 'memberbar'],
    ['cleaning_company', '清掃業', 4, [8], 0, 'purple', 'cleaning'],
    ['it_startup', 'ITベンチャー', 1, [10], 0, 'purple', 'itstartup'],
    ['park', '公園', 3, [11, 12, 13], 0, 'purple', 'park'],
]);

const OFFICIAL_LANDMARK_DEFINITION_ROWS = Object.freeze([
    ['駅', 4],
    ['ショッピングモール', 10],
    ['遊園地', 16],
    ['電波塔', 22],
    ['港', 2],
    ['空港', 30],
]);

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

runTest('雑貨屋はランドマーク0-1軒で2コインの公式定義を維持する', () => {
    const def = runtime.CARD_DEFS.find(card => card.id === runtime.CARD_IDS.GENERAL_STORE);
    assert.ok(def);
    assert.deepStrictEqual(
        { cost: def.cost, diceNums: Array.from(def.diceNums), income: def.income, effect: def.effect },
        { cost: 0, diceNums: [2], income: 2, effect: runtime.CARD_EFFECTS.FEWLANDMARK }
    );
    assert.strictEqual(runtime.CARD_EFFECT_DESCRIPTIONS[def.effect](def.income), 'ランドマーク0-1軒なら+2コイン');
});

runTest('公式定義契約は全38施設のID・費用・出目・収入・色・効果を固定する', () => {
    const actual = Array.from(runtime.CARD_DEFS, def => [
        def.id,
        def.name,
        def.cost,
        Array.from(def.diceNums),
        def.income,
        def.color,
        def.effect,
    ]);
    assert.strictEqual(actual.length, 38);
    assert.deepStrictEqual(actual, OFFICIAL_CARD_DEFINITION_ROWS);
});

runTest('JS/Pythonの全カード定義はcategoryを含めて一致する', () => {
    const result = spawnSync('python3', ['-c', [
        'import json',
        'from scripts.rl.cards import ALL_CARDS',
        'print(json.dumps([[c.name,c.cost,list(c.dice_nums),c.income,c.color,c.category,c.effect] for c in ALL_CARDS], ensure_ascii=False))',
    ].join(';')], {
        cwd: path.join(__dirname, '..'),
        encoding: 'utf8',
    });
    assert.strictEqual(result.status, 0, result.stderr || result.stdout);
    const pythonDefs = JSON.parse(result.stdout);
    const jsDefs = Array.from(runtime.CARD_DEFS, def => [
        def.name,
        def.cost,
        Array.from(def.diceNums),
        def.income,
        def.color,
        def.category,
        def.effect,
    ]);
    assert.deepStrictEqual(pythonDefs, jsDefs);
});

runTest('公式定義契約は全6ランドマークの名称と費用を固定する', () => {
    const actual = Array.from(runtime.Player._LANDMARK_DEFS, def => [def.name, def.cost]);
    assert.strictEqual(actual.length, 6);
    assert.deepStrictEqual(actual, OFFICIAL_LANDMARK_DEFINITION_ROWS);
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
    const cardActivationPolicySource = fs.readFileSync(
        path.join(__dirname, '..', 'js', 'gameCardActivationPolicy.js'),
        'utf8'
    );
    const cpuSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'CPU.js'), 'utf8');
    const cpuEvaluationSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'cpuEvaluation.js'), 'utf8');
    const explicitRuleEffects = effectValues.filter(effect => {
        if (effect === runtime.CARD_EFFECTS.NORMAL) return false;
        return !runtime.CARD_EFFECT_METADATA[effect].incomeHandler;
    });
    const cpuEffects = effectValues.filter(effect => effect !== runtime.CARD_EFFECTS.NORMAL);

    for (const effect of explicitRuleEffects) {
        const constant = `CARD_EFFECTS.${effectKeyByValue[effect]}`;
        const injectedConstant = `facts.effects.${effectKeyByValue[effect]}`;
        assert.ok(
            gameManagerSource.includes(constant) || cardActivationPolicySource.includes(injectedConstant),
            `rule reference missing: ${constant}/${injectedConstant}`
        );
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
