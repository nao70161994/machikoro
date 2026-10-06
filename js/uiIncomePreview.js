'use strict';

const UiIncomePreview = (() => {
    const PENDING_LABELS = Object.freeze({
        pendingTV: 'テレビ局の対象選択', pendingBusiness: '施設交換',
        pendingCleaning: '休業施設の選択', pendingMover: '引越し先の選択',
        pendingRenovation: '改装するランドマークの選択', pendingIT: 'IT投資の選択',
    });
    const NOTES = Object.freeze([
        '今の所持金・施設・休業状態で、指定した人が振った場合の即時純収支です。',
        '赤の支払い順と残高制限、青・緑・紫の即時効果、役所を含みます。',
        '対象を選ぶ効果は未解決です。振り直し・追加手番・建設・空港の建設なし収入・追加投資は含みません。',
        'マグロ漁船の別ダイスは確率を反映した平均と最小・最大を示します。',
    ]);

    function create(dependencies) {
        const d = dependencies || {};
        if (!d.simulation || typeof d.simulation.cloneGame !== 'function' ||
                typeof d.simulation.diceOutcomeWeights !== 'function' ||
                typeof d.createGame !== 'function' || typeof d.cloneCard !== 'function' ||
                typeof d.defaultLandmarks !== 'function' || !Array.isArray(d.cards) ||
                typeof d.tunaEffect !== 'string' || typeof d.harborName !== 'string') {
            throw new TypeError('Income preview game adapters are required');
        }
        const knownNames = new Set(d.cards.map(card => card.name));
        const unavailable = reason => ({ available: false, reason, rows: [], aggregate: [],
            notes: NOTES.slice(), simulationCount: 0 });

        function evaluate(game, options = {}) {
            const players = game?.players;
            const { playerIndex, rollerIndex, diceCount = 1, harborBonus = false } = options;
            if (!Array.isArray(players) || players.length < 2 || players.length > 10 ||
                    !Number.isInteger(playerIndex) || !players[playerIndex] ||
                    !Number.isInteger(rollerIndex) || !players[rollerIndex] ||
                    (diceCount !== 1 && diceCount !== 2)) return unavailable('invalid-input');
            if (players.some(player => !Array.isArray(player.cards) || !Array.isArray(player.dormantCards) ||
                    !Number.isSafeInteger(player.coins) || player.coins < 0 || !player.landmarks)) {
                return unavailable('invalid-state');
            }
            if (players.some(player => player.cards.some(card => !card || !knownNames.has(card.name)))) {
                return unavailable('unknown-card');
            }
            const hasHarbor = !!players[rollerIndex].landmarks[d.harborName];
            if (harborBonus && (diceCount !== 2 || !hasHarbor)) return unavailable('harbor-unavailable');
            const hasTuna = players.some(player => !!player.landmarks[d.harborName] &&
                player.cards.some(card => card.effect === d.tunaEffect));
            const samples = hasTuna ? d.simulation.diceOutcomeWeights(true)
                : [{ dice1: 1, dice2: 1, weight: 1 }];
            const sampleWeight = samples.reduce((sum, sample) => sum + sample.weight, 0);
            const outcomes = d.simulation.diceOutcomeWeights(diceCount === 2);
            const diceWeight = outcomes.reduce((sum, outcome) => sum + outcome.weight, 0);
            let simulationCount = 0;
            const rows = outcomes.map(outcome => {
                const useHarbor = harborBonus && outcome.total >= 10;
                const effectiveDice = outcome.total + (useHarbor ? 2 : 0);
                const values = players.map(() => ({ mean: 0, min: Infinity, max: -Infinity }));
                const pendingFields = new Set();
                for (const sample of samples) {
                    const clone = d.simulation.cloneGame(game, d);
                    clone.resetPendingState();
                    clone.currentPlayerIndex = rollerIndex;
                    clone.lastDice1 = outcome.dice1;
                    clone.lastDice2 = outcome.dice2;
                    clone.lastDiceResult = effectiveDice;
                    clone.processIncome([sample.dice1, sample.dice2]);
                    simulationCount++;
                    clone.players.forEach((player, index) => {
                        const delta = player.coins - players[index].coins;
                        values[index].mean += delta * sample.weight / sampleWeight;
                        values[index].min = Math.min(values[index].min, delta);
                        values[index].max = Math.max(values[index].max, delta);
                    });
                    for (const field of Object.keys(PENDING_LABELS)) {
                        if (clone[field]) pendingFields.add(field);
                    }
                }
                return { dice: outcome.total, effectiveDice, harborApplied: !!useHarbor,
                    probability: outcome.weight / diceWeight, players: values,
                    target: { ...values[playerIndex] },
                    pending: [...pendingFields].map(field => ({ field, label: PENDING_LABELS[field] })) };
            });
            const aggregate = players.map((_, index) => ({
                mean: rows.reduce((sum, row) => sum + row.players[index].mean * row.probability, 0),
                min: Math.min(...rows.map(row => row.players[index].min)),
                max: Math.max(...rows.map(row => row.players[index].max)),
            }));
            return { available: true, playerIndex, rollerIndex, diceCount, harborBonus,
                rows, aggregate, target: { ...aggregate[playerIndex] }, simulationCount,
                notes: NOTES.concat(harborBonus ? ['港ありの2個振りで、合計10以上のとき毎回+2する場合です。'] : []) };
        }
        return Object.freeze({ evaluate });
    }
    return Object.freeze({ create, NOTES });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = UiIncomePreview;
if (typeof window !== 'undefined') window.UiIncomePreview = UiIncomePreview;
if (typeof globalThis !== 'undefined') globalThis.UiIncomePreview = UiIncomePreview;
