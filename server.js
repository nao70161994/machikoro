const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const gameRuntime = loadGameRuntime();

app.use(express.static(path.join(__dirname)));

const rooms = {};

function sanitizeName(name) {
    return String(name || '').trim().slice(0, 20).replace(/[<>&"'`]/g, '');
}

function generateReconnectToken() {
    if (typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return crypto.randomBytes(16).toString('hex');
}

// 開始済みルームのGC（2時間アクティビティなしで削除）
setInterval(() => {
    const TTL = 2 * 60 * 60 * 1000;
    const now = Date.now();
    for (const [id, room] of Object.entries(rooms)) {
        if (room.started && room.lastTouchedAt && now - room.lastTouchedAt > TTL) {
            delete rooms[id];
            console.log(`ルーム削除（TTL）: ${id}`);
        }
    }
}, 10 * 60 * 1000);

io.on('connection', (socket) => {
    console.log('接続:', socket.id);

    socket.on('createRoom', ({ playerName, playerCount, playerSettings, cpuSpeed, enabledCards }) => {
        playerName = sanitizeName(playerName);
        if (!playerName) { socket.emit('error', '名前が無効です'); return; }
        let roomId;
        do { roomId = Math.random().toString(36).substr(2, 6).toUpperCase(); } while (rooms[roomId]);
        const reconnectToken = generateReconnectToken();
        // ホストの人間枠を探す
        let hostIndex = 0;
        if (playerSettings && playerSettings.length > 0) {
            hostIndex = playerSettings.findIndex(s => s.type === "human");
            if (hostIndex === -1) {
                socket.emit('error', 'オンライン対戦は最低1人の人間プレイヤーが必要です');
                return;
            }
        }
        rooms[roomId] = {
            enabledCards: enabledCards || null,
            players: [{ id: socket.id, name: playerName, index: hostIndex, reconnectToken }],
            hostPlayerIndex: hostIndex,
            maxPlayers: playerCount,
            playerSettings: playerSettings || [],
            cpuSpeed: cpuSpeed || 1500,
            started: false,
        };
        socket.join(roomId);
        socket.roomId = roomId;
        socket.playerIndex = hostIndex;
        socket.emit('roomCreated', { roomId, playerIndex: hostIndex, reconnectToken });

        // 参加者リストを送信
        const playerList = buildPlayerList(rooms[roomId]);
        io.to(roomId).emit('playerList', playerList);

        // 人間が1人だけなら即開始チェック
        checkGameStart(io, roomId);
        console.log(`ルーム作成: ${roomId} (${playerCount}人)`);
    });

    socket.on('joinRoom', ({ roomId, playerName }) => {
        playerName = sanitizeName(playerName);
        if (!playerName) { socket.emit('error', '名前が無効です'); return; }
        const room = rooms[roomId];
        if (!room) { socket.emit('error', 'ルームが見つかりません'); return; }
        if (room.started) { socket.emit('error', 'ゲームはすでに開始されています'); return; }

        // 重複参加チェック
        if (room.players.some(p => p.id === socket.id)) {
            socket.emit('error', 'すでにこのルームに参加しています');
            return;
        }
        if (room.players.some(p => p.name === playerName)) {
            socket.emit('error', 'その名前はすでに使われています');
            return;
        }

        // 人間枠を探す
        let playerIndex = -1;
        if (room.playerSettings.length > 0) {
            for (let i = 0; i < room.playerSettings.length; i++) {
                const taken = room.players.some(p => p.index === i);
                if (!taken && room.playerSettings[i].type === "human") {
                    playerIndex = i;
                    break;
                }
            }
        } else {
            if (room.players.length >= room.maxPlayers) {
                socket.emit('error', '参加できる枠がありません');
                return;
            }
            playerIndex = room.players.length;
        }

        if (playerIndex === -1) {
            socket.emit('error', '参加できる枠がありません');
            return;
        }

        const reconnectToken = generateReconnectToken();
        room.players.push({ id: socket.id, name: playerName, index: playerIndex, reconnectToken });
        socket.join(roomId);
        socket.roomId = roomId;
        socket.playerIndex = playerIndex;
        socket.emit('roomJoined', { roomId, playerIndex, reconnectToken });

        // 参加者リストを送信
        const playerList = buildPlayerList(room);
        io.to(roomId).emit('playerList', playerList);

        // ゲーム開始チェック
        checkGameStart(io, roomId);
    });

    socket.on('gameAction', ({ action, data }) => {
        const roomId = socket.roomId;
        if (!roomId) return;
        const room = rooms[roomId];
        if (!room || !room.started) return;
        const validation = validateGameAction(room, socket, action, data);
        if (!validation.ok) {
            socket.emit('error', '無効な操作です');
            return;
        }
        let safeData = data;
        if (action === 'buildCard' || action === 'buildLandmark') {
            room.lastUndoState = makeUndoStateFromMirror(validation.mirror.game, validation.mirror.shopStock);
        } else if (action === 'undoBuild') {
            safeData = { state: room.lastUndoState };
            room.lastUndoState = null;
        } else if (action === 'nextTurn') {
            room.lastUndoState = null;
        }
        if (room.actionLog) {
            room.actionLog.push({ action, data: safeData });
            room.lastTouchedAt = Date.now();
        }
        socket.to(roomId).emit('gameAction', { action, data: safeData, playerIndex: socket.playerIndex });
    });

    socket.on('rejoinRoom', ({ roomId, playerIndex, playerName, reconnectToken }) => {
        const room = rooms[roomId];
        if (!room) { socket.emit('error', 'ルームが見つかりません（サーバーが再起動した可能性があります）'); return; }
        if (!room.started) { socket.emit('error', 'ゲームはまだ開始されていません'); return; }

        const player = room.players.find(p =>
            p.index === playerIndex &&
            p.name === playerName &&
            p.reconnectToken === reconnectToken
        );
        if (!player) { socket.emit('error', '再接続情報が一致しません'); return; }

        player.id = socket.id;
        socket.join(roomId);
        socket.roomId = roomId;
        socket.playerIndex = playerIndex;

        socket.emit('rejoinData', {
            gameStartPayload: room.gameStartPayload,
            actionLog: room.actionLog || [],
            playerIndex,
        });
        io.to(roomId).emit('playerRejoined', { playerIndex, playerName });
        console.log(`再接続: ${playerName} (ルーム: ${roomId})`);
    });

    socket.on('disconnect', () => {
        const roomId = socket.roomId;
        if (roomId && rooms[roomId]) {
            const room = rooms[roomId];
            if (!room.started) {
                room.players = room.players.filter(p => p.id !== socket.id);
                if (room.players.length === 0) {
                    delete rooms[roomId];
                } else {
                    const playerList = buildPlayerList(room);
                    io.to(roomId).emit('playerList', playerList);
                }
            } else {
                const disconnectedPlayer = room.players.find(p => p.index === socket.playerIndex);
                io.to(roomId).emit('playerDisconnected', {
                    playerIndex: socket.playerIndex,
                    playerName: disconnectedPlayer?.name || `プレイヤー${socket.playerIndex + 1}`,
                });
                // ホストが切断した場合、残存プレイヤーの中から新ホストを選出
                if (socket.playerIndex === room.hostPlayerIndex) {
                    const remaining = room.players.filter(p => p.id !== socket.id);
                    if (remaining.length > 0) {
                        room.hostPlayerIndex = remaining[0].index;
                        io.to(roomId).emit('hostChanged', { newHostPlayerIndex: room.hostPlayerIndex });
                        console.log(`ホスト移譲: ${roomId} → プレイヤー${room.hostPlayerIndex}`);
                    }
                }
            }
            console.log(`切断: ${socket.id} (ルーム: ${roomId})`);
        }
    });
});

function buildPlayerList(room) {
    if (room.playerSettings.length === 0) {
        return room.players.map(p => p.name);
    }
    return room.playerSettings.map((s, i) => {
        if (s.type === "cpu") {
            const diffLabel = s.difficulty === 'weak' ? '弱' : s.difficulty === 'normal' ? '普' : '強';
            return `CPU（${diffLabel}）`;
        }
        const p = room.players.find(p => p.index === i);
        if (p) return p.name;
        return "待機中...";
    });
}

function loadGameRuntime() {
    const context = { console };
    vm.createContext(context);
    for (const file of ['js/Card.js', 'js/Player.js', 'js/GameManager.js']) {
        const source = fs.readFileSync(path.join(__dirname, file), 'utf8');
        vm.runInContext(source, context, { filename: file });
    }
    vm.runInContext(
        'this.Card = Card; this.Player = Player; this.GameManager = GameManager; this.CARDS = CARDS; this.createCardByName = createCardByName;',
        context
    );
    return context;
}

function createRoomMirror(room) {
    if (!room.gameStartPayload) return null;
    const { GameManager, CARDS, createCardByName } = gameRuntime;
    const { playerNames, playerSettings, playerOrder, enabledCards } = room.gameStartPayload;
    const game = new GameManager(playerNames.length);
    const shopStock = {};
    const enabled = new Set(enabledCards || CARDS.map(c => c.name));
    for (const card of CARDS) {
        shopStock[card.name] = enabled.has(card.name) ? 6 : 0;
    }

    const order = playerOrder || playerNames.map((_, i) => i);
    for (let i = 0; i < playerNames.length; i++) {
        const originalIndex = order[i];
        game.players[i].name = playerNames[originalIndex];
    }
    const cpuPlayers = (playerSettings && playerSettings.length > 0)
        ? order.map(originalIndex => playerSettings[originalIndex]?.type === 'cpu')
        : game.players.map(() => false);

    for (const { action, data } of room.actionLog || []) {
        applyActionToMirror(game, shopStock, action, data, createCardByName);
    }
    return { game, shopStock, cpuPlayers };
}

function applyActionToMirror(game, shopStock, action, data, createCardByName) {
    switch (action) {
        case 'rollDice':
            game.rollDice(data.forceDice, data.tunaDice);
            break;
        case 'selectDice':
            game.selectDiceCount(data.useTwo, data.d1, data.d2, data.tunaDice);
            break;
        case 'skipReroll':
            game.skipReroll();
            break;
        case 'rerollDice':
            game.rerollDice(data.forceDice, data.tunaDice);
            break;
        case 'resolveHarbor':
            game.resolveHarbor(data.useBonus);
            break;
        case 'resolveTV':
            game.resolveTV(data.targetIndex);
            break;
        case 'resolveBusiness':
            game.resolveBusiness(data.myCard, data.targetIndex, data.theirCard);
            break;
        case 'resolveCleaning':
            game.resolveCleaning(data.cardName);
            break;
        case 'resolveMover':
            game.resolveMover(data.cardIndex ?? data.cardName, data.targetIndex);
            break;
        case 'resolveRenovation':
            game.resolveRenovation(data.landmarkName);
            break;
        case 'resolveIT':
            game.resolveIT(data.doSave);
            break;
        case 'buildCard': {
            const card = createCardByName(data.cardName);
            if (card && game.buildCard(card)) shopStock[data.cardName]--;
            break;
        }
        case 'buildLandmark':
            game.buildLandmark(data.name);
            break;
        case 'undoBuild':
            restoreUndoMirror(game, shopStock, data.state, createCardByName);
            break;
        case 'nextTurn':
            game.nextTurn();
            break;
    }
}

function restoreUndoMirror(game, shopStock, state, createCardByName) {
    if (!state) return;
    game.players.forEach((p, i) => {
        p.coins = state.playerCoins[i];
        p.cards = state.playerCardNames[i].map(name => createCardByName(name)).filter(Boolean);
        p.dormantCards = (state.playerDormantIndices?.[i] || []).map(idx => p.cards[idx]).filter(Boolean);
        p.landmarks = Object.assign({}, state.playerLandmarks[i]);
        p.itVentureCoins = state.playerItVenture[i];
        p.hasYakusho = state.playerHasYakusho?.[i] !== false;
    });
    Object.assign(shopStock, state.shopStock);
    game.builtThisTurn = state.builtThisTurn;
    game.log = [...state.log];
}

function makeUndoStateFromMirror(game, shopStock) {
    return {
        playerCoins: game.players.map(p => p.coins),
        playerCardNames: game.players.map(p => p.cards.map(c => c.name)),
        playerDormantIndices: game.players.map(p =>
            p.dormantCards.map(dc => p.cards.indexOf(dc)).filter(i => i >= 0)
        ),
        playerLandmarks: game.players.map(p => Object.assign({}, p.landmarks)),
        playerItVenture: game.players.map(p => p.itVentureCoins),
        playerHasYakusho: game.players.map(p => p.hasYakusho),
        shopStock: Object.assign({}, shopStock),
        builtThisTurn: game.builtThisTurn,
        log: [...game.log],
    };
}

function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

function isPlayerIndex(value, game) {
    return Number.isInteger(value) && value >= 0 && value < game.players.length;
}

function hasPendingAction(game, action) {
    if (game.phase !== 'pending') return false;
    if (action === 'resolveBusiness') return game.pendingBusiness > 0;
    if (action === 'resolveCleaning') return game.pendingCleaning > 0;
    if (action === 'resolveMover') return game.pendingMover > 0;
    if (action === 'resolveRenovation') return game.pendingRenovation > 0;
    return false;
}

function validateBusinessPayload(game, data) {
    if (!hasPendingAction(game, 'resolveBusiness') || !isPlainObject(data)) return false;
    const { myCard, targetIndex, theirCard } = data;
    if (!isNonEmptyString(myCard) || !isNonEmptyString(theirCard) || !isPlayerIndex(targetIndex, game)) {
        return false;
    }
    if (targetIndex === game.currentPlayerIndex) return false;
    const current = game.currentPlayer();
    const target = game.players[targetIndex];
    return !!current.cards.find(card => card.name === myCard && card.category !== '大施設') &&
        !!target.cards.find(card => card.name === theirCard && card.category !== '大施設');
}

function validateCleaningPayload(game, data) {
    if (!hasPendingAction(game, 'resolveCleaning') || !isPlainObject(data)) return false;
    if (!isNonEmptyString(data.cardName)) return false;
    return game.players.some(player =>
        player.cards.some(card => card.name === data.cardName && !player.isDormant(card))
    );
}

function validateMoverPayload(game, data) {
    if (!hasPendingAction(game, 'resolveMover') || !isPlainObject(data)) return false;
    const { cardName, targetIndex } = data;
    if (!isNonEmptyString(cardName) || !isPlayerIndex(targetIndex, game)) return false;
    if (targetIndex === game.currentPlayerIndex) return false;
    const current = game.currentPlayer();
    return !!current.cards.find(card => card.name === cardName && card.category !== '大施設');
}

function validateRenovationPayload(game, data) {
    if (!hasPendingAction(game, 'resolveRenovation') || !isPlainObject(data)) return false;
    if (!isNonEmptyString(data.landmarkName)) return false;
    const current = game.currentPlayer();
    if (!Object.prototype.hasOwnProperty.call(current.landmarks, data.landmarkName)) return false;
    return current.landmarks[data.landmarkName] === true;
}

function validateGameAction(room, socket, action, data) {
    const mirror = createRoomMirror(room);
    if (!mirror) return { ok: false };
    const { game, cpuPlayers, shopStock } = mirror;
    const currentIndex = game.currentPlayerIndex;
    const currentIsCpu = !!cpuPlayers[currentIndex];
    const hostPlayerIndex = room.hostPlayerIndex;

    if (currentIsCpu) {
        if (socket.playerIndex !== hostPlayerIndex) return { ok: false };
    } else if (socket.playerIndex !== currentIndex) {
        return { ok: false };
    }

    const allowed = getAllowedActions(game);
    if (!allowed.has(action)) return { ok: false };

    if (action === 'resolveTV') {
        return {
            ok: Number.isInteger(data.targetIndex) &&
            data.targetIndex >= 0 &&
            data.targetIndex < game.players.length &&
            data.targetIndex !== currentIndex,
            mirror,
        };
    }

    if (action === 'resolveBusiness') {
        return {
            ok: validateBusinessPayload(game, data),
            mirror,
        };
    }

    if (action === 'resolveCleaning') {
        return {
            ok: validateCleaningPayload(game, data),
            mirror,
        };
    }

    if (action === 'resolveMover') {
        return {
            ok: validateMoverPayload(game, data),
            mirror,
        };
    }

    if (action === 'resolveRenovation') {
        return {
            ok: validateRenovationPayload(game, data),
            mirror,
        };
    }

    if (action === 'buildCard') {
        const cardName = data?.cardName;
        const enabledCards = new Set(room.gameStartPayload?.enabledCards || gameRuntime.CARDS.map(c => c.name));
        const card = gameRuntime.createCardByName(cardName);
        const current = game.currentPlayer();
        return {
            ok: !!card &&
                enabledCards.has(cardName) &&
                (shopStock[cardName] || 0) > 0 &&
                !game.builtThisTurn &&
                current.coins >= card.cost &&
                !(card.color === 'purple' && current.countCard(card.name) > 0),
            mirror,
        };
    }

    if (action === 'undoBuild') {
        return {
            ok: !!room.lastUndoState && game.builtThisTurn,
            mirror,
        };
    }

    return { ok: true, mirror };
}

function getAllowedActions(game) {
    if (game.pendingIT) return new Set(['resolveIT']);
    switch (game.phase) {
        case 'roll':
            return new Set(['rollDice']);
        case 'selectDice':
            return new Set(['selectDice']);
        case 'rerollConfirm':
            return new Set(['rerollDice', 'skipReroll']);
        case 'harborChoice':
            return new Set(['resolveHarbor']);
        case 'pending': {
            const actions = new Set();
            if (game.pendingTV > 0) actions.add('resolveTV');
            if (game.pendingBusiness > 0) actions.add('resolveBusiness');
            if (game.pendingCleaning > 0) actions.add('resolveCleaning');
            if (game.pendingMover > 0) actions.add('resolveMover');
            if (game.pendingRenovation > 0) actions.add('resolveRenovation');
            return actions;
        }
        case 'build':
            return new Set(['buildCard', 'buildLandmark', 'nextTurn', 'undoBuild']);
        default:
            return new Set();
    }
}

function checkGameStart(io, roomId) {
    const room = rooms[roomId];
    if (!room || room.started) return;

    // 人間枠が全員揃ったか確認
    const humanSlots = room.playerSettings.length > 0
        ? room.playerSettings.filter(s => s.type === "human").length
        : room.maxPlayers;

    if (room.players.length >= humanSlots) {
        room.started = true;
        let cpuCount = 0;
        const playerNames = room.playerSettings.length > 0
            ? room.playerSettings.map((s, i) => {
                if (s.type === "cpu") {
                    cpuCount++;
                    const diffLabel = s.difficulty === 'weak' ? '弱' : s.difficulty === 'normal' ? '普' : '強';
                    return `CPU${cpuCount}（${diffLabel}）`;
                }
                const p = room.players.find(p => p.index === i);
                if (p) return p.name;
                return "不明";
            })
            : room.players.map(p => p.name);

        // ターン順をランダムにシャッフル
        const playerOrder = playerNames.map((_, i) => i);
        for (let i = playerOrder.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [playerOrder[i], playerOrder[j]] = [playerOrder[j], playerOrder[i]];
        }

        const gameStartPayload = {
            enabledCards: room.enabledCards,
            playerNames,
            playerSettings: room.playerSettings,
            cpuSpeed: room.cpuSpeed,
            playerOrder
        };
        rooms[roomId].gameStartPayload = gameStartPayload;
        rooms[roomId].actionLog = [];
        rooms[roomId].lastUndoState = null;
        rooms[roomId].lastTouchedAt = Date.now();
        io.to(roomId).emit('gameStart', gameStartPayload);
        console.log(`ゲーム開始: ${roomId} プレイヤー: ${playerNames.join(', ')}`);
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`サーバー起動: http://localhost:${PORT}`);
});
