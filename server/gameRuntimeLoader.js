'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const GAME_RUNTIME_SOURCE_FILES = Object.freeze([
    'js/Card.js',
    'js/Player.js',
    'js/actionContract.js',
    'js/pendingActionQueue.js',
    'js/gameTurnPolicy.js',
    'js/gameDicePolicy.js',
    'js/gameCardActivationPolicy.js',
    'js/gameBuildPolicy.js',
    'js/gameCoinTransaction.js',
    'js/gamePendingTransition.js',
    'js/gamePendingResolutionPolicy.js',
    'js/GameManager.js',
]);
const GAME_RUNTIME_EXPORT_NAMES = Object.freeze([
    'Card',
    'Player',
    'GameManager',
    'CARDS',
    'createCardByName',
    'getInitialCardStock',
    'getShopStockCount',
    'setShopStockCount',
    'decrementShopStock',
    'assignShopStockSnapshot',
    'resolveCardStockName',
    'GAME_PHASES',
    'GAME_ACTIONS',
    'GAME_ACTION_REGISTRY',
    'GAME_PHASE_ACTIONS',
    'CARD_CATEGORIES',
    'LANDMARK_NAMES',
]);
const GAME_RUNTIME_EXPORT_SOURCE = GAME_RUNTIME_EXPORT_NAMES
    .map(name => `this.${name} = ${name};`)
    .join(' ');

function injectedFunction(name, candidate, fallback) {
    if (candidate === undefined) return fallback;
    if (typeof candidate !== 'function') {
        throw new TypeError(`${name} must be a function`);
    }
    return candidate;
}

/**
 * @param {{
 *   baseDir?: string,
 *   runtimeConsole?: Object,
 *   resolveSourcePath?: function(string, string): string,
 *   readSource?: function(string): string,
 *   createContext?: function(Object): unknown,
 *   runSource?: function(string, Object, Object=): unknown
 * }} options
 * @returns {function(): Object}
 */
function makeGameRuntimeLoader(options = {}) {
    if (options.baseDir !== undefined && typeof options.baseDir !== 'string') {
        throw new TypeError('baseDir must be a string');
    }
    const baseDir = options.baseDir === undefined
        ? path.resolve(__dirname, '..')
        : options.baseDir;
    const runtimeConsole = options.runtimeConsole === undefined
        ? console
        : options.runtimeConsole;
    const resolveSourcePath = injectedFunction(
        'resolveSourcePath',
        options.resolveSourcePath,
        (rootDir, file) => path.join(rootDir, file)
    );
    const readSource = injectedFunction(
        'readSource',
        options.readSource,
        filePath => fs.readFileSync(filePath, 'utf8')
    );
    const createContext = injectedFunction(
        'createContext',
        options.createContext,
        context => vm.createContext(context)
    );
    const runSource = injectedFunction(
        'runSource',
        options.runSource,
        (source, context, metadata) => vm.runInContext(source, context, metadata)
    );

    return function loadGameRuntime() {
        const context = { console: runtimeConsole };
        createContext(context);
        for (const file of GAME_RUNTIME_SOURCE_FILES) {
            const sourcePath = resolveSourcePath(baseDir, file);
            const source = readSource(sourcePath);
            runSource(source, context, { filename: file });
        }
        runSource(GAME_RUNTIME_EXPORT_SOURCE, context);
        return context;
    };
}

module.exports = {
    GAME_RUNTIME_SOURCE_FILES,
    GAME_RUNTIME_EXPORT_NAMES,
    GAME_RUNTIME_EXPORT_SOURCE,
    makeGameRuntimeLoader,
};
