'use strict';

const fs = require('fs');
const vm = require('vm');
const { spawnSync } = require('child_process');

/**
 * @param {string} source
 * @returns {string}
 */
function normalizeJavaScriptSource(source) {
    return source.replace(/^#![^\r\n]*/, line => `//${line.slice(2)}`);
}

/**
 * @param {string} filename
 * @param {string} source
 */
function validateJavaScript(filename, source) {
    new vm.Script(normalizeJavaScriptSource(source), {
        filename,
    });
}

/**
 * @param {string} filename
 * @param {string} source
 */
function validateJson(filename, source) {
    try {
        JSON.parse(source);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new SyntaxError(`${filename}: ${message}`);
    }
}

/**
 * @returns {string[]}
 */
function discoverStaticFiles() {
    const result = spawnSync('git', [
        'ls-files',
        '-z',
        '--cached',
        '--others',
        '--exclude-standard',
        '--',
        '*.js',
        '*.json',
        ':!:node_modules/*',
    ], {
        encoding: 'utf8',
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
        throw new Error(result.stderr || `git ls-files exited with ${result.status}`);
    }
    return String(result.stdout || '')
        .split('\0')
        .filter(Boolean);
}

/**
 * @typedef {{ filename: string, message: string }} StaticFileError
 * @typedef {{ jsCount: number, jsonCount: number, errors: StaticFileError[] }} StaticFileResult
 */

/**
 * @param {string[]} files
 * @param {(filename: string) => string} [readFile]
 * @returns {StaticFileResult}
 */
function checkStaticFiles(files, readFile = filename => fs.readFileSync(filename, 'utf8')) {
    let jsCount = 0;
    let jsonCount = 0;
    /** @type {StaticFileError[]} */
    const errors = [];
    for (const filename of files) {
        try {
            const source = readFile(filename);
            if (filename.endsWith('.js')) {
                validateJavaScript(filename, source);
                jsCount += 1;
            } else if (filename.endsWith('.json')) {
                validateJson(filename, source);
                jsonCount += 1;
            }
        } catch (error) {
            errors.push({
                filename,
                message: error instanceof Error ? error.message : String(error),
            });
        }
    }
    return { jsCount, jsonCount, errors };
}

function main() {
    const result = checkStaticFiles(discoverStaticFiles());
    for (const error of result.errors) {
        console.error(`[static-files] ${error.filename}: ${error.message}`);
    }
    if (result.errors.length > 0) {
        process.exitCode = 1;
        return;
    }
    console.log(`static files ok: ${result.jsCount} JavaScript, ${result.jsonCount} JSON`);
}

const runtimeRequire = /** @type {typeof require & { main?: unknown }} */ (require);
if (runtimeRequire.main === module) main();

module.exports = {
    checkStaticFiles,
    discoverStaticFiles,
    normalizeJavaScriptSource,
    validateJavaScript,
    validateJson,
};
