'use strict';

// Inventory of local package metadata; this is not a distribution permission check.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const root = path.resolve(__dirname, '..');
const lockBytes = fs.readFileSync(path.join(root, 'package-lock.json'));
const lock = JSON.parse(lockBytes);
const escapeCell = value => String(value || '未記載').replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ');
const packages = Object.entries(lock.packages)
    .filter(([location, metadata]) => location && !metadata.dev && !metadata.devOptional)
    .sort(([left], [right]) => left.localeCompare(right));
const rows = packages.map(([location, metadata]) => {
    const directory = path.join(root, location);
    const manifestPath = path.join(directory, 'package.json');
    const installed = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : null;
    const licenseFiles = fs.existsSync(directory)
        ? fs.readdirSync(directory).filter(name => /^(licen[cs]e|copying|notice)([._-]|$)/i.test(name))
        : [];
    const state = !installed ? '未インストール'
        : installed.version === metadata.version ? '一致' : `不一致: ${installed.version}`;
    return `| ${escapeCell(location)} | ${escapeCell(metadata.version)} | ${escapeCell(metadata.license)} | ${escapeCell(state)} | ${escapeCell(licenseFiles.join(', '))} |`;
});
const report = [
    '# 本番依存パッケージのライセンス台帳',
    '',
    '`node scripts/report-production-licenses.js` でローカルのlockfileとインストール済みパッケージから生成。',
    '',
    `package-lock.json SHA-256: \`${crypto.createHash('sha256').update(lockBytes).digest('hex')}\``,
    '',
    `対象: lockfileでdev/devOptionalとされていない${packages.length}件。推移的依存も含む。`,
    '',
    'これは宣言情報とファイル存在の一覧であり、ライセンス本文の審査や配布物への通知同梱を完了した記録ではない。ブラウザ配信bundleに含まれるコード、外部配信物、図版、ゲームの名称・文言の権利は別途確認する。',
    '',
    '| パッケージ位置 | 固定バージョン | 宣言ライセンス | インストール版との一致 | 直下のライセンス・通知ファイル |',
    '| --- | --- | --- | --- | --- |',
    ...rows,
    '',
].join('\n');
fs.writeFileSync(path.join(root, 'docs/PRODUCTION_LICENSE_INVENTORY.md'), report);
console.log(`Recorded ${packages.length} production dependency entries.`);
