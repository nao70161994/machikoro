'use strict';
/* global DicePresentation, GameActionContract */

// Device-local presentation boundary only. No timers, sound, or game mutations.
const CardBoardFeedback = (() => {
    const presentation = typeof DicePresentation !== 'undefined' ? DicePresentation : require('./dicePresentation');
    const phases = (typeof GameActionContract !== 'undefined' ? GameActionContract : require('./actionContract')).phases;
    const signature = entry => JSON.stringify([entry?.type, entry?.message, entry?.diceResolution]);
    function resolution(entry, game) {
        const value = presentation.read(entry?.diceResolution, game.players.length);
        return value?.turn === game.turnCount && value?.actor === game.currentPlayerIndex && value?.rerolled === (game.usedReroll === true)
            ? presentation.identity(value) : null;
    }
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
    function create() {
        let previous = null;
        let invalidated = false;
        let resultLogs = [];
        function refresh(facts = {}) {
            resultLogs = [];
            invalidated = false;
            const game = facts.game;
            if (!game || !Array.isArray(game.log) || !Array.isArray(game.players)) { previous = null; invalidated = true; return false; }
            const log = game.log;
            const resolutions = log.map(entry => resolution(entry, game));
            const snapshot = {
                session: facts.session, replaying: facts.replaying === true,
                turn: game.turnCount, actor: game.currentPlayerIndex, players: game.players.length,
                rerolled: game.usedReroll === true, phase: game.phase,
                resolution: resolutions.filter(Boolean).at(-1) || null,
                length: log.length, digest: digest(log),
            };
            const old = previous;
            previous = snapshot;
            if (!old || old.session !== snapshot.session || old.replaying || snapshot.replaying ||
                snapshot.players !== old.players || snapshot.turn < old.turn) { invalidated = true; return false; }
            const append = log.length >= old.length && digest(log, old.length) === old.digest;
            // Metadata survives engine adoption; unlike message text, it denotes
            // an actual completed roll. Initial/restore history is only a baseline.
            const resolved = snapshot.resolution !== null && snapshot.resolution !== old.resolution;
            if (append && resolved && resolutions.slice(old.length).filter(Boolean).length === 1) {
                resultLogs = log.slice();
                return true;
            }
            invalidated = !append || old.turn !== snapshot.turn || old.actor !== snapshot.actor;
            const reroll = resolved && old.turn === snapshot.turn && old.actor === snapshot.actor &&
                !old.rerolled && snapshot.rerolled && resolutions.filter(Boolean).length === 1;
            if (reroll) { invalidated = false; resultLogs = log.slice(); }
            // A resolved roll may still await radio/harbor/special choices.
            // Only their new append is presented; never replay earlier income.
            const waiting = [phases.REROLL_CONFIRM, phases.HARBOR_CHOICE, phases.PENDING].includes(old.phase);
            if (!invalidated && append && waiting && snapshot.resolution &&
                old.resolution === snapshot.resolution && !game.builtThisTurn && log.length > old.length) {
                const anchor = log.findLast(entry => resolution(entry, game) === snapshot.resolution);
                if (anchor) resultLogs = [anchor, ...log.slice(old.length)];
            }
            return reroll;
        }
        return Object.freeze({ refresh, takeResultLogs() { const logs = resultLogs; resultLogs = []; return logs; }, wasInvalidated: () => invalidated, reset() { previous = null; invalidated = true; resultLogs = []; } });
    }
    return Object.freeze({ create });
})();
if (typeof module !== 'undefined' && module.exports) module.exports = CardBoardFeedback;
if (typeof window !== 'undefined') window.CardBoardFeedback = CardBoardFeedback;
