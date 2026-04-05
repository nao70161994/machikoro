const vm = require('vm');
const { loadScripts } = require('./test-utils');

function loadGameRuntime() {
    const context = { console };
    vm.createContext(context);
    loadScripts(context, ['js/Card.js', 'js/Player.js', 'js/GameManager.js']);
    vm.runInContext(
        'this.GameManager = GameManager; this.Player = Player; this.createCardByName = createCardByName; this.CARDS = CARDS; this.LOG_TYPES = LOG_TYPES; this.GAME_PHASES = GAME_PHASES; this.CARD_CATEGORIES = CARD_CATEGORIES;',
        context
    );
    return context;
}

function loadCPURuntime() {
    const context = { console };
    vm.createContext(context);
    loadScripts(context, ['js/Card.js', 'js/Player.js', 'js/GameManager.js', 'js/CPU.js']);
    vm.runInContext(
        'this.CPU = CPU; this.GameManager = GameManager; this.Player = Player; this.createCardByName = createCardByName; this.CARDS = CARDS; this.CARD_EFFECTS = CARD_EFFECTS; this.CARD_CATEGORIES = CARD_CATEGORIES; this.LANDMARK_NAMES = LANDMARK_NAMES; this.GAME_PHASES = GAME_PHASES;',
        context
    );
    return context;
}

module.exports = {
    loadGameRuntime,
    loadCPURuntime,
};
