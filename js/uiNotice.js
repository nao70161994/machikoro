let noticeTimer = null;

function hideNotice() {
    const toast = document.getElementById('noticeToast');
    if (noticeTimer) {
        clearTimeout(noticeTimer);
        noticeTimer = null;
    }
    if (toast) toast.style.display = 'none';
}

function showNotice(message) {
    const text = String(message || '');
    const toast = document.getElementById('noticeToast');
    const body = document.getElementById('noticeToastMessage');
    if (!toast || !body) {
        if (typeof alert === 'function') alert(text);
        return;
    }
    body.textContent = text;
    toast.style.display = 'flex';
    if (noticeTimer) clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => {
        toast.style.display = 'none';
        noticeTimer = null;
    }, 4500);
}
