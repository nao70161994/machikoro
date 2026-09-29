'use strict';

// This preference is device-local and never enters game saves or online actions.
const DesignTheme = (() => {
    const STORAGE_KEY = 'machikoroDesignTheme';
    function normalize(value) {
        return value === 'sunset' ? 'sunset' : 'classic';
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
        if (design === 'sunset' && guide.nextElementSibling === log && log.nextElementSibling === footer) return;
        const moves = design === 'sunset' ? [[guide, footer], [log, footer]] : [[guide, actions], [log, players]];
        for (const [element, anchor] of moves) {
            if (element.nextElementSibling !== anchor) screen.insertBefore(element, anchor);
        }
    }
    function initialize(documentRef, getStorage) {
        let selected = 'classic';
        try { selected = normalize(getStorage().getItem(STORAGE_KEY)); } catch (_) {}
        function apply(value, persist = false) {
            selected = normalize(value);
            documentRef.documentElement.setAttribute('data-design', selected);
            arrangeGameSections(documentRef, selected);
            const control = documentRef.getElementById('designThemeSelect');
            if (control) control.value = selected;
            const currentLabel = documentRef.getElementById('designThemeCurrentLabel');
            if (currentLabel) currentLabel.textContent = selected === 'sunset' ? '夕暮れの街' : 'クラシック';
            if (persist) {
                let saved = true;
                try { getStorage().setItem(STORAGE_KEY, selected); } catch (_) { saved = false; }
                const status = documentRef.getElementById('designThemeStatus');
                if (status) status.textContent = saved
                    ? 'デザインを変更しました。次回もこの設定で開きます。'
                    : 'デザインを変更しました。この端末では設定を保存できないため、今回のみ適用します。';
            }
        }
        apply(selected);
        const sync = () => apply(selected);
        if (documentRef.readyState === 'loading') {
            documentRef.addEventListener('DOMContentLoaded', sync, { once: true });
        } else sync();
        documentRef.addEventListener('change', event => {
            if (event.target && event.target.id === 'designThemeSelect') apply(event.target.value, true);
        });
        return Object.freeze({ apply, current: () => selected });
    }
    return Object.freeze({ STORAGE_KEY, normalize, initialize });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = DesignTheme;
if (typeof document !== 'undefined') DesignTheme.initialize(document, () => localStorage);
