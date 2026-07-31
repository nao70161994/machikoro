declare var GameActionContract: typeof import("../js/actionContract");
declare var escapeHtml: ((value: unknown) => string) | undefined;
declare var isOnlineGame: boolean | undefined;
declare var showConfirm: ((message: string, onConfirm: () => void) => void) | undefined;

declare var CPUProfile: typeof import("../js/cpuProfile").CPUProfile;
declare var CPUDiagnostics: typeof import("../js/cpuDiagnostics").CPUDiagnostics;
declare var CPUEvaluationCache: typeof import("../js/cpuEvaluationCache").CPUEvaluationCache;
declare var CPUBusinessMoves: typeof import("../js/cpuBusinessMoves").CPUBusinessMoves;
declare var CPUSimulation: typeof import("../js/cpuSimulation").CPUSimulation;
declare var CPUEvaluation: typeof import("../js/cpuEvaluation").CPUEvaluation;
declare var CPUBuildExecution: typeof import("../js/cpuBuildExecution").CPUBuildExecution;
declare var CPULegalMoves: typeof import("../js/cpuLegalMoves").CPULegalMoves;
declare var CPUPendingResolution: typeof import("../js/cpuPendingResolution").CPUPendingResolution;
declare var CPU_EXPERT_DEFAULT_OPTIONS: typeof import("../js/cpuTuning").CPU_EXPERT_DEFAULT_OPTIONS;
declare var CPU_EXPERT_PRESETS: typeof import("../js/cpuTuning").CPU_EXPERT_PRESETS;
declare var CPU_EXPERT_PROFILE_TUNINGS: typeof import("../js/cpuTuning").CPU_EXPERT_PROFILE_TUNINGS;


declare var isRoomHost: boolean | undefined;
declare var isReconnectingOnline: boolean | undefined;
declare var socket: { connected?: boolean } | undefined;
declare var sendAction: ((action: string, data: Record<string, unknown>) => boolean) | undefined;


// Browser-global publication names for the explicitly checked compatibility modules.
interface Window {
    CPUBusinessMoves: unknown;
    AD_SLOT_CONFIGS: unknown;
    renderAdSlot: unknown;
    mountAdSlot: unknown;
    mountStaticAdSlots: unknown;
    webkitAudioContext: typeof AudioContext;
    GameSnapshot: unknown;
    LocalSaveRepository: unknown;
    GameSchemaNegotiation: unknown;
    GameSchemaCodec: unknown;
    OnlineRetryPolicy: unknown;
    OnlinePlayerSettings: unknown;
    createOnlineStorageFacade: unknown;
    GameEngine: unknown;
    GameSchemaWire: unknown;
    RecreateRoomPayload: unknown;
    GameSchemaRecreateWire: unknown;
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
    UiTabView: unknown;
    UiDiceChoice: unknown;
    UiWatchdog: unknown;
    UiWinner: unknown;
    LifecycleNotify: unknown;
    LocalPlayerSettings: unknown;
    ClientStorage: unknown;
    AppShellStorage: unknown;
    PwaShell: unknown;
}
