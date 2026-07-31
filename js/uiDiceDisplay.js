'use strict';

const DICE_DOT_LAYOUTS = Object.freeze({
    1: Object.freeze([0, 0, 0, 0, 1, 0, 0, 0, 0]),
    2: Object.freeze([1, 0, 0, 0, 0, 0, 0, 0, 1]),
    3: Object.freeze([1, 0, 0, 0, 1, 0, 0, 0, 1]),
    4: Object.freeze([1, 0, 1, 0, 0, 0, 1, 0, 1]),
    5: Object.freeze([1, 0, 1, 0, 1, 0, 1, 0, 1]),
    6: Object.freeze([1, 0, 1, 1, 0, 1, 1, 0, 1]),
});

function buildDiceFaceHtml(value) {
    const dots = DICE_DOT_LAYOUTS[value] || DICE_DOT_LAYOUTS[1];
    return `<div class="dice-face">
        ${dots.map(dot => `<div class="dot ${dot ? '' : 'hidden'}"></div>`).join('')}
    </div>`;
}

function buildDiceDisplayView(values, rolling = false) {
    if (rolling) {
        return Object.freeze({
            html: `<div class="dice-display">
            <div class="dice-face rolling">
                ${DICE_DOT_LAYOUTS[1].map(() => '<div class="dot"></div>').join('')}
            </div>
        </div>`,
            opacity: null,
        });
    }
    if (!Array.isArray(values) || values.length === 0) {
        return Object.freeze({
            html: `<div class="dice-display">${buildDiceFaceHtml(1)}</div>`,
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

const UiDiceDisplay = Object.freeze({
    layouts: DICE_DOT_LAYOUTS,
    buildFaceHtml: buildDiceFaceHtml,
    buildView: buildDiceDisplayView,
});

if (typeof module !== 'undefined' && module.exports) module.exports = UiDiceDisplay;
if (typeof window !== 'undefined') window.UiDiceDisplay = UiDiceDisplay;
if (typeof globalThis !== 'undefined') globalThis.UiDiceDisplay = UiDiceDisplay;
