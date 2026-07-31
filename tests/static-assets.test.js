const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
    PUBLIC_ROOT_FILES,
    PUBLIC_STATIC_DIRS,
    injectServiceWorkerBuildHash,
    injectIndexBuildHash,
    isPublicRootFile,
} = require('../server/staticAssets');
const { runTest } = require('./helpers/test-utils');

const repoRoot = path.join(__dirname, '..');

runTest('static assets は公開root allowlistを固定する', () => {
    assert.deepStrictEqual(Array.from(PUBLIC_ROOT_FILES), [
        'style.css',
        'manifest.json',
        'manifest.webmanifest',
        'sw.js',
        'privacy.html',
        'rules.html',
        'how-to-play.html',
        'cards.html',
        'ai-cpu.html',
    ]);
    assert.strictEqual(isPublicRootFile('/manifest.json'), true);
    assert.strictEqual(isPublicRootFile('server.js'), false);
    assert.strictEqual(isPublicRootFile('../style.css'), false);
});

runTest('static assets は公開directory routeとindexのlocal asset参照を同期する', () => {
    assert.deepStrictEqual(PUBLIC_STATIC_DIRS, [
        { route: '/js', directory: 'js' },
        { route: '/icons', directory: 'icons' },
        { route: '/models/rl_model/portfolio', directory: 'models/rl_model/portfolio' },
    ]);
    assert.ok(Object.isFrozen(PUBLIC_STATIC_DIRS));
    for (const entry of PUBLIC_STATIC_DIRS) {
        assert.ok(Object.isFrozen(entry), `${entry.route} entry must be frozen`);
        assert.ok(fs.statSync(path.join(repoRoot, entry.directory)).isDirectory());
    }
    for (const fileName of PUBLIC_ROOT_FILES) {
        assert.ok(fs.statSync(path.join(repoRoot, fileName)).isFile(), `missing public root file: ${fileName}`);
    }

    const indexSource = fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf8');
    const localAssetRefs = Array.from(indexSource.matchAll(/\b(?:src|href)="([^"]+)"/g), match => match[1])
        .filter(ref => !/^https?:\/\//.test(ref))
        .filter(ref => ref !== '/socket.io/socket.io.js');

    for (const ref of localAssetRefs) {
        const requestPath = ref.split(/[?#]/, 1)[0];
        const rootFile = requestPath.replace(/^\/+/, '');
        const routePath = '/' + rootFile;
        if (isPublicRootFile(rootFile)) {
            assert.ok(fs.statSync(path.join(repoRoot, rootFile)).isFile(), `missing index asset: ${ref}`);
            continue;
        }

        const staticEntry = PUBLIC_STATIC_DIRS.find(entry =>
            routePath === entry.route || routePath.startsWith(entry.route + '/')
        );
        assert.ok(staticEntry, `index asset is not served by an allowlisted route: ${ref}`);
        const suffix = routePath.slice(staticEntry.route.length).replace(/^\/+/, '');
        assert.ok(fs.statSync(path.join(repoRoot, staticEntry.directory, suffix)).isFile(), `missing index asset: ${ref}`);
    }
});

runTest('static assets はSW cache versionだけをbuild hashへ置換する', () => {
    const source = "const CACHE_NAME = 'machikoro-v123';\nconst OTHER = 'keep';";

    assert.strictEqual(
        injectServiceWorkerBuildHash(source, 'abc123'),
        "const CACHE_NAME = 'machikoro-abc123';\nconst OTHER = 'keep';"
    );
});

runTest('static assets はclient version scriptをhead末尾へ安全に注入する', () => {
    const injected = injectIndexBuildHash('<html><head></head><body></body></html>', 'a"</script>');

    assert.ok(injected.includes('window.MACHIKORO_CLIENT_VERSION="a\\\"</script>";'));
    assert.ok(injected.indexOf('window.MACHIKORO_CLIENT_VERSION') < injected.indexOf('</head>'));
});

runTest('static assets はschema negotiation flagを明示有効時だけ注入する', () => {
    const source = '<html><head></head><body></body></html>';
    const disabled = injectIndexBuildHash(source, 'build-1');
    const enabled = injectIndexBuildHash(source, 'build-1', { gameSchemaNegotiationEnabled: true });
    const wireEnabled = injectIndexBuildHash(source, 'build-1', {
        gameSchemaNegotiationEnabled: true,
        gameSchemaWireEnabled: true,
    });
    const snapshotWireEnabled = injectIndexBuildHash(source, 'build-1', {
        gameSchemaNegotiationEnabled: true,
        gameSchemaSnapshotWireEnabled: true,
    });
    const recreateWireEnabled = injectIndexBuildHash(source, 'build-1', {
        gameSchemaRecreateWireEnabled: true,
    });
    const localSaveEnabled = injectIndexBuildHash(source, 'build-1', {
        localSaveSchemaWriteEnabled: true,
    });
    const reconnectAuthorityEnabled = injectIndexBuildHash(source, 'build-1', {
        onlineReconnectEventAuthorityEnabled: true,
    });
    assert.ok(!disabled.includes('MACHIKORO_GAME_SCHEMA_NEGOTIATION_ENABLED'));
    assert.ok(!disabled.includes('MACHIKORO_GAME_SCHEMA_WIRE_ENABLED'));
    assert.ok(!disabled.includes('MACHIKORO_GAME_SCHEMA_SNAPSHOT_WIRE_ENABLED'));
    assert.ok(!disabled.includes('MACHIKORO_GAME_SCHEMA_RECREATE_WIRE_ENABLED'));
    assert.ok(!disabled.includes('MACHIKORO_LOCAL_SAVE_SCHEMA_WRITE_ENABLED'));
    assert.ok(!disabled.includes('MACHIKORO_ONLINE_RECONNECT_EVENT_AUTHORITY_ENABLED'));
    assert.ok(!disabled.includes('MACHIKORO_ONLINE_RECONNECT_EFFECT_AUTHORITY_ENABLED'));
    assert.ok(!disabled.includes('MACHIKORO_ONLINE_RECONNECT_STATUS_EFFECT_AUTHORITY_ENABLED'));
    assert.ok(!disabled.includes('MACHIKORO_ONLINE_RECONNECT_TIMER_AUTHORITY_ENABLED'));
    assert.ok(!disabled.includes('MACHIKORO_ONLINE_RECONNECT_CALLBACK_AUTHORITY_ENABLED'));
    assert.ok(!disabled.includes('MACHIKORO_ONLINE_RECONNECT_QUEUE_PLAN_AUTHORITY_ENABLED'));
    assert.ok(!disabled.includes('MACHIKORO_ONLINE_RECONNECT_QUEUE_EFFECT_AUTHORITY_ENABLED'));
    assert.ok(!disabled.includes('MACHIKORO_ONLINE_RESTORE_ABORT_PLAN_AUTHORITY_ENABLED'));
    assert.ok(!disabled.includes('MACHIKORO_ONLINE_RESTORE_ABORT_EFFECT_AUTHORITY_ENABLED'));
    assert.ok(!disabled.includes('MACHIKORO_ONLINE_ACTION_TIMEOUT_PLAN_AUTHORITY_ENABLED'));
    assert.ok(!disabled.includes('MACHIKORO_ONLINE_ACTION_TIMEOUT_EFFECT_AUTHORITY_ENABLED'));
    assert.ok(!disabled.includes('MACHIKORO_ONLINE_GAME_ACTION_PLAN_AUTHORITY_ENABLED'));
    assert.ok(!disabled.includes('MACHIKORO_ONLINE_ACTION_ACCEPTED_PLAN_AUTHORITY_ENABLED'));
    assert.ok(!disabled.includes('MACHIKORO_ONLINE_GAME_ACTION_DECODE_EFFECT_AUTHORITY_ENABLED'));
    assert.ok(!disabled.includes('MACHIKORO_ONLINE_ACTION_ACCEPTED_DECODE_EFFECT_AUTHORITY_ENABLED'));
    assert.ok(!disabled.includes('MACHIKORO_ONLINE_GAME_ACTION_APPLY_EFFECT_AUTHORITY_ENABLED'));
    assert.ok(!disabled.includes('MACHIKORO_ONLINE_ACTION_ACCEPTED_APPLY_EFFECT_AUTHORITY_ENABLED'));
    assert.ok(enabled.includes('window.MACHIKORO_GAME_SCHEMA_NEGOTIATION_ENABLED=true;'));
    assert.ok(!enabled.includes('MACHIKORO_GAME_SCHEMA_WIRE_ENABLED'));
    assert.ok(wireEnabled.includes('window.MACHIKORO_GAME_SCHEMA_WIRE_ENABLED=true;'));
    assert.ok(snapshotWireEnabled.includes(
        'window.MACHIKORO_GAME_SCHEMA_SNAPSHOT_WIRE_ENABLED=true;'
    ));
    assert.ok(recreateWireEnabled.includes(
        'window.MACHIKORO_GAME_SCHEMA_RECREATE_WIRE_ENABLED=true;'
    ));
    assert.ok(localSaveEnabled.includes(
        'window.MACHIKORO_LOCAL_SAVE_SCHEMA_WRITE_ENABLED=true;'
    ));
    assert.ok(reconnectAuthorityEnabled.includes(
        'window.MACHIKORO_ONLINE_RECONNECT_EVENT_AUTHORITY_ENABLED=true;'
    ));
});
