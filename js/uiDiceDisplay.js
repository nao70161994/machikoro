'use strict';

const DICE_DOT_LAYOUTS = Object.freeze({
    1: Object.freeze([0, 0, 0, 0, 1, 0, 0, 0, 0]),
    2: Object.freeze([1, 0, 0, 0, 0, 0, 0, 0, 1]),
    3: Object.freeze([1, 0, 0, 0, 1, 0, 0, 0, 1]),
    4: Object.freeze([1, 0, 1, 0, 0, 0, 1, 0, 1]),
    5: Object.freeze([1, 0, 1, 0, 1, 0, 1, 0, 1]),
    6: Object.freeze([1, 0, 1, 1, 0, 1, 1, 0, 1]),
});

function buildDiceFaceHtml(value, options = {}) {
    const dots = DICE_DOT_LAYOUTS[value] || DICE_DOT_LAYOUTS[1];
    const accessible = options.decorative === true
        ? ' aria-hidden="true"'
        : ` role="img" aria-label="サイコロの出目 ${DICE_DOT_LAYOUTS[value] ? value : 1}"`;
    return `<div class="dice-face"${accessible}>
        ${dots.map(dot => `<div class="dot ${dot ? '' : 'hidden'}" aria-hidden="true"></div>`).join('')}
    </div>`;
}

function buildDiceDisplayView(values, rolling = false) {
    if (rolling) {
        return Object.freeze({
            html: `<div class="dice-display">
            <div class="dice-face rolling" aria-hidden="true">
                ${DICE_DOT_LAYOUTS[1].map(() => '<div class="dot" aria-hidden="true"></div>').join('')}
            </div>
        </div>`,
            opacity: null,
        });
    }
    if (!Array.isArray(values) || values.length === 0) {
        return Object.freeze({
            html: `<div class="dice-display">${buildDiceFaceHtml(1, { decorative: true })}</div>`,
            opacity: '0.2',
        });
    }
    return Object.freeze({
        html: `<div class="dice-display">
        ${values.map(value => buildDiceFaceHtml(value)).join('')}
    </div>`,
        opacity: '1',
    });
}

function normalizeDiceValues(values) {
    if (!Array.isArray(values)) return [];
    return values.filter(value => Number.isInteger(value) && value >= 1 && value <= 6);
}

function buildResultAnnouncement(values, options = {}) {
    const dice = normalizeDiceValues(values);
    if (dice.length === 0) return '';
    const prefix = options.rerolled === true ? '振り直し後、' : '';
    if (dice.length === 1) return `${prefix}サイコロの出目は${dice[0]}です`;
    const total = dice.reduce((sum, value) => sum + value, 0);
    return `${prefix}サイコロの出目は${dice.join('と')}、合計${total}です`;
}

function createAnnouncementController() {
    let initialized = false;
    let resultKey = '';

    return Object.freeze({
        reset() {
            initialized = false;
            resultKey = '';
        },
        transition(values, options = {}) {
            const dice = normalizeDiceValues(values);
            const nextKey = dice.length > 0 ? String(options.resultKey || dice.join(',')) : '';
            const changed = nextKey !== resultKey;
            const announce = initialized && changed && nextKey !== '' &&
                options.eligible === true;
            initialized = true;
            resultKey = nextKey;
            return Object.freeze({
                announce,
                clear: nextKey === '' || changed,
                text: announce ? buildResultAnnouncement(dice, options) : '',
            });
        },
    });
}

function applyAnnouncementPlan(plan, target) {
    if (!plan || !target) return false;
    if (plan.clear === true) target.textContent = '';
    if (plan.announce !== true || !plan.text) return false;
    target.textContent = plan.text;
    return true;
}

const UiDiceDisplay = Object.freeze({
    layouts: DICE_DOT_LAYOUTS,
    applyAnnouncementPlan,
    buildFaceHtml: buildDiceFaceHtml,
    buildResultAnnouncement,
    buildView: buildDiceDisplayView,
    createAnnouncementController,
    normalizeDiceValues,
});

if (typeof module !== 'undefined' && module.exports) module.exports = UiDiceDisplay;
if (typeof window !== 'undefined') window.UiDiceDisplay = UiDiceDisplay;
if (typeof globalThis !== 'undefined') globalThis.UiDiceDisplay = UiDiceDisplay;
