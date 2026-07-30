'use strict';

const ClientStorageApi = typeof module !== 'undefined' && module.exports
    ? require('./clientStorage')
    : globalThis.ClientStorage;

const AppShellStorage = Object.freeze({
    createFacade(options = {}) {
        return ClientStorageApi.createFacade(Object.assign({}, options, { missingSetResult: true }));
    },
});

if (typeof module !== 'undefined' && module.exports) module.exports = AppShellStorage;
if (typeof window !== 'undefined') window.AppShellStorage = AppShellStorage;
if (typeof globalThis !== 'undefined') globalThis.AppShellStorage = AppShellStorage;
