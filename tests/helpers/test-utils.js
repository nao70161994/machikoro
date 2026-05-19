const fs = require('fs');
const path = require('path');
const vm = require('vm');

function runTest(name, fn) {
    try {
        fn();
        console.log(`テスト成功: ${name}`);
    } catch (error) {
        console.error(`テスト失敗: ${name}`);
        console.error(error.stack);
        process.exitCode = 1;
    }
}

function makeElement(overrides = {}) {
    const attributes = new Map();
    const element = Object.assign({
        style: {},
        textContent: '',
        innerHTML: '',
        value: '',
        checked: false,
        disabled: false,
        className: '',
        classList: {
            add() {},
            remove() {},
            toggle() {},
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
