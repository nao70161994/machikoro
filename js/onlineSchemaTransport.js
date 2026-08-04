'use strict';

const OnlineSchemaTransport = (() => {
    function createSelectionController(initialSelection = null) {
        let selection = initialSelection || null;

        function get() {
            return selection;
        }

        function set(value) {
            selection = value || null;
            return selection;
        }

        function clear() {
            selection = null;
        }

        function snapshot() {
            return Object.freeze({ selection });
        }

        return Object.freeze({ get, set, clear, snapshot });
    }

    function create(options = {}) {
        const runtimeFlags = options.runtimeFlags || null;
        const negotiation = options.negotiation || null;
        const actionWire = options.actionWire || null;
        const recreateWire = options.recreateWire || null;
        const getFlagRoot = typeof options.getFlagRoot === 'function'
            ? options.getFlagRoot
            : () => null;
        const getSelection = typeof options.getSelection === 'function'
            ? options.getSelection
            : () => null;

        function isFlagEnabled(name) {
            return !!(runtimeFlags && typeof runtimeFlags.isEnabled === 'function' &&
                runtimeFlags.isEnabled(name, getFlagRoot()));
        }

        function isNegotiationEnabled() {
            return isFlagEnabled('isGameSchemaNegotiationTransportEnabled');
        }

        function isActionWireEnabled() {
            return isNegotiationEnabled() && isFlagEnabled('isGameSchemaWireTransportEnabled');
        }

        function isSnapshotWireEnabled() {
            return isNegotiationEnabled() && isFlagEnabled('isGameSchemaSnapshotWireTransportEnabled');
        }

        function isRecreateWireEnabled() {
            return isNegotiationEnabled() && isFlagEnabled('isGameSchemaRecreateWireTransportEnabled');
        }

        function capabilities() {
            if (!negotiation || typeof negotiation.transportCapabilities !== 'function') return null;
            return negotiation.transportCapabilities(isNegotiationEnabled());
        }

        function acceptsSelection(selection) {
            if (!isNegotiationEnabled()) return true;
            if (!negotiation || typeof negotiation.supportsSelection !== 'function') return selection == null;
            return negotiation.supportsSelection(capabilities(), selection);
        }

        function encodeAction(payload) {
            const enabled = isActionWireEnabled();
            if (!enabled) return { ok: true, value: payload };
            if (!actionWire || typeof actionWire.encodeActionPayload !== 'function') {
                return { ok: false, reason: 'wire-codec-unavailable' };
            }
            return actionWire.encodeActionPayload(enabled, false, getSelection(), payload);
        }

        function decodeAction(payload) {
            const actionEnabled = isActionWireEnabled();
            const snapshotEnabled = isSnapshotWireEnabled();
            if (!actionEnabled && !snapshotEnabled) return { ok: true, value: payload };
            if (!actionWire || typeof actionWire.decodeActionPayload !== 'function') {
                return { ok: false, reason: 'wire-codec-unavailable' };
            }
            return actionWire.decodeActionPayload(
                actionEnabled,
                snapshotEnabled,
                getSelection(),
                payload
            );
        }

        function decodeSnapshot(payload) {
            if (!isSnapshotWireEnabled()) return { ok: true, value: payload };
            if (!actionWire || typeof actionWire.decodeSnapshotField !== 'function') {
                return { ok: false, reason: 'wire-codec-unavailable' };
            }
            const selection = payload && payload.gameStartPayload && payload.gameStartPayload.gameSchema ||
                getSelection();
            return actionWire.decodeSnapshotField(true, selection, payload);
        }

        function encodeRecreate(payload) {
            const enabled = isRecreateWireEnabled();
            if (!enabled) return { ok: true, value: payload };
            if (!recreateWire || typeof recreateWire.encode !== 'function') {
                return { ok: false, reason: 'recreate-codec-unavailable' };
            }
            return recreateWire.encode(true, payload);
        }

        return Object.freeze({
            isNegotiationEnabled,
            isActionWireEnabled,
            isSnapshotWireEnabled,
            isRecreateWireEnabled,
            capabilities,
            acceptsSelection,
            encodeAction,
            decodeAction,
            decodeSnapshot,
            encodeRecreate,
        });
    }

    return Object.freeze({ create, createSelectionController });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = OnlineSchemaTransport;
if (typeof window !== 'undefined') Object.assign(window, { OnlineSchemaTransport });
if (typeof globalThis !== 'undefined') globalThis.OnlineSchemaTransport = OnlineSchemaTransport;
