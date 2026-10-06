'use strict';

// Presentation snapshots only; never adopts state, submits actions, or moves a camera.
const UiPlazaFeedback = (() => {
    function create(options) {
        const documentRef = options.document;
        const schedule = options.setTimeout || setTimeout;
        const cancel = options.clearTimeout || clearTimeout;
        let previous = null;
        const effects = new Set();
        function clear() {
            for (const effect of effects) { cancel(effect.timer); effect.clear(); }
            effects.clear();
        }
        function pulse(element, className) {
            if (!element?.classList) return;
            for (const effect of effects) {
                if (effect.element === element && effect.className === className) {
                    cancel(effect.timer); effect.clear(); effects.delete(effect);
                }
            }
            element.classList.add(className);
            const effect = { element, className, timer: null, clear: () => element.classList.remove(className) };
            effect.timer = schedule(() => {
                if (!effects.has(effect)) return;
                effect.clear(); effects.delete(effect);
            }, 1000);
            effects.add(effect);
        }
        function snapshot(game) {
            const enabled = options.getEnabledLandmarks?.();
            return {
                session: options.getSession(), replaying: options.isReplaying?.() === true,
                counts: game.players.slice(0, 10).map(player => {
                    const counts = new Map();
                    for (const card of player.cards || []) counts.set(`card:${card.name}`, (counts.get(`card:${card.name}`) || 0) + 1);
                    for (const [name, built] of Object.entries(player.landmarks || {})) {
                        if (built && (!enabled || enabled.has(name))) counts.set(`landmark:${name}`, 1);
                    }
                    return counts;
                }),
                log: (game.log || []).map(entry => JSON.stringify([entry.type, entry.message])),
                turn: game.turnCount, actor: game.currentPlayerIndex,
            };
        }
        function refresh() {
            const game = options.getGame();
            if (!game || !Array.isArray(game.players) || options.isVisible?.() === false) {
                clear(); previous = null; options.onMilestones?.([]); return [];
            }
            const current = snapshot(game), old = previous;
            previous = current;
            const reset = !old || old.session !== current.session || current.replaying || old.replaying ||
                old.counts.length !== current.counts.length || current.turn < old.turn ||
                current.counts.some((counts, index) => [...old.counts[index]].some(([key, value]) => (counts.get(key) || 0) < value)) ||
                (old.turn === current.turn && old.actor === current.actor &&
                    (old.log.length > current.log.length || old.log.some((signature, index) => signature !== current.log[index])));
            if (reset) { clear(); options.onMilestones?.([]); return []; }
            if (old.turn !== current.turn || old.actor !== current.actor) options.onMilestones?.([]);
            const milestones = [];
            let landmarkSound = false;
            current.counts.forEach((counts, index) => {
                for (const [key, count] of counts) {
                    const before = old.counts[index].get(key) || 0;
                    if (count <= before) continue;
                    const landmark = key.startsWith('landmark:');
                    const name = key.slice(key.indexOf(':') + 1);
                    const panel = documentRef.getElementById(`playerBox${index}`);
                    const lots = Array.from(panel?.querySelectorAll('[data-town-building]') || [])
                        .filter(lot => lot.dataset.townBuilding === key);
                    // Each visible lot is one owned copy. A capped town may have
                    // no new lot; highlight its receipt rather than an old copy.
                    const added = landmark ? lots : lots.slice(before);
                    const newest = added[added.length - 1];
                    const won = options.isWinner ? options.isWinner(game, index) === true : game.winner === game.players[index];
                    if (newest && (!landmark || !won)) pulse(newest,
                        landmark ? 'town-building-landmark-arrival' : 'town-building-arrival');
                    const wallet = documentRef.getElementById('plazaPlayerHud')?.querySelector(`[data-player-index="${index}"] .plaza-player-coins`);
                    pulse(wallet, 'plaza-wallet-purchase');
                    pulse(options.getMarketCard?.(name, landmark), 'plaza-market-purchased');
                    const milestone = { playerIndex: index, name, landmark, winner: won,
                        message: `${game.players[index].name}：${name}${landmark ? 'が完成' : 'を建設'}` };
                    milestones.push(milestone);
                    if (landmark && !won) {
                        pulse(options.getReceipt?.(), 'plaza-landmark-feedback');
                        landmarkSound = true;
                    } else if (!landmark) pulse(options.getReceipt?.(), 'plaza-purchase-feedback');
                }
            });
            const sameTurn = old.turn === current.turn && old.actor === current.actor;
            const appended = sameTurn ? (game.log || []).slice(old.log.length) : [];
            const significant = options.isImportantLog || (entry => /[+-]?(\d+)コイン/u.test(entry.message || '') &&
                Math.max(0, ...[...(entry.message || '').matchAll(/([+-]?\d+)コイン/gu)].map(match => Math.abs(Number(match[1])))) >= 5);
            const amounts = appended.map(entry => [...(entry.message || '').matchAll(/([+-]?\d+)コイン/gu)]
                .map(match => Math.abs(Number(match[1])))).map(values => values[values.length - 1] || 0);
            const combo = amounts.filter(amount => amount > 0).length > 1 &&
                amounts.reduce((total, amount) => total + amount, 0) >= 5;
            if (appended.some(significant) || combo) pulse(options.getReceipt?.(), 'plaza-important-feedback');
            if (landmarkSound) options.playLandmarkSound?.();
            const boundedMilestones = milestones.slice(-10);
            if (boundedMilestones.length) options.onMilestones?.(boundedMilestones);
            return boundedMilestones;
        }
        return Object.freeze({ refresh, clear, reset() { clear(); previous = null; options.onMilestones?.([]); } });
    }
    return Object.freeze({ create });
})();
if (typeof module !== 'undefined' && module.exports) module.exports = UiPlazaFeedback;
if (typeof window !== 'undefined') window.UiPlazaFeedback = UiPlazaFeedback;
