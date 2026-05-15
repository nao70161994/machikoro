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
    assert.strictEqual(args.verbose, false);
    assert.deepStrictEqual(args.profiles, DEFAULT_PROFILES);
});

runTest('diagnose-expert-v2-branches parseArgs は CLI 引数を解釈する', () => {
    const args = parseArgs(['--games', '7', '--seed', '9', '--max-steps', '7000', '--format', 'json', '--full', '--profiles', 'duel,crowd', '--margin', '0.5', '--verbose']);
    assert.strictEqual(args.games, 7);
    assert.strictEqual(args.seed, 9);
    assert.strictEqual(args.maxSteps, 7000);
    assert.strictEqual(args.format, 'json');
    assert.strictEqual(args.lite, false);
    assert.strictEqual(args.margin, 0.5);
    assert.strictEqual(args.verbose, true);
    assert.deepStrictEqual(args.profiles, ['duel', 'crowd']);
});

runTest('diagnose-expert-v2-branches parseArgs は games/seed/maxSteps の 0 指定を保持する', () => {
    const args = parseArgs(['--games', '0', '--seed', '0', '--max-steps', '0']);

    assert.strictEqual(args.games, 0);
    assert.strictEqual(args.seed, 0);
    assert.strictEqual(args.maxSteps, 0);
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
    assert.strictEqual(report.entries[0].expertPreset, 'v2simple');
    assert.ok(typeof report.entries[0].counters.diceDecisions === 'number');
    assert.ok(typeof report.totals.rerollMarginWindow === 'number');
    assert.ok(typeof report.totals.buildRenovationFirstEarlyChosen === 'number');
    assert.ok(typeof report.totals.buildCornCandidate === 'number');
});

runTest('diagnose-expert-v2-branches toText は主要カウンタを含む', () => {
    const report = {
        options: { games: 1, seed: 1, lite: true, fast: false, margin: 0.2, verbose: true },
        summary: { weightedWinRate: 0.5, minWinRate: 0.5 },
        totals: Object.assign(createCounters(), {
            diceDecisions: 2,
            diceTie: 1,
            diceNearTie: 1,
            diceRaceDecision: 2,
            diceLateRaceDecision: 1,
            diceRaceNearGap05: 1,
            diceLateRaceWouldChooseOther: 1,
            diceRaceWouldChooseOtherNames: { one: 1 },
            diceSelfNearWinShortfall3: 1,
            diceOpponentNearWinShortfall3: 1,
            diceChosenHigherRedRisk: 1,
            diceChosenHigherOpponentBlue: 1,
            diceRaceWouldChooseOther: 1,
            rerollDecisions: 3,
            rerollMarginWindow: 1,
            rerollRaceDecision: 3,
            rerollRaceWouldPreferKeep: 1,
            rerollChosenHigherRedRisk: 1,
            rerollChosenHigherOpponentBlue: 1,
            harborDecisions: 4,
            harborLowRollImproves: 1,
            harborRaceDecision: 4,
            harborRaceWouldPreferKeep: 1,
            harborBonusHigherRedRisk: 1,
            harborBonusHigherOpponentBlue: 1,
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
            cleaningValueAltDecisions: 4,
            cleaningValueAltDiff: 2,
            cleaningValueAltAvoidsSelfDamage: 1,
            cleaningValueAltSimpleNames: { パン屋: 2, カフェ: 1 },
            cleaningValueAltNames: { カフェ: 2, 牧場: 1 },
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
            businessScoredDecisions: 5,
            businessScoredDiffers: 3,
            businessScoredImprovesScore: 2,
            businessScoredHarmfulGiftAvailable: 4,
            businessSimpleMissedHarmfulGift: 1,
            businessSimpleMissedHarmfulGiftImproves05: 1,
            businessSimpleMissedHarmfulGiftGapLt05: 1,
            businessSimpleMissedHarmfulGiftRenovation: 1,
            businessSimpleMissedHarmfulGiftRenovationToGrape: 1,
            businessSimpleMissedHarmfulGiftRenovationToGrowth: 1,
            businessScoredTakesHigherValue: 2,
            businessSimpleMissedHarmfulGiftNames: { '改装屋->ブドウ園': 1 },
            businessSimpleNames: { '貸金業->牧場': 2, '麦畑->チーズ工場': 1 },
            businessScoredNames: { '貸金業->チーズ工場': 2, '改装屋->牧場': 1 },
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
            buildFinishWindow: 4,
            buildFinishOneRemainingWindow: 2,
            buildFinishNear: 3,
            buildFinishDelay: 2,
            buildFinishStrictDelay: 1,
            buildFinishDisruptionCanDelayImmediateWin: 1,
            buildFinishDelayNoImmediateDisruption: 1,
            buildFinishStrictDelayNoImmediateDisruption: 1,
            buildFinishNames: { 税務署: 2, ピザ屋: 1 },
            buildPortfolioGrowthAvailable: 4,
            buildPortfolioGrowthChosen: 1,
            buildPortfolioLowGrowthChosen: 3,
            buildPortfolioBasicOverGrowth: 2,
            buildPortfolioSpecialOverGrowth: 1,
            buildPortfolioGrowthNearBest05: 2,
            buildPortfolioGrowthNearBest1: 3,
            buildPortfolioGrowthWouldFlipBonus08: 3,
            buildPortfolioGrowthMissedNearBest05: 2,
            buildPortfolioBasicOverNearGrowth05: 1,
            buildPortfolioSpecialOverNearGrowth05: 1,
            buildPortfolioGrowthMissedWouldFlipBonus08: 2,
            buildPortfolioChosenNames: { パン屋: 2, 税務署: 1 },
            buildPortfolioGrowthAvailableNames: { 青果市場: 2, ブドウ園: 1 },
            buildPortfolioGrowthNearNames: { 青果市場: 1, ブドウ園: 1 },
            buildPortfolioGrowthMissedNearNames: { 青果市場: 1, ブドウ園: 1 },
            buildPortfolioNoCornAvailable: 4,
            buildPortfolioNoCornNearBest05: 2,
            buildPortfolioNoCornMissedNearBest05: 1,
            buildPortfolioNoCornWouldFlipBonus04: 1,
            buildPortfolioNoCornWouldFlipBonus08: 2,
            buildPortfolioNoCornMissedNearNames: { 青果市場: 1 },
            buildPortfolioEffectiveAvailable: 3,
            buildPortfolioEffectiveNearBest05: 2,
            buildPortfolioEffectiveMissedNearBest05: 1,
            buildPortfolioEffectiveWouldFlipBonus04: 1,
            buildPortfolioEffectiveWouldFlipBonus08: 2,
            buildPortfolioEffectiveAvailableNames: { 青果市場: 2, ワイナリー: 1 },
            buildPortfolioEffectiveMissedNearNames: { ワイナリー: 1 },
            buildPortfolioEffectiveByCardAvailableNames: { 青果市場: 2, ワイナリー: 1 },
            buildPortfolioEffectiveByCardChosenNames: { 青果市場: 1 },
            buildPortfolioEffectiveByCardNearNames: { 青果市場: 2, ワイナリー: 1 },
            buildPortfolioEffectiveByCardMissedNearNames: { ワイナリー: 1 },
            buildPortfolioEffectiveByCardFlip04Names: { ワイナリー: 1 },
            buildPortfolioEffectiveByCardFlip08Names: { 青果市場: 1, ワイナリー: 1 },
            buildPortfolioEffectiveReadyDetailAvailableNames: { '青果市場:farm2': 2, 'ワイナリー:grape1': 1 },
            buildPortfolioEffectiveReadyDetailMissedNearNames: { 'ワイナリー:grape1': 1 },
            buildPortfolioEffectiveReadyDetailFlip04Names: { 'ワイナリー:grape1': 1 },
            buildPortfolioEffectiveMissedWinnerNames: { 'ワイナリー->パン屋': 1 },
            buildPortfolioEffectiveStrongReadyAvailable: 3,
            buildPortfolioEffectiveStrongReadyMissedNear: 1,
            buildPortfolioEffectiveStrongReadyFlip04: 1,
            buildPortfolioEffectiveReadyMissedNear: 2,
            buildPortfolioEffectiveReadyFlip04: 2,
            buildPortfolioEffectiveStrongReadyNames: { ワイナリー: 2, 青果市場: 1 },
            buildPortfolioEffectiveStrongReadyMissedNames: { ワイナリー: 1 },
            buildPortfolioEffectiveStrongReadyFlip04Names: { ワイナリー: 1 },
            buildPortfolioStrongReadyHighValueCandidate: 3,
            buildPortfolioStrongReadyHighValueNear05: 2,
            buildPortfolioStrongReadyHighValueMissedNear05: 1,
            buildPortfolioStrongReadyHighValueFlip025: 1,
            buildPortfolioStrongReadyHighValueFlip04: 2,
            buildPortfolioStrongReadyHighValueNames: { ブドウ園: 1, サンマ漁船: 1 },
            buildPortfolioStrongReadyHighValueMissedNames: { サンマ漁船: 1 },
            buildPortfolioReachShortenAvailable: 4,
            buildPortfolioReachShortenMissedNear: 2,
            buildPortfolioReachShortenFlip04: 1,
            buildPortfolioReachShortenNames: { 青果市場: 2, ワイナリー: 2 },
            buildPortfolioReachShortenMissedNames: { ワイナリー: 2 },
            buildPortfolioReachShortenFlip04Names: { ワイナリー: 1 },
            buildBasicDuplicateAvailable: 4,
            buildBasicDuplicateChosen: 3,
            buildBasicDuplicateLowLiftChosen: 2,
            buildBasicDuplicateNearBest05: 3,
            buildBasicDuplicateWouldFlipPenalty05: 1,
            buildBasicDuplicateNames: { パン屋: 2, コンビニ: 1 },
            buildBasicDuplicateLowLiftNames: { パン屋: 2 },
            buildBasicDuplicateFlip05Names: { 青果市場: 1 },
            buildComponentDecisions: 6,
            buildTempoDominantChosen: 1,
            buildTempoDominantNames: { コンビニ: 1 },
            buildComboDominantChosen: 2,
            buildComboHalfWouldFlip: 1,
            buildComboDominantNames: { ブドウ園: 2 },
            buildComboRanchDominantChosen: 2,
            buildComboRanchDominantCopy0: 1,
            buildComboRanchDominantCopy1: 1,
            buildComboRanchDominantCopy2Plus: 0,
            buildComboRanchDominantGapLe025: 1,
            buildComboRanchDominantGapLe05: 2,
            buildComboRanchDominantSecondNames: { コンビニ: 1, 改装屋: 1 },
            buildRedBonusDominantChosen: 1,
            buildRedBonusHalfWouldFlip: 1,
            buildRedBonusDominantNames: { ファミレス: 1 },
            buildRedBonusBasicDominantChosen: 2,
            buildRedBonusBasicDominantCopy0: 1,
            buildRedBonusBasicDominantCopy1: 1,
            buildRedBonusBasicDominantCopy2Plus: 0,
            buildRedBonusBasicDominantMallBuilt: 1,
            buildRedBonusBasicDominantGapLe025: 1,
                buildRedBonusBasicDominantGapLe05: 2,
                buildRedBonusBasicDominantSecondNames: { パン屋: 1, 牧場: 1 },
                buildRedBonusBasicDominantWin: 1,
                buildRedBonusBasicDominantLoss: 1,
                buildRedBonusBasicDominantWinNames: { パン屋: 1 },
                buildRedBonusBasicDominantLossNames: { 牧場: 1 },
                buildV3RaceDecisions: 4,
                buildV3RaceDifferentChoice: 2,
                buildV3RaceReachGainPositive: 3,
                buildV3RaceAirportGainPositive: 1,
                buildV3RaceV2ChoiceDelaysAirport: 1,
                buildV3RaceSecondGapLe025: 2,
                buildV3RaceDifferentLowValue: 1,
                buildV3RaceDifferentLowValueNoReachGain: 1,
                buildV3RaceDifferentLowValueAirportGain: 1,
                buildV3RaceDifferentGrowthOrDisruption: 1,
                buildV3RaceDifferentBasic: 1,
                buildV3RaceDifferentSpecial: 1,
                buildV3RaceDifferentV2ChosenRedOrCombo: 2,
                buildV3RaceDifferentAirportShortfallLe6: 1,
                buildV3RaceDifferentRemainingOneOrTwo: 1,
                buildV3RaceDifferentWouldImproveReachTurns: 2,
                buildV3RaceWouldChooseNames: { ブドウ園: 1, コンビニ: 1 },
                buildV3RaceV2ChosenNames: { パン屋: 2 },
                buildRenovationPenaltyWouldFlip: 1,
                buildRenovationPenaltyNames: { パン屋: 1 },
            buildCornCandidate: 4,
            buildCornChosen: 2,
            buildCornChosenNoMarket: 2,
            buildCornChosenNoMarketStock: 1,
            buildCornChosenLateNoStation: 1,
            buildCornNearBest05: 3,
            buildCornMissedNearBest05: 2,
            buildCornWouldFlipBonus08: 2,
            buildCornWouldFlipPenalty05: 1,
            buildCornFlip05Names: { パン屋: 1 },
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
                businessScoredDecisions: 5,
                businessSimpleMissedHarmfulGift: 1,
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
                buildFinishDelay: 2,
                buildFinishStrictDelay: 1,
                buildPortfolioGrowthNearBest05: 2,
                buildPortfolioGrowthMissedNearBest05: 2,
                buildPortfolioNoCornAvailable: 4,
                buildPortfolioNoCornNearBest05: 2,
                buildPortfolioNoCornMissedNearBest05: 1,
                buildPortfolioNoCornWouldFlipBonus04: 1,
                buildPortfolioNoCornWouldFlipBonus08: 2,
                buildPortfolioNoCornMissedNearNames: { 青果市場: 1 },
                buildBasicDuplicateLowLiftChosen: 2,
                buildCornCandidate: 4,
                buildCornChosen: 2,
                buildCornChosenNoMarket: 2,
                buildCornChosenNoMarketStock: 1,
                buildCornChosenLateNoStation: 1,
                buildCornWouldFlipPenalty05: 1,
                buildCornFlip05Names: { パン屋: 1 },
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
    assert.ok(text.includes('rollRace: diceOther=1/2 diceRedRisk=1/2 diceBlueRisk=1/2 selfNear3=1/2 opponentNear3=1/2 rerollKeep=1/3 rerollRedRisk=1/3 rerollBlueRisk=1/3 harborKeep=1/4 harborRedRisk=1/4 harborBlueRisk=1/4'));
    assert.ok(text.includes('rollRaceDetail: late=1/2 nearGap05=1/2 lateOther=1/2 otherNames=one:1'));
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
    assert.ok(text.includes('cleaningValueAlt: diff=2/4 avoidsSelfDamage=1/4 simpleNames=パン屋:2,カフェ:1 valueNames=カフェ:2,牧場:1'));
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
    assert.ok(text.includes('businessScored: diff=3/5 improves=2/5 harmfulAvailable=4/5 missedHarmful=1/5 missedHarmfulImprove05=1/5 gapLt05=1/5 renovation=1/5 renovationToGrape=1/5 renovationToGrowth=1/5 takesHigher=2/5 missedHarmfulNames=改装屋->ブドウ園:1 simpleNames=貸金業->牧場:2,麦畑->チーズ工場:1 scoredNames=貸金業->チーズ工場:2,改装屋->牧場:1'));
    assert.ok(text.includes('businessMissedHarmful=1/5'));
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
    assert.ok(text.includes('finishMode: window=4/6 oneRemaining=2/6 near=3/6 broadDelay=2/6 strictDelay=1/6 potentialDisruption=1/6 broadDelayNoDisruption=1/6 strictDelayNoDisruption=1/6 names=税務署:2,ピザ屋:1'));
    assert.ok(text.includes('portfolioGap: growthAvailable=4/6 growthChosen=1/6 lowGrowthChosen=3/6 basicOverGrowth=2/6 specialOverGrowth=1/6 near05=2/6 near1=3/6 flip08=3/6 missedNear05=2/6 basicOverNear05=1/6 specialOverNear05=1/6 missedFlip08=2/6'));
    assert.ok(text.includes('portfolioGapNames: chosen=パン屋:2,税務署:1 available=青果市場:2,ブドウ園:1 near=ブドウ園:1,青果市場:1 missedNear=ブドウ園:1,青果市場:1'));
    assert.ok(text.includes('portfolioNoCorn: available=4/6 near05=2/6 missedNear05=1/6 flip04=1/6 flip08=2/6 missedNearNames=青果市場:1'));
    assert.ok(text.includes('portfolioEffective: available=3/6 near05=2/6 missedNear05=1/6 flip04=1/6 flip08=2/6 availableNames=青果市場:2,ワイナリー:1 missedNearNames=ワイナリー:1'));
    assert.ok(text.includes('portfolioEffectiveByCard: available=青果市場:2,ワイナリー:1 chosen=青果市場:1 near=青果市場:2,ワイナリー:1 missedNear=ワイナリー:1 flip04=ワイナリー:1 flip08=ワイナリー:1,青果市場:1'));
    assert.ok(text.includes('portfolioEffectiveReadyDetail: available=青果市場:farm2:2,ワイナリー:grape1:1 missedNear=ワイナリー:grape1:1 flip04=ワイナリー:grape1:1 missedWinners=ワイナリー->パン屋:1'));
    assert.ok(text.includes('portfolioEffectiveReadiness: strongAvailable=3 strongMissedNear=1 strongFlip04=1 readyMissedNear=2 readyFlip04=2 strongNames=ワイナリー:2,青果市場:1 strongMissedNames=ワイナリー:1 strongFlip04Names=ワイナリー:1'));
    assert.ok(text.includes('portfolioStrongReadyHighValue: candidate=3/6 near05=2/6 missedNear05=1/6 flip025=1/6 flip04=2/6 names=サンマ漁船:1,ブドウ園:1 missedNames=サンマ漁船:1'));
    assert.ok(text.includes('portfolioReachShorten: available=4 missedNear=2 flip04=1 names=ワイナリー:2,青果市場:2 missedNames=ワイナリー:2 flip04Names=ワイナリー:1'));
    assert.ok(text.includes('basicDuplicate: available=4/6 chosen=3/6 lowLift=2/6 near05=3/6 flip05=1/6 names=パン屋:2,コンビニ:1 lowLiftNames=パン屋:2 flip05Names=青果市場:1'));
    assert.ok(text.includes('componentDominance: tempo=1/6 names=コンビニ:1 combo=2/6 half=1/6 names=ブドウ園:2 red=1/6 half=1/6 names=ファミレス:1 renovationPenaltyFlip=1/6 names=パン屋:1'));
    assert.ok(text.includes('componentRanchCombo: dominant=2/6 copy0=1/2 copy1=1/2 copy2plus=0/2 gap025=1/2 gap05=2/2 secondNames=コンビニ:1,改装屋:1'));
    assert.ok(text.includes('componentRedBasic: dominant=2/6 copy0=1/2 copy1=1/2 copy2plus=0/2 mallBuilt=1/2 gap025=1/2 gap05=2/2 secondNames=パン屋:1,牧場:1'));
    assert.ok(text.includes('componentRedBasicResult: win=1/2 loss=1/2 winSecondNames=パン屋:1 lossSecondNames=牧場:1'));
    assert.ok(text.includes('v3Race: different=2/4 reachGain=3/4 airportGain=1/4 v2DelaysAirport=1/4 gap025=2/4 wouldChoose=コンビニ:1,ブドウ園:1 v2Chosen=パン屋:2'));
    assert.ok(text.includes('v3RaceDetail: lowValue=1/2 lowNoReach=1/1 lowAirport=1/1 growthOrDisruption=1/2 basic=1/2 special=1/2 v2RedOrCombo=2/2 airportLe6=1/2 remainingLe2=1/2 improvesReach=2/2'));
    assert.ok(text.includes('cornGate: candidate=4/6 chosen=2/6 noMarket=2/6 noMarketStock=1/6 lateNoStation=1/6 near05=3/6 missedNear05=2/6 flipBonus08=2/6 flip05=1/6 flip05Names=パン屋:1'));
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
    assert.ok(text.includes('finishStrictDelay=1/6'));
    assert.ok(text.includes('portfolioMissedNear05=2/6'));
    assert.ok(text.includes('basicDuplicateLow=2/6'));
    assert.ok(text.includes('highPurpleEarly=2/6'));
    assert.ok(text.includes('redSaturated=2/6'));
    assert.ok(text.includes('specialSpendDelay=1/6'));
    assert.ok(text.includes('itDelay=1/4'));
});

runTest('diagnose-expert-v2-branches toText は通常出力で詳細 totals を省略する', () => {
    const counters = Object.assign(createCounters(), {
        buildCardEvDecisions: 6,
        buildRedWouldFlipWeight025: 1,
        buildGatedMallFarChosen: 2,
        buildGatedMallSpendWouldDelay: 1,
        buildMallBasicLowIncomeChosen: 1,
        buildBusinessDelayWouldDelay: 1,
        buildSpecialSpendWouldDelayLandmark: 1,
    });
    const text = toText({
        options: { games: 1, seed: 1, lite: true, fast: false, margin: 0.2, verbose: false },
        summary: { weightedWinRate: 0.5, minWinRate: 0.5 },
        totals: counters,
        entries: [{
            profile: 'duel',
            winRate: 0.5,
            averageTurns: 40,
            exhausted: 0,
            counters,
        }],
    });

    assert.ok(!text.includes('totals:'));
    assert.ok(text.includes('gated:'));
    assert.ok(text.includes('mallBasic:'));
    assert.ok(text.includes('duel: winRate=50.0%'));
    assert.ok(text.includes('mallBasicLow=1/6'));
});
