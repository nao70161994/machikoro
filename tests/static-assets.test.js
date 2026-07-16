const assert = require('assert');
const {
    PUBLIC_ROOT_FILES,
    injectServiceWorkerBuildHash,
    injectIndexBuildHash,
    isPublicRootFile,
} = require('../server/staticAssets');
const { runTest } = require('./helpers/test-utils');

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
