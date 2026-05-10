const assert = require('assert');
const path = require('path');
const { runTest } = require('./helpers/test-utils');

const {
    classifyField,
    ratio,
    renderText,
    summarizeReport,
} = require(path.join(__dirname, '..', 'scripts', 'summarize-expert-losses-json.js'));

runTest('summarize-expert-losses-json ratio は totalBuilds 比率を返す', () => {
    assert.strictEqual(ratio({ totalBuilds: 50, mallBasicChosen: 10 }, 'mallBasicChosen'), 0.2);
    assert.strictEqual(ratio({ totalBuilds: 0, mallBasicChosen: 10 }, 'mallBasicChosen'), 0);
    assert.strictEqual(ratio(null, 'mallBasicChosen'), 0);
});

runTest('summarize-expert-losses-json classifyField は loss 偏りを判定する', () => {
    assert.strictEqual(classifyField(0.3, 0.1, 1.5, 100, 100), 'loss-skew');
    assert.strictEqual(classifyField(0.2, 0.18, 1.5, 100, 100), 'not-loss-specific');
    assert.strictEqual(classifyField(0.5, 0.0, 1.5, 9, 100), 'low-sample');
});

runTest('summarize-expert-losses-json は loss/win attribution を要約する', () => {
    const report = {
        entries: [
            {
                profile: 'allStrong4',
                games: 50,
                expertWins: 3,
                expertWinRate: 0.06,
                summary: {
                    losses: 47,
                    buildAttribution: {
                        totalBuilds: 100,
                        mallBasicChosen: 40,
                        portfolioMissedNear05: 30,
                        portfolioMissedVsConvenience: 5,
                        basicDuplicateChosen: 20,
                        basicDuplicateCopy3Plus: 10,
                        portfolioMissedWinnerNames: [{ name: 'ブドウ園->駅', count: 7 }],
                    },
                    winBuildAttribution: {
                        totalBuilds: 20,
                        mallBasicChosen: 4,
                        portfolioMissedNear05: 2,
                        portfolioMissedVsConvenience: 1,
                        basicDuplicateChosen: 5,
                        basicDuplicateCopy3Plus: 1,
                        portfolioMissedWinnerNames: [{ name: 'サンマ漁船->空港', count: 2 }],
                    },
                },
            },
        ],
    };
    const summaries = summarizeReport(report);
    assert.strictEqual(summaries[0].profile, 'allStrong4');
    assert.strictEqual(summaries[0].fields.find(field => field.field === 'portfolioMissedNear05').status, 'loss-skew');
    const text = renderText(summaries);
    assert.ok(text.includes('allStrong4: expertWinRate=6.0%'));
    assert.ok(text.includes('portfolioMissedNear05=loss:30(30.0%) win:2(10.0%) loss-skew'));
    assert.ok(text.includes('lossMissedWinners=ブドウ園->駅:7'));
});
