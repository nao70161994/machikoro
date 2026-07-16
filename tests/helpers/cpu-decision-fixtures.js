function makeCpuDecisionFixtures(runtime) {
    function makeGame(playerCount) {
        const game = new runtime.GameManager(playerCount);
        game.players.forEach((player, index) => {
            player.name = `CPU Fixture ${index + 1}`;
            player.difficulty = index === 0 ? 'expert' : 'strong';
        });
        return game;
    }

    function makeShopStock(playerCount) {
        return Object.fromEntries(runtime.CARDS.map(card => [
            card.name,
            card.color === 'purple' ? playerCount : 6,
        ]));
    }

    function addCards(player, names) {
        names.forEach(name => player.cards.push(runtime.createCardByName(name)));
    }

    const opening = makeGame(2);
    opening.phase = runtime.GAME_PHASES.BUILD;
    opening.players[0].coins = 6;
    addCards(opening.players[0], ['麦畑', 'パン屋']);
    addCards(opening.players[1], ['カフェ']);

    const landmarkRace = makeGame(3);
    landmarkRace.phase = runtime.GAME_PHASES.BUILD;
    landmarkRace.currentPlayerIndex = 1;
    landmarkRace.players[1].coins = 13;
    landmarkRace.players[1].landmarks[runtime.LANDMARK_NAMES.STATION] = true;
    addCards(landmarkRace.players[1], ['牧場', 'チーズ工場', 'コンビニ']);
    landmarkRace.players[2].coins = 18;
    runtime.Player.landmarkNames().slice(0, 4).forEach(name => {
        landmarkRace.players[2].landmarks[name] = true;
    });

    const crowd = makeGame(4);
    crowd.phase = runtime.GAME_PHASES.BUILD;
    crowd.currentPlayerIndex = 2;
    crowd.players[2].coins = 9;
    addCards(crowd.players[2], ['麦畑', '牧場', 'パン屋', 'コンビニ']);
    crowd.players[1].coins = 14;
    crowd.players[3].coins = 11;
    crowd.players[1].landmarks[runtime.LANDMARK_NAMES.STATION] = true;
    crowd.players[3].landmarks[runtime.LANDMARK_NAMES.SHOPPING_MALL] = true;

    const endgame = makeGame(5);
    endgame.phase = runtime.GAME_PHASES.BUILD;
    endgame.currentPlayerIndex = 4;
    endgame.turnCount = 42;
    endgame.players[4].coins = 35;
    runtime.Player.landmarkNames()
        .filter(name => name !== runtime.LANDMARK_NAMES.AIRPORT)
        .forEach(name => {
            endgame.players[4].landmarks[name] = true;
        });
    addCards(endgame.players[4], ['麦畑', 'パン屋', 'コンビニ', 'スタジアム']);

    const largeTable = makeGame(10);
    largeTable.phase = runtime.GAME_PHASES.BUILD;
    largeTable.currentPlayerIndex = 7;
    largeTable.players[7].coins = 8;
    addCards(largeTable.players[7], ['麦畑', 'パン屋', 'カフェ']);
    largeTable.players.forEach((player, index) => {
        if (index !== 7) player.coins = 3 + index;
    });

    const diceChoice = makeGame(4);
    diceChoice.currentPlayerIndex = 0;
    diceChoice.players[0].landmarks[runtime.LANDMARK_NAMES.STATION] = true;
    addCards(diceChoice.players[0], ['牧場', 'チーズ工場', 'パン屋']);
    addCards(diceChoice.players[1], ['カフェ', 'ファミレス']);

    const reroll = makeGame(2);
    reroll.currentPlayerIndex = 0;
    reroll.players[0].landmarks[runtime.LANDMARK_NAMES.RADIO_TOWER] = true;
    reroll.lastDiceResult = 3;
    reroll.lastDice1 = 3;
    reroll.lastDice2 = 0;
    addCards(reroll.players[0], ['森林', '家具工場']);

    const harbor = makeGame(3);
    harbor.currentPlayerIndex = 0;
    harbor.players[0].landmarks[runtime.LANDMARK_NAMES.HARBOR] = true;
    harbor.lastDiceResult = 10;
    harbor.lastDice1 = 5;
    harbor.lastDice2 = 5;
    harbor.pendingTunaDice = [4, 6];
    addCards(harbor.players[0], ['マグロ漁船', '寿司屋']);

    const pendingTv = makeGame(4);
    pendingTv.phase = runtime.GAME_PHASES.PENDING;
    pendingTv.pendingTV = 1;
    pendingTv.pendingActionQueue = [{ action: 'resolveTV', field: 'pendingTV' }];
    pendingTv.players[0].coins = 5;
    pendingTv.players[1].coins = 4;
    pendingTv.players[2].coins = 12;
    pendingTv.players[3].coins = 8;
    addCards(pendingTv.players[0], ['テレビ局']);

    return [
        { name: 'opening-build-2p', decision: 'build', seed: 101, game: opening, shopStock: makeShopStock(2) },
        { name: 'landmark-race-build-3p', decision: 'build', seed: 103, game: landmarkRace, shopStock: makeShopStock(3) },
        { name: 'crowd-build-4p', decision: 'build', seed: 107, game: crowd, shopStock: makeShopStock(4) },
        { name: 'endgame-build-5p', decision: 'build', seed: 109, game: endgame, shopStock: makeShopStock(5) },
        { name: 'large-table-build-10p', decision: 'build', seed: 113, game: largeTable, shopStock: makeShopStock(10) },
        { name: 'station-dice-choice-4p', decision: 'diceCount', seed: 127, game: diceChoice },
        { name: 'radio-tower-reroll-2p', decision: 'reroll', seed: 131, game: reroll },
        { name: 'harbor-choice-3p', decision: 'harbor', seed: 137, game: harbor },
        { name: 'pending-tv-4p', decision: 'pending', seed: 139, game: pendingTv },
    ];
}

module.exports = { makeCpuDecisionFixtures };
