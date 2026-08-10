const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { runTest } = require('./helpers/test-utils');

const css = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');

function channelLuminance(value) {
    const normalized = value / 255;
    return normalized <= 0.04045
        ? normalized / 12.92
        : ((normalized + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex) {
    const channels = hex.replace('#', '').match(/.{2}/g).map(value => parseInt(value, 16));
    return 0.2126 * channelLuminance(channels[0]) +
        0.7152 * channelLuminance(channels[1]) +
        0.0722 * channelLuminance(channels[2]);
}

function contrastRatio(foreground, background) {
    const foregroundLuminance = relativeLuminance(foreground);
    const backgroundLuminance = relativeLuminance(background);
    const lighter = Math.max(foregroundLuminance, backgroundLuminance);
    const darker = Math.min(foregroundLuminance, backgroundLuminance);
    return (lighter + 0.05) / (darker + 0.05);
}

function ruleFor(selector) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
    assert.ok(match, `${selector} rule is required`);
    return match[1];
}

runTest('カード色badgeとON toggleはdark textで4.5:1以上を保つ', () => {
    const foreground = '#0f0e17';
    const backgrounds = Object.freeze({
        '.blue-badge': '#3b82f6',
        '.green-badge': '#22c55e',
        '.red-badge': '#ef4444',
        '.purple-badge': '#a855f7',
        '.set-toggle.on': '#22c55e',
    });
    for (const [selector, background] of Object.entries(backgrounds)) {
        const rule = ruleFor(selector);
        assert.ok(rule.includes(`background: ${background};`), `${selector} background contract`);
        assert.ok(rule.includes(`color: ${foreground};`), `${selector} foreground contract`);
        assert.ok(contrastRatio(foreground, background) >= 4.5, `${selector} contrast`);
    }
});

runTest('確認OKとcrash primaryはwhite textで全背景色4.5:1以上を保つ', () => {
    const foreground = '#ffffff';
    const contracts = Object.freeze({
        '.confirm-btn-ok': Object.freeze(['#c92f4b', '#c73652']),
        '.crash-btn-primary': Object.freeze(['#b91c1c']),
    });
    for (const [selector, backgrounds] of Object.entries(contracts)) {
        const rule = ruleFor(selector);
        assert.ok(/color:\s*#fff(?:fff)?;/.test(rule), `${selector} white foreground contract`);
        for (const background of backgrounds) {
            assert.ok(rule.includes(background), `${selector} background ${background} contract`);
            assert.ok(contrastRatio(foreground, background) >= 4.5,
                `${selector} ${background} contrast`);
        }
    }
});
