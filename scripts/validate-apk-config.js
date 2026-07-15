const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { PRODUCTION_HOST, createTwaManifest } = require('./create-twa-manifest');

const ROOT = path.resolve(__dirname, '..');

function readPngSize(relativePath) {
    const data = fs.readFileSync(path.join(ROOT, relativePath));
    assert.ok(data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), `${relativePath} is not PNG`);
    return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}

function validateWebManifest() {
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
    assert.strictEqual(manifest.id, '/');
    assert.strictEqual(manifest.start_url, '/');
    assert.strictEqual(manifest.display, 'standalone');
    assert.strictEqual(manifest.orientation, 'portrait');
    assert.strictEqual(manifest.theme_color, '#0f0e17');
    assert.strictEqual(manifest.background_color, '#0f0e17');
    const requiredIcons = new Map([['/icons/icon-192.png', 192], ['/icons/icon-512.png', 512]]);
    for (const icon of manifest.icons || []) {
        if (!requiredIcons.has(icon.src)) continue;
        const size = requiredIcons.get(icon.src);
        assert.strictEqual(icon.type, 'image/png');
        assert.ok(String(icon.purpose || '').split(/\s+/).includes('any'));
        assert.ok(String(icon.purpose || '').split(/\s+/).includes('maskable'));
        assert.deepStrictEqual(readPngSize(icon.src.slice(1)), { width: size, height: size });
        requiredIcons.delete(icon.src);
    }
    assert.deepStrictEqual([...requiredIcons.keys()], [], 'required PWA icons are missing');
}

function validateTwaManifest() {
    const twa = createTwaManifest(1);
    assert.strictEqual(twa.host, PRODUCTION_HOST);
    assert.strictEqual(twa.startUrl, '/');
    assert.strictEqual(twa.display, 'standalone');
    assert.strictEqual(twa.orientation, 'portrait');
    assert.deepStrictEqual(twa.signingKey, { path: 'android.keystore', alias: 'android' });
    for (const key of ['iconUrl', 'maskableIconUrl', 'monochromeIconUrl', 'webManifestUrl']) {
        const url = new URL(twa[key]);
        assert.strictEqual(url.protocol, 'https:');
        assert.strictEqual(url.host, PRODUCTION_HOST);
        assert.strictEqual(url.username, '');
        assert.strictEqual(url.password, '');
    }
}

function validateDeliveryFiles() {
    const server = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
    const serviceWorker = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
    const workflow = fs.readFileSync(path.join(ROOT, '.github/workflows/build-apk.yml'), 'utf8');
    assert.ok(server.includes("app.get('/.well-known/assetlinks.json'"));
    assert.ok(serviceWorker.includes("'/manifest.json'"));
    assert.ok(serviceWorker.includes("'/icons/icon-192.png'"));
    assert.ok(serviceWorker.includes("'/icons/icon-512.png'"));
    assert.ok(workflow.includes('@bubblewrap/cli@1.24.1'));
    assert.ok(!workflow.includes('--skipPwaValidation'));
}

function validateApkConfig() {
    validateWebManifest();
    validateTwaManifest();
    validateDeliveryFiles();
}

if (require.main === module) {
    validateApkConfig();
    console.log('APK/TWA static validation passed');
}

module.exports = { readPngSize, validateApkConfig, validateTwaManifest, validateWebManifest };
