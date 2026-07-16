'use strict';

const PUBLIC_ROOT_FILES = Object.freeze(new Set([
    'style.css',
    'manifest.json',
    'manifest.webmanifest',
    'sw.js',
    'privacy.html',
    'rules.html',
    'how-to-play.html',
    'cards.html',
    'ai-cpu.html',
]));

function injectServiceWorkerBuildHash(content, buildHash) {
    return String(content).replace(/'machikoro-v[^']*'/, `'machikoro-${buildHash}'`);
}

function injectIndexBuildHash(content, buildHash) {
    const script = `<script>window.MACHIKORO_CLIENT_VERSION=${JSON.stringify(buildHash)};</script>`;
    return String(content).replace('</head>', `    ${script}\n</head>`);
}

function isPublicRootFile(fileName) {
    return PUBLIC_ROOT_FILES.has(String(fileName || '').replace(/^\/+/, ''));
}

module.exports = {
    PUBLIC_ROOT_FILES,
    injectServiceWorkerBuildHash,
    injectIndexBuildHash,
    isPublicRootFile,
};
