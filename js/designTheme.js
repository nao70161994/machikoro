'use strict';

// This preference is device-local and never enters game saves or online actions.
const DesignTheme = (() => {
    const STORAGE_KEY = 'machikoroDesignTheme';
    function normalize(value) {
        return value === 'sunset' ? 'sunset' : 'classic';
    }
    function initialize(documentRef, getStorage) {
        let selected = 'classic';
        try { selected = normalize(getStorage().getItem(STORAGE_KEY)); } catch (_) {}
        function apply(value, persist = false) {
            selected = normalize(value);
            documentRef.documentElement.setAttribute('data-design', selected);
            const control = documentRef.getElementById('designThemeSelect');
            if (control) control.value = selected;
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
