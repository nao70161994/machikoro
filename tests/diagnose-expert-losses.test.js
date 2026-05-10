const assert = require('assert');
const path = require('path');
const { runTest } = require('./helpers/test-utils');

const {
    DEFAULT_PROFILES,
    collectFinishDelayExamples,
    finalActionDiagnosticsFromTrace,
    findChosenBuildOption,
    parseArgs,
    summarizeBuildAttribution,
    summarizeFinishDelayActions,
    summarizeLosses,
    summarizeMissedImmediateDisruption,
    toText,
} = require(path.join(__dirname, '..', 'scripts', 'diagnose-expert-losses.js'));

runTest('diagnose-expert-losses parseArgs は既定値を返す', () => {
    const args = parseArgs([]);
    assert.strictEqual(args.games, 20);
    assert.strictEqual(args.seed, 1);
    assert.strictEqual(args.maxSteps, 5000);
    assert.strictEqual(args.format, 'text');
    assert.strictEqual(args.lite, true);
    assert.deepStrictEqual(args.profiles, DEFAULT_PROFILES);
});

runTest('diagnose-expert-losses parseArgs は CLI 引数を解釈する', () => {
    const args = parseArgs(['--games', '12', '--seed', '9', '--max-steps', '7000', '--format', 'json', '--full', '--expert-preset', 'rush', '--tuning-candidate', 'default:skipPenaltyx1.25', '--profiles', 'duel,crowd']);
    assert.strictEqual(args.games, 12);
    assert.strictEqual(args.seed, 9);
    assert.strictEqual(args.maxSteps, 7000);
    assert.strictEqual(args.format, 'json');
    assert.strictEqual(args.lite, false);
    assert.strictEqual(args.expertPreset, 'rush');
    assert.strictEqual(args.tuningCandidate, 'default:skipPenaltyx1.25');
    assert.deepStrictEqual(args.profiles, ['duel', 'crowd']);
});

runTest('diagnose-expert-losses summarizeLosses は負け筋を集計する', () => {
    const summary = summarizeLosses([
        {
            winnerDifficulty: 'strong',
            winnerSeat: 1,
            turns: 40,
            landmarkGap: 2,
            expertMissingLandmarks: ['駅', 'ショッピングモール'],
            winnerBuiltLandmarks: ['駅', 'ショッピングモール', '港'],
            expertTopCards: [{ name: 'パン屋', count: 2 }],
            winnerTopCards: [{ name: '寿司屋', count: 3 }],
            lastExpertAction: 'PASS',
            finalActionDiagnostics: null,
        },
        {
            winnerDifficulty: 'normal',
            winnerSeat: 2,
            turns: 50,
            landmarkGap: 1,
            expertMissingLandmarks: ['駅'],
            winnerBuiltLandmarks: ['駅'],
            expertTopCards: [{ name: 'パン屋', count: 1 }],
            winnerTopCards: [{ name: '寿司屋', count: 1 }],
            lastExpertAction: 'BUY_CARD:パン屋',
            finalActionDiagnostics: null,
        },
    ]);
    assert.strictEqual(summary.losses, 2);
    assert.strictEqual(summary.averageLandmarkGap, 1.5);
    assert.strictEqual(summary.averageTurns, 45);
    assert.strictEqual(summary.winnerDifficulties.strong, 1);
    assert.strictEqual(summary.winnerSeats.p2, 1);
    assert.strictEqual(summary.expertMissingLandmarks[0].name, '駅');
    assert.strictEqual(summary.winnerTopCards[0].name, '寿司屋');
    assert.strictEqual(summary.finalActions[0].name, 'BUY_CARD:パン屋');
    assert.strictEqual(summary.finishDelayActions.total, 0);
});

runTest('diagnose-expert-losses summarizeFinishDelayActions は終盤遅延と即勝利妨害を分ける', () => {
    const delayRenovation = {
        lastExpertAction: 'BUY_CARD:改装屋',
        finalActionDiagnostics: {
            buildActionLabel: 'BUY_CARD:改装屋',
            buildOptions: [
                {
                    type: 'card',
                    name: '改装屋',
                    label: 'BUY_CARD:改装屋',
                    cost: 4,
                    score: 2.25,
                    landmarkDelayPreview: {
                        wouldTrigger: true,
                        nearestLandmark: '空港',
                        remainingLandmarks: 1,
                        shortfallBefore: 3,
                        delayCoins: 4,
                    },
                    disruptionPreview: {
                        canDelayImmediateWin: false,
                    },
                },
                {
                    type: 'card',
                    name: 'パン屋',
                    label: 'BUY_CARD:パン屋',
                    cost: 1,
                    score: 2,
                    landmarkDelayPreview: {
                        wouldTrigger: false,
                        nearestLandmark: '空港',
                        remainingLandmarks: 1,
                        shortfallBefore: 3,
                        shortfallAfter: 3,
                        delayCoins: 0,
                    },
                },
            ],
        },
    };
    const delayTaxOffice = {
        lastExpertAction: 'BUY_CARD:税務署',
        finalActionDiagnostics: {
            buildActionLabel: 'BUY_CARD:税務署',
            buildOptions: [
                {
                    type: 'card',
                    name: '税務署',
                    label: 'BUY_CARD:税務署',
                    cost: 4,
                    score: 3,
                    landmarkDelayPreview: {
                        wouldTrigger: true,
                        nearestLandmark: '遊園地',
                        remainingLandmarks: 2,
                        shortfallBefore: 9,
                        delayCoins: 4,
                    },
                    disruptionPreview: {
                        canDelayImmediateWin: true,
                    },
                },
            ],
        },
    };
    const noDelay = {
        lastExpertAction: 'BUY_CARD:パン屋',
        finalActionDiagnostics: {
            buildActionLabel: 'BUY_CARD:パン屋',
            buildOptions: [
                {
                    label: 'BUY_CARD:パン屋',
                    landmarkDelayPreview: {
                        wouldTrigger: false,
                        nearestLandmark: '駅',
                        remainingLandmarks: 5,
                        shortfallBefore: 20,
                        delayCoins: 0,
                    },
                },
            ],
        },
    };

    assert.strictEqual(findChosenBuildOption(delayRenovation.finalActionDiagnostics).label, 'BUY_CARD:改装屋');
    const summary = summarizeFinishDelayActions([delayRenovation, delayTaxOffice, noDelay]);
    assert.strictEqual(summary.total, 2);
    assert.strictEqual(summary.noImmediateDisruption, 1);
    assert.strictEqual(summary.canDelayImmediateWin, 1);
    assert.strictEqual(summary.shortfallBeforeLe6, 1);
    assert.strictEqual(summary.airportNear, 1);
    assert.strictEqual(summary.remainingOne, 1);
    assert.strictEqual(summary.remainingOneAirportNear, 1);
    assert.strictEqual(summary.noImmediateDisruptionAirportNear, 1);
    assert.strictEqual(summary.strictDelay, 1);
    assert.strictEqual(summary.strictNoImmediateDisruption, 1);
    assert.strictEqual(summary.specialSpendDelay, 2);
    assert.strictEqual(summary.specialSpendDelayNoImmediateDisruption, 1);
    assert.strictEqual(summary.specialSpendDelayShortfallLe6, 1);
    assert.strictEqual(summary.averageDelayCoins, 4);
    assert.deepStrictEqual(summary.actionNames.map(item => item.name), ['BUY_CARD:改装屋', 'BUY_CARD:税務署']);
    assert.deepStrictEqual(summary.noImmediateDisruptionActionNames.map(item => item.name), ['BUY_CARD:改装屋']);
    assert.deepStrictEqual(summary.shortfallBeforeLe6ActionNames.map(item => item.name), ['BUY_CARD:改装屋']);
    assert.deepStrictEqual(summary.strictActionNames.map(item => item.name), ['BUY_CARD:改装屋']);
    assert.deepStrictEqual(summary.specialSpendDelayNames.map(item => item.name), ['BUY_CARD:改装屋', 'BUY_CARD:税務署']);
    assert.deepStrictEqual(summary.specialSpendNoImmediateDisruptionNames.map(item => item.name), ['BUY_CARD:改装屋']);
    assert.strictEqual(summary.nearestLandmarks[0].name, '空港');
    assert.strictEqual(summary.remainingLandmarks[0].name, '1');
});

runTest('diagnose-expert-losses collectFinishDelayExamples は終盤遅延の具体例を返す', () => {
    const examples = collectFinishDelayExamples([
        {
            profile: 'allStrong4',
            game: 9,
            seed: 9,
            turns: 80,
            lastExpertAction: 'BUY_CARD:改装屋',
            finalActionDiagnostics: {
                coins: 29,
                missingLandmarks: ['空港'],
                opponentWinThreats: [{ playerIndex: 2, canWinNow: false }],
                buildActionLabel: 'BUY_CARD:改装屋',
                buildOptions: [
                    {
                        type: 'card',
                        name: '改装屋',
                        label: 'BUY_CARD:改装屋',
                        cost: 4,
                        score: 2.25,
                        landmarkDelayPreview: {
                            wouldTrigger: true,
                            nearestLandmark: '空港',
                            remainingLandmarks: 1,
                            shortfallBefore: 1,
                            shortfallAfter: 5,
                            delayCoins: 4,
                            coinsBefore: 29,
                            cardCost: 4,
                        },
                        disruptionPreview: {
                            canDelayImmediateWin: false,
                        },
                    },
                    {
                        type: 'card',
                        name: 'パン屋',
                        label: 'BUY_CARD:パン屋',
                        cost: 1,
                        score: 2,
                        landmarkDelayPreview: {
                            wouldTrigger: false,
                            nearestLandmark: '空港',
                            remainingLandmarks: 1,
                            shortfallBefore: 1,
                            shortfallAfter: 2,
                            delayCoins: 0,
                        },
                    },
                ],
            },
        },
    ]);
    assert.strictEqual(examples.length, 1);
    assert.strictEqual(examples[0].profile, 'allStrong4');
    assert.strictEqual(examples[0].chosen.name, '改装屋');
    assert.strictEqual(examples[0].bestNonDelay.name, 'パン屋');
    assert.strictEqual(examples[0].scoreGapToBestNonDelay, 0.25);
    assert.ok(examples[0].reasonTags.includes('strict-delay'));
    assert.ok(examples[0].reasonTags.includes('special-spend'));
    assert.ok(examples[0].reasonTags.includes('no-immediate-disruption'));
});

runTest('diagnose-expert-losses summarizeMissedImmediateDisruption は即勝利妨害の見送りを集計する', () => {
    const summary = summarizeMissedImmediateDisruption([
        {
            profile: 'allStrong4',
            lastExpertAction: 'BUY_CARD:パン屋',
            finalActionDiagnostics: {
                opponentWinThreats: [{ playerIndex: 2, canWinNow: true }],
                buildActionLabel: 'BUY_CARD:パン屋',
                buildOptions: [
                    {
                        type: 'card',
                        name: 'パン屋',
                        label: 'BUY_CARD:パン屋',
                        score: 3,
                    },
                    {
                        type: 'card',
                        name: 'テレビ局',
                        label: 'BUY_CARD:テレビ局',
                        score: 2.6,
                        disruptionPreview: {
                            canDelayImmediateWin: true,
                        },
                    },
                ],
            },
        },
        {
            profile: 'crowd',
            lastExpertAction: 'BUY_CARD:税務署',
            finalActionDiagnostics: {
                opponentWinThreats: [{ playerIndex: 1, canWinNow: true }],
                buildActionLabel: 'BUY_CARD:税務署',
                buildOptions: [
                    {
                        type: 'card',
                        name: '税務署',
                        label: 'BUY_CARD:税務署',
                        score: 4,
                        disruptionPreview: {
                            canDelayImmediateWin: true,
                        },
                    },
                    {
                        type: 'card',
                        name: 'テレビ局',
                        label: 'BUY_CARD:テレビ局',
                        score: 3.5,
                        disruptionPreview: {
                            canDelayImmediateWin: true,
                        },
                    },
                ],
            },
        },
    ]);
    assert.strictEqual(summary.total, 2);
    assert.strictEqual(summary.gapLe05, 2);
    assert.strictEqual(summary.gapLe1, 2);
    assert.strictEqual(summary.chosenAlsoDisrupts, 1);
    assert.strictEqual(summary.opponentThreatPresent, 2);
    assert.strictEqual(summary.missedNames[0].name, 'BUY_CARD:テレビ局');
    assert.strictEqual(summary.chosenNames[0].name, 'BUY_CARD:パン屋');
    assert.strictEqual(summary.profileNames[0].name, 'allStrong4');
});

runTest('diagnose-expert-losses finalActionDiagnosticsFromTrace は末尾IT後でも直近build診断を返す', () => {
    const diagnostics = {
        diagnosticSource: '_listExpertBuildOptions/_scoreExpertBuildOption',
        mode: 'generic',
        coins: 20,
        missingLandmarks: ['空港'],
        affordableLandmarks: [{ name: '空港', cost: 30 }],
        buildOptions: [{ type: 'card', name: '青果市場', label: 'BUY_CARD:青果市場', score: 12 }],
        chosenBuildAction: { type: 'card', name: '青果市場', label: 'BUY_CARD:青果市場' },
        buildActionLabel: 'BUY_CARD:青果市場',
    };
    const result = finalActionDiagnosticsFromTrace([
        { chosenAction: { label: 'ROLL1' } },
        { chosenAction: { label: 'BUY_CARD:青果市場' }, buildDiagnostics: diagnostics },
        { chosenAction: { label: 'IT_SKIP' } },
    ]);
    assert.strictEqual(result, diagnostics);
    assert.strictEqual(finalActionDiagnosticsFromTrace([]), null);
});

runTest('diagnose-expert-losses summarizeBuildAttribution は敗戦中のbuild診断を集計する', () => {
    const summary = summarizeBuildAttribution([
        {
            buildDiagnostics: [
                {
                    actorIndex: 0,
                    before: {
                        players: [{ cards: { 'パン屋': 1 } }],
                    },
                    diagnostics: {
                        buildActionLabel: 'BUY_CARD:パン屋',
                        nearTie: { isNearTie: true },
                        missingLandmarks: ['空港'],
                        buildOptions: [
                            {
                                type: 'card',
                                name: 'パン屋',
                                label: 'BUY_CARD:パン屋',
                                score: 3,
                                landmarkDelayPreview: { wouldTrigger: false },
                            },
                            {
                                type: 'card',
                                name: '青果市場',
                                label: 'BUY_CARD:青果市場',
                                score: 2.7,
                                landmarkDelayPreview: { wouldTrigger: false },
                            },
                        ],
                    },
                },
                {
                    buildActionLabel: 'BUY_CARD:ビジネスセンター',
                    missingLandmarks: ['空港'],
                    buildOptions: [
                        {
                            type: 'card',
                            name: 'ビジネスセンター',
                            label: 'BUY_CARD:ビジネスセンター',
                            score: 4,
                            landmarkDelayPreview: {
                                wouldTrigger: true,
                                remainingLandmarks: 1,
                                nearestLandmark: '空港',
                                shortfallBefore: 4,
                                delayCoins: 4,
                            },
                        },
                        {
                            type: 'landmark',
                            name: '空港',
                            label: 'BUY_LANDMARK:空港',
                            score: 3,
                        },
                    ],
                },
            ],
        },
    ]);
    assert.strictEqual(summary.totalBuilds, 2);
    assert.strictEqual(summary.cardBuilds, 2);
    assert.strictEqual(summary.nearTie, 1);
    assert.strictEqual(summary.chosenDelay, 1);
    assert.strictEqual(summary.finishStrictDelay, 1);
    assert.strictEqual(summary.specialSpendDelay, 1);
    assert.strictEqual(summary.businessDelay, 1);
    assert.strictEqual(summary.mallBasicChosen, 1);
    assert.strictEqual(summary.portfolioMissedNear05, 1);
    assert.strictEqual(summary.portfolioMissedVsBasicNear05, 1);
    assert.strictEqual(summary.portfolioMissedWithAirportMissing, 1);
    assert.strictEqual(summary.portfolioMissedChosenDuplicate, 1);
    assert.strictEqual(summary.airportDelayBuilds, 1);
    assert.strictEqual(summary.airportAffordableSkipped, 1);
    assert.strictEqual(summary.airportShortfallLe6, 1);
    assert.strictEqual(summary.basicDuplicateChosen, 1);
    assert.strictEqual(summary.basicDuplicateOverGrowthNear05, 1);
    assert.strictEqual(summary.basicDuplicateWithAirportMissing, 1);
    assert.strictEqual(summary.portfolioMissedNames[0].name, '青果市場');
    assert.strictEqual(summary.portfolioMissedWinnerNames[0].name, '青果市場->パン屋');
    assert.strictEqual(summary.airportDelayNames[0].name, 'ビジネスセンター');
    assert.strictEqual(summary.basicDuplicateNames[0].name, 'パン屋');
});

runTest('diagnose-expert-losses toText は主要な差分を含む', () => {
    const text = toText([
        {
            profile: 'duel',
            expertWinRate: 0.25,
            summary: {
                losses: 3,
                averageLandmarkGap: 1.67,
                averageTurns: 48.3,
                winnerDifficulties: { strong: 3 },
                winnerSeats: { p2: 2, p1: 1 },
                expertMissingLandmarks: [{ name: '駅', count: 3 }],
                winnerBuiltLandmarks: [{ name: '駅', count: 3 }],
                expertTopCards: [{ name: 'パン屋', count: 5 }],
                winnerTopCards: [{ name: '寿司屋', count: 6 }],
                finalActions: [{ name: 'PASS', count: 2 }],
                finishDelayActions: {
                    total: 1,
                    noImmediateDisruption: 1,
                    canDelayImmediateWin: 0,
                    shortfallBeforeLe6: 1,
                    airportNear: 1,
                    remainingOne: 1,
                    remainingOneAirportNear: 1,
                    noImmediateDisruptionAirportNear: 1,
                    strictDelay: 1,
                    strictNoImmediateDisruption: 1,
                    specialSpendDelay: 1,
                    specialSpendDelayNoImmediateDisruption: 1,
                    specialSpendDelayShortfallLe6: 1,
                    averageDelayCoins: 3,
                    actionNames: [{ name: 'BUY_CARD:改装屋', count: 1 }],
                    noImmediateDisruptionActionNames: [{ name: 'BUY_CARD:改装屋', count: 1 }],
                    shortfallBeforeLe6ActionNames: [{ name: 'BUY_CARD:改装屋', count: 1 }],
                    strictActionNames: [{ name: 'BUY_CARD:改装屋', count: 1 }],
                    specialSpendDelayNames: [{ name: 'BUY_CARD:改装屋', count: 1 }],
                    specialSpendNoImmediateDisruptionNames: [{ name: 'BUY_CARD:改装屋', count: 1 }],
                    nearestLandmarks: [{ name: '空港', count: 1 }],
                    remainingLandmarks: [{ name: '1', count: 1 }],
                },
                finishDelayExamples: [
                    {
                        game: 2,
                        lastExpertAction: 'BUY_CARD:改装屋',
                        delayCoins: 3,
                        remainingLandmarks: 1,
                        nearestLandmark: '空港',
                        reasonTags: ['landmark-delay', 'strict-delay'],
                    },
                ],
                missedImmediateDisruption: {
                    total: 1,
                    gapLe05: 1,
                    gapLe1: 1,
                    chosenAlsoDisrupts: 0,
                    opponentThreatPresent: 1,
                    missedNames: [{ name: 'BUY_CARD:テレビ局', count: 1 }],
                    chosenNames: [{ name: 'BUY_CARD:パン屋', count: 1 }],
                    profileNames: [{ name: 'duel', count: 1 }],
                },
                buildAttribution: {
                    totalBuilds: 2,
                    cardBuilds: 2,
                    landmarkBuilds: 0,
                    nearTie: 1,
                    chosenDelay: 1,
                    finishStrictDelay: 1,
                    specialSpendDelay: 1,
                    businessDelay: 1,
                    mallBasicChosen: 1,
                    portfolioMissedNear05: 1,
                    portfolioMissedVsBasicNear05: 1,
                    portfolioMissedVsConvenience: 0,
                    portfolioMissedWithAirportMissing: 1,
                    portfolioMissedChosenDuplicate: 1,
                    airportDelayBuilds: 1,
                    airportAffordableSkipped: 0,
                    airportShortfallLe6: 1,
                    basicDuplicateChosen: 1,
                    basicDuplicateOverGrowthNear05: 1,
                    basicDuplicateWithAirportMissing: 1,
                    chosenNames: [{ name: 'BUY_CARD:パン屋', count: 1 }],
                    portfolioMissedNames: [{ name: '青果市場', count: 1 }],
                    portfolioMissedWinnerNames: [{ name: '青果市場->パン屋', count: 1 }],
                    delayNames: [{ name: 'BUY_CARD:ビジネスセンター', count: 1 }],
                    specialDelayNames: [{ name: 'BUY_CARD:ビジネスセンター', count: 1 }],
                    airportDelayNames: [{ name: 'ビジネスセンター', count: 1 }],
                    basicDuplicateNames: [{ name: 'パン屋', count: 1 }],
                },
                winBuildAttribution: {
                    totalBuilds: 3,
                    basicDuplicateChosen: 2,
                    basicDuplicateOverGrowthNear05: 1,
                    basicDuplicateWithAirportMissing: 0,
                    basicDuplicateNames: [{ name: 'コンビニ', count: 2 }],
                },
            },
        },
    ], { games: 4, seed: 1, lite: true, fast: false, expertPreset: 'default', tuningCandidate: '' });
    assert.ok(text.includes('duel: expertWinRate=25.0%'));
    assert.ok(text.includes('avgLandmarkGap=1.67'));
    assert.ok(text.includes('expertMissing=駅:3'));
    assert.ok(text.includes('winnerCards=寿司屋:6'));
    assert.ok(text.includes('finalActions=PASS:2'));
    assert.ok(text.includes('finishDelayActions=total:1'));
    assert.ok(text.includes('remainingOneAirportNear:1'));
    assert.ok(text.includes('strictNoDisruption:1'));
    assert.ok(text.includes('specialNoDisruption:1'));
    assert.ok(text.includes('finishDelayNames=BUY_CARD:改装屋:1'));
    assert.ok(text.includes('finishDelayStrict=BUY_CARD:改装屋:1'));
    assert.ok(text.includes('finishDelayExamples=g2:BUY_CARD:改装屋'));
    assert.ok(text.includes('missedImmediateDisruption=total:1'));
    assert.ok(text.includes('missedDisruptionNames=missed:BUY_CARD:テレビ局:1'));
    assert.ok(text.includes('buildAttribution=total:2 card:2 landmark:0 nearTie:1 chosenDelay:1 finishStrict:1 specialDelay:1 businessDelay:1 mallBasic:1 portfolioMissedNear05:1 portfolioVsBasic:1 portfolioVsConvenience:0 portfolioAirportMissing:1 portfolioChosenDuplicate:1'));
    assert.ok(text.includes('buildAttributionAirport=delay:1 affordableSkipped:0 shortfallLe6:1 names:ビジネスセンター:1'));
    assert.ok(text.includes('buildAttributionBasicDuplicate=chosen:1 overGrowthNear05:1 airportMissing:1 names:パン屋:1'));
    assert.ok(text.includes('buildAttributionNames=chosen:BUY_CARD:パン屋:1 portfolioMissed:青果市場:1 missedWinners:青果市場->パン屋:1'));
    assert.ok(text.includes('winBuildAttribution=total:3 basicDuplicate:2 overGrowthNear05:1 airportMissing:0 names:コンビニ:2'));
});
