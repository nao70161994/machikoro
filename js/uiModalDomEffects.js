'use strict';

const UiModalDomEffects = (() => {
    const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

    function createRuntime(dependencies = {}) {
        const requiredFunctions = [
            'getDocument', 'getVisibleBlockingIds', 'getWindow', 'recordTrace',
        ];
        for (const name of requiredFunctions) {
            if (typeof dependencies[name] !== 'function') {
                throw new TypeError(`ui modal DOM effect dependency is required: ${name}`);
            }
        }
        if (!dependencies.controller || !dependencies.policy ||
                !Array.isArray(dependencies.inertRootIds)) {
            throw new TypeError('ui modal DOM effect runtime dependencies are required');
        }

        function isVisibleFocusable(element) {
            if (!element || element.disabled || element.hidden ||
                    element.getAttribute('aria-hidden') === 'true') return false;
            if (typeof element.closest === 'function' &&
                    element.closest('[hidden], [aria-hidden="true"]')) return false;
            const currentWindow = dependencies.getWindow();
            if (currentWindow && typeof currentWindow.getComputedStyle === 'function') {
                const style = currentWindow.getComputedStyle(element);
                if (style && (style.display === 'none' || style.visibility === 'hidden')) {
                    return false;
                }
            }
            return true;
        }

        function focusableElements(root) {
            if (!root || typeof root.querySelectorAll !== 'function') return [];
            return Array.from(root.querySelectorAll(FOCUSABLE_SELECTOR))
                .filter(isVisibleFocusable);
        }

        function focusModal(modal) {
            const focusable = focusableElements(modal);
            const target = focusable[0] || modal;
            if (target && typeof target.focus === 'function') target.focus();
        }

        function isModalVisible(id) {
            const currentDocument = dependencies.getDocument();
            if (!id || !currentDocument ||
                    typeof currentDocument.getElementById !== 'function') return false;
            const modal = currentDocument.getElementById(id);
            const inline = modal && modal.style || {};
            const currentWindow = dependencies.getWindow();
            const computed = currentWindow &&
                    typeof currentWindow.getComputedStyle === 'function' && modal
                ? currentWindow.getComputedStyle(modal)
                : null;
            return dependencies.policy.isVisibleState({
                exists: !!modal,
                hidden: !!(modal && modal.hidden),
                inline: {
                    display: inline.display || '',
                    visibility: inline.visibility || '',
                    opacity: inline.opacity || '',
                    pointerEvents: inline.pointerEvents || '',
                },
                computed,
            });
        }

        function normalizeForOpen(modal) {
            if (!modal || !modal.style) return;
            modal.style.display = 'flex';
            modal.style.visibility = 'visible';
            modal.style.opacity = '1';
            modal.style.pointerEvents = 'auto';
            modal.style.transform = '';
            if (typeof modal.querySelector !== 'function') return;
            const content = modal.querySelector('.modal-content');
            if (!content || !content.style) return;
            content.style.visibility = 'visible';
            content.style.opacity = '1';
            content.style.pointerEvents = 'auto';
        }

        function setAppInert(enabled) {
            const currentDocument = dependencies.getDocument();
            if (!currentDocument ||
                    typeof currentDocument.getElementById !== 'function') return;
            if (!enabled) {
                for (const entry of dependencies.controller.getInertRestore()) {
                    const element = entry && entry.el;
                    if (!element) continue;
                    element.inert = entry.hadInert ? entry.inert : false;
                    if (entry.ariaHidden === null) {
                        element.removeAttribute && element.removeAttribute('aria-hidden');
                    } else {
                        element.setAttribute &&
                            element.setAttribute('aria-hidden', entry.ariaHidden);
                    }
                    if (element.style) {
                        element.style.pointerEvents = entry.pointerEvents || '';
                    }
                }
                dependencies.controller.clearInertRestore();
                return;
            }
            if (dependencies.controller.getInertRestore().length > 0) return;
            const restore = dependencies.inertRootIds
                .map(rootId => currentDocument.getElementById(rootId))
                .filter(Boolean)
                .map(element => ({
                    el: element,
                    hadInert: Object.prototype.hasOwnProperty.call(element, 'inert'),
                    inert: element.inert,
                    ariaHidden: element.getAttribute
                        ? element.getAttribute('aria-hidden')
                        : null,
                    pointerEvents: element.style
                        ? element.style.pointerEvents || ''
                        : '',
                }));
            dependencies.controller.setInertRestore(restore);
            for (const { el } of restore) {
                el.inert = true;
                if (el.setAttribute) el.setAttribute('aria-hidden', 'true');
                if (el.style) el.style.pointerEvents = 'none';
            }
        }

        function clearOrphanLocks() {
            if (dependencies.getVisibleBlockingIds().length > 0) return false;
            const currentDocument = dependencies.getDocument();
            if (!currentDocument ||
                    typeof currentDocument.getElementById !== 'function') return false;
            let changed = false;
            for (const rootId of dependencies.inertRootIds) {
                const element = currentDocument.getElementById(rootId);
                if (!element) continue;
                if (element.inert) {
                    element.inert = false;
                    changed = true;
                }
                if (element.getAttribute &&
                        element.getAttribute('aria-hidden') === 'true') {
                    element.removeAttribute('aria-hidden');
                    changed = true;
                }
                if (element.style && element.style.pointerEvents === 'none') {
                    element.style.pointerEvents = '';
                    changed = true;
                }
            }
            if (currentDocument.body && currentDocument.body.classList &&
                    currentDocument.body.classList.contains('modal-open')) {
                currentDocument.body.classList.remove('modal-open');
                changed = true;
            }
            if (changed) {
                dependencies.recordTrace('modal-close-orphan-lock-cleared', {
                    visibleBlockingModalIds: dependencies.getVisibleBlockingIds(),
                });
            }
            return changed;
        }

        function resetRuntimeState() {
            setAppInert(false);
            return dependencies.controller.reset();
        }

        return Object.freeze({
            clearOrphanLocks,
            focusModal,
            focusableElements,
            isModalVisible,
            isVisibleFocusable,
            normalizeForOpen,
            setAppInert,
            resetRuntimeState,
        });
    }

    return Object.freeze({ FOCUSABLE_SELECTOR, createRuntime });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = UiModalDomEffects;
if (typeof window !== 'undefined') Object.assign(window, { UiModalDomEffects });
if (typeof globalThis !== 'undefined') Object.assign(globalThis, { UiModalDomEffects });
