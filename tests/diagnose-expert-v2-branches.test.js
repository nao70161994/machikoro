const assert = require('assert');
const path = require('path');
const { runTest } = require('./helpers/test-utils');

const {
    DEFAULT_PROFILES,
    createCounters,
    installBranchDiagnostics,
    parseArgs,
    runDiagnostics,
    toText,
} = require(path.join(__dirname, '..', 'scripts', 'diagnose-expert-v2-branches.js'));
const { loadRuntime } = require(path.join(__dirname, '..', 'scripts', 'selfplay.js'));

runTest('diagnose-expert-v2-branches parseArgs は既定値を返す', () => {
    const args = parseArgs([]);
    assert.strictEqual(args.games, 20);
    assert.strictEqual(args.seed, 1);
    assert.strictEqual(args.maxSteps, 5000);
    assert.strictEqual(args.format, 'text');
    assert.strictEqual(args.lite, true);
    assert.strictEqual(args.margin, 0.2);
    assert.deepStrictEqual(args.profiles, DEFAULT_PROFILES);
});

runTest('diagnose-expert-v2-branches parseArgs は CLI 引数を解釈する', () => {
    const args = parseArgs(['--games', '7', '--seed', '9', '--max-steps', '7000', '--format', 'json', '--full', '--profiles', 'duel,crowd', '--margin', '0.5']);
    assert.strictEqual(args.games, 7);
    assert.strictEqual(args.seed, 9);
    assert.strictEqual(args.maxSteps, 7000);
    assert.strictEqual(args.format, 'json');
    assert.strictEqual(args.lite, false);
    assert.strictEqual(args.margin, 0.5);
    assert.deepStrictEqual(args.profiles, ['duel', 'crowd']);
});

runTest('diagnose-expert-v2-branches installBranchDiagnostics は prototype を戻す', () => {
    const runtime = loadRuntime({ includeRL: false });
    const original = runtime.CPU.prototype.chooseDiceCount;
    const counters = createCounters();
    const uninstall = installBranchDiagnostics(runtime, counters);
    assert.notStrictEqual(runtime.CPU.prototype.chooseDiceCount, original);
    uninstall();
    assert.strictEqual(runtime.CPU.prototype.chooseDiceCount, original);
});

runTest('diagnose-expert-v2-branches installBranchDiagnostics は build prototype も戻す', () => {
    const runtime = loadRuntime({ includeRL: false });
    const original = runtime.CPU.prototype._buildExpertV2Simple;
    const counters = createCounters();
    const uninstall = installBranchDiagnostics(runtime, counters);
    assert.notStrictEqual(runtime.CPU.prototype._buildExpertV2Simple, original);
    uninstall();
    assert.strictEqual(runtime.CPU.prototype._buildExpertV2Simple, original);
});

runTest('diagnose-expert-v2-branches runDiagnostics は profile ごとのカウンタを返す', () => {
    const report = runDiagnostics({ games: 1, seed: 1, maxSteps: 5000, lite: true, fast: false, profiles: ['duel'], margin: 0.2 });
    assert.strictEqual(report.entries.length, 1);
    assert.strictEqual(report.entries[0].profile, 'duel');
    assert.ok(typeof report.entries[0].counters.diceDecisions === 'number');
    assert.ok(typeof report.totals.rerollMarginWindow === 'number');
    assert.ok(typeof report.totals.buildRenovationFirstEarlyChosen === 'number');
});

runTest('diagnose-expert-v2-branches toText は主要カウンタを含む', () => {
    const report = {
        options: { games: 1, seed: 1, lite: true, fast: false, margin: 0.2 },
        summary: { weightedWinRate: 0.5, minWinRate: 0.5 },
        totals: Object.assign(createCounters(), {
            diceDecisions: 2,
            diceTie: 1,
            diceNearTie: 1,
            rerollDecisions: 3,
            rerollMarginWindow: 1,
            harborDecisions: 4,
            harborLowRollImproves: 1,
            tvDecisions: 5,
            tvStealTie: 2,
            buildCardEvDecisions: 6,
            buildRenovationFirstEarlyChosen: 1,
            buildRenovationFirstEarlyNearBest: 1,
            buildComboSaturatedChosen: 2,
            buildComboSaturatedWouldFlipHalf: 1,
            buildComboPayoffReadyChosen: 1,
            buildComboPayoffNotReadyChosen: 2,
            buildComboPayoffNotReadyWouldFlipPenalty05: 1,
            buildComboPayoffNotReadyWouldFlipPenalty1: 2,
            buildLoanChosen: 3,
            buildLoanWouldFlipPenalty2: 1,
            buildLoanDuplicateNonBridgeChosen: 2,
            buildLoanDuplicateNonBridgeWouldFlipPenalty15: 1,
            buildLoanDuplicateNonBridgeWouldFlipPenalty2: 1,
            buildCleaningCandidate: 4,
            buildCleaningPositiveCandidate: 3,
            buildCleaningNearBest1: 2,
            buildCleaningWouldFlipBonus05: 1,
            buildCleaningWouldFlipBonus1: 2,
            buildRedCandidate: 5,
            buildRedWouldFlipWeight025: 1,
            buildRedWouldFlipWeight05: 2,
            buildRedWouldFlipWeight1: 3,
            buildRedPaymentCappedChosen: 1,
            buildRedPaymentCapWouldFlip: 1,
            buildRedPaymentCapLossTotal: 0.5,
            buildRedOneDieCandidate: 4,
            buildRedOneDieUnderweightedCandidate: 3,
            buildRedOneDieWouldFlipFreq6: 2,
            buildRedOneDieChosenUnderweighted: 1,
            buildRedOneDieNames: { ファミレス: 2, 寿司屋: 1 },
            buildItCandidate: 4,
            buildItWouldFlipAssumeInvest025: 1,
            buildItWouldFlipAssumeInvest05: 2,
            buildBusinessCandidate: 4,
            buildBusinessWouldFlipBonus05: 1,
            buildBusinessWouldFlipBonus1: 2,
            buildBusinessDelayChosen: 3,
            buildBusinessDelayWouldDelay: 2,
            buildBusinessDelayNear: 2,
            buildBusinessDelayDuplicate: 1,
            buildBusinessDelayLowExchangeValue: 1,
            buildBusinessDelaySecondGapLt05: 1,
            buildBusinessDelayWouldFlipPenalty05: 1,
            buildBusinessDelayWouldFlipPenalty1: 2,
            buildParkCandidate: 3,
            buildParkPositive: 2,
            buildParkNearBest1: 1,
            buildParkWouldFlipBonus05: 1,
            buildParkWouldFlipBonus1: 2,
            buildLandmarkGatedChosen: 3,
            buildLandmarkGatedFarChosen: 2,
            buildLandmarkGatedWouldFlipPenalty05: 1,
            buildLandmarkGatedWouldFlipPenalty1: 2,
            buildGatedHarborFarChosen: 1,
            buildGatedHarborWouldFlipPenalty05: 1,
            buildGatedStationFarChosen: 2,
            buildGatedStationWouldFlipPenalty05: 1,
            buildGatedMallFarChosen: 3,
            buildGatedMallWouldFlipPenalty05: 2,
            buildGatedMallNames: { コンビニ: 2, パン屋: 1 },
            buildGatedMallFlip05Names: { コンビニ: 1, パン屋: 1 },
            buildGatedMallSpendNearChosen: 2,
            buildGatedMallSpendWouldDelay: 1,
            buildGatedMallSpendWouldFlipPenalty05: 1,
            buildGatedMallSpendNames: { ピザ屋: 1, コンビニ: 1 },
            buildGatedMallSpendDelayNames: { ピザ屋: 1 },
            buildMallBasicChosen: 3,
            buildMallBasicFarChosen: 2,
            buildMallBasicLowIncomeChosen: 1,
            buildMallBasicWouldFlipPenalty05: 1,
            buildMallBasicWouldFlipPenalty1: 2,
            buildMallBasicNames: { コンビニ: 2, ピザ屋: 1 },
            buildMallBasicLowIncomeNames: { ピザ屋: 1 },
            buildHighPurpleEarlyChosen: 2,
            buildHighPurpleWouldFlipPenalty1: 1,
            buildHighPurpleWouldFlipPenalty2: 2,
            buildRedSaturatedLowIncomeChosen: 2,
            buildRedSaturatedWouldFlipPenalty05: 1,
            buildRedSaturatedWouldFlipPenalty1: 2,
            buildSpecialSpendChosen: 3,
            buildSpecialSpendNearLandmarkChosen: 2,
            buildSpecialSpendWouldDelayLandmark: 1,
            buildSpecialSpendPenalty05: 1,
            buildSpecialSpendPenalty1: 2,
            buildSpecialSpendNames: { テレビ局: 2, 貸金業: 1 },
            buildSpecialSpendDelayNames: { テレビ局: 1 },
            itInvestDecisions: 4,
            itInvestSaves: 4,
            itInvestCloseToFinishSaves: 2,
            itInvestNearLandmarkSaves: 1,
            itInvestWouldDelayLandmarkSaves: 1,
            moverDecisions: 5,
            moverCandidates: 12,
            moverDiffStrongLike: 2,
            moverHarmfulGiftAvailable: 3,
            moverHarmfulGiftMissed: 1,
            moverDangerTargetChosen: 1,
            moverLeaderAvoidWouldFlip: 2,
            moverHarmfulGiftWouldFlip: 1,
        }),
        entries: [{
            profile: 'duel',
            winRate: 0.5,
            averageTurns: 40,
            exhausted: 0,
            counters: Object.assign(createCounters(), {
                diceDecisions: 2,
                diceTie: 1,
                rerollDecisions: 3,
                rerollMarginWindow: 1,
                harborDecisions: 4,
                harborLowRollImproves: 1,
                tvDecisions: 5,
                tvStealTie: 2,
                buildCardEvDecisions: 6,
                buildRenovationFirstEarlyChosen: 1,
                buildComboSaturatedChosen: 2,
                buildComboPayoffNotReadyChosen: 2,
                buildComboPayoffNotReadyWouldFlipPenalty05: 1,
                buildLoanChosen: 3,
                buildLoanDuplicateNonBridgeChosen: 2,
                buildLoanDuplicateNonBridgeWouldFlipPenalty15: 1,
                buildCleaningNearBest1: 2,
                buildRedWouldFlipWeight025: 1,
                buildRedOneDieWouldFlipFreq6: 2,
                buildRedPaymentCapWouldFlip: 1,
                buildItWouldFlipAssumeInvest025: 1,
                buildBusinessWouldFlipBonus05: 1,
                buildBusinessDelayWouldDelay: 2,
                buildParkWouldFlipBonus05: 1,
                buildLandmarkGatedFarChosen: 2,
                buildLandmarkGatedWouldFlipPenalty05: 1,
                buildGatedHarborFarChosen: 1,
                buildGatedStationFarChosen: 2,
                buildGatedMallFarChosen: 3,
                buildGatedMallNames: { コンビニ: 2, パン屋: 1 },
                buildGatedMallFlip05Names: { コンビニ: 1, パン屋: 1 },
                buildGatedMallSpendWouldDelay: 1,
                buildMallBasicLowIncomeChosen: 1,
                buildHighPurpleEarlyChosen: 2,
                buildRedSaturatedLowIncomeChosen: 2,
                buildSpecialSpendWouldDelayLandmark: 1,
                itInvestDecisions: 4,
                itInvestWouldDelayLandmarkSaves: 1,
                moverDecisions: 5,
                moverCandidates: 12,
                moverDiffStrongLike: 2,
                moverHarmfulGiftAvailable: 3,
                moverHarmfulGiftMissed: 1,
                moverDangerTargetChosen: 1,
                moverLeaderAvoidWouldFlip: 2,
                moverHarmfulGiftWouldFlip: 1,
            }),
        }],
    };
    const text = toText(report);
    assert.ok(text.includes('diceTie=1/2'));
    assert.ok(text.includes('rerollMarginWindow=1/3'));
    assert.ok(text.includes('harborLowRollImproves=1/4'));
    assert.ok(text.includes('tvStealTie=2/5'));
    assert.ok(text.includes('buildRenovationFirstEarlyChosen=1/6'));
    assert.ok(text.includes('renovationFirstEarly=1/6'));
    assert.ok(text.includes('buildComboSaturatedChosen=2/6'));
    assert.ok(text.includes('buildComboPayoffReadyChosen=1/6'));
    assert.ok(text.includes('buildComboPayoffNotReadyChosen=2/6'));
    assert.ok(text.includes('buildComboPayoffNotReadyWouldFlipPenalty05=1/6'));
    assert.ok(text.includes('buildLoanChosen=3/6'));
    assert.ok(text.includes('buildLoanDuplicateNonBridgeChosen=2/6'));
    assert.ok(text.includes('buildLoanDuplicateNonBridgeWouldFlipPenalty15=1/6'));
    assert.ok(text.includes('buildCleaningCandidate=4/6'));
    assert.ok(text.includes('buildCleaningNearBest1=2/6'));
    assert.ok(text.includes('buildRedCandidate=5/6'));
    assert.ok(text.includes('buildRedWouldFlipWeight025=1/6'));
    assert.ok(text.includes('buildRedOneDieCandidate=4/6'));
    assert.ok(text.includes('buildRedOneDieUnderweightedCandidate=3/6'));
    assert.ok(text.includes('buildRedOneDieWouldFlipFreq6=2/6'));
    assert.ok(text.includes('buildRedOneDieChosenUnderweighted=1/6'));
    assert.ok(text.includes('redOneDie: names=ファミレス:2,寿司屋:1'));
    assert.ok(text.includes('buildRedPaymentCapWouldFlip=1/6'));
    assert.ok(text.includes('buildItCandidate=4/6'));
    assert.ok(text.includes('buildItWouldFlipAssumeInvest025=1/6'));
    assert.ok(text.includes('buildBusinessCandidate=4/6'));
    assert.ok(text.includes('buildBusinessWouldFlipBonus05=1/6'));
    assert.ok(text.includes('businessDelay: chosen=3/6 near=2/6 delay=2/6 duplicate=1/6 lowExchange=1/6 secondGap05=1/6 flip05=1/6 flip1=2/6'));
    assert.ok(text.includes('buildParkCandidate=3/6'));
    assert.ok(text.includes('buildParkPositive=2/6'));
    assert.ok(text.includes('buildParkWouldFlipBonus05=1/6'));
    assert.ok(text.includes('buildLandmarkGatedChosen=3/6'));
    assert.ok(text.includes('buildLandmarkGatedFarChosen=2/6'));
    assert.ok(text.includes('buildLandmarkGatedWouldFlipPenalty05=1/6'));
    assert.ok(text.includes('gated: harbor=1/6 flip05=1/6 station=2/6 flip05=1/6 mall=3/6 flip05=2/6'));
    assert.ok(text.includes('mallNames=コンビニ:2,パン屋:1'));
    assert.ok(text.includes('mallFlip05Names=コンビニ:1,パン屋:1'));
    assert.ok(text.includes('mallSpend: near=2/6 delay=1/6 flip05=1/6 names=コンビニ:1,ピザ屋:1 delayNames=ピザ屋:1'));
    assert.ok(text.includes('mallBasic: chosen=3/6 far=2/6 lowIncome=1/6 flip05=1/6 flip1=2/6 names=コンビニ:2,ピザ屋:1 lowIncomeNames=ピザ屋:1'));
    assert.ok(text.includes('buildHighPurpleEarlyChosen=2/6'));
    assert.ok(text.includes('buildHighPurpleWouldFlipPenalty1=1/6'));
    assert.ok(text.includes('buildRedSaturatedLowIncomeChosen=2/6'));
    assert.ok(text.includes('buildRedSaturatedWouldFlipPenalty05=1/6'));
    assert.ok(text.includes('buildSpecialSpendChosen=3/6'));
    assert.ok(text.includes('buildSpecialSpendNearLandmarkChosen=2/6'));
    assert.ok(text.includes('buildSpecialSpendWouldDelayLandmark=1/6'));
    assert.ok(text.includes('buildSpecialSpendPenalty05=1/6'));
    assert.ok(text.includes('specialSpend: names=テレビ局:2,貸金業:1 delayNames=テレビ局:1'));
    assert.ok(text.includes('itInvestSaves=4/4'));
    assert.ok(text.includes('itInvestWouldDelayLandmarkSaves=1/4'));
    assert.ok(text.includes('mover: decisions=5 candidates=12'));
    assert.ok(text.includes('diffStrongLike=2/5'));
    assert.ok(text.includes('harmfulAvailable=3/5'));
    assert.ok(text.includes('harmfulMissed=1/5'));
    assert.ok(text.includes('dangerTarget=1/5'));
    assert.ok(text.includes('leaderFlip=2/5'));
    assert.ok(text.includes('harmfulFlip=1/5'));
    assert.ok(text.includes('comboSaturated=2/6'));
    assert.ok(text.includes('comboPayoffNotReady=2/6'));
    assert.ok(text.includes('comboPayoffNotReadyFlip05=1/6'));
    assert.ok(text.includes('loan=3/6'));
    assert.ok(text.includes('loanDuplicateNonBridge=2/6'));
    assert.ok(text.includes('loanDuplicateNonBridgeFlip15=1/6'));
    assert.ok(text.includes('cleaningNearBest1=2/6'));
    assert.ok(text.includes('redFlip025=1/6'));
    assert.ok(text.includes('redOneDieFlip=2/6'));
    assert.ok(text.includes('redPaymentCapFlip=1/6'));
    assert.ok(text.includes('itFlip025=1/6'));
    assert.ok(text.includes('businessFlip05=1/6'));
    assert.ok(text.includes('businessDelay=2/6'));
    assert.ok(text.includes('parkFlip05=1/6'));
    assert.ok(text.includes('gatedFar=2/6'));
    assert.ok(text.includes('gatedFlip05=1/6'));
    assert.ok(text.includes('gatedHarbor=1/6'));
    assert.ok(text.includes('gatedStation=2/6'));
    assert.ok(text.includes('gatedMall=3/6'));
    assert.ok(text.includes('mallSpendDelay=1/6'));
    assert.ok(text.includes('mallBasicLow=1/6'));
    assert.ok(text.includes('highPurpleEarly=2/6'));
    assert.ok(text.includes('redSaturated=2/6'));
    assert.ok(text.includes('specialSpendDelay=1/6'));
    assert.ok(text.includes('itDelay=1/4'));
});
