const fs = require('fs');
const path = require('path');
const vm = require('vm');

function runTest(name, fn) {
    try {
        const result = fn();
        if (result && typeof result.then === 'function') {
            return result
                .then(() => console.log(`テスト成功: ${name}`))
                .catch(error => {
                    console.error(`テスト失敗: ${name}`);
                    console.error(error && error.stack || error);
                    process.exitCode = 1;
                });
        }
        console.log(`テスト成功: ${name}`);
    } catch (error) {
        console.error(`テスト失敗: ${name}`);
        console.error(error.stack);
        process.exitCode = 1;
    }
}

function makeElement(overrides = {}) {
    const attributes = new Map();
    const classes = new Set(String(overrides.className || '').split(/\s+/).filter(Boolean));
    function syncClassName(target) { target.className = Array.from(classes).join(' '); }
    const element = Object.assign({
        style: {},
        textContent: '',
        innerHTML: '',
        value: '',
        checked: false,
        disabled: false,
        className: '',
        classList: {
            add(...values) { values.filter(Boolean).forEach(value => classes.add(String(value))); syncClassName(element); },
            remove(...values) { values.filter(Boolean).forEach(value => classes.delete(String(value))); syncClassName(element); },
            toggle(value, force) {
                const name = String(value);
                const shouldAdd = force === undefined ? !classes.has(name) : !!force;
                if (shouldAdd) classes.add(name);
                else classes.delete(name);
                syncClassName(element);
                return shouldAdd;
            },
            contains(value) { return classes.has(String(value)); },
        },
        setAttribute(name, value) { attributes.set(String(name), String(value)); },
        getAttribute(name) { return attributes.has(String(name)) ? attributes.get(String(name)) : null; },
        removeAttribute(name) { attributes.delete(String(name)); },
        focus() { element.focused = true; },
        querySelectorAll() { return []; },
        appendChild() {},
        remove() {},
        getContext() {
            return {
                clearRect() {},
                createLinearGradient() { return { addColorStop() {} }; },
                createRadialGradient() { return { addColorStop() {} }; },
                fillRect() {},
                beginPath() {},
                arc() {},
                fill() {},
                ellipse() {},
                strokeRect() {},
                moveTo() {},
                lineTo() {},
                stroke() {},
            };
        },
    }, overrides);
    return element;
}

function createStorage() {
    const storage = new Map();
    return {
        storage,
        localStorage: {
            getItem(key) { return storage.has(key) ? storage.get(key) : null; },
            setItem(key, value) { storage.set(key, String(value)); },
            removeItem(key) { storage.delete(key); },
        },
    };
}

function loadScript(context, relativePath) {
    const fullPath = path.join(__dirname, '..', '..', relativePath);
    const source = fs.readFileSync(fullPath, 'utf8');
    vm.runInContext(source, context, { filename: fullPath });
}

function loadScripts(context, relativePaths) {
    for (const relativePath of relativePaths) {
        loadScript(context, relativePath);
    }
}

function createSequenceRandom(values) {
    let index = 0;
    return () => {
        if (values.length === 0) return 0;
        const value = values[Math.min(index, values.length - 1)];
        index++;
        return value;
    };
}

module.exports = {
    createStorage,
    createSequenceRandom,
    loadScript,
    loadScripts,
    makeElement,
    runTest,
};
