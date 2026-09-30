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

function buildIndexBootstrapScripts(buildHash, options = {}) {
    const jsonBuildHash = JSON.stringify(String(buildHash))
        .replace(/</g, '\\u003c')
        .replace(/>/g, '\\u003e')
        .replace(/&/g, '\\u0026')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');
    const scripts = [`window.MACHIKORO_CLIENT_VERSION=${jsonBuildHash};`];
    if (options.gameSchemaNegotiationEnabled === true) {
        scripts.push('window.MACHIKORO_GAME_SCHEMA_NEGOTIATION_ENABLED=true;');
    }
    if (options.gameSchemaWireEnabled === true) {
        scripts.push('window.MACHIKORO_GAME_SCHEMA_WIRE_ENABLED=true;');
    }
    if (options.gameSchemaSnapshotWireEnabled === true) {
        scripts.push('window.MACHIKORO_GAME_SCHEMA_SNAPSHOT_WIRE_ENABLED=true;');
    }
    if (options.gameSchemaRecreateWireEnabled === true) {
        scripts.push('window.MACHIKORO_GAME_SCHEMA_RECREATE_WIRE_ENABLED=true;');
    }
    if (options.localSaveSchemaWriteEnabled === true) {
        scripts.push('window.MACHIKORO_LOCAL_SAVE_SCHEMA_WRITE_ENABLED=true;');
    }
    if (options.onlineReconnectEventAuthorityEnabled === true) {
        scripts.push('window.MACHIKORO_ONLINE_RECONNECT_EVENT_AUTHORITY_ENABLED=true;');
    }
    return Object.freeze(scripts);
}

function injectIndexBuildHash(content, buildHash, options = {}) {
    const scripts = buildIndexBootstrapScripts(buildHash, options)
        .map(script => `<script>${script}</script>`)
        .join('\n    ');
    return String(content).replace('</head>', `    ${scripts}\n</head>`);
}

function isPublicRootFile(fileName) {
    return PUBLIC_ROOT_FILES.has(String(fileName || '').replace(/^\/+/, ''));
}

function registerStaticMetadataRoutes(options = {}) {
    const app = options.app;
    const assetLinks = options.assetLinks;
    const serviceWorkerContent = options.serviceWorkerContent;
    const buildHash = options.buildHash;

    app.get('/.well-known/assetlinks.json', (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.json(assetLinks);
    });
    app.get('/sw.js', (req, res) => {
        res.setHeader('Content-Type', 'application/javascript');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.send(serviceWorkerContent);
    });
    app.get('/api/version', (req, res) => {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.json({ hash: buildHash });
    });
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
    buildIndexBootstrapScripts,
    isPublicRootFile,
    makeStaticAssetHandlers,
    registerStaticMetadataRoutes,
    registerStaticContentRoutes,
};
