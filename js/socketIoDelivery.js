'use strict';

const SocketIoDelivery = (() => {
    function load(options = {}) {
        const documentRef = options.document;
        const getIo = typeof options.getIo === 'function' ? options.getIo : () => undefined;
        if (typeof getIo() === 'function') return Promise.resolve(true);
        if (!documentRef || typeof documentRef.createElement !== 'function') {
            return Promise.resolve(false);
        }
        const parent = documentRef.head || documentRef.documentElement;
        if (!parent || typeof parent.appendChild !== 'function') return Promise.resolve(false);
        return new Promise(resolve => {
            const script = documentRef.createElement('script');
            script.async = true;
            script.src = String(options.src || '/socket.io/socket.io.js');
            script.onload = () => resolve(typeof getIo() === 'function');
            script.onerror = () => resolve(false);
            parent.appendChild(script);
        });
    }

    return Object.freeze({ load });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SocketIoDelivery;
if (typeof window !== 'undefined') window.SocketIoDelivery = SocketIoDelivery;
if (typeof globalThis !== 'undefined') globalThis.SocketIoDelivery = SocketIoDelivery;
