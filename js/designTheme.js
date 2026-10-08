'use strict';
/* global CustomEvent */

// This preference is device-local and never enters game saves or online actions.
const DesignTheme = (() => {
    const STORAGE_KEY = 'machikoroDesignTheme';
    function normalize(value) {
        return value === 'cardboard' || value === 'plaza' || value === 'sunset' ? value : 'classic';
    }
    function arrangeGameSections(documentRef, design) {
        const screen = documentRef.getElementById('gameScreen');
        if (!screen || typeof screen.querySelector !== 'function' || typeof screen.insertBefore !== 'function') return;
        const guide = documentRef.getElementById('tutorialBox');
        const log = documentRef.getElementById('gameLogContainer');
        const actions = screen.querySelector('.game-action-panel');
        const players = screen.querySelector('.player-area');
        const footer = documentRef.getElementById('onlineLeaveHelp');
        if (![guide, log, actions, players, footer].every(element => element && element.parentElement === screen)) return;
        if (design !== 'classic' && guide.nextElementSibling === log && log.nextElementSibling === footer) return;
        const moves = design !== 'classic' ? [[guide, footer], [log, footer]] : [[guide, actions], [log, players]];
        for (const [element, anchor] of moves) {
            if (element.nextElementSibling !== anchor) screen.insertBefore(element, anchor);
        }
    }
    function initialize(documentRef, getStorage) {
        let selected = 'classic';
        try { selected = normalize(getStorage().getItem(STORAGE_KEY)); } catch (_) {}
        function apply(value, persist = false) {
            const next = normalize(value);
            // Capture focus before CSS hides the outgoing presentation.
            if (typeof documentRef.dispatchEvent === 'function' && typeof CustomEvent !== 'undefined') {
                documentRef.dispatchEvent(new CustomEvent('design-theme-will-change', { detail: { design: next } }));
            }
            selected = next;
            documentRef.documentElement.setAttribute('data-design', selected);
            arrangeGameSections(documentRef, selected);
            for (const id of ['designThemeSelect', 'gameDesignThemeSelect']) {
                const control = documentRef.getElementById(id);
                if (control) control.value = selected;
            }
            const currentLabel = documentRef.getElementById('designThemeCurrentLabel');
            if (currentLabel) currentLabel.textContent = selected === 'cardboard' ? 'にぎわい広場（カード盤面）' : selected === 'plaza'
                ? '夕暮れの広場'
                : (selected === 'sunset' ? '夕暮れの街' : 'クラシック');
            if (persist) {
                let saved = true;
                try { getStorage().setItem(STORAGE_KEY, selected); } catch (_) { saved = false; }
                const status = documentRef.getElementById('designThemeStatus');
                if (status) status.textContent = saved
                    ? 'デザインを変更しました。次回もこの設定で開きます。'
                    : 'デザインを変更しました。この端末では設定を保存できないため、今回のみ適用します。';
            }
            if (typeof documentRef.dispatchEvent === 'function' && typeof CustomEvent !== 'undefined') {
                documentRef.dispatchEvent(new CustomEvent('design-theme-change', { detail: { design: selected } }));
            }
        }
        apply(selected);
        const sync = () => apply(selected);
        if (documentRef.readyState === 'loading') {
            documentRef.addEventListener('DOMContentLoaded', sync, { once: true });
        } else sync();
        documentRef.addEventListener('change', event => {
            if (event.target && ['designThemeSelect', 'gameDesignThemeSelect'].includes(event.target.id)) apply(event.target.value, true);
        });
        return Object.freeze({ apply, current: () => selected });
    }
    return Object.freeze({ STORAGE_KEY, normalize, initialize, arrangeGameSections });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = DesignTheme;
if (typeof document !== 'undefined') DesignTheme.initialize(document, () => localStorage);
