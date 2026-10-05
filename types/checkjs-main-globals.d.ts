// Classic-script globals consumed by main.js. appShell.js owns overlapping
// declarations in its own checkJs project, so this project keeps a separate
// contract to avoid script-scope redeclaration conflicts.
declare var AppShellComposition: typeof import("../js/appShellComposition");
declare var AppShellStorage: typeof import("../js/appShellStorage");

declare var AppShellClientReportingRuntime: typeof import("../js/appShellClientReportingRuntime");
declare var AppShellCrashRuntime: typeof import("../js/appShellCrashRuntime");
declare var AppShellObservationRuntime: typeof import("../js/appShellObservationRuntime");
declare var AppShellRuntimeEffects: typeof import("../js/appShellRuntimeEffects");
declare var AppShellStartupRuntime: typeof import("../js/appShellStartupRuntime");
declare var AppShellUiLockRuntime: typeof import("../js/appShellUiLockRuntime");
declare var ActionUiRegistry: typeof import("../js/actionUiRegistry");
declare var ClientCheckpoint: typeof import("../js/clientCheckpoint");
declare var ClientReporting: typeof import("../js/clientReporting").ClientReporting;
declare var ClientReportingTransport: typeof import("../js/clientReportingTransport");
declare var ClientRuntimeSnapshot: typeof import("../js/clientRuntimeSnapshot");
declare var CrashScreen: typeof import("../js/crashScreen");
declare var CrashScreenEffects: typeof import("../js/crashScreenEffects");
declare var GameRuntimeState: typeof import("../js/gameRuntimeState");
declare var GameSetupState: typeof import("../js/gameSetupState");
declare var LifecycleNotify: typeof import("../js/lifecycleNotify");
declare var LifecycleRuntime: typeof import("../js/lifecycleRuntime");
declare var LifecycleTransport: typeof import("../js/lifecycleTransport");
declare var OnlineRetryPolicy: typeof import("../js/onlineRetryPolicy");
declare var OnlineRuntimeState: typeof import("../js/onlineRuntimeState");
declare var PwaShell: typeof import("../js/pwaShell");
declare var RetryTimer: typeof import("../js/retryTimer");
declare var UiDomSnapshot: typeof import("../js/uiDomSnapshot");
declare var UiRecoveryEffects: typeof import("../js/uiRecoveryEffects");
declare var UiScreenFocus: typeof import("../js/uiScreenFocus");
declare var UiTabEffects: typeof import("../js/uiTabEffects");
declare var UiTabView: typeof import("../js/uiTabView");
declare var UiWatchdog: typeof import("../js/uiWatchdog");
declare var UiWatchdogAsyncRecovery: typeof import("../js/uiWatchdogAsyncRecovery");
declare var UiWatchdogMonitor: typeof import("../js/uiWatchdogMonitor");
declare var UiWatchdogRecoveryRuntime: typeof import("../js/uiWatchdogRecoveryRuntime");
declare var UiWatchdogReporting: typeof import("../js/uiWatchdogReporting");
declare var UiWatchdogRuntime: typeof import("../js/uiWatchdogRuntime");
declare var ClientStorage: typeof import("../js/clientStorage");
declare var CpuTournament: typeof import("../js/cpuTournament");
declare var GameSetupPresets: typeof import("../js/gameSetupPresets");
declare var GameSelectionState: typeof import("../js/gameSelectionState");
declare var LocalGameStartRuntime: typeof import("../js/localGameStartRuntime");
declare var LocalGameStart: typeof import("../js/localGameStart");
declare var LocalGameRestartRuntime: typeof import("../js/localGameRestartRuntime");
declare var LocalGameInitializer: typeof import("../js/localGameInitializer");
declare var LocalGameEngineRuntime: typeof import("../js/localGameEngineRuntime");
declare var GameEngine: typeof import("../js/gameEngine");
declare var GameEngineClientShadow: typeof import("../js/gameEngineClientShadow");
declare var GameEngineDeterminism: typeof import("../js/gameEngineDeterminism");
declare var GameEngineRuntimeAdapter: typeof import("../js/gameEngineRuntimeAdapter");
declare var PageActivationRuntime: typeof import("../js/pageActivationRuntime");
declare var PageActivationPolicy: typeof import("../js/pageActivationPolicy");
declare var DelayedHumanActionPolicy: typeof import("../js/delayedHumanActionPolicy");
declare var CpuSchedulerState: typeof import("../js/cpuSchedulerState");
declare var CpuTurnSchedulerRuntime: typeof import("../js/cpuTurnSchedulerRuntime");
declare var CpuTurnStrategy: typeof import("../js/cpuTurnStrategy");
declare var CpuPhaseHandlers: typeof import("../js/cpuPhaseHandlers");
declare var LocalActionPolicy: typeof import("../js/localActionPolicy");
declare var MainHumanActionRuntime: typeof import("../js/mainHumanActionRuntime");
declare var MainAutoSkipRuntime: typeof import("../js/mainAutoSkipRuntime");
declare var MainUiEventRuntime: typeof import("../js/mainUiEventRuntime");
declare var UiEventDelegation: typeof import("../js/uiEventDelegation");
declare var UiCpuTournament: typeof import("../js/uiCpuTournament");
declare var UiDiceDisplay: typeof import("../js/uiDiceDisplay");
declare var UiGameStatusView: typeof import("../js/uiGameStatusView");
declare var UiPlayerCount: typeof import("../js/uiPlayerCount");
declare var UiPlayerDisplay: typeof import("../js/uiPlayerDisplay");
declare var UiRangeControl: typeof import("../js/uiRangeControl");
declare var CitySkyline: typeof import("../js/citySkyline");
declare var AutoSkipPolicy: typeof import("../js/autoSkipPolicy");
declare var RoomQrCode: typeof import("../js/roomQrCode");
declare var AppDiagnostics: typeof import("../js/appDiagnostics");
declare var AppBackup: typeof import("../js/appBackup");
declare var LocalPlayerSettings: typeof import("../js/localPlayerSettings");
declare var UiWinner: typeof import("../js/uiWinner");

declare var cardFilter: string | undefined;
declare var enabledLandmarks: Set<string> | undefined;
declare var onlineActionInFlight: boolean | undefined;
declare var onlineActionInFlightAt: number | undefined;

declare var closeAccessibleModal: ((id: string, options?: { restoreFocus?: boolean }) => void) | undefined;
declare var closeConfirmModal: ((restoreFocus?: boolean) => void) | undefined;
declare var getOnlineActionFlightState: (() => { inFlight?: boolean; startedAt?: number; hasPendingOutboundAction?: boolean }) | undefined;
declare var loadSettings: (() => void) | undefined;
declare var preloadOnlineRlModelsInBackground: (() => void) | undefined;
declare var render: (() => void) | undefined;
declare var renderBuildMenu: (() => void) | undefined;
declare var renderOnlinePlayerSettings: (() => void) | undefined;
declare var resetAccessibleModalRuntimeState: (() => void) | undefined;
declare var resumeGame: (() => void) | undefined;
declare function cancelPendingLocalResume(): void;
declare var updateResumeButton: (() => void) | undefined;
declare var activeModalId: string | null | undefined;
declare var lastModalFocus: HTMLElement | null | undefined;
declare var modalInertRestore: HTMLElement[] | undefined;
declare var MACHIKORO_CLIENT_VERSION: string | undefined;
declare var __machikoroConfirmModalOpen: boolean | undefined;
declare var __machikoroSetLifecycleNotificationsEnabled: ((enabled: boolean) => void) | undefined;
declare var __machikoroLifecycleNotifyState: unknown;
declare var __machikoroSendLifecycleNotification: ((payload: unknown) => void) | undefined;
declare var __machikoroSendTestErrorReport: ((payload: unknown) => void) | undefined;
declare var _handleOnlineActionTimeout: (() => void) | undefined;
declare var _isOnlineFlowActive: (() => boolean) | undefined;
declare var _readOnlineActionLog: (() => Array<{ action?: string }>) | undefined;
declare var getLocalSaveRepository: (() => { exists: () => boolean; readHistory: () => unknown[] } | null) | undefined;
declare var readOnlineSession: (() => unknown) | undefined;
declare var replaceEnabledCardSelection: ((values: string[]) => unknown) | undefined;
declare var replaceEnabledLandmarkSelection: ((values: string[]) => unknown) | undefined;
declare var replaceMarketRuleSelection: ((value: string) => unknown) | undefined;
declare var syncCardSelectStateFromRuntime: (() => void) | undefined;
declare var getEnabledCardSelection: (() => string[]) | undefined;
declare var getEnabledLandmarkSelection: (() => string[]) | undefined;
declare var saveSettings: (() => void) | undefined;
declare var isValidSavedGameState: ((state: unknown) => boolean) | undefined;
declare var resetOnlineState: (() => void) | undefined;
declare var resetStatsRecorded: (() => void) | undefined;
declare var resetFullLog: (() => void) | undefined;
declare var resetUiLocksForGameReset: ((reason?: string) => void) | undefined;
declare var resetGameLifecycleForRestart: ((reason?: string) => void) | undefined;
declare var refreshPwaUpdateState: (() => void) | undefined;
declare var notifyGameLifecycleStart: (() => void) | undefined;
declare var reportClientError: ((error: unknown, details?: unknown) => void) | undefined;
declare var unlockUiForHumanTurn: ((reason?: string) => void) | undefined;
declare var markClientFlowCheckpoint: ((event: string, details?: unknown) => void) | undefined;
declare var recordFlowTrace: ((event: string, details?: unknown) => void) | undefined;
declare var initMainView: (() => void) | undefined;
declare var switchTab: ((tab: string) => void) | undefined;
declare var switchOnlineTab: ((tab: string) => void) | undefined;
declare var resetFreezeWatchdogAfterPageActivation: (() => void) | undefined;
declare var updateGameSelectionSummary: (() => string) | undefined;
declare var isOnlineReconnectInputBlocked: (() => boolean) | undefined;
declare var resumeOnlineReconnectAfterPageActivation: (() => boolean) | undefined;
declare var saveUndoState: (() => void) | undefined;
declare var clearOnlineSessionStorage: (() => void) | undefined;

interface Document {
    getElementById(elementId: 'cityCanvas'): HTMLCanvasElement;
    getElementById(elementId: 'setupPresetName' | 'cpuSpeed' | 'appBackupFile' |
        'cpuTournamentGames' | 'cpuTournamentPlayerCount' | 'roomIdInput'): HTMLInputElement;
}

interface HTMLInputElement {
    value: string;
}

interface HTMLSelectElement {
    value: string;
}

interface Navigator {
    standalone?: boolean;
}


interface Window {
    MACHIKORO_CLIENT_VERSION?: string;
    __machikoroClientCheckpoints?: unknown[];
    MACHIKORO_LOCAL_GAME_ENGINE_SHADOW_ENABLED?: boolean;
    MACHIKORO_LOCAL_GAME_ENGINE_AUTHORITY_ENABLED?: boolean;
}
