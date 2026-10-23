'use strict';

const fs = require('fs');
const EXPECTED_VERSION = '1.61.1';
const EXPECTED_IMAGE = 'mcr.microsoft.com/playwright:v1.61.1-noble@sha256:5b8f294aff9041b7191c34a4bab3ac270157a28774d4b0660e9743297b697e48';

function checkContainer(version, executables, exists = fs.existsSync) {
    if (version !== EXPECTED_VERSION) {
        throw new Error(`Playwright ${version} does not match pinned image ${EXPECTED_VERSION}; update the image and guard together`);
    }
    for (const executable of executables) {
        if (!executable.startsWith('/ms-playwright/') || !exists(executable)) {
            throw new Error('Missing preinstalled Playwright browser: ' + executable);
        }
    }
    if (executables.length !== 2) throw new Error('Both Chromium and WebKit must be checked');
}

if (require.main === module) {
    const { chromium, webkit } = require('playwright');
    checkContainer(require('@playwright/test/package.json').version, [chromium.executablePath(), webkit.executablePath()]);
    console.log('Preinstalled browser runtime verified: ' + EXPECTED_IMAGE);
}
module.exports = { EXPECTED_VERSION, EXPECTED_IMAGE, checkContainer };
