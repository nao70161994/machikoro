'use strict';

const OnlineInboundActionRuntime = (() => {
    const CHANNELS = Object.freeze({
        incoming: Object.freeze({
            queueType: 'gameAction',
            diagnosticPrefix: 'incomingGameAction',
            clearActionFlightOnDecodeFailure: false,
            noGameMessage: '⚠️ ゲーム状態を準備できていないため、再接続しています...',
            requestRejoinOnNoGame: true,
            gapMessage: '操作の欠落を検知したため、状態を再同期しています...',
            clearPendingOnDuplicate: false,
            alreadyApplied: false,
            clearPendingOnCommit: false,
        }),
        accepted: Object.freeze({
            queueType: 'actionAccepted',
            diagnosticPrefix: 'acceptedGameAction',
            clearActionFlightOnDecodeFailure: true,
            noGameMessage: '⚠️ ゲーム状態を準備できていないため、再接続してください。',
            requestRejoinOnNoGame: false,
            gapMessage: null,
            clearPendingOnDuplicate: true,
            alreadyApplied: true,
            clearPendingOnCommit: true,
        }),
    });

    function createRuntime(dependencies = {}) {
        const requiredObjects = ['flags', 'payload', 'reconnectState'];
        for (const name of requiredObjects) {
            if (!dependencies[name]) {
                throw new TypeError(`online inbound action dependency is required: ${name}`);
            }
        }
        const requiredEffects = [
            'applyReplayedAction', 'clearPending', 'decodeAction', 'getGameState',
            'getReconnectSnapshot', 'lastAppliedSeq', 'queueDuringRestore',
            'readPending', 'recordSelection', 'runApplyFailure', 'runCommit',
            'runDecodeFailure', 'runGap', 'runNoGame', 'setActionFlight',
            'shouldClearPending',
        ];
        for (const name of requiredEffects) {
            if (typeof dependencies[name] !== 'function') {
                throw new TypeError(`online inbound action effect is required: ${name}`);
            }
        }
        for (const channel of Object.keys(CHANNELS)) {
            if (!dependencies.flags[channel]) {
                throw new TypeError(`online inbound action flags are required: ${channel}`);
            }
            for (const name of ['plan', 'decode', 'apply', 'gap', 'noGame', 'commit']) {
                if (typeof dependencies.flags[channel][name] !== 'function') {
                    throw new TypeError(`online inbound action flag is required: ${channel}.${name}`);
                }
            }
        }

        function diagnosticKey(channel, suffix) {
            return CHANNELS[channel].diagnosticPrefix + suffix;
        }

        function record(channel, suffix, selection) {
            dependencies.recordSelection(diagnosticKey(channel, suffix), selection);
        }

        function legacyPlan(seq, lastAppliedSeq) {
            const decisions = dependencies.payload.incomingGameActionDecisions;
            let decision = decisions.APPLY;
            if (!dependencies.getGameState().game) decision = decisions.NO_GAME;
            else if (Number.isInteger(seq) && seq <= lastAppliedSeq) {
                decision = decisions.DUPLICATE;
            } else if (Number.isInteger(seq) && seq !== lastAppliedSeq + 1) {
                decision = decisions.GAP;
            }
            return Object.freeze({ decision });
        }

        function planSelection(seq, lastAppliedSeq, requested) {
            const fallbackPlan = legacyPlan(seq, lastAppliedSeq);
            const stateSelection = dependencies.reconnectState.selectAuthorityState(
                dependencies.getReconnectSnapshot(),
                { eventAuthorityEnabled: requested }
            );
            const stateReady = stateSelection.source === 'event';
            const selected = dependencies.payload.selectIncomingGameActionPlan(
                !!dependencies.getGameState().game,
                seq,
                lastAppliedSeq,
                fallbackPlan,
                { authorityEnabled: requested && stateReady }
            );
            if (!requested || stateReady) return selected;
            return Object.freeze({
                ...selected,
                source: 'legacy-fallback',
                fallbackReason: stateSelection.fallbackReason || 'state-authority-unavailable',
            });
        }

        function normalizeDecoded(value) {
            const {
                action,
                data,
                playerIndex,
                seq,
                clientActionId,
                restoreActionAudit,
                stateSnapshot,
                restoreAudit,
            } = value;
            return {
                action,
                data,
                playerIndex,
                seq,
                clientActionId,
                restoreActionAudit,
                stateSnapshot,
                restoreAudit,
            };
        }

        function decode(channel, wirePayload) {
            const config = CHANNELS[channel];
            const decoded = dependencies.decodeAction(wirePayload);
            if (decoded.ok) {
                return Object.freeze({ ok: true, payload: normalizeDecoded(decoded.value) });
            }
            const result = dependencies.runDecodeFailure(
                { clearActionFlight: config.clearActionFlightOnDecodeFailure },
                dependencies.flags[channel].decode(),
                selection => record(channel, 'DecodeEffectSelection', selection)
            );
            return Object.freeze({ ok: false, result });
        }

        function selectPlan(channel, payload) {
            const selected = planSelection(
                payload.seq,
                dependencies.lastAppliedSeq(),
                dependencies.flags[channel].plan()
            );
            record(channel, 'PlanSelection', selected);
            return selected;
        }

        function applyOrRecover(channel, payload, selected) {
            try {
                dependencies.applyReplayedAction(payload.action, payload.data);
                return Object.freeze({ ok: true });
            } catch (error) {
                const result = dependencies.runApplyFailure(
                    error,
                    selected,
                    dependencies.flags[channel].apply(),
                    selection => record(channel, 'ApplyEffectSelection', selection)
                );
                return Object.freeze({ ok: false, result });
            }
        }

        function dispatchSelected(channel, payload, selected) {
            const config = CHANNELS[channel];
            const decisions = dependencies.payload.incomingGameActionDecisions;
            const decision = selected.plan.decision;
            if (decision === decisions.NO_GAME) {
                return dependencies.runNoGame(
                    config.noGameMessage,
                    config.requestRejoinOnNoGame,
                    selected,
                    dependencies.flags[channel].noGame(),
                    selection => record(channel, 'NoGameEffectSelection', selection)
                );
            }
            if (decision === decisions.DUPLICATE) {
                if (config.clearPendingOnDuplicate) dependencies.clearPending();
                return;
            }
            if (decision === decisions.GAP) {
                return dependencies.runGap(
                    config.gapMessage,
                    selected,
                    dependencies.flags[channel].gap(),
                    selection => record(channel, 'GapEffectSelection', selection)
                );
            }
            const applied = applyOrRecover(channel, payload, selected);
            if (!applied.ok) return applied.result;
            const logOptions = {
                ...(config.alreadyApplied ? { alreadyApplied: true } : {}),
                playerIndex: payload.playerIndex,
                seq: payload.seq,
                clientActionId: payload.clientActionId,
                restoreActionAudit: payload.restoreActionAudit,
                stateSnapshot: payload.stateSnapshot,
                restoreAudit: payload.restoreAudit,
            };
            return dependencies.runCommit(
                payload.action,
                payload.data,
                payload.seq,
                logOptions,
                config.clearPendingOnCommit,
                config.alreadyApplied,
                selected,
                dependencies.flags[channel].commit(),
                selection => record(channel, 'CommitEffectSelection', selection)
            );
        }

        function handleGameAction(wirePayload) {
            const decoded = decode('incoming', wirePayload);
            if (!decoded.ok) return decoded.result;
            const payload = decoded.payload;
            if (dependencies.queueDuringRestore(CHANNELS.incoming.queueType, payload)) return;
            return dispatchSelected('incoming', payload, selectPlan('incoming', payload));
        }

        function handleActionAccepted(wirePayload) {
            const decoded = decode('accepted', wirePayload);
            if (!decoded.ok) return decoded.result;
            const payload = decoded.payload;
            if (dependencies.queueDuringRestore(CHANNELS.accepted.queueType, payload)) return;
            const pending = dependencies.readPending();
            if (!dependencies.shouldClearPending(payload, pending)) return;
            dependencies.setActionFlight(false);
            return dispatchSelected('accepted', payload, selectPlan('accepted', payload));
        }

        return Object.freeze({
            handleActionAccepted,
            handleGameAction,
            legacyPlan,
            planSelection,
        });
    }

    return Object.freeze({ CHANNELS, createRuntime });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = OnlineInboundActionRuntime;
if (typeof window !== 'undefined') Object.assign(window, { OnlineInboundActionRuntime });
if (typeof globalThis !== 'undefined') Object.assign(globalThis, { OnlineInboundActionRuntime });
