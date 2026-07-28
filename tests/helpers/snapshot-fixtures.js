function makeSnapshotRoundtripFixtures(runtime, makeUndoStateFromMirror) {
    function makeGame(playerCount) {
        const game = new runtime.GameManager(playerCount);
        game.players.forEach((player, index) => {
            player.name = `Player ${index + 1}`;
        });
        return game;
    }

    const initialGame = makeGame(2);

    const buildGame = makeGame(2);
    const buildStock = { 麦畑: 5, パン屋: 6, カフェ: 6 };
    buildGame.phase = runtime.GAME_PHASES.BUILD;
    buildGame.builtThisTurn = true;
    buildGame.players[0].coins = 7;
    buildGame.log = [{ type: runtime.LOG_TYPES.BUILD, message: 'build fixture' }];
    const buildUndoState = makeUndoStateFromMirror(buildGame, buildStock);

    const pendingGame = makeGame(2);
    pendingGame.phase = runtime.GAME_PHASES.PENDING;
    pendingGame.pendingTV = 1;
    pendingGame.pendingActionQueue = [{ action: runtime.GAME_ACTIONS.RESOLVE_TV, field: 'pendingTV' }];
    pendingGame.lastDiceResult = 6;
    pendingGame.lastDice1 = 6;
    pendingGame.turnCount = 3;

    const multiplayerGame = makeGame(4);
    multiplayerGame.currentPlayerIndex = 3;
    multiplayerGame.players[1].coins = 12;
    multiplayerGame.players[1].landmarks['駅'] = true;
    multiplayerGame.players[2].cards.push(runtime.createCardByName('カフェ'));
    multiplayerGame.players[2].dormantCards = [multiplayerGame.players[2].cards[2]];
    multiplayerGame.players[3].itVentureCoins = 4;

    const maxPlayersGame = makeGame(10);
    maxPlayersGame.phase = runtime.GAME_PHASES.BUILD;
    maxPlayersGame.currentPlayerIndex = 9;
    maxPlayersGame.turnCount = 72;
    maxPlayersGame.players[4].coins = 18;
    maxPlayersGame.players[4].landmarks['駅'] = true;
    maxPlayersGame.players[9].cards.push(runtime.createCardByName('カフェ'));
    maxPlayersGame.players[9].itVentureCoins = 7;

    const endgameGame = makeGame(3);
    endgameGame.phase = runtime.GAME_PHASES.BUILD;
    endgameGame.currentPlayerIndex = 2;
    endgameGame.turnCount = 38;
    endgameGame.players[2].coins = 24;
    for (const landmark of runtime.Player.landmarkNames()) {
        endgameGame.players[2].landmarks[landmark] = true;
    }

    return [
        { name: 'initial', game: initialGame, shopStock: { 麦畑: 6, パン屋: 6 }, undoState: null, actionSeq: 0 },
        { name: 'build-with-undo', game: buildGame, shopStock: buildStock, undoState: buildUndoState, actionSeq: 9 },
        { name: 'pending', game: pendingGame, shopStock: { 麦畑: 6, パン屋: 6 }, undoState: null, actionSeq: 14 },
        { name: 'multiplayer-landmark', game: multiplayerGame, shopStock: { 麦畑: 4, パン屋: 5, カフェ: 3 }, undoState: null, actionSeq: 27 },
        { name: 'max-players', game: maxPlayersGame, shopStock: { 麦畑: 1, パン屋: 2, カフェ: 4 }, undoState: null, actionSeq: 88 },
        { name: 'endgame', game: endgameGame, shopStock: { 麦畑: 2, パン屋: 3 }, undoState: null, actionSeq: 61 },
    ];
}

module.exports = { makeSnapshotRoundtripFixtures };
