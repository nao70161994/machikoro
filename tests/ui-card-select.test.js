const assert = require('assert');
const UiCardSelect = require('../js/uiCardSelect');
const { runTest } = require('./helpers/test-utils');

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

runTest('ui card select はカードtoggleの属性とescape契約を生成する', () => {
    const html = UiCardSelect.buildCardToggleButtonHtml({
        name: '麦畑"><script>',
        enabled: true,
        escapeHtml,
    });

    assert.ok(html.includes('class="card-toggle-btn on"'));
    assert.ok(html.includes('data-action="toggleCard"'));
    assert.ok(html.includes('aria-pressed="true"'));
    assert.ok(html.includes('麦畑&quot;&gt;&lt;script&gt;'));
    assert.ok(!html.includes('<script>'));
});

runTest('ui card select はランドマークtoggleを既存属性で生成する', () => {
    const html = UiCardSelect.buildLandmarkToggleButtonHtml({
        name: '港', enabled: false, escapeHtml, getLandmarkEmoji: () => '⚓',
    });
    assert.strictEqual(html, '<button class="card-toggle-btn off" data-action="toggleLandmark" data-landmark-name="港" aria-pressed="false">⚓ 港</button>');
});
