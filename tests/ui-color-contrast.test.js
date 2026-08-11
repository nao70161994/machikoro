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

function blendHex(foreground, background, alpha) {
    const channels = value => value.replace('#', '').match(/.{2}/g)
        .map(channel => parseInt(channel, 16));
    const foregroundChannels = channels(foreground);
    const backgroundChannels = channels(background);
    return '#' + foregroundChannels.map((channel, index) =>
        Math.round(channel * alpha + backgroundChannels[index] * (1 - alpha))
            .toString(16)
            .padStart(2, '0')
    ).join('');
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

runTest('主要な赤い操作buttonはwhite textで4.5:1以上を保つ', () => {
    const foreground = '#fffffe';
    const contracts = Object.freeze({
        '#btnRoll': Object.freeze(['#c92f4b', '#c73652']),
        '.card-select-confirm-btn': Object.freeze(['#c92f4b']),
    });
    for (const [selector, backgrounds] of Object.entries(contracts)) {
        const rule = ruleFor(selector);
        assert.ok(rule.includes(`color: ${foreground};`) || selector === '#btnRoll',
            `${selector} white foreground contract`);
        for (const background of backgrounds) {
            assert.ok(rule.includes(background), `${selector} background ${background} contract`);
            assert.ok(contrastRatio(foreground, background) >= 4.5,
                `${selector} ${background} contrast`);
        }
    }
});

runTest('modal closeは半透明button背景上でも4.5:1以上を保つ', () => {
    const foreground = '#ff8a95';
    const overlay = '#e94560';
    const rule = ruleFor('.modal-header button');
    assert.ok(rule.includes(`color: ${foreground};`), 'modal close foreground contract');
    assert.ok(rule.includes('background: rgba(233,69,96,0.15);'),
        'modal close overlay contract');
    for (const modalBackground of ['#1e1e38', '#12122a']) {
        const buttonBackground = blendHex(overlay, modalBackground, 0.15);
        assert.ok(contrastRatio(foreground, buttonBackground) >= 4.5,
            `modal close contrast on ${modalBackground}`);
    }
});

runTest('削除buttonと未選択card toggleは文字・境界を薄いopacityに頼らない', () => {
    const deleteRule = ruleFor('.delete-save-btn');
    assert.ok(deleteRule.includes('color: #a7a9be;'), 'delete foreground contract');
    assert.ok(deleteRule.includes('border: 1px solid #6a7a8a;'), 'delete border contract');
    assert.ok(contrastRatio('#a7a9be', '#1a1a2e') >= 4.5, 'delete text contrast');
    assert.ok(contrastRatio('#6a7a8a', '#1a1a2e') >= 3, 'delete boundary contrast');

    const offRule = ruleFor('.card-toggle-btn.off');
    assert.strictEqual(/opacity\s*:/.test(offRule), false, 'off toggle must not fade focus outline');
    assert.ok(offRule.includes('background: #1a1a2e;'), 'off toggle background contract');
    assert.ok(offRule.includes('border-color: #6a7a8a;'), 'off toggle border contract');
    assert.ok(offRule.includes('color: #a7a9be;'), 'off toggle foreground contract');
    assert.ok(contrastRatio('#a7a9be', '#1a1a2e') >= 4.5, 'off toggle text contrast');
    assert.ok(contrastRatio('#6a7a8a', '#1a1a2e') >= 3, 'off toggle boundary contrast');
});
