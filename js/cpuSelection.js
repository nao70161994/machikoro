'use strict';

const CPUSelection = Object.freeze({
    randomChoice(items, random = Math.random) {
        if (!Array.isArray(items) || items.length === 0) return null;
        return items[Math.floor(random() * items.length)];
    },

    firstMax(items, scoreOf) {
        if (!Array.isArray(items) || typeof scoreOf !== 'function') return null;
        let best = null;
        let bestScore = -Infinity;
        for (const item of items) {
            const score = scoreOf(item);
            if (score > bestScore) {
                best = item;
                bestScore = score;
            }
        }
        return best;
    },

    firstLexicographicMax(items, valueSelectors) {
        if (!Array.isArray(items) || !Array.isArray(valueSelectors) || valueSelectors.length === 0) return null;
        let best = null;
        let bestValues = null;
        for (const item of items) {
            const values = valueSelectors.map(select => select(item));
            if (!bestValues) {
                best = item;
                bestValues = values;
                continue;
            }
            for (let index = 0; index < values.length; index++) {
                if (values[index] === bestValues[index]) continue;
                if (values[index] > bestValues[index]) {
                    best = item;
                    bestValues = values;
                }
                break;
            }
        }
        return best;
        },

    stableRankDescending(items, scoreOf) {
        if (!Array.isArray(items) || typeof scoreOf !== 'function') return [];
        return items.map((item, index) => ({ item, index, score: scoreOf(item) }))
            .sort((left, right) => {
                const difference = right.score - left.score;
                return Number.isNaN(difference) || difference === 0
                    ? left.index - right.index
                    : difference;
            })
            .map(entry => entry.item);
    },

    directions: Object.freeze({ ASCENDING: 'ascending', DESCENDING: 'descending' }),

    stableRankLexicographic(items, keySpecs) {
        if (!Array.isArray(items) || !Array.isArray(keySpecs) || keySpecs.length === 0) return [];
        if (keySpecs.some(spec => !spec || typeof spec.valueOf !== 'function' ||
                !Object.values(CPUSelection.directions).includes(spec.direction))) return [];
        return items.map((item, index) => ({
            item,
            index,
            values: keySpecs.map(spec => spec.valueOf(item)),
        })).sort((left, right) => {
            for (let index = 0; index < keySpecs.length; index++) {
                const difference = keySpecs[index].direction === CPUSelection.directions.DESCENDING
                    ? right.values[index] - left.values[index]
                    : left.values[index] - right.values[index];
                if (!Number.isNaN(difference) && difference !== 0) return difference;
            }
            return left.index - right.index;
        }).map(entry => entry.item);
    },
});

if (typeof module !== 'undefined' && module.exports) module.exports = { CPUSelection };
if (typeof window !== 'undefined') window.CPUSelection = CPUSelection;
if (typeof globalThis !== 'undefined') globalThis.CPUSelection = CPUSelection;
