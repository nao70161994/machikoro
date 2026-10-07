'use strict';

// Device-local presentation boundary only. No timers, sound, or game mutations.
const CardBoardFeedback = (() => {
    const rollPattern = /^🎲 (?:[1-6] が出ました|[1-6]\+[1-6]=(?:[2-9]|1[0-2]))$/u;
    const radioPattern = /^📡 電波塔で振り直し: (.+) → (.+)$/u;
    const signature = entry => JSON.stringify([entry?.type, entry?.message]);
    function digest(entries, length = entries.length) {
        let first = 2166136261, second = 5381;
        for (let index = 0; index < length; index++) {
            const text = signature(entries[index]);
            for (let at = 0; at < text.length; at++) {
                const code = text.charCodeAt(at);
                first = Math.imul(first ^ code, 16777619) >>> 0;
                second = (Math.imul(second, 33) ^ code) >>> 0;
            }
            first = Math.imul(first ^ 255, 16777619) >>> 0;
            second = (Math.imul(second, 33) ^ 255) >>> 0;
        }
        return `${first}:${second}`;
    }
    function outcome(game) {
        return game.lastDice2 ? `${game.lastDice1}+${game.lastDice2}=${game.lastDiceResult}` : String(game.lastDice1);
    }
    function create() {
        let previous = null;
        let invalidated = false;
        function refresh(facts = {}) {
            invalidated = false;
            const game = facts.game;
            if (!game || !Array.isArray(game.log) || !Array.isArray(game.players)) { previous = null; invalidated = true; return false; }
            const log = game.log;
            const snapshot = {
                session: facts.session, replaying: facts.replaying === true,
                turn: game.turnCount, actor: game.currentPlayerIndex, players: game.players.length,
                rerolled: game.usedReroll === true, outcome: outcome(game),
                length: log.length, digest: digest(log),
                tail: log.slice(-100).map(signature),
            };
            const old = previous;
            previous = snapshot;
            if (!old || old.session !== snapshot.session || old.replaying || snapshot.replaying ||
                snapshot.players !== old.players || snapshot.turn < old.turn) { invalidated = true; return false; }
            const append = log.length >= old.length && digest(log, old.length) === old.digest;
            if (append && log.slice(old.length).some(entry => rollPattern.test(entry?.message || ''))) return true;
            // A radio reroll intentionally replaces the current turn's log.
            // Accept only its false→true transition and exact old/new dice metadata.
            invalidated = !append || old.turn !== snapshot.turn || old.actor !== snapshot.actor;
            if (old.turn !== snapshot.turn || old.actor !== snapshot.actor || old.rerolled || !snapshot.rerolled) return false;
            const reroll = log.some(entry => rollPattern.test(entry?.message || '')) && log.some(entry => {
                const match = (entry?.message || '').match(radioPattern);
                return match && match[1] === old.outcome && match[2] === snapshot.outcome &&
                    !old.tail.includes(signature(entry));
            });
            if (reroll) invalidated = false;
            return reroll;
        }
        return Object.freeze({ refresh, wasInvalidated: () => invalidated, reset() { previous = null; invalidated = true; } });
    }
    return Object.freeze({ create });
})();
if (typeof module !== 'undefined' && module.exports) module.exports = CardBoardFeedback;
if (typeof window !== 'undefined') window.CardBoardFeedback = CardBoardFeedback;
