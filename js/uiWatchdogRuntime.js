'use strict';

const UiWatchdogRuntime = (() => {
    function createRuntime(dependencies = {}) {
        const {
            buildSnapshot,
            checkpoint,
            compactActionChildStates,
            confirmModalOpen,
            freezeKinds,
            getConfirmAwaitingChoice,
            getOnlineRetryPolicy,
            getRoot,
            hasActiveBlockingModal,
            hasUsablePendingAction,
            hasUsablePrimaryAction,
            monitor,
            monitorActions,
            now,
            recover,
            report,
            reporting,
            schemaVersion,
            staleConfirmModalOpen,
            stalePendingModalOpen,
            store,
            uiWatchdog,
            validateInteractability,
        } = dependencies;
        const requiredFunctions = {
            buildSnapshot,
            checkpoint,
            compactActionChildStates,
            confirmModalOpen,
            getConfirmAwaitingChoice,
            getOnlineRetryPolicy,
            getRoot,
            hasActiveBlockingModal,
            hasUsablePendingAction,
            hasUsablePrimaryAction,
            now,
            recover,
            report,
            staleConfirmModalOpen,
            stalePendingModalOpen,
            store,
            validateInteractability,
        };
        for (const [name, dependency] of Object.entries(requiredFunctions)) {
            if (typeof dependency !== 'function') throw new TypeError(`${name} is required`);
        }
        if (!freezeKinds || !monitor || !monitorActions || !reporting || !uiWatchdog) {
            throw new TypeError('watchdog runtime dependencies are required');
        }

        function stateKey(snapshot) {
            return uiWatchdog.stateKey(snapshot);
        }

        function isOnlineActionTimedOut(snapshot, observedAt = now()) {
            if (!snapshot || !snapshot.onlineActionInFlight) return false;
            const onlineRetryPolicy = getOnlineRetryPolicy();
            if (!onlineRetryPolicy || typeof onlineRetryPolicy.isActionAckTimedOut !== 'function') return false;
            return onlineRetryPolicy.isActionAckTimedOut(snapshot.onlineActionInFlightAt, observedAt);
        }

        function hasPendingWork(snapshot) {
            return uiWatchdog.hasPendingWork(snapshot);
        }

        function classify(snapshot) {
            if (!uiWatchdog.isFreezeClassificationCandidate(snapshot)) return '';
            return uiWatchdog.classifySnapshot(snapshot, {
                confirmOpen: confirmModalOpen(snapshot),
                staleConfirmOpen: staleConfirmModalOpen(snapshot),
                activeBlockingModalOpen: hasActiveBlockingModal(snapshot),
                stalePendingOpen: stalePendingModalOpen(snapshot),
                hasUsablePrimaryAction: hasUsablePrimaryAction(snapshot),
                hasUsablePendingAction: hasUsablePendingAction(snapshot),
                onlineActionTimedOut: isOnlineActionTimedOut(snapshot),
                interactabilityIssues: validateInteractability(snapshot),
                modalFreezeKind: freezeKinds.MODAL_UI_LOCKED,
                pendingFreezeKind: freezeKinds.PENDING_UI_LOCKED,
                humanFreezeKind: freezeKinds.HUMAN_TURN_UI_LOCKED,
            }, freezeKinds);
        }

        function compactIssue(issue) {
            return uiWatchdog.compactIssueForTrace(issue);
        }

        function compactSnapshot(snapshot) {
            return uiWatchdog.compactSnapshotForTrace(snapshot);
        }

        function recentCheckpoints(limit = 8) {
            try {
                const root = getRoot();
                return uiWatchdog.compactRecentCheckpoints(root && root.__machikoroClientCheckpoints, limit);
            } catch (_) {
                return [];
            }
        }

        function classifyInteractabilityCause(issue, snapshot) {
            return uiWatchdog.classifyInteractabilityCause(issue, snapshot);
        }

        function issueDedupeSignature(snapshot) {
            return uiWatchdog.issueDedupeSignature(snapshot, validateInteractability(snapshot));
        }

        function compactElementSnapshotForStorage(state) {
            return uiWatchdog.compactElementSnapshotForStorage(state);
        }

        function compactPayloadForStorage(payload) {
            return uiWatchdog.compactFreezePayloadForStorage(payload, compactIssue);
        }

        function payloadStorageJson(payload) {
            return uiWatchdog.freezePayloadStorageJson(payload, compactIssue);
        }

        function buildReportStack(payload) {
            const snapshot = payload && payload.snapshot || {};
            const issues = Array.isArray(payload && payload.interactabilityIssues)
                ? payload.interactabilityIssues.map(compactIssue)
                : validateInteractability(snapshot);
            return uiWatchdog.buildFreezeReportStack(payload, {
                schemaVersion,
                confirmAwaitingChoice: getConfirmAwaitingChoice(),
                expectedPrimaryActions: uiWatchdog.expectedPrimaryActions(snapshot),
                interactabilityIssues: issues,
                actionChildren: compactActionChildStates(snapshot),
            });
        }

        function check() {
            const observedAt = now();
            const snapshot = buildSnapshot('freeze-watchdog');
            const progress = monitor.observeProgress(stateKey(snapshot), observedAt);
            if (!progress.shouldClassify) return;
            const freezeKind = classify(snapshot);
            if (!freezeKind) return;
            const reportKey = freezeKind + '|' + issueDedupeSignature(snapshot);
            const action = monitor.decideReport(freezeKind, reportKey, observedAt);
            if (action === monitorActions.RECOVER) {
                recover(snapshot);
                return;
            }
            if (action !== monitorActions.REPORT_AND_RECOVER) return;
            reporting.execute({
                freezeKind,
                stagnantMs: progress.stagnantMs,
                snapshot,
                interactabilityIssues: validateInteractability(snapshot).filter(issue => issue && issue.freezeKind),
            }, {
                markCheckpoint: checkpoint,
                recover,
                serialize: payloadStorageJson,
                store,
                buildStack: buildReportStack,
                report,
            });
        }

        return Object.freeze({
            stateKey,
            isOnlineActionTimedOut,
            hasPendingWork,
            classify,
            compactIssue,
            compactSnapshot,
            recentCheckpoints,
            classifyInteractabilityCause,
            issueDedupeSignature,
            compactElementSnapshotForStorage,
            compactPayloadForStorage,
            payloadStorageJson,
            buildReportStack,
            check,
        });
    }

    return Object.freeze({ createRuntime });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = UiWatchdogRuntime;
if (typeof window !== 'undefined') window.UiWatchdogRuntime = UiWatchdogRuntime;
if (typeof globalThis !== 'undefined') globalThis.UiWatchdogRuntime = UiWatchdogRuntime;
