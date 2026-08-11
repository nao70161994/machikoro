let noticeTimer = null;

function setNoticeAnnouncement(toast, enabled) {
    if (!toast || typeof toast.setAttribute !== 'function') return false;
    toast.setAttribute('aria-live', enabled === false ? 'off' : 'polite');
    return true;
}

function noticeContainsActiveElement(toast) {
    if (!toast || !document || !document.activeElement) return false;
    const activeElement = document.activeElement;
    if (activeElement === toast) return true;
    if (typeof toast.contains === 'function') return toast.contains(activeElement);
    let current = activeElement.parentElement;
    while (current) {
        if (current === toast) return true;
        current = current.parentElement;
    }
    return false;
}

function hideNoticeSurface(toast) {
    if (!toast) return;
    const restoreScreenFocus = noticeContainsActiveElement(toast);
    toast.style.display = 'none';
    setNoticeAnnouncement(toast, true);
    const screenFocus = typeof globalThis !== 'undefined' ? globalThis.UiScreenFocus : null;
    if (restoreScreenFocus && screenFocus &&
            typeof screenFocus.ensureCurrentScreenFocus === 'function') {
        screenFocus.ensureCurrentScreenFocus(document);
    }
}

function hideNotice() {
    const toast = document.getElementById('noticeToast');
    if (noticeTimer) {
        clearTimeout(noticeTimer);
        noticeTimer = null;
    }
    hideNoticeSurface(toast);
}

function showNotice(message, options = {}) {
    const text = String(message || '');
    const toast = document.getElementById('noticeToast');
    const body = document.getElementById('noticeToastMessage');
    if (!toast || !body) {
        if (typeof alert === 'function') alert(text);
        return;
    }
    setNoticeAnnouncement(toast, options.announce !== false);
    body.textContent = text;
    toast.style.display = 'flex';
    if (noticeTimer) clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => {
        hideNoticeSurface(toast);
        noticeTimer = null;
    }, 4500);
}
