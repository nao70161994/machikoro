'use strict';

const assert = require('assert');
const eslintConfig = require('../eslint.config');
const fs = require('fs');
const path = require('path');
const packageJson = require('../package.json');
const config = require('../tsconfig.checkjs.json');
const { runTest } = require('./helpers/test-utils');

runTest('checkJs configは変換なしの限定JavaScript検査だけを有効にする', () => {
    assert.deepStrictEqual(config.compilerOptions, {
        allowJs: true,
        checkJs: true,
        noEmit: true,
        skipLibCheck: true,
        target: 'ES2022',
        module: 'CommonJS',
        lib: ['ES2022', 'DOM'],
    });
    assert.strictEqual(packageJson.scripts['test:types'], 'tsc -p tsconfig.checkjs.json');
    assert.ok(packageJson.scripts['test:static'].includes('npm run test:types'));
});

runTest('checkJs configは段階的な検査対象だけを明示列挙する', () => {
    assert.strictEqual(config.files[0], 'types/checkjs-globals.d.ts');
    assert.strictEqual(new Set(config.files).size, config.files.length);
    for (const file of config.files) {
        assert.ok(fs.existsSync(path.join(__dirname, '..', file)), file);
    }
    for (const excluded of ['js/online.js', 'js/ui.js', 'js/appShell.js']) {
        assert.ok(!config.files.includes(excluded), excluded);
    }
    assert.ok(config.files.includes('js/Card.js'));
    assert.ok(config.files.includes('server.js'));
    assert.ok(config.files.includes('js/Player.js'));
    assert.ok(config.files.includes('js/gameSelectionState.js'));
    assert.ok(config.files.includes('js/gameSetupState.js'));
    assert.ok(config.files.includes('js/gameRuntimeState.js'));
    assert.ok(config.files.includes('js/onlineRuntimeState.js'));
    assert.ok(config.files.includes('js/onlineSetupState.js'));
    assert.ok(config.files.includes('js/GameManager.js'));
    assert.ok(config.files.includes('js/actionContract.js'));
    assert.ok(config.files.includes('js/actionUiRegistry.js'));
    assert.ok(config.files.includes('js/adSlots.js'));
    assert.ok(config.files.includes('js/audio.js'));
    assert.ok(config.files.includes('js/citySkyline.js'));
    assert.ok(config.files.includes('js/delayedHumanActionPolicy.js'));
    assert.ok(config.files.includes('js/uiEventDelegation.js'));
    assert.ok(config.files.includes('js/CPU.js'));
    assert.ok(config.files.includes('js/confetti.js'));
    assert.ok(config.files.includes('js/stats.js'));
    assert.ok(config.files.includes('js/RLModelPortfolio.js'));
    assert.ok(config.files.includes('js/RLCPU.js'));
    assert.ok(config.files.includes('js/gameSnapshot.js'));
    assert.ok(config.files.includes('js/localSaveRepository.js'));
    assert.ok(config.files.includes('js/localResumePolicy.js'));
    assert.ok(config.files.includes('js/gameEngine.js'));
    assert.ok(config.files.includes('js/cpuActionProposal.js'));
    assert.ok(config.files.includes('js/cpuBuildExecution.js'));
    assert.ok(config.files.includes('js/cpuBuildProposalCollector.js'));
    assert.ok(config.files.includes('js/cpuBuildStrategy.js'));
    assert.ok(config.files.includes('js/cpuBuildScoring.js'));
    assert.ok(config.files.includes('js/cpuChoiceScoring.js'));
    assert.ok(config.files.includes('js/cpuCardEvaluationRuntime.js'));
    assert.ok(config.files.includes('js/cpuStateEvaluationRuntime.js'));
    assert.ok(config.files.includes('js/cpuBuildPolicyRuntime.js'));
    assert.ok(config.files.includes('js/cpuEvaluation.js'));
    assert.ok(config.files.includes('js/cpuLegalMoves.js'));
    assert.ok(config.files.includes('js/cpuLookaheadRuntime.js'));
    assert.ok(config.files.includes('js/cpuProfile.js'));
    assert.ok(config.files.includes('js/cpuSimulation.js'));
    assert.ok(config.files.includes('js/cpuBusinessMoves.js'));
    assert.ok(config.files.includes('js/cpuBusinessDecisionRuntime.js'));
    assert.ok(config.files.includes('js/cpuDiagnostics.js'));
    assert.ok(config.files.includes('js/cpuEvaluationCache.js'));
    assert.ok(config.files.includes('js/cpuPendingResolution.js'));
    assert.ok(config.files.includes('js/cpuPendingDecision.js'));
    assert.ok(config.files.includes('js/cpuRollDecision.js'));
    assert.ok(config.files.includes('js/cpuTuning.js'));
    assert.ok(config.files.includes('js/savedGameValidation.js'));
    assert.ok(config.files.includes('js/uiBuildMenu.js'));
    assert.ok(config.files.includes('js/uiDiceDisplay.js'));
    assert.ok(config.files.includes('js/uiTurnAnnouncer.js'));
    assert.ok(config.files.includes('js/autoSkipPolicy.js'));
    assert.ok(config.files.includes('js/uiModalPolicy.js'));
    assert.ok(config.files.includes('js/uiModalOpen.js'));
    assert.ok(config.files.includes('js/uiModalClose.js'));
    assert.ok(config.files.includes('js/uiWatchdog.js'));
    assert.ok(config.files.includes('js/uiWatchdogMonitor.js'));
    assert.ok(config.files.includes('js/clientStorage.js'));
    assert.ok(config.files.includes('js/clientReporting.js'));
    assert.ok(config.files.includes('js/pwaShell.js'));
    assert.ok(config.files.includes('js/appShellComposition.js'));
    assert.ok(config.files.includes('js/localPlayerSettings.js'));
    assert.ok(config.files.includes('js/pageActivationPolicy.js'));
    assert.ok(config.files.includes('js/onlineReconnectState.js'));
    assert.ok(config.files.includes('js/onlineRuntimeFlags.js'));
    assert.ok(config.files.includes('js/onlineDiagnosticState.js'));
    assert.ok(config.files.includes('js/onlineSchemaTransport.js'));
    assert.ok(config.files.includes('js/onlineRestoreQueueState.js'));
    assert.ok(config.files.includes('js/onlineRestoreLifecycleState.js'));
    assert.ok(config.files.includes('js/onlineReconnectCleanup.js'));
    assert.ok(config.files.includes('js/onlineReconnectRequest.js'));
    assert.ok(config.files.includes('js/onlineRestoreAbort.js'));
    assert.ok(config.files.includes('js/onlineActionTimeout.js'));
    assert.ok(config.files.includes('js/onlineDecodeFailure.js'));
    assert.ok(config.files.includes('js/onlineActionApplyFailure.js'));
    assert.ok(config.files.includes('js/onlineActionGap.js'));
    assert.ok(config.files.includes('js/onlineActionNoGame.js'));
    assert.ok(config.files.includes('js/onlineActionCommit.js'));
    assert.ok(config.files.includes('js/onlineSocketConnect.js'));
    assert.ok(config.files.includes('js/onlineSocketDisconnect.js'));
    assert.ok(config.files.includes('js/onlineHostChanged.js'));
    assert.ok(config.files.includes('js/onlineRejoinPersistence.js'));
    assert.ok(config.files.includes('js/onlinePendingOutboundState.js'));
    assert.ok(config.files.includes('js/onlinePendingResend.js'));
    assert.ok(config.files.includes('js/onlineRestoreReplay.js'));
    assert.ok(config.files.includes('js/onlineRestoreActivation.js'));
    assert.ok(config.files.includes('js/onlineActionSequence.js'));
    assert.ok(config.files.includes('js/onlineActionLog.js'));
    assert.ok(config.files.includes('js/onlineStorage.js'));
    assert.ok(config.files.includes('js/onlinePlayerSettings.js'));
    assert.ok(config.files.includes('server/canonicalStateStore.js'));
    assert.ok(config.files.includes('server/canonicalMirrorRuntime.js'));
    assert.ok(config.files.includes('server/runtimeLimits.js'));
    assert.ok(config.files.includes('server/gameRuntimeLoader.js'));
    assert.ok(config.files.includes('server/gameStartLifecycle.js'));
    assert.ok(config.files.includes('server/gameStartCoordinator.js'));
    assert.ok(config.files.includes('server/clientErrorReporting.js'));
    assert.ok(config.files.includes('server/actionAcceptance.js'));
    assert.ok(config.files.includes('server/actionValidationGateway.js'));
    assert.ok(config.files.includes('server/restoreAuditRuntime.js'));
    assert.ok(config.files.includes('server/restoreSnapshotAttachment.js'));
    assert.ok(config.files.includes('server/actionSocketHandler.js'));
    assert.ok(config.files.includes('server/disconnectSocketHandler.js'));
    assert.ok(config.files.includes('server/hostlessRestoreRuntime.js'));
    assert.ok(config.files.includes('server/rejoinSocketHandler.js'));
    assert.ok(config.files.includes('server/hostlessRestoreCandidate.js'));
    assert.ok(config.files.includes('server/roomLifecycle.js'));
    assert.ok(config.files.includes('server/roomSocketRuntime.js'));
    assert.ok(config.files.includes('server/mirrorReplay.js'));
    assert.ok(config.files.includes('server/restoreAuthorityPolicy.js'));
    assert.ok(config.files.includes('server/restoreAdmission.js'));
    assert.ok(config.files.includes('server/existingRoomRestoreRuntime.js'));
    assert.ok(config.files.includes('server/newRoomRestoreRuntime.js'));
    assert.ok(config.files.includes('server/restoreReplayAdmission.js'));
    assert.ok(config.files.includes('server/restoreValidation.js'));
    assert.ok(config.files.includes('server/reportingPolicy.js'));
    assert.ok(config.files.includes('server/reportingHttpRoutes.js'));
});

runTest('checkJs対象はmaintenance lint対象からNode専用report scriptだけを除く', () => {
    const configuredLintFiles = eslintConfig
        .flatMap(entry => Array.isArray(entry.files) ? entry.files : []);
    assert.ok(configuredLintFiles.includes('scripts/report-action-contract.js'));
    const lintFiles = configuredLintFiles
        .filter(file => file !== 'scripts/report-action-contract.js')
        .slice()
        .sort();
    const checkJsFiles = config.files
        .filter(file => file.endsWith('.js'))
        .slice()
        .sort();

    assert.deepStrictEqual(checkJsFiles, lintFiles);
    assert.ok(config.files.includes('js/crashScreen.js'));
    assert.ok(config.files.includes('js/crashScreenEffects.js'));
    assert.ok(config.files.includes('scripts/check-static-files.js'));
});


runTest('主要browser globalとadapter境界は実モジュール型で検査する', () => {
    const globals = fs.readFileSync(
        path.join(__dirname, '..', 'types/checkjs-browser-globals.d.ts'),
        'utf8'
    );
    for (const name of [
        'GameActionContract',
        'GameSnapshot',
        'CPUActionProposal',
        'CPUBuildStrategy',
        'OnlineReconnectRuntime',
        'OnlineGameEngineRuntime',
    ]) {
        assert.match(globals, new RegExp('\\b' + name + ': typeof import\\('));
        assert.ok(!globals.includes(name + ': unknown;'), name);
    }

    const boundaries = {
        'js/actionContract.js': ['GameActionEnvelope', 'GameActionReadResult'],
        'js/gameSnapshot.js': ['GameSnapshotPlayerState', 'GameSnapshotState'],
        'js/Card.js': ['class Card', '@param {Array<number>} diceNums'],
        'js/Player.js': ['class Player', '@type {Array<Card>}'],
        'js/onlineReconnectRuntime.js': ['OnlineReconnectRuntimeDependencies'],
        'js/onlineGameEngineRuntime.js': ['OnlineGameEngineRuntimeDependencies'],
        'js/cpuActionProposal.js': ['@template {string} TAction'],
        'js/cpuBuildStrategy.js': ['CPUBuildStrategyAction'],
    };
    for (const [file, markers] of Object.entries(boundaries)) {
        const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
        for (const marker of markers) assert.ok(source.includes(marker), file + ': ' + marker);
    }
});
