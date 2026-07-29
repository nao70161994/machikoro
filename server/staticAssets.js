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

const PUBLIC_STATIC_DIRS = Object.freeze([
    Object.freeze({ route: '/js', directory: 'js' }),
    Object.freeze({ route: '/icons', directory: 'icons' }),
    Object.freeze({ route: '/models/rl_model/portfolio', directory: 'models/rl_model/portfolio' }),
]);

function injectServiceWorkerBuildHash(content, buildHash) {
    return String(content).replace(/'machikoro-v[^']*'/, `'machikoro-${buildHash}'`);
}

function injectIndexBuildHash(content, buildHash, options = {}) {
    const script = `<script>window.MACHIKORO_CLIENT_VERSION=${JSON.stringify(buildHash)};</script>`;
    let scripts = options.gameSchemaNegotiationEnabled === true
        ? script + '\n    <script>window.MACHIKORO_GAME_SCHEMA_NEGOTIATION_ENABLED=true;</script>'
        : script;
    if (options.gameSchemaWireEnabled === true) {
        scripts += '\n    <script>window.MACHIKORO_GAME_SCHEMA_WIRE_ENABLED=true;</script>';
    }
    if (options.gameSchemaSnapshotWireEnabled === true) {
        scripts += '\n    <script>window.MACHIKORO_GAME_SCHEMA_SNAPSHOT_WIRE_ENABLED=true;</script>';
    }
    return String(content).replace('</head>', `    ${scripts}\n</head>`);
}

function isPublicRootFile(fileName) {
    return PUBLIC_ROOT_FILES.has(String(fileName || '').replace(/^\/+/, ''));
}

module.exports = {
    PUBLIC_ROOT_FILES,
    PUBLIC_STATIC_DIRS,
    injectServiceWorkerBuildHash,
    injectIndexBuildHash,
    isPublicRootFile,
};
