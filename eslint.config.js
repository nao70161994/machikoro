'use strict';

const browserMaintenanceFiles = Object.freeze([
    'js/actionUiRegistry.js',
    'js/clientReporting.js',
    'js/cpuEvaluation.js',
    'js/cpuLegalMoves.js',
    'js/lifecycleNotify.js',
    'js/onlinePayload.js',
    'js/onlineReconnectState.js',
    'js/onlineRestoreRank.js',
    'js/uiTutorial.js',
    'js/uiWatchdog.js',
]);

const serverMaintenanceFiles = Object.freeze([
    'scripts/report-action-contract.js',
    'server/actionPayload.js',
    'server/actionValidation.js',
    'server/clientErrorAuth.js',
    'server/rejoinPayload.js',
    'server/reportThrottle.js',
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
                module: 'readonly',
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
