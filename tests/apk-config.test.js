const assert = require('assert');
const { createTwaManifest } = require('../scripts/create-twa-manifest');
const { validateApkConfig, validateTwaManifest } = require('../scripts/validate-apk-config');
const { runTest } = require('./helpers/test-utils');

runTest('TWA生成設定はAndroid Browser Helperが要求するAPI 24と共通配信設定を満たす', () => {
    const manifest = createTwaManifest(42);
    assert.strictEqual(manifest.appVersionCode, 42);
    assert.strictEqual(manifest.minSdkVersion, '24');
    assert.strictEqual(manifest.sdkVersion, '36');
    validateTwaManifest(manifest);
    validateApkConfig();
});

runTest('TWA検証は依存SDK下限を満たさない旧設定とSDK設定の欠落を拒否する', () => {
    for (const minSdkVersion of ['21', '23', undefined]) {
        assert.throws(() => validateTwaManifest({ ...createTwaManifest(), minSdkVersion }), /API 24/);
    }
    assert.throws(() => validateTwaManifest({ ...createTwaManifest(), sdkVersion: '23' }));
});
