'use strict';

const UI_MODAL_INERT_ROOT_IDS = Object.freeze([
    'titleScreen',
    'gameScreen',
    'pwaUpdateBanner',
    'pwaInstallBanner',
]);
const UI_MODAL_POLICY_REGISTRY = Object.freeze({
    rulesModal: Object.freeze({ blocking: true }),
    cardSelectModal: Object.freeze({ blocking: true }),
    cardDetailModal: Object.freeze({ blocking: true }),
    confirmModal: Object.freeze({ blocking: true }),
    pendingModal: Object.freeze({ blocking: false, gameCritical: true }),
    noticeToast: Object.freeze({ blocking: false }),
    pwaUpdateBanner: Object.freeze({ blocking: false }),
    pwaInstallBanner: Object.freeze({ blocking: false }),
});
const UI_MODAL_STACK_EXCEPTION_REGISTRY = Object.freeze({});
const UI_DEFAULT_BLOCKING_MODAL_POLICY = Object.freeze({ blocking: true });

function policyFor(id) {
    return UI_MODAL_POLICY_REGISTRY[id] || UI_DEFAULT_BLOCKING_MODAL_POLICY;
}

function stackExceptionKey(parentId, childId) {
    return (parentId || '') + '->' + (childId || '');
}

function hasStackException(parentId, childId) {
    return !!UI_MODAL_STACK_EXCEPTION_REGISTRY[stackExceptionKey(parentId, childId)];
}

function visibleBlockingIds(isVisible) {
    if (typeof isVisible !== 'function') return [];
    return Object.keys(UI_MODAL_POLICY_REGISTRY)
        .filter(id => policyFor(id).blocking && isVisible(id));
}

function canOpen(id, options = {}) {
    const policy = policyFor(id);
    if (!policy.blocking) return Object.freeze({ ok: true, parentId: null, blockingIds: [] });
    const isVisible = typeof options.isVisible === 'function' ? options.isVisible : () => false;
    const blockingIds = visibleBlockingIds(isVisible).filter(modalId => modalId !== id);
    const activeId = options.activeModalId;
    const parentId = activeId && activeId !== id && isVisible(activeId)
        ? activeId
        : blockingIds[0] || null;
    if (!parentId || !policyFor(parentId).blocking || hasStackException(parentId, id)) {
        return Object.freeze({ ok: true, parentId, blockingIds: Object.freeze(blockingIds) });
    }
    return Object.freeze({
        ok: false,
        reason: 'nested-blocking-modal-denied',
        parentId,
        childId: id,
        blockingIds: Object.freeze(blockingIds),
    });
}

function activeAfterClose(closedId, activeId, blockingIds, isVisible) {
    const visibleIds = Array.isArray(blockingIds) ? blockingIds : [];
    const activeStillVisible = activeId && activeId !== closedId &&
        typeof isVisible === 'function' && isVisible(activeId);
    return activeStillVisible ? activeId : visibleIds[0] || null;
}

const UiModalPolicy = Object.freeze({
    inertRootIds: UI_MODAL_INERT_ROOT_IDS,
    registry: UI_MODAL_POLICY_REGISTRY,
    exceptions: UI_MODAL_STACK_EXCEPTION_REGISTRY,
    policyFor,
    stackExceptionKey,
    hasStackException,
    visibleBlockingIds,
    canOpen,
    activeAfterClose,
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = UiModalPolicy;
}
if (typeof window !== 'undefined') window.UiModalPolicy = UiModalPolicy;
if (typeof globalThis !== 'undefined') globalThis.UiModalPolicy = UiModalPolicy;
