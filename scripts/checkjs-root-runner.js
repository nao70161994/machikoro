'use strict';

const path = require('path');
const ts = require('typescript');

const REPO_ROOT = path.join(__dirname, '..');
const BASE_CONFIG = path.join(REPO_ROOT, 'tsconfig.checkjs.json');
const MAIN_CONFIG = path.join(REPO_ROOT, 'tsconfig.checkjs-main.json');
const MAIN_EXCLUDED_BASE_FILES = new Set([
    'js/appShell.js',
    'types/checkjs-app-shell-globals.d.ts',
]);
const UI_EXCLUDED_BASE_FILES = new Set([
    'js/appShell.js',
    'types/checkjs-app-shell-globals.d.ts',
]);
const UI_ROOT_FILES = Object.freeze([
    'types/checkjs-ui-globals.d.ts',
    'js/ui.js',
]);

function readConfig(configPath) {
    const read = ts.readConfigFile(configPath, ts.sys.readFile);
    if (read.error) return { errors: [read.error], fileNames: [], options: {} };
    const parsed = ts.parseJsonConfigFileContent(
        read.config,
        ts.sys,
        path.dirname(configPath),
        undefined,
        configPath
    );
    return { errors: parsed.errors, fileNames: parsed.fileNames, options: parsed.options };
}

function checkCompositionRoot() {
    const base = readConfig(BASE_CONFIG);
    const main = readConfig(MAIN_CONFIG);
    const diagnostics = [...base.errors, ...main.errors];
    if (diagnostics.length === 0) {
        const rootFiles = base.fileNames.filter(file =>
            !MAIN_EXCLUDED_BASE_FILES.has(path.relative(REPO_ROOT, file).split(path.sep).join('/'))
        );
        const program = ts.createProgram({
            rootNames: [...new Set([...rootFiles, ...main.fileNames])],
            options: main.options,
        });
        diagnostics.push(...ts.getPreEmitDiagnostics(program));
    }

    if (diagnostics.length > 0) {
        const host = {
            getCanonicalFileName: file => file,
            getCurrentDirectory: () => REPO_ROOT,
            getNewLine: () => ts.sys.newLine,
        };
        process.stderr.write(ts.formatDiagnosticsWithColorAndContext(diagnostics, host));
        return 1;
    }
    process.stdout.write('checkJs main composition-root project passed\n');
    return 0;
}

function checkUiCompositionRoot() {
    const base = readConfig(BASE_CONFIG);
    const diagnostics = [...base.errors];
    if (diagnostics.length === 0) {
        const rootFiles = base.fileNames.filter(file =>
            !UI_EXCLUDED_BASE_FILES.has(path.relative(REPO_ROOT, file).split(path.sep).join('/'))
        );
        const program = ts.createProgram({
            rootNames: [...new Set([...rootFiles, ...UI_ROOT_FILES.map(file => path.join(REPO_ROOT, file))])],
            options: base.options,
        });
        diagnostics.push(...ts.getPreEmitDiagnostics(program));
    }

    if (diagnostics.length > 0) {
        const host = {
            getCanonicalFileName: file => file,
            getCurrentDirectory: () => REPO_ROOT,
            getNewLine: () => ts.sys.newLine,
        };
        process.stderr.write(ts.formatDiagnosticsWithColorAndContext(diagnostics, host));
        return 1;
    }
    process.stdout.write('checkJs ui composition-root project passed\n');
    return 0;
}

if (require.main === module) {
    const mainStatus = checkCompositionRoot();
    const uiStatus = checkUiCompositionRoot();
    process.exitCode = mainStatus || uiStatus;
}

module.exports = Object.freeze({ checkCompositionRoot, checkUiCompositionRoot, readConfig });
