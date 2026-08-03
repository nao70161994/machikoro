'use strict';

const { execSync: defaultExecSync } = require('child_process');
const defaultPath = require('path');

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

function resolveBuildHash(options = {}) {
    const env = options.env || process.env;
    if (env.BUILD_HASH) return env.BUILD_HASH;
    const execSync = typeof options.execSync === 'function'
        ? options.execSync
        : defaultExecSync;
    const now = typeof options.now === 'function' ? options.now : Date.now;
    try {
        return execSync('git rev-parse --short HEAD', { timeout: 3000 })
            .toString()
            .trim();
    } catch (_) {
        return now().toString(36);
    }
}

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
    if (options.gameSchemaRecreateWireEnabled === true) {
        scripts += '\n    <script>window.MACHIKORO_GAME_SCHEMA_RECREATE_WIRE_ENABLED=true;</script>';
    }
    if (options.localSaveSchemaWriteEnabled === true) {
        scripts += '\n    <script>window.MACHIKORO_LOCAL_SAVE_SCHEMA_WRITE_ENABLED=true;</script>';
    }
    if (options.onlineReconnectEventAuthorityEnabled === true) {
        scripts += '\n    <script>window.MACHIKORO_ONLINE_RECONNECT_EVENT_AUTHORITY_ENABLED=true;</script>';
    }
    return String(content).replace('</head>', `    ${scripts}\n</head>`);
}

function isPublicRootFile(fileName) {
    return PUBLIC_ROOT_FILES.has(String(fileName || '').replace(/^\/+/, ''));
}

function registerStaticContentRoutes(options = {}) {
    const app = options.app;
    const staticMiddleware = options.staticMiddleware;
    const rootDirectory = options.rootDirectory || '.';
    const pathModule = options.pathModule || defaultPath;
    const rootFiles = options.rootFiles || PUBLIC_ROOT_FILES;
    const staticDirs = options.staticDirs || PUBLIC_STATIC_DIRS;
    const sendIndex = options.sendIndex;
    const sendRootFile = options.sendRootFile;

    app.get('/', sendIndex);
    app.get('/index.html', sendIndex);
    app.get(Array.from(rootFiles).map(fileName => '/' + fileName), sendRootFile);
    for (const entry of staticDirs) {
        app.use(entry.route, staticMiddleware(pathModule.join(rootDirectory, entry.directory)));
    }
}

function makeStaticAssetHandlers(options = {}) {
    const indexContent = String(options.indexContent || '');
    const rootDirectory = options.rootDirectory || '.';
    const pathModule = options.pathModule || defaultPath;
    const isAllowedRootFile = typeof options.isPublicRootFile === 'function'
        ? options.isPublicRootFile
        : isPublicRootFile;

    function sendIndexWithBuildHash(req, res) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.send(indexContent);
    }

    function sendPublicRootFile(req, res, next) {
        const fileName = String(req.path || '').replace(/^\/+/, '');
        if (!isAllowedRootFile(fileName)) return next();
        res.sendFile(pathModule.join(rootDirectory, fileName));
    }

    return Object.freeze({
        sendIndexWithBuildHash,
        sendPublicRootFile,
    });
}

module.exports = {
    PUBLIC_ROOT_FILES,
    PUBLIC_STATIC_DIRS,
    resolveBuildHash,
    injectServiceWorkerBuildHash,
    injectIndexBuildHash,
    isPublicRootFile,
    makeStaticAssetHandlers,
    registerStaticContentRoutes,
};
