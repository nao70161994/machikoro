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
            ['js/cpuProfile.js', 'js/CPU.js'],
            ['js/cpuLegalMoves.js', 'js/CPU.js'],
            ['js/cpuSimulation.js', 'js/CPU.js'],
            ['js/cpuEvaluation.js', 'js/CPU.js'],
            ['js/onlineStorage.js', 'js/online.js'],
            ['js/onlinePayload.js', 'js/online.js'],
            ['js/onlineRestoreRank.js', 'js/online.js'],
            ['js/onlineReconnectState.js', 'js/online.js'],
            ['js/uiLogDisplay.js', 'js/ui.js'],
            ['js/uiCardOrder.js', 'js/ui.js'],
            ['js/uiPlayerDisplay.js', 'js/ui.js'],
            ['js/uiBuildMenu.js', 'js/ui.js'],
            ['js/uiPendingMenu.js', 'js/ui.js'],
            ['js/uiCardDetail.js', 'js/ui.js'],
            ['js/uiCardSelect.js', 'js/ui.js'],
            ['js/clientReporting.js', 'js/appShell.js'],
            ['js/lifecycleNotify.js', 'js/appShell.js'],
            ['js/uiWatchdog.js', 'js/appShell.js']
        ]],
        ['scripts/selfplay.js', [
            ['js/cpuProfile.js', 'js/CPU.js'],
            ['js/cpuLegalMoves.js', 'js/CPU.js'],
            ['js/cpuSimulation.js', 'js/CPU.js'],
            ['js/cpuEvaluation.js', 'js/CPU.js']
        ]],
        ['tests/helpers/runtime-loaders.js', [
            ['js/cpuProfile.js', 'js/CPU.js'],
            ['js/cpuLegalMoves.js', 'js/CPU.js'],
            ['js/cpuSimulation.js', 'js/CPU.js'],
            ['js/cpuEvaluation.js', 'js/CPU.js']
        ]],
        ['tests/helpers/integration-runtime.js', [
            ['js/cpuProfile.js', 'js/CPU.js'],
            ['js/cpuLegalMoves.js', 'js/CPU.js'],
            ['js/cpuSimulation.js', 'js/CPU.js'],
            ['js/cpuEvaluation.js', 'js/CPU.js'],
            ['js/clientReporting.js', 'js/appShell.js'],
            ['js/lifecycleNotify.js', 'js/appShell.js'],
            ['js/uiWatchdog.js', 'js/appShell.js'],
            ['js/uiLogDisplay.js', 'js/ui.js'],
            ['js/uiCardOrder.js', 'js/ui.js'],
            ['js/uiPlayerDisplay.js', 'js/ui.js'],
            ['js/uiBuildMenu.js', 'js/ui.js'],
            ['js/uiPendingMenu.js', 'js/ui.js'],
            ['js/uiCardDetail.js', 'js/ui.js'],
            ['js/uiCardSelect.js', 'js/ui.js'],
            ['js/onlineStorage.js', 'js/online.js'],
            ['js/onlinePayload.js', 'js/online.js'],
            ['js/onlineRestoreRank.js', 'js/online.js'],
            ['js/onlineReconnectState.js', 'js/online.js'],
        ]],
        ['tests/ui.test.js', [
            ['js/uiLogDisplay.js', 'js/ui.js'],
            ['js/uiCardOrder.js', 'js/ui.js'],
            ['js/uiPlayerDisplay.js', 'js/ui.js'],
            ['js/uiBuildMenu.js', 'js/ui.js'],
            ['js/uiPendingMenu.js', 'js/ui.js'],
            ['js/uiCardDetail.js', 'js/ui.js'],
            ['js/uiCardSelect.js', 'js/ui.js']
        ]],
        ['tests/online.test.js', [
            ['js/onlineStorage.js', 'js/online.js'],
            ['js/onlinePayload.js', 'js/online.js'],
            ['js/onlineRestoreRank.js', 'js/online.js'],
            ['js/onlineReconnectState.js', 'js/online.js'],
        ]],
        ['tests/release-e2e.test.js', [
            ['js/uiLogDisplay.js', 'js/ui.js'],
            ['js/uiCardOrder.js', 'js/ui.js'],
            ['js/clientReporting.js', 'js/appShell.js'],
            ['js/lifecycleNotify.js', 'js/appShell.js'],
            ['js/uiWatchdog.js', 'js/appShell.js'],
            ['js/uiPendingMenu.js', 'js/ui.js']
        ]],
        ['tests/main.test.js', [
            ['js/clientReporting.js', 'js/appShell.js'],
            ['js/lifecycleNotify.js', 'js/appShell.js'],
            ['js/uiWatchdog.js', 'js/appShell.js']
        ]]
    ];

    for (const [file, dependencies] of cases) {
        assertDependencyOrder(file, dependencies);
    }
});
