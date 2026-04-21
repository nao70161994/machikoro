const path = require('path');
const fs = require('fs');

const { loadRegistry } = require('./validate-rl-registry.js');
const { buildRegistryReport, renderText: renderReportText, renderMarkdown: renderReportMarkdown } = require('./report-rl-registry.js');
const { buildAudit, renderText: renderAuditText, renderMarkdown: renderAuditMarkdown } = require('./audit-rl-portfolio.js');
const { buildNextActions, renderText: renderPlanText, renderMarkdown: renderPlanMarkdown } = require('./plan-rl-next-actions.js');
const { buildAdoptionReview, renderText: renderReviewText, renderMarkdown: renderReviewMarkdown } = require('./review-rl-adoptions.js');
const { buildDiversityReport, renderText: renderDiversityText, renderMarkdown: renderDiversityMarkdown } = require('./report-rl-diversity.js');

function parseArgs(argv) {
    const args = {
        registryPath: path.join(__dirname, '..', 'models', 'rl_model', 'registry.json'),
        outputDir: path.join(__dirname, '..', 'models', 'rl_model', 'reports'),
    };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--registry') args.registryPath = argv[++i] || args.registryPath;
        else if (arg === '--output-dir') args.outputDir = argv[++i] || args.outputDir;
    }
    return args;
}

function ensureDir(dirPath) {
    fs.mkdirSync(dirPath, { recursive: true });
}

function writeFile(filePath, content) {
    fs.writeFileSync(filePath, content, 'utf8');
}

function buildArtifacts(registry) {
    const report = buildRegistryReport(registry);
    const audit = buildAudit(registry);
    const plan = buildNextActions(registry);
    const review = buildAdoptionReview(registry);
    return {
        report,
        audit,
        plan,
        review,
        diversity: buildDiversityReport(registry),
    };
}

function writeArtifacts(artifacts, outputDir) {
    ensureDir(outputDir);
    const files = [];

    const mapping = [
        ['registry-report.txt', renderReportText(artifacts.report)],
        ['registry-report.md', renderReportMarkdown(artifacts.report)],
        ['registry-report.json', JSON.stringify(artifacts.report, null, 2) + '\n'],
        ['portfolio-audit.txt', renderAuditText(artifacts.audit)],
        ['portfolio-audit.md', renderAuditMarkdown(artifacts.audit)],
        ['portfolio-audit.json', JSON.stringify(artifacts.audit, null, 2) + '\n'],
        ['next-actions.txt', renderPlanText(artifacts.plan)],
        ['next-actions.md', renderPlanMarkdown(artifacts.plan)],
        ['next-actions.json', JSON.stringify(artifacts.plan, null, 2) + '\n'],
        ['adoption-review.txt', renderReviewText(artifacts.review)],
        ['adoption-review.md', renderReviewMarkdown(artifacts.review)],
        ['adoption-review.json', JSON.stringify(artifacts.review, null, 2) + '\n'],
        ['diversity-report.txt', renderDiversityText(artifacts.diversity)],
        ['diversity-report.md', renderDiversityMarkdown(artifacts.diversity)],
        ['diversity-report.json', JSON.stringify(artifacts.diversity, null, 2) + '\n'],
    ];

    for (const [name, content] of mapping) {
        const filePath = path.join(outputDir, name);
        writeFile(filePath, content);
        files.push(filePath);
    }
    return files;
}

function renderSummary(outputDir, files) {
    const lines = [
        `RL ops reports refreshed: ${outputDir}`,
    ];
    for (const filePath of files) {
        lines.push(`- ${path.basename(filePath)}`);
    }
    return lines.join('\n') + '\n';
}

if (require.main === module) {
    const args = parseArgs(process.argv.slice(2));
    const registry = loadRegistry(args.registryPath);
    const artifacts = buildArtifacts(registry);
    const files = writeArtifacts(artifacts, args.outputDir);
    process.stdout.write(renderSummary(args.outputDir, files));
}

module.exports = {
    parseArgs,
    ensureDir,
    buildArtifacts,
    writeArtifacts,
    renderSummary,
};
