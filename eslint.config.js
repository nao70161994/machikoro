'use strict';

const browserMaintenanceFiles = Object.freeze([
    'js/actionContract.js',
    'js/actionUiRegistry.js',
    'js/clientReporting.js',
    'js/cpuBuildExecution.js',
    'js/cpuEvaluation.js',
    'js/cpuLegalMoves.js',
    'js/gameEngine.js',
    'js/gameSnapshot.js',
    'js/gameSchemaNegotiation.js',
    'js/gameSchemaCodec.js',
    'js/gameSchemaWire.js',
    'js/lifecycleNotify.js',
    'js/onlinePayload.js',
    'js/onlineRetryPolicy.js',
    'js/onlineReconnectState.js',
    'js/onlineRestoreRank.js',
    'js/uiModalPolicy.js',
    'js/uiTutorial.js',
    'js/uiDiceChoice.js',
    'js/uiWatchdog.js',
    'js/uiWinner.js',
]);

const serverMaintenanceFiles = Object.freeze([
    'scripts/report-action-contract.js',
    'server/actionSocketHandler.js',
    'server/actionPayload.js',
    'server/actionValidation.js',
    'server/canonicalStateStore.js',
    'server/clientErrorAuth.js',
    'server/gameSchemaRuntime.js',
    'server/gameSchemaShadow.js',
    'server/lobbySocketHandlers.js',
    'server/mirrorReplay.js',
    'server/rejoinSocketHandler.js',
    'server/rejoinPayload.js',
    'server/reportThrottle.js',
    'server/restoreAuditKeyring.js',
    'server/restoreAuthorityPolicy.js',
    'server/restoreSanitization.js',
    'server/restoreValidation.js',
    'server/roomValidation.js',
    'server/socketPayload.js',
]);

const maintenanceRules = Object.freeze({
    'no-constant-condition': ['error', { checkLoops: false }],
    'no-duplicate-case': 'error',
    'no-duplicate-imports': 'error',
    'no-undef': 'error',
    'no-unreachable': 'error',
});

module.exports = [
    {
        files: browserMaintenanceFiles,
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'script',
            globals: {
                GameActionContract: 'readonly',
                module: 'readonly',
                require: 'readonly',
                window: 'readonly',
            },
        },
        linterOptions: {
            reportUnusedDisableDirectives: 'error',
        },
        rules: maintenanceRules,
    },
    {
        files: serverMaintenanceFiles,
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'commonjs',
            globals: {
                console: 'readonly',
                process: 'readonly',
                URL: 'readonly',
            },
        },
        linterOptions: {
            reportUnusedDisableDirectives: 'error',
        },
        rules: maintenanceRules,
    },
];
