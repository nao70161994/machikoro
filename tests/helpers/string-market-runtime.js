'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { loadScript } = require('./test-utils');

// These integration fixtures represent markup as strings, not DOM trees.
// Keep real market policies/HTML generation; adapt only the two DOM effects.
// Node identity, attribute patching and pointer capture belong to real-browser
// tests (市場の連続操作), not to this string-backed fixture.
function loadScriptsWithStringMarket(context, files) {
    for (const file of files) {
        if (file !== 'js/uiBuildMenu.js') {
            loadScript(context, file);
            continue;
        }
        const filename = path.join(__dirname, '..', '..', file);
        // Scope the module's const so callers use its explicit global export,
        // with exactly the DOM boundary replaced below.
        vm.runInContext(`{\n${fs.readFileSync(filename, 'utf8')}\n}`, context, { filename });
        const actual = context.UiBuildMenu;
        const bound = new WeakSet();
        const calls = { updates: [], bindings: [] };
        const adapted = Object.freeze({
            ...actual,
            updateBuildMenuHtml(element, html) {
                if (!element || typeof html !== 'string') throw new TypeError('Invalid string market render');
                calls.updates.push({ element, html });
                element.innerHTML = html;
            },
            bindBuildMenuPointerCapture(element) {
                if (!element) throw new TypeError('Missing string market root');
                if (bound.has(element)) return;
                bound.add(element);
                calls.bindings.push(element);
            },
        });
        context.UiBuildMenu = adapted;
        if (context.window) context.window.UiBuildMenu = adapted;
        context.__stringMarketDomCalls = calls;
    }
}

module.exports = { loadScriptsWithStringMarket };
