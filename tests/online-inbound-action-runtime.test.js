'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const OnlineInboundActionRuntime = require('../js/onlineInboundActionRuntime');
const { runTest } = require('./helpers/test-utils');

const DECISIONS = Object.freeze({
    APPLY: 'apply',
    NO_GAME: 'no-game',
    DUPLICATE: 'duplicate',
    GAP: 'gap',
});

function createHarness(options = {}) {
    const calls = [];
    const diagnostics = {};
    const gameState = { game: options.hasGame === false ? null : {} };
    const flags = {
        incoming: {},
        accepted: {},
    };
    for (const channel of Object.keys(flags)) {
        for (const name of ['plan', 'decode', 'apply', 'gap', 'noGame', 'commit']) {
            flags[channel][name] = () => !!options[`${channel}.${name}`];
        }
    }
    const payloadApi = {
        incomingGameActionDecisions: DECISIONS,
        selectIncomingGameActionPlan(hasGame, seq, lastAppliedSeq, legacyPlan, config) {
            calls.push(['selectPlan', hasGame, seq, lastAppliedSeq, legacyPlan, config]);
            return Object.freeze({
                plan: legacyPlan,
                source: config.authorityEnabled ? 'pure-plan' : 'legacy',
                matched: true,
                fallbackReason: '',
            });
        },
    };
    const dependencies = {
        applyReplayedAction(action, data) {
            calls.push(['apply', action, data]);
            if (options.applyError) throw new Error('apply failed');
            return options.applyResult === undefined ? true : options.applyResult;
        },
        clearPending: () => calls.push(['clearPending']),
        decodeAction(wire) {
            calls.push(['decode', wire]);
            return options.decodeFailure ? { ok: false } : { ok: true, value: wire };
        },
        flags,
        getGameState: () => gameState,
        getReconnectSnapshot: () => ({ state: 'active' }),
        lastAppliedSeq: () => options.lastAppliedSeq || 0,
        payload: payloadApi,
        queueDuringRestore(type, payload) {
            calls.push(['queue', type, payload]);
            return !!options.queued;
        },
        readPending: () => { calls.push(['readPending']); return options.pending || null; },
        reconnectState: {
            selectAuthorityState(snapshot, config) {
                calls.push(['selectAuthorityState', snapshot, config]);
                return options.stateUnavailable
                    ? { source: 'legacy-fallback', fallbackReason: 'state-not-ready' }
                    : { source: 'event', fallbackReason: '' };
            },
        },
        recordSelection(key, selection) {
            diagnostics[key] = selection;
            calls.push(['record', key, selection]);
        },
        runApplyFailure(error, plan, enabled, record) {
            calls.push(['applyFailure', error.message, plan, enabled]);
            record({ source: 'apply-effect' });
            return 'apply-failed';
        },
        runCommit(...args) {
            const record = args[args.length - 1];
            calls.push(['commit', ...args.slice(0, -1)]);
            record({ source: 'commit-effect' });
            return 'committed';
        },
        runDecodeFailure(plan, enabled, record) {
            calls.push(['decodeFailure', plan, enabled]);
            record({ source: 'decode-effect' });
            return 'decode-failed';
        },
        runGap(message, plan, enabled, record) {
            calls.push(['gap', message, plan, enabled]);
            record({ source: 'gap-effect' });
            return 'gap';
        },
        runNoGame(message, requestRejoin, plan, enabled, record) {
            calls.push(['noGame', message, requestRejoin, plan, enabled]);
            record({ source: 'no-game-effect' });
            return 'no-game';
        },
        setActionFlight: value => calls.push(['setActionFlight', value]),
        shouldClearPending(accepted, pending) {
            calls.push(['shouldClearPending', accepted, pending]);
            return options.pendingMatches !== false;
        },
    };
    const runtime = OnlineInboundActionRuntime.createRuntime(dependencies);
    return { calls, dependencies, diagnostics, gameState, runtime };
}

function action(overrides = {}) {
    return {
        action: 'nextTurn',
        data: {},
        playerIndex: 1,
        seq: 1,
        clientActionId: 'action-1',
        restoreActionAudit: null,
        stateSnapshot: null,
        restoreAudit: null,
        ...overrides,
    };
}

runTest('online inbound runtimeはgameActionをdecode→queue→plan→apply→commit順で処理する', () => {
    const harness = createHarness();
    assert.strictEqual(harness.runtime.handleGameAction(action()), 'committed');
    assert.deepStrictEqual(harness.calls.map(call => call[0]), [
        'decode', 'queue', 'selectAuthorityState', 'selectPlan', 'record',
        'apply', 'commit', 'record',
    ]);
    const commit = harness.calls[6];
    assert.strictEqual(commit[1], 'nextTurn');
    assert.strictEqual(commit[5], false);
    assert.strictEqual(commit[6], false);
    assert.strictEqual(commit[4].alreadyApplied, undefined);
    assert.strictEqual(harness.diagnostics.incomingGameActionPlanSelection.source, 'legacy');
});

runTest('online inbound runtimeは別ACKをpendingとflightへ影響させない', () => {
    const harness = createHarness({ pendingMatches: false, pending: { clientActionId: 'other' } });
    harness.runtime.handleActionAccepted(action());
    assert.deepStrictEqual(harness.calls.map(call => call[0]), [
        'decode', 'queue', 'readPending', 'shouldClearPending',
    ]);
});

runTest('online inbound runtimeは一致ACKのduplicateでflightとpendingだけを確定する', () => {
    const harness = createHarness({ lastAppliedSeq: 1, pending: { clientActionId: 'action-1' } });
    harness.runtime.handleActionAccepted(action());
    assert.deepStrictEqual(harness.calls.map(call => call[0]), [
        'decode', 'queue', 'readPending', 'shouldClearPending', 'setActionFlight',
        'selectAuthorityState', 'selectPlan', 'record', 'clearPending',
    ]);
});

runTest('online inbound runtimeはmalformed ACKだけflight解除付きdecode recoveryへ渡す', () => {
    const incoming = createHarness({ decodeFailure: true });
    assert.strictEqual(incoming.runtime.handleGameAction(action()), 'decode-failed');
    assert.deepStrictEqual(incoming.calls[1], ['decodeFailure', { clearActionFlight: false }, false]);
    const accepted = createHarness({ decodeFailure: true });
    assert.strictEqual(accepted.runtime.handleActionAccepted(action()), 'decode-failed');
    assert.deepStrictEqual(accepted.calls[1], ['decodeFailure', { clearActionFlight: true }, false]);
});

runTest('online inbound runtimeはapply例外をcommitせずchannel別recoveryへ渡す', () => {
    const harness = createHarness({ applyError: true, 'incoming.apply': true });
    assert.strictEqual(harness.runtime.handleGameAction(action()), 'apply-failed');
    assert.ok(harness.calls.some(call => call[0] === 'applyFailure' && call[3] === true));
    assert.strictEqual(harness.calls.some(call => call[0] === 'commit'), false);
    assert.strictEqual(harness.diagnostics.incomingGameActionApplyEffectSelection.source, 'apply-effect');
});

runTest('online inbound runtimeはapply falseをincoming/acceptedともcommitせずrecoveryへ渡す', () => {
    for (const channel of ['incoming', 'accepted']) {
        const options = { applyResult: false };
        options[`${channel}.apply`] = true;
        if (channel === 'accepted') options.pending = { clientActionId: 'action-1' };
        const harness = createHarness(options);
        const result = channel === 'incoming'
            ? harness.runtime.handleGameAction(action())
            : harness.runtime.handleActionAccepted(action());
        assert.strictEqual(result, 'apply-failed', channel);
        assert.strictEqual(harness.calls.some(call => call[0] === 'commit'), false, channel);
        assert.ok(harness.calls.some(call =>
            call[0] === 'applyFailure' &&
            call[1] === 'online action application rejected'
        ), channel);
    }
});

runTest('online inbound runtimeはstate authority未準備ならlegacy planへ明示fallbackする', () => {
    const harness = createHarness({ stateUnavailable: true, 'incoming.plan': true });
    const selection = harness.runtime.planSelection(1, 0, true);
    assert.strictEqual(selection.source, 'legacy-fallback');
    assert.strictEqual(selection.fallbackReason, 'state-not-ready');
    assert.strictEqual(harness.calls[1][5].authorityEnabled, false);
});

runTest('online.jsは受信Action orchestrationを専用runtimeへ委譲する', () => {
    const online = fs.readFileSync(path.join(__dirname, '..', 'js/online.js'), 'utf8');
    const runtime = fs.readFileSync(
        path.join(__dirname, '..', 'js/onlineInboundActionRuntime.js'),
        'utf8'
    );
    assert.ok(online.includes('OnlineInboundActionRuntime.createRuntime'));
    for (const pattern of [
        'function legacyInboundGameActionPlan(',
        'function inboundGameActionPlanSelection(',
        'const handleGameAction = wirePayload =>',
        'const handleActionAccepted = wirePayload =>',
    ]) {
        assert.strictEqual(online.includes(pattern), false, pattern);
    }
    assert.ok(runtime.includes('function handleGameAction(wirePayload)'));
    assert.ok(runtime.includes('function handleActionAccepted(wirePayload)'));
});

runTest('online inbound runtimeは必須adapter欠落を初期化前に拒否する', () => {
    assert.throws(() => OnlineInboundActionRuntime.createRuntime(), /dependency is required/);
    const harness = createHarness();
    assert.ok(Object.isFrozen(harness.runtime));
    assert.ok(Object.isFrozen(OnlineInboundActionRuntime.CHANNELS));
});

runTest('online inbound runtimeは現在世代と異なる遅延action/ACKを適用しない', () => {
    const h = createHarness();
    h.dependencies.getGameGeneration = () => 2;
    const runtime = OnlineInboundActionRuntime.createRuntime(h.dependencies);

    assert.strictEqual(runtime.handleGameAction({ action: 'nextTurn', data: {}, seq: 1, gameGeneration: 1 }), false);
    assert.strictEqual(runtime.handleActionAccepted({ action: 'nextTurn', data: {}, seq: 1, gameGeneration: 1 }), false);
    assert.deepStrictEqual(h.calls.map(call => call[0]), ['decode', 'decode']);
});

runTest('online inbound runtimeは再戦で旧seq42からreset後の最初のseq1を適用する', () => {
    const h = createHarness({ lastAppliedSeq: 0 });
    h.dependencies.getGameGeneration = () => 1;
    const runtime = OnlineInboundActionRuntime.createRuntime(h.dependencies);

    assert.strictEqual(runtime.handleGameAction(action({ seq: 1, gameGeneration: 1 })), 'committed');
    assert.ok(h.calls.some(call => call[0] === 'apply'));
    assert.ok(h.calls.some(call => call[0] === 'commit'));
});
