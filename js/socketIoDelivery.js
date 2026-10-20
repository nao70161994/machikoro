'use strict';

const SocketIoDelivery = (() => {
    const pendingLoads = new WeakMap();

    function load(options = {}) {
        const documentRef = options.document;
        const getIo = typeof options.getIo === 'function' ? options.getIo : () => undefined;
        if (typeof getIo() === 'function') return Promise.resolve(true);
        if (!documentRef || typeof documentRef.createElement !== 'function') {
            return Promise.resolve(false);
        }
        const parent = documentRef.head || documentRef.documentElement;
        if (!parent || typeof parent.appendChild !== 'function') return Promise.resolve(false);
        if (pendingLoads.has(documentRef)) return pendingLoads.get(documentRef);
        /** @type {(success: boolean) => void} */
        let finish = () => {};
        const promise = new Promise(resolve => { finish = resolve; });
        pendingLoads.set(documentRef, promise);
        const script = documentRef.createElement('script');
        let timer = null;
        let settled = false;
        const complete = success => {
            if (settled) return;
            settled = true;
            if (timer !== null) clearTimeout(timer);
            script.onload = null;
            script.onerror = null;
            if (!success && typeof script.remove === 'function') script.remove();
            pendingLoads.delete(documentRef);
            finish(success);
        };
        try {
            script.async = true;
            script.src = String(options.src || '/socket.io/socket.io.js');
            script.onload = () => complete(typeof getIo() === 'function');
            script.onerror = () => complete(false);
            timer = setTimeout(() => complete(false), 8000);
            parent.appendChild(script);
        } catch (_) {
            complete(false);
        }
        return promise;
    }

    return Object.freeze({ load });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SocketIoDelivery;
if (typeof window !== 'undefined') window.SocketIoDelivery = SocketIoDelivery;
if (typeof globalThis !== 'undefined') globalThis.SocketIoDelivery = SocketIoDelivery;
