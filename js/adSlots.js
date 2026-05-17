(function () {
    const AD_SLOT_CONFIGS = Object.freeze({
        'title-bottom': Object.freeze({
            label: '広告枠',
            description: 'タイトル画面下部',
        }),
        'rules-bottom': Object.freeze({
            label: '広告枠',
            description: 'ルール画面下部',
        }),
        'result-bottom': Object.freeze({
            label: '広告枠',
            description: 'リザルト画面下部',
        }),
    });

    function escapeAdText(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function renderAdSlot(location) {
        const config = AD_SLOT_CONFIGS[location];
        if (!config) return '';
        return [
            `<aside class="ad-slot ad-slot-${escapeAdText(location)}" data-ad-location="${escapeAdText(location)}" aria-label="${escapeAdText(config.label)}">`,
            `    <div class="ad-slot-label">${escapeAdText(config.label)}</div>`,
            `    <div class="ad-slot-description">${escapeAdText(config.description)}</div>`,
            '</aside>',
        ].join('');
    }

    function mountAdSlot(location, target) {
        const el = typeof target === 'string' ? document.getElementById(target) : target;
        if (!el) return false;
        el.innerHTML = renderAdSlot(location);
        return true;
    }

    function mountStaticAdSlots(root) {
        const scope = root || document;
        const hosts = scope.querySelectorAll('[data-ad-slot-host]');
        hosts.forEach(host => mountAdSlot(host.dataset.adSlotHost, host));
    }

    if (typeof window !== 'undefined') {
        window.AD_SLOT_CONFIGS = AD_SLOT_CONFIGS;
        window.renderAdSlot = renderAdSlot;
        window.mountAdSlot = mountAdSlot;
        window.mountStaticAdSlots = mountStaticAdSlots;
        document.addEventListener('DOMContentLoaded', () => mountStaticAdSlots());
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { AD_SLOT_CONFIGS, renderAdSlot, mountAdSlot, mountStaticAdSlots };
    }
})();
