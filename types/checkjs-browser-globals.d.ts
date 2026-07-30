declare var GameActionContract: typeof import("../js/actionContract");
declare var escapeHtml: ((value: unknown) => string) | undefined;
declare var isOnlineGame: boolean | undefined;
declare var showConfirm: ((message: string, onConfirm: () => void) => void) | undefined;
declare class RLCPU {
    constructor(modelData: unknown);
    difficulty: string;
    modelId: string;
    modelLabel: string;
}

declare var CPU: { _nowMs(): number };
declare var Player: { landmarkNames(): ReadonlyArray<string> };
declare var GameManager: { pendingActionsFor(game: unknown): ReadonlyArray<{ action: string, field: string, count: number }> };
declare var GAME_PHASES: Readonly<{ PENDING: string }>;
declare var LANDMARK_NAMES: Readonly<{ YAKUSHO: string }>;
declare var CPU_EXPERT_DEFAULT_OPTIONS: unknown;
declare var CPU_EXPERT_PRESETS: unknown;
declare var CPU_EXPERT_PROFILE_TUNINGS: unknown;



// Browser-global publication names for the explicitly checked compatibility modules.
interface Window {
    CPUBusinessMoves: unknown;
    AD_SLOT_CONFIGS: unknown;
    renderAdSlot: unknown;
    mountAdSlot: unknown;
    mountStaticAdSlots: unknown;
    webkitAudioContext: typeof AudioContext;
    GameSnapshot: unknown;
    GameSchemaNegotiation: unknown;
    GameSchemaCodec: unknown;
    OnlineRetryPolicy: unknown;
    createOnlineStorageFacade: unknown;
    GameEngine: unknown;
    GameSchemaWire: unknown;
    CPUActionProposal: unknown;
    CPUBuildExecution: unknown;
    CPULegalMoves: unknown;
    CPUProfile: unknown;
    CPUSimulation: unknown;
    SavedGameValidation: unknown;
    StorageSettings: unknown;
    UiBuildMenu: unknown;
    UiCardDetail: unknown;
    UiCardOrder: unknown;
    UiCardSelect: unknown;
    UiLogDisplay: unknown;
    UiModalPolicy: unknown;
    UiPlayerDisplay: unknown;
    UiPendingMenu: unknown;
    UiTutorial: unknown;
    UiDiceChoice: unknown;
    UiWatchdog: unknown;
    UiWinner: unknown;
    LifecycleNotify: unknown;
    AppShellStorage: unknown;
    PwaShell: unknown;
}
