const vm = require('vm');
const { loadScripts } = require('./test-utils');

function loadGameRuntime() {
    const context = { console, Math: Object.create(Math) };
    vm.createContext(context);
    loadScripts(context, ['js/Card.js', 'js/Player.js', 'js/GameManager.js']);
    vm.runInContext(
        'this.GameManager = GameManager; this.Player = Player; this.createCardByName = createCardByName; this.createCardById = createCardById; this.CARDS = CARDS; this.LOG_TYPES = LOG_TYPES; this.GAME_PHASES = GAME_PHASES; this.GAME_ACTIONS = GAME_ACTIONS; this.GAME_ACTION_REGISTRY = GAME_ACTION_REGISTRY; this.GAME_PHASE_ACTIONS = GAME_PHASE_ACTIONS; this.CARD_EFFECTS = CARD_EFFECTS; this.CARD_CATEGORIES = CARD_CATEGORIES; this.CARD_IDS = CARD_IDS; this.CARD_NAME_BY_ID = CARD_NAME_BY_ID; this.CARD_ID_BY_NAME = CARD_ID_BY_NAME; this.CARD_EFFECT_METADATA = CARD_EFFECT_METADATA; this.CARD_INCOME_EFFECT_HANDLERS = CARD_INCOME_EFFECT_HANDLERS;',
        context
    );
    return context;
}

function loadCPURuntime() {
    const context = { console, Math: Object.create(Math) };
    vm.createContext(context);
    loadScripts(context, ['js/Card.js', 'js/Player.js', 'js/GameManager.js', 'js/CPU.js']);
    vm.runInContext(
        'this.CPU = CPU; this.GameManager = GameManager; this.Player = Player; this.createCardByName = createCardByName; this.createCardById = createCardById; this.CARDS = CARDS; this.CARD_EFFECTS = CARD_EFFECTS; this.CARD_CATEGORIES = CARD_CATEGORIES; this.CARD_IDS = CARD_IDS; this.CARD_NAME_BY_ID = CARD_NAME_BY_ID; this.CARD_ID_BY_NAME = CARD_ID_BY_NAME; this.CARD_EFFECT_METADATA = CARD_EFFECT_METADATA; this.CARD_INCOME_EFFECT_HANDLERS = CARD_INCOME_EFFECT_HANDLERS; this.LANDMARK_NAMES = LANDMARK_NAMES; this.GAME_PHASES = GAME_PHASES;',
        context
    );
    return context;
}

module.exports = {
    loadGameRuntime,
    loadCPURuntime,
};
