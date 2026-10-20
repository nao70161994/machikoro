#!/usr/bin/env sh
set -eu

# CLI 1.24.1 declares core ^1.24.1; pin the actual generator as well.
# core 1.27.0 selects Android Browser Helper 2.7.4 (minimum Android API 24).
npm install -g @bubblewrap/cli@1.24.1
bubblewrap_cli_dir="$(npm root -g)/@bubblewrap/cli"
npm install --prefix "$bubblewrap_cli_dir" --omit=dev --save-exact --no-package-lock @bubblewrap/core@1.27.0
node - "$bubblewrap_cli_dir" <<'NODE'
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const cliDir = process.argv[2];
const cliVersion = require(path.join(cliDir, 'package.json')).version;
const corePath = require.resolve('@bubblewrap/core/package.json', { paths: [cliDir] });
const coreVersion = require(corePath).version;
console.log(`Bubblewrap CLI ${cliVersion}, core ${coreVersion}`);
assert.strictEqual(cliVersion, '1.24.1');
assert.strictEqual(coreVersion, '1.27.0');
const featureManager = fs.readFileSync(path.join(path.dirname(corePath), 'dist/lib/features/FeatureManager.js'), 'utf8');
assert.ok(featureManager.includes('com.google.androidbrowserhelper:androidbrowserhelper:2.7.4'),
    'Pinned core must generate the API 24 compatible Android Browser Helper 2.7.4 dependency');
NODE
