'use strict';

const UiModalRuntime = (() => {
    const TRACE_MODAL_IDS = Object.freeze(['rulesModal', 'cardSelectModal']);

    function createRuntime(dependencies = {}) {
        const requiredObjects = [
            'closePlan', 'controller', 'domEffects', 'openPlan', 'policy',
        ];
        for (const name of requiredObjects) {
            if (!dependencies[name]) {
                throw new TypeError(`ui modal runtime dependency is required: ${name}`);
            }
        }
        const requiredFunctions = [
            'appendViolation', 'buildSnapshot', 'canRenderPending', 'canTrace',
            'getCloseHandler', 'getDocument', 'isCloseAuthorityEnabled',
            'isOpenAuthorityEnabled', 'nowIso', 'recordTrace', 'renderPending', 'warn',
        ];
        for (const name of requiredFunctions) {
            if (typeof dependencies[name] !== 'function') {
                throw new TypeError(`ui modal runtime effect is required: ${name}`);
            }
        }

        function recordViolation(type, details = {}) {
            const entry = {
                type,
                timestamp: dependencies.nowIso(),
                activeModalId: dependencies.controller.getActiveModalId(),
                ...details,
            };
            dependencies.appendViolation(entry);
            try {
                dependencies.recordTrace('modal-policy-violation', entry);
            } catch (_) {}
            dependencies.warn('[machikoro-modal-policy]', type, entry);
            return entry;
        }

        function visibleBlockingIds() {
            const currentDocument = dependencies.getDocument();
            if (!currentDocument ||
                    typeof currentDocument.getElementById !== 'function') return [];
            return dependencies.policy.visibleBlockingIds(
                id => dependencies.domEffects.isModalVisible(id)
            );
        }

        function canOpen(id) {
            const decision = dependencies.policy.canOpen(id, {
                activeModalId: dependencies.controller.getActiveModalId(),
                isVisible: modalId => dependencies.domEffects.isModalVisible(modalId),
            });
            if (decision.ok) return true;
            recordViolation(decision.reason, {
                parentModalId: decision.parentId,
                childModalId: decision.childId,
                visibleBlockingModalIds: decision.blockingIds,
            });
            return false;
        }

        function legacyOpenPlan(id) {
            return Object.freeze({ modalId: id });
        }

        function selectOpenPlan(id) {
            return dependencies.openPlan.selectPlan(
                { modalId: id },
                legacyOpenPlan(id),
                { authorityEnabled: dependencies.isOpenAuthorityEnabled() }
            );
        }

        function captureFocus() {
            const currentDocument = dependencies.getDocument();
            if (currentDocument) {
                dependencies.controller.rememberFocus(currentDocument.activeElement);
            }
        }

        function addBodyClass() {
            const currentDocument = dependencies.getDocument();
            if (currentDocument && currentDocument.body &&
                    currentDocument.body.classList) {
                currentDocument.body.classList.add('modal-open');
            }
        }

        function setDialogAttributes(modal) {
            if (!modal || typeof modal.setAttribute !== 'function') return;
            modal.setAttribute('role', modal.getAttribute('role') || 'dialog');
            modal.setAttribute('aria-modal', 'true');
        }

        function runOpenLegacy(modal, id) {
            captureFocus();
            dependencies.controller.setActiveModalId(id);
            addBodyClass();
            dependencies.domEffects.normalizeForOpen(modal);
            setDialogAttributes(modal);
            dependencies.domEffects.focusModal(modal);
            dependencies.domEffects.setAppInert(true);
        }

        function runOpen(modal, id) {
            const selection = selectOpenPlan(id);
            if (selection.source !== 'pure-plan') {
                runOpenLegacy(modal, id);
                return selection;
            }
            dependencies.openPlan.execute(selection.plan, {
                captureFocus,
                setActiveModal(modalId) {
                    dependencies.controller.setActiveModalId(modalId);
                },
                addBodyClass,
                normalizeVisualState() {
                    dependencies.domEffects.normalizeForOpen(modal);
                },
                setDialogAttributes() { setDialogAttributes(modal); },
                focusModal() { dependencies.domEffects.focusModal(modal); },
                setAppInert() { dependencies.domEffects.setAppInert(true); },
            });
            return selection;
        }

        function open(id) {
            const currentDocument = dependencies.getDocument();
            const modal = currentDocument &&
                    typeof currentDocument.getElementById === 'function'
                ? currentDocument.getElementById(id)
                : null;
            if (!modal || !canOpen(id)) return false;
            runOpen(modal, id);
            return true;
        }

        function closePlanInput(id, options, blockingIds, nextActiveModalId) {
            const lastFocus = dependencies.controller.getLastFocus();
            return {
                modalId: id,
                nextActiveModalId,
                visibleBlockingIds: blockingIds,
                restoreFocus: options.restoreFocus,
                hasRestorableFocus: !!(lastFocus && typeof lastFocus.focus === 'function'),
                canRenderPending: dependencies.canRenderPending(),
                canTrace: dependencies.canTrace(),
            };
        }

        function legacyClosePlan(id, options, blockingIds, nextActiveModalId) {
            const shouldUnlockApp = blockingIds.length <= 0;
            const lastFocus = dependencies.controller.getLastFocus();
            return Object.freeze({
                modalId: id,
                nextActiveModalId: shouldUnlockApp ? null : (nextActiveModalId || null),
                visibleBlockingIds: Object.freeze(blockingIds.slice()),
                shouldUnlockApp,
                shouldRenderPending: shouldUnlockApp && id !== 'pendingModal' &&
                    dependencies.canRenderPending(),
                shouldRestoreFocus: options.restoreFocus !== false &&
                    !!lastFocus && typeof lastFocus.focus === 'function',
                shouldTrace: TRACE_MODAL_IDS.includes(id) && dependencies.canTrace(),
            });
        }

        function selectClosePlan(id, options, blockingIds, nextActiveModalId) {
            return dependencies.closePlan.selectPlan(
                closePlanInput(id, options, blockingIds, nextActiveModalId),
                legacyClosePlan(id, options, blockingIds, nextActiveModalId),
                { authorityEnabled: dependencies.isCloseAuthorityEnabled() }
            );
        }

        function renderPendingSafely() {
            try { dependencies.renderPending(); } catch (_) {}
        }

        function recordCloseTrace(id, beforeSnapshot) {
            dependencies.recordTrace('modal-close-ui-state', {
                modalId: id,
                before: beforeSnapshot,
                after: dependencies.buildSnapshot('modal-close-after-' + id),
            });
        }

        function runCloseLegacy(id, options, beforeSnapshot, blockingIds,
                nextActiveModalId) {
            dependencies.controller.setActiveModalId(nextActiveModalId);
            if (blockingIds.length <= 0) {
                dependencies.controller.setActiveModalId(null);
                dependencies.domEffects.setAppInert(false);
                dependencies.domEffects.clearOrphanLocks();
                if (id !== 'pendingModal' && dependencies.canRenderPending()) {
                    renderPendingSafely();
                }
            }
            const lastFocus = dependencies.controller.getLastFocus();
            if (options.restoreFocus !== false && lastFocus &&
                    typeof lastFocus.focus === 'function') {
                lastFocus.focus();
            }
            dependencies.controller.clearLastFocus();
            if (TRACE_MODAL_IDS.includes(id) && dependencies.canTrace()) {
                recordCloseTrace(id, beforeSnapshot);
            }
        }

        function runClose(id, options, beforeSnapshot, blockingIds, nextActiveModalId) {
            const selection = selectClosePlan(
                id,
                options,
                blockingIds,
                nextActiveModalId
            );
            if (selection.source !== 'pure-plan') {
                runCloseLegacy(id, options, beforeSnapshot, blockingIds, nextActiveModalId);
                return selection;
            }
            dependencies.closePlan.execute(selection.plan, {
                setActiveModal(plan) {
                    dependencies.controller.setActiveModalId(plan.nextActiveModalId);
                },
                restoreAppInert() { dependencies.domEffects.setAppInert(false); },
                clearOrphanLocks() { dependencies.domEffects.clearOrphanLocks(); },
                renderPending: renderPendingSafely,
                restoreFocus() { dependencies.controller.getLastFocus().focus(); },
                clearLastFocus() { dependencies.controller.clearLastFocus(); },
                recordTrace(plan) { recordCloseTrace(plan.modalId, beforeSnapshot); },
            });
            return selection;
        }

        function close(id, options = {}) {
            const beforeSnapshot = dependencies.buildSnapshot('modal-close-before-' + id);
            const currentDocument = dependencies.getDocument();
            const modal = currentDocument &&
                    typeof currentDocument.getElementById === 'function'
                ? currentDocument.getElementById(id)
                : null;
            if (modal) modal.style.display = 'none';
            const blockingIds = visibleBlockingIds();
            const nextActiveModalId = dependencies.policy.activeAfterClose(
                id,
                dependencies.controller.getActiveModalId(),
                blockingIds,
                modalId => dependencies.domEffects.isModalVisible(modalId)
            );
            runClose(id, options, beforeSnapshot, blockingIds, nextActiveModalId);
        }

        function handleKeydown(event) {
            const activeModalId = dependencies.controller.getActiveModalId();
            if (!activeModalId) return;
            const currentDocument = dependencies.getDocument();
            const modal = currentDocument &&
                    typeof currentDocument.getElementById === 'function'
                ? currentDocument.getElementById(activeModalId)
                : null;
            if (!modal || modal.style.display === 'none') return;
            const closeHandler = event.key === 'Escape'
                ? dependencies.getCloseHandler(activeModalId)
                : null;
            const state = {
                active: true,
                visible: true,
                key: event.key,
                hasCloseHandler: !!closeHandler,
            };
            let focusable = [];
            if (event.key === 'Tab') {
                focusable = dependencies.domEffects.focusableElements(modal);
                state.containsActive = typeof modal.contains !== 'function' ||
                    modal.contains(currentDocument.activeElement);
                state.focusableCount = focusable.length;
                state.activeIndex = focusable.indexOf(currentDocument.activeElement);
                state.shiftKey = !!event.shiftKey;
            }
            const action = dependencies.policy.keydownAction(state);
            if (action === 'close') {
                event.preventDefault();
                closeHandler();
                return;
            }
            if (action === 'focus-modal') {
                event.preventDefault();
                dependencies.domEffects.focusModal(modal);
                return;
            }
            if (action === 'focus-last') {
                event.preventDefault();
                focusable[focusable.length - 1].focus();
                return;
            }
            if (action === 'focus-first') {
                event.preventDefault();
                focusable[0].focus();
            }
        }

        return Object.freeze({
            canOpen,
            close,
            closePlanInput,
            handleKeydown,
            legacyClosePlan,
            legacyOpenPlan,
            open,
            recordViolation,
            runClose,
            runCloseLegacy,
            runOpen,
            runOpenLegacy,
            selectClosePlan,
            selectOpenPlan,
            visibleBlockingIds,
        });
    }

    return Object.freeze({ TRACE_MODAL_IDS, createRuntime });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = UiModalRuntime;
if (typeof window !== 'undefined') Object.assign(window, { UiModalRuntime });
if (typeof globalThis !== 'undefined') Object.assign(globalThis, { UiModalRuntime });
