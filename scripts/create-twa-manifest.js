const fs = require('fs');
const path = require('path');

const PRODUCTION_HOST = 'machikoro-9jv2.onrender.com';

function createTwaManifest(versionCode = 1) {
    const numericVersion = Number(versionCode);
    if (!Number.isSafeInteger(numericVersion) || numericVersion < 1) throw new Error('version-code must be a positive integer');
    return {
        packageId: 'com.machikoro.game', host: PRODUCTION_HOST,
        name: 'ダイスシティ', launcherName: 'ダイスシティ', display: 'standalone', orientation: 'portrait',
        themeColor: '#0f0e17', backgroundColor: '#0f0e17', startUrl: '/',
        iconUrl: `https://${PRODUCTION_HOST}/icons/icon-512.png`, maskableIconUrl: `https://${PRODUCTION_HOST}/icons/icon-512.png`,
        monochromeIconUrl: `https://${PRODUCTION_HOST}/icons/icon-512.png`, appVersion: String(numericVersion), appVersionCode: numericVersion,
        signingKey: { path: 'android.keystore', alias: 'android' }, generatorApp: 'bubblewrap-cli',
        webManifestUrl: `https://${PRODUCTION_HOST}/manifest.json`, sdkVersion: '36', minSdkVersion: '21',
        isChromeOSOnly: false, enableNotifications: false, features: {}, alphaDependencies: { enabled: false },
        enableSiteSettingsShortcut: true, metaQuest: { enabled: false }, splashScreenFadeOutDuration: 300,
    };
}

function parseArguments(argv) {
    const args = { output: 'twa-manifest.json', versionCode: 1 };
    for (let index = 0; index < argv.length; index += 1) {
        if (argv[index] === '--output') args.output = argv[++index];
        else if (argv[index] === '--version-code') args.versionCode = argv[++index];
        else throw new Error(`unknown argument: ${argv[index]}`);
    }
    if (!args.output) throw new Error('--output requires a path');
    return args;
}

if (require.main === module) {
    const args = parseArguments(process.argv.slice(2));
    const outputPath = path.resolve(args.output);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(createTwaManifest(args.versionCode), null, 2)}\n`);
    console.log(`TWA manifest written: ${outputPath}`);
}

module.exports = { PRODUCTION_HOST, createTwaManifest, parseArguments };
