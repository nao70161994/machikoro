declare var GameActionContract: typeof import("../js/actionContract");
declare var escapeHtml: ((value: unknown) => string) | undefined;
declare var isOnlineGame: boolean | undefined;
declare var showConfirm: ((message: string, onConfirm: () => void) => void) | undefined;


// Browser-global publication names for the explicitly checked compatibility modules.
interface Window {
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
