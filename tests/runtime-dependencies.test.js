const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { runTest } = require('./helpers/test-utils');

function assertDependencyOrder(file, dependencies) {
    const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

    for (const [dependency, consumer] of dependencies) {
        const dependencyIndex = source.indexOf(dependency);
        const consumerIndex = source.indexOf(consumer);

        assert.ok(dependencyIndex >= 0, `${file}: missing ${dependency}`);
        assert.ok(consumerIndex >= 0, `${file}: missing ${consumer}`);
        assert.ok(
            dependencyIndex < consumerIndex,
            `${file}: ${dependency} must load before ${consumer}`
        );
    }
}

runTest('productionと主要runtimeは抽出moduleをconsumerより先に読み込む', () => {
    const cases = [
        ['index.html', [
            ['js/actionContract.js', 'js/GameManager.js'],
            ['js/cpuProfile.js', 'js/CPU.js'],
            ['js/cpuLegalMoves.js', 'js/CPU.js'],
            ['js/cpuActionProposal.js', 'js/cpuBuildExecution.js'],
            ['js/cpuBuildExecution.js', 'js/CPU.js'],
            ['js/cpuSimulation.js', 'js/CPU.js'],
            ['js/cpuEvaluation.js', 'js/CPU.js'],
            ['js/actionContract.js', 'js/gameEngine.js'],
            ['js/gameSnapshot.js', 'js/gameEngine.js'],
            ['js/actionContract.js', 'js/gameSchemaCodec.js'],
            ['js/gameSchemaNegotiation.js', 'js/gameSchemaCodec.js'],
            ['js/gameSnapshot.js', 'js/gameSchemaCodec.js'],
            ['js/gameSchemaCodec.js', 'js/gameSchemaWire.js'],
            ['js/gameSchemaWire.js', 'js/online.js'],
            ['js/gameSchemaCodec.js', 'js/gameEngine.js'],
            ['js/gameSnapshot.js', 'js/online.js'],
            ['js/gameEngine.js', 'js/online.js'],
            ['js/gameSchemaNegotiation.js', 'js/online.js'],
            ['js/onlineStorage.js', 'js/online.js'],
            ['js/onlinePayload.js', 'js/online.js'],
            ['js/onlineRestoreRank.js', 'js/online.js'],
            ['js/onlineReconnectState.js', 'js/online.js'],
            ['js/onlineRetryPolicy.js', 'js/online.js'],
            ['js/uiLogDisplay.js', 'js/ui.js'],
            ['js/uiCardOrder.js', 'js/ui.js'],
            ['js/uiPlayerDisplay.js', 'js/ui.js'],
            ['js/uiBuildMenu.js', 'js/ui.js'],
            ['js/uiPendingMenu.js', 'js/ui.js'],
            ['js/uiCardDetail.js', 'js/ui.js'],
            ['js/uiCardSelect.js', 'js/ui.js'],
            ['js/uiTutorial.js', 'js/ui.js'],
            ['js/uiDiceChoice.js', 'js/ui.js'],
            ['js/uiModalPolicy.js', 'js/ui.js'],
            ['js/uiWinner.js', 'js/ui.js'],
            ['js/savedGameValidation.js', 'js/storage.js'],
            ['js/storageSettings.js', 'js/storage.js'],
            ['js/clientReporting.js', 'js/appShell.js'],
            ['js/lifecycleNotify.js', 'js/appShell.js'],
            ['js/uiWatchdog.js', 'js/appShell.js'],
            ['js/pwaShell.js', 'js/appShell.js'],
            ['js/actionUiRegistry.js', 'js/appShell.js'],
        ]],
        ['scripts/selfplay.js', [
            ['js/actionContract.js', 'js/GameManager.js'],
            ['js/actionContract.js', 'js/gameEngine.js'],
            ['js/gameSnapshot.js', 'js/gameEngine.js'],
            ['js/gameSchemaCodec.js', 'js/gameEngine.js'],
            ['js/gameEngine.js', 'js/cpuBuildExecution.js'],
            ['js/cpuProfile.js', 'js/CPU.js'],
            ['js/cpuLegalMoves.js', 'js/CPU.js'],
            ['js/cpuActionProposal.js', 'js/cpuBuildExecution.js'],
            ['js/cpuBuildExecution.js', 'js/CPU.js'],
            ['js/cpuSimulation.js', 'js/CPU.js'],
            ['js/cpuEvaluation.js', 'js/CPU.js']
        ]],
        ['tests/helpers/runtime-loaders.js', [
            ['js/actionContract.js', 'js/GameManager.js'],
            ['js/actionContract.js', 'js/gameEngine.js'],
            ['js/gameSnapshot.js', 'js/gameEngine.js'],
            ['js/gameSchemaCodec.js', 'js/gameEngine.js'],
            ['js/gameEngine.js', 'js/cpuBuildExecution.js'],
            ['js/cpuProfile.js', 'js/CPU.js'],
            ['js/cpuLegalMoves.js', 'js/CPU.js'],
            ['js/cpuActionProposal.js', 'js/cpuBuildExecution.js'],
            ['js/cpuBuildExecution.js', 'js/CPU.js'],
            ['js/cpuSimulation.js', 'js/CPU.js'],
            ['js/cpuEvaluation.js', 'js/CPU.js']
        ]],
        ['tests/helpers/integration-runtime.js', [
            ['js/actionContract.js', 'js/GameManager.js'],
            ['js/cpuProfile.js', 'js/CPU.js'],
            ['js/cpuLegalMoves.js', 'js/CPU.js'],
            ['js/cpuActionProposal.js', 'js/cpuBuildExecution.js'],
            ['js/cpuBuildExecution.js', 'js/CPU.js'],
            ['js/cpuSimulation.js', 'js/CPU.js'],
            ['js/cpuEvaluation.js', 'js/CPU.js'],
            ['js/clientReporting.js', 'js/appShell.js'],
            ['js/lifecycleNotify.js', 'js/appShell.js'],
            ['js/uiWatchdog.js', 'js/appShell.js'],
            ['js/pwaShell.js', 'js/appShell.js'],
            ['js/actionUiRegistry.js', 'js/appShell.js'],
            ['js/savedGameValidation.js', 'js/storage.js'],
            ['js/storageSettings.js', 'js/storage.js'],
            ['js/uiLogDisplay.js', 'js/ui.js'],
            ['js/uiCardOrder.js', 'js/ui.js'],
            ['js/uiPlayerDisplay.js', 'js/ui.js'],
            ['js/uiBuildMenu.js', 'js/ui.js'],
            ['js/uiPendingMenu.js', 'js/ui.js'],
            ['js/uiCardDetail.js', 'js/ui.js'],
            ['js/uiCardSelect.js', 'js/ui.js'],
            ['js/uiTutorial.js', 'js/ui.js'],
            ['js/uiDiceChoice.js', 'js/ui.js'],
            ['js/uiModalPolicy.js', 'js/ui.js'],
            ['js/uiWinner.js', 'js/ui.js'],
            ['js/actionContract.js', 'js/gameEngine.js'],
            ['js/gameSnapshot.js', 'js/gameEngine.js'],
            ['js/actionContract.js', 'js/gameSchemaCodec.js'],
            ['js/gameSchemaNegotiation.js', 'js/gameSchemaCodec.js'],
            ['js/gameSnapshot.js', 'js/gameSchemaCodec.js'],
            ['js/gameSchemaCodec.js', 'js/gameSchemaWire.js'],
            ['js/gameSchemaWire.js', 'js/online.js'],
            ['js/gameSchemaCodec.js', 'js/gameEngine.js'],
            ['js/gameSnapshot.js', 'js/online.js'],
            ['js/gameEngine.js', 'js/online.js'],
            ['js/gameSchemaNegotiation.js', 'js/online.js'],
            ['js/onlineStorage.js', 'js/online.js'],
            ['js/onlinePayload.js', 'js/online.js'],
            ['js/onlineRestoreRank.js', 'js/online.js'],
            ['js/onlineReconnectState.js', 'js/online.js'],
            ['js/onlineRetryPolicy.js', 'js/online.js'],
        ]],
        ['tests/ui.test.js', [
            ['js/uiLogDisplay.js', 'js/ui.js'],
            ['js/uiCardOrder.js', 'js/ui.js'],
            ['js/uiPlayerDisplay.js', 'js/ui.js'],
            ['js/uiBuildMenu.js', 'js/ui.js'],
            ['js/uiPendingMenu.js', 'js/ui.js'],
            ['js/uiCardDetail.js', 'js/ui.js'],
            ['js/uiCardSelect.js', 'js/ui.js'],
            ['js/uiTutorial.js', 'js/ui.js'],
            ['js/uiDiceChoice.js', 'js/ui.js'],
            ['js/uiModalPolicy.js', 'js/ui.js'],
            ['js/uiWinner.js', 'js/ui.js'],
        ]],
        ['tests/online.test.js', [
            ['js/actionContract.js', 'js/gameEngine.js'],
            ['js/gameSnapshot.js', 'js/gameEngine.js'],
            ['js/actionContract.js', 'js/gameSchemaCodec.js'],
            ['js/gameSchemaNegotiation.js', 'js/gameSchemaCodec.js'],
            ['js/gameSnapshot.js', 'js/gameSchemaCodec.js'],
            ['js/gameSchemaCodec.js', 'js/gameSchemaWire.js'],
            ['js/gameSchemaWire.js', 'js/online.js'],
            ['js/gameSchemaCodec.js', 'js/gameEngine.js'],
            ['js/gameSnapshot.js', 'js/online.js'],
            ['js/gameEngine.js', 'js/online.js'],
            ['js/gameSchemaNegotiation.js', 'js/online.js'],
            ['js/onlineStorage.js', 'js/online.js'],
            ['js/onlinePayload.js', 'js/online.js'],
            ['js/onlineRestoreRank.js', 'js/online.js'],
            ['js/onlineReconnectState.js', 'js/online.js'],
            ['js/onlineRetryPolicy.js', 'js/online.js'],
        ]],
        ['tests/release-e2e.test.js', [
            ['js/actionContract.js', 'js/actionUiRegistry.js'],
            ['js/uiLogDisplay.js', 'js/ui.js'],
            ['js/uiCardOrder.js', 'js/ui.js'],
            ['js/clientReporting.js', 'js/appShell.js'],
            ['js/lifecycleNotify.js', 'js/appShell.js'],
            ['js/uiWatchdog.js', 'js/appShell.js'],
            ['js/pwaShell.js', 'js/appShell.js'],
            ['js/actionUiRegistry.js', 'js/appShell.js'],
            ['js/uiPendingMenu.js', 'js/ui.js'],
            ['js/uiTutorial.js', 'js/ui.js'],
            ['js/uiDiceChoice.js', 'js/ui.js'],
            ['js/uiModalPolicy.js', 'js/ui.js'],
            ['js/uiWinner.js', 'js/ui.js'],
        ]],
        ['tests/main.test.js', [
            ['js/actionContract.js', 'js/actionUiRegistry.js'],
            ['js/clientReporting.js', 'js/appShell.js'],
            ['js/lifecycleNotify.js', 'js/appShell.js'],
            ['js/uiWatchdog.js', 'js/appShell.js'],
            ['js/pwaShell.js', 'js/appShell.js'],
            ['js/actionUiRegistry.js', 'js/appShell.js'],
        ]]
    ];

    for (const [file, dependencies] of cases) {
        assertDependencyOrder(file, dependencies);
    }
});
