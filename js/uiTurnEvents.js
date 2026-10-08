'use strict';
/* global UiLogDisplay, DicePresentation, GameCoinTransaction */

// Device-local receipt projection. Structured rule/replay logs remain untouched.
const UiTurnEvents = (() => {
    const dicePresentation = typeof DicePresentation !== 'undefined' ? DicePresentation : require('./dicePresentation');
    const transactions = typeof GameCoinTransaction !== 'undefined' ? GameCoinTransaction : require('./gameCoinTransaction');
    function project(entries, options = {}) {
        const helper = options.logDisplay || (typeof UiLogDisplay !== 'undefined' ? UiLogDisplay
            : typeof require === 'function' ? require('./uiLogDisplay') : null);
        const display = options.display || (options.logTypes ? helper.makeLogTypeDisplay(options.logTypes) : {});
        const players = (options.players || []).slice(0, 10);
        const history = (Array.isArray(entries) ? entries : []).filter(entry => entry && typeof entry.message === 'string');
        const uniqueIndex = name => {
            const indices = players.map((player, index) => player.name === name ? index : -1).filter(index => index >= 0);
            return indices.length === 1 ? indices[0] : null;
        };
        const currentIndex = Number.isInteger(options.turnPlayerIndex) && options.turnPlayerIndex >= 0 &&
            options.turnPlayerIndex < players.length ? options.turnPlayerIndex : null;
        let actorIndex = currentIndex;
        let boundary = 0;
        let turnBoundary = 0;
        /** @type {{values: number[], base: number, effective: number, rerolled: boolean, harbor: boolean} | null} */
        let dice = null;
        for (let index = 0; index < history.length; index++) {
            const entry = history[index];
            const cls = helper.classifyLogEntry(entry, display).cls;
            const marker = entry.message.match(/^👤\s+(.+)のターン$/u);
            if (marker) {
                actorIndex = uniqueIndex(marker[1]); boundary = index; dice = null;
                turnBoundary = index > 0 && history[index - 1].message === '🎡 遊園地効果！ゾロ目でもう一度ターン'
                    ? index - 1 : index;
            }
            if (cls !== 'log-dice') continue;
            const resolution = dicePresentation.read(entry.diceResolution, players.length);
            if (resolution) {
                boundary = index;
                actorIndex = resolution.actor;
                dice = { values: resolution.dice2 ? [resolution.dice1, resolution.dice2] : [resolution.dice1],
                    base: resolution.result, effective: resolution.result,
                    rerolled: resolution.rerolled, harbor: false };
                continue;
            }
            const one = entry.message.match(/^🎲\s+(\d+) が出ました$/u);
            const two = entry.message.match(/^🎲\s+(\d+)\+(\d+)=(\d+)$/u);
            if (one || two) {
                boundary = index;
                const values = one ? [Number(one[1])] : [Number(two[1]), Number(two[2])];
                dice = { values, base: one ? values[0] : Number(two[3]), effective: one ? values[0] : Number(two[3]), rerolled: false, harbor: false };
            } else if (/^📡 電波塔で振り直し: /u.test(entry.message)) {
                // Some historical fixtures only contain the radio result marker.
                const result = entry.message.split(' → ')[1]?.match(/^(\d+)(?:\+(\d+)=(\d+))?$/u);
                // Non-station rerolls append radio metadata after new income.
                // Keep the most recent actual roll as the receipt boundary.
                if (!dice) boundary = index;
                if (result) {
                    const values = result[2] ? [Number(result[1]), Number(result[2])] : [Number(result[1])];
                    const base = Number(result[3] || result[1]);
                    dice = { values, base, effective: base, rerolled: true, harbor: false };
                } else if (dice) dice = { ...dice, rerolled: true };
            } else {
                const harbor = entry.message.match(/^⚓ 港効果\+2 → (\d+)$/u);
                const unchanged = entry.message.match(/^→ そのまま (\d+) を使用$/u);
                if (dice && (harbor || unchanged)) dice = { ...dice, effective: Number((harbor || unchanged)[1]), harbor: !!harbor };
            }
        }
        const actorName = actorIndex === null ? '' : players[actorIndex].name;
        const cards = new Set(options.cardNames || players.flatMap(player => (player.cards || []).map(card => card.name)));
        const groups = new Map();
        const balances = players.map((player, index) => ({ index, name: player.name, income: 0, payment: 0, facilityNet: 0, otherLogNet: 0 }));
        const unparsed = [];
        const seenResolutions = new Set();
        for (const entry of history.slice(boundary)) {
            const resolution = transactions.readResolution(entry.coinResolution, players.length);
            if (resolution && cards.has(resolution.subject)) {
                const identity = JSON.stringify([resolution.owner, resolution.subject, resolution.activation]);
                if (seenResolutions.has(identity)) continue;
                const projected = balances.map(balance => ({ ...balance }));
                const safe = resolution.transfers.every(({ from, to, amount }) => {
                    if (Number.isInteger(from)) { projected[from].payment += amount; projected[from].facilityNet -= amount; }
                    if (Number.isInteger(to)) { projected[to].income += amount; projected[to].facilityNet += amount; }
                    return projected.every(balance => Number.isSafeInteger(balance.payment) &&
                        Number.isSafeInteger(balance.income) && Number.isSafeInteger(balance.facilityNet));
                });
                if (!safe) { unparsed.push(entry.message); continue; }
                seenResolutions.add(identity);
                for (const transfer of resolution.transfers) {
                    const { from, to, amount } = transfer;
                    const key = JSON.stringify(['typed', identity, from, to]);
                    groups.set(key, { from, to, amount, subject: resolution.subject, facility: true,
                        owner: resolution.owner, activation: identity, count: 1 });
                    if (Number.isInteger(from)) { balances[from].payment += amount; balances[from].facilityNet -= amount; }
                    if (Number.isInteger(to)) { balances[to].income += amount; balances[to].facilityNet += amount; }
                }
                continue;
            }
            const cls = helper.classifyLogEntry(entry, display).cls;
            if (cls === 'log-special' && /[+-]?\d+コイン/u.test(entry.message)) {
                // Purple effects may log both individual transfers and their
                // aggregate. Without typed payer/recipient data, retain raw
                // evidence instead of double-counting or guessing transfers.
                unparsed.push(entry.message);
                continue;
            }
            if (cls !== 'log-gain' && cls !== 'log-lose') continue;
            const event = helper.coinEvent(entry, display, { players, turnPlayerName: actorName });
            const receiver = event ? uniqueIndex(event.actor) : null;
            // Never infer owners for ambiguous/unknown names or malformed amounts.
            if (!event || receiver === null || !Number.isSafeInteger(event.amount)) { unparsed.push(entry.message); continue; }
            const transfer = event.payment && event.transfer;
            if (transfer && actorIndex === null) { unparsed.push(entry.message); continue; }
            const from = event.payment ? transfer ? actorIndex : receiver : null;
            const to = !event.payment || transfer ? receiver : null;
            const facility = cards.has(event.subject);
            const key = JSON.stringify([from, to, event.subject, facility]);
            const previous = groups.get(key);
            const amount = (previous?.amount || 0) + event.amount;
            const safeBalance = (index, sign) => index === null ||
                Number.isSafeInteger(balances[index][sign < 0 ? 'payment' : 'income'] + event.amount) &&
                Number.isSafeInteger(balances[index][facility ? 'facilityNet' : 'otherLogNet'] + sign * event.amount);
            if (!Number.isSafeInteger(amount) || !safeBalance(from, -1) || !safeBalance(to, 1)) {
                unparsed.push(entry.message); continue;
            }
            groups.set(key, { from, to, subject: event.subject, facility, amount, count: (previous?.count || 0) + 1 });
            if (from !== null) {
                balances[from].payment += event.amount;
                balances[from][facility ? 'facilityNet' : 'otherLogNet'] -= event.amount;
            }
            if (to !== null) {
                balances[to].income += event.amount;
                balances[to][facility ? 'facilityNet' : 'otherLogNet'] += event.amount;
            }
        }
        const landmarks = new Set(options.landmarkNames || []);
        const important = [];
        history.slice(turnBoundary).forEach((entry, offset) => {
            const index = turnBoundary + offset;
            const cls = helper.classifyLogEntry(entry, display).cls;
            const built = entry.message.match(/^🏆\s+(.+)を建設！$/u);
            let kind = '', priority = 0;
            if (built && landmarks.has(built[1])) { kind = 'landmark'; priority = 4; }
            else if (entry.message === '🎡 遊園地効果！ゾロ目でもう一度ターン') { kind = 'extra-turn'; priority = 3; }
            else if (cls === 'log-build') { kind = 'build'; priority = 2; }
            else if (cls === 'log-special' || cls === 'log-error') { kind = 'special'; priority = 1; }
            if (kind) important.push({ kind, priority, index, actorIndex, message: entry.message });
        });
        important.sort((a, b) => b.priority - a.priority || b.index - a.index);
        const activationLimit = Number.isInteger(options.maxActivations)
            ? Math.max(12, Math.min(1000, options.maxActivations)) : 12;
        return { actorIndex, actorName, participantNames: players.map(player => player.name), dice, activations: [...groups.values()].slice(0, activationLimit),
            omittedActivations: Math.max(0, groups.size - activationLimit), balances: balances.filter(balance => balance.income || balance.payment),
            unparsed: unparsed.slice(-3), unparsedCount: unparsed.length,
            incomplete: unparsed.length > 0, important: important.slice(0, 4) };
    }

    return Object.freeze({ project });
})();
if (typeof module !== 'undefined' && module.exports) module.exports = UiTurnEvents;
if (typeof window !== 'undefined') window.UiTurnEvents = UiTurnEvents;
