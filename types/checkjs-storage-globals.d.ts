// Browser globals consumed by storage.js. Keep this boundary limited to the
// persistence composition root so its host-page dependencies stay explicit.
declare var ClientStorage: typeof import("../js/clientStorage");
declare var GameRuntimeState: typeof import("../js/gameRuntimeState");
declare var GameSelectionState: typeof import("../js/gameSelectionState");
declare var GameSetupState: typeof import("../js/gameSetupState");
declare var LocalResumeEffects: typeof import("../js/localResumeEffects");
declare var LocalResumePolicy: typeof import("../js/localResumePolicy");
declare var LocalResumePreloadRuntime: typeof import("../js/localResumePreloadRuntime");
declare var LocalResumePreloadState: typeof import("../js/localResumePreloadState");
declare var LocalResumeView: typeof import("../js/localResumeView");
declare var LocalSaveRepository: typeof import("../js/localSaveRepository");
declare var LocalSaveRuntime: typeof import("../js/localSaveRuntime");
declare var OnlinePayload: typeof import("../js/onlinePayload").OnlinePayload;
declare var OnlineRuntimeState: typeof import("../js/onlineRuntimeState");
declare var SavedGameValidation: typeof import("../js/savedGameValidation");
declare var SnapshotInventoryValidation: typeof import("../js/snapshotInventoryValidation");
declare var StorageSettings: typeof import("../js/storageSettings");
declare var StoredOnlineReconnect: typeof import("../js/storedOnlineReconnect");
declare var UiPlayerCount: typeof import("../js/uiPlayerCount");
declare var UiRangeControl: typeof import("../js/uiRangeControl");
declare var UiScreenFocus: typeof import("../js/uiScreenFocus");
declare var UndoPreview: typeof import("../js/undoPreview");

declare var ONLINE_SESSION_STORAGE_KEY: string | undefined;
declare var ONLINE_ROOM_STORAGE_KEY_SEPARATOR: string | undefined;
declare var ONLINE_STORAGE_KEYS: Readonly<Record<string, string>> | undefined;
declare var ONLINE_RESTORE_ROOM_INDEX_KEY: string | undefined;
declare var SHOP_STOCK: Record<string, number>;
declare var onlineDomEffects: Pick<ReturnType<typeof import("../js/onlineDomEffects").createRuntime>,
    'showNotice' | 'setStatusText'> | undefined;
declare var myPlayerName: string;
declare var myRoomId: string | null;
declare var myOriginalPlayerIndex: number;
declare var myPlayerIndex: number;
declare var reconnectToken: string;
declare var isRoomHost: boolean;
declare var isReconnectingOnline: boolean;

declare var _clearOnlineRestoreBundle: (() => void) | undefined;
declare var _clearRejoinRetry: (() => void) | undefined;
declare var _emitOnlineRejoinRequest: ((session: unknown) => boolean) | undefined;
declare var _isOnlineFlowActive: (() => boolean) | undefined;
declare var cancelAutoSkip: () => void;
declare var createCpuPlayer: ((difficulty: string, options?: unknown) => CPU) | undefined;
declare var createOnlineStorageFacade: typeof import("../js/onlineStorage").createOnlineStorageFacade | undefined;
declare var formatCpuSpeedLabel: ((value: string) => string) | undefined;
declare var getEnabledCardSelection: (() => Set<string>) | undefined;
declare var getEnabledLandmarkSelection: (() => Set<string>) | undefined;
declare var initSocket: () => boolean;
declare var invalidateCpuScheduleChain: () => void;
declare var isCurrentHumanUiTurn: (() => boolean) | undefined;
declare var isPlainObject: (value: unknown) => value is Record<string, unknown>;
declare var normalizeLocalPlayerName: ((name: unknown, index: number) => string) | undefined;
declare var refreshPwaUpdateState: (() => void) | undefined;
declare var render: () => void;
declare var renderPlayerSettings: () => void;
declare var resetOnlineState: (() => void) | undefined;
declare var resetUiLocksForGameReset: ((reason?: string) => void) | undefined;
declare var replaceEnabledCardSelection: (values: string[]) => unknown;
declare var replaceEnabledLandmarkSelection: (values: string[]) => unknown;
declare var replaceMarketRuleSelection: (value: string) => unknown;
declare var runLocalOrSendOnline: ((action: string, data: unknown,
    fallback: () => boolean, options: { effects: boolean }) => boolean) | undefined;
declare var scheduleCPU: (() => void) | undefined;
declare var setOnlineReconnectLegacyFlag: ((value: boolean) => boolean) | undefined;
declare var switchTab: ((tab: string) => void) | undefined;
declare var syncTutorialControls: () => void;

interface Window {
    MACHIKORO_LOCAL_SAVE_SCHEMA_WRITE_ENABLED?: boolean;
}

interface Document {
    getElementById(elementId: 'localSaveGeneration'): HTMLSelectElement;
    getElementById(elementId: 'cpuSpeed' | 'soundVolume'): HTMLInputElement;
    getElementById(elementId: 'accessibilityFontScale'): HTMLSelectElement;
    getElementById(elementId: 'accessibilityReducedMotion' | 'accessibilityHighContrast' |
        'accessibilityHaptics' | 'hapticTurnEnabled' | 'hapticDiceEnabled' |
        'hapticBuildEnabled' | 'hapticWinEnabled' | 'soundDiceEnabled' |
        'soundCoinEnabled' | 'soundBuildEnabled' | 'soundWinEnabled'): HTMLInputElement;
}
