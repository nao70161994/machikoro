'use strict';

const UiLogHighlightEffects = (() => {
    /**
     * @typedef {HTMLElement & { open?: boolean }} HighlightElement
     * @typedef {{ name?: string } | null} Player
     * @typedef {{ players?: Player[] } | null} Game
     * @typedef {{
     *   document: Pick<Document, 'querySelectorAll' | 'getElementById'> & { body: HTMLElement | null },
     *   getGame: () => Game,
     *   getTimer: () => number | null,
     *   setTimer: (timer: number | null) => void,
     *   clearTimeout: (timer: number) => void,
     *   schedule: (callback: () => void, delay: number) => number,
     * }} Dependencies
     */

    /**
     * @param {Dependencies} dependencies
     */
    function create(dependencies) {
        if (!dependencies || !dependencies.document ||
                typeof dependencies.document.querySelectorAll !== 'function' ||
                typeof dependencies.document.getElementById !== 'function' ||
                typeof dependencies.getGame !== 'function' ||
                typeof dependencies.getTimer !== 'function' ||
                typeof dependencies.setTimer !== 'function' ||
                typeof dependencies.clearTimeout !== 'function' ||
                typeof dependencies.schedule !== 'function') {
            throw new TypeError('UI log highlight dependencies are required');
        }

        /**
         * @param {string} playerName
         * @param {string} targetName
         * @param {string} cardName
         * @param {string} logMessage
         * @returns {boolean}
         */
        function highlight(playerName = '', targetName = '', cardName = '', logMessage = '') {
            const { document } = dependencies;
            Array.from(document.querySelectorAll('.log-related-highlight'))
                .forEach(element => element.classList.remove('log-related-highlight'));
            const previousTimer = dependencies.getTimer();
            if (previousTimer !== null) {
                dependencies.clearTimeout(previousTimer);
                dependencies.setTimer(null);
            }

            const game = dependencies.getGame();
            if (!game || !Array.isArray(game.players)) return false;
            const relatedNames = new Set([playerName, targetName].filter(Boolean));
            const matches = [];
            game.players.forEach((player, index) => {
                if (!player || (!relatedNames.has(player.name) && !String(logMessage).includes(player.name))) return;
                const box = /** @type {HighlightElement | null} */ (
                    document.getElementById(`playerBox${index}`)
                );
                if (!box) return;
                if (box.tagName === 'DETAILS') box.open = true;
                box.classList.add('log-related-highlight');
                matches.push(box);
            });
            if (cardName) {
                const playerRoot = document.getElementById('players');
                const roots = matches.length > 0 ? matches : [playerRoot];
                roots.filter(Boolean).forEach(root => {
                    Array.from(root.querySelectorAll('[data-card-name]')).forEach(card => {
                        if (card.dataset.cardName !== cardName) return;
                        card.classList.add('log-related-highlight');
                        matches.push(card);
                    });
                });
            }

            const first = matches[0];
            if (!first) return false;
            if (typeof first.scrollIntoView === 'function') {
                const reduceMotion = document.body &&
                    document.body.classList.contains('accessibility-reduced-motion');
                first.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
            }
            dependencies.setTimer(dependencies.schedule(() => {
                matches.forEach(element => element.classList.remove('log-related-highlight'));
                dependencies.setTimer(null);
            }, 2200));
            return true;
        }

        return Object.freeze({ highlight });
    }

    return Object.freeze({ create });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = UiLogHighlightEffects;
if (typeof window !== 'undefined') Object.assign(window, { UiLogHighlightEffects });
if (typeof globalThis !== 'undefined') globalThis.UiLogHighlightEffects = UiLogHighlightEffects;
