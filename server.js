const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const crypto = require('crypto');
const { execSync } = require('child_process');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const gameRuntime = loadGameRuntime();
const MAX_ACTION_LOG_LENGTH = 200;

function resolveBuildHash() {
    if (process.env.BUILD_HASH) return process.env.BUILD_HASH;
    try {
        return execSync('git rev-parse --short HEAD', { timeout: 3000 }).toString().trim();
    } catch {
        return Date.now().toString(36);
    }
}

const BUILD_HASH = require.main === module ? resolveBuildHash() : (process.env.BUILD_HASH || 'test');
if (require.main === module) {
    console.log(`Build hash: ${BUILD_HASH}`);
}

// sw.jsにビルドハッシュを注入して返す（staticより前に登録する必要がある）
const swTemplate = fs.readFileSync(path.join(__dirname, 'sw.js'), 'utf8');
const swContent = swTemplate.replace("'machikoro-v1'", `'machikoro-${BUILD_HASH}'`);
// TWA用 Digital Asset Links（ビルド後にSHA256フィンガープリントを更新すること）
const ASSET_LINKS = [{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
        namespace: 'android_app',
        package_name: 'com.machikoro.game',
        sha256_cert_fingerprints: [
            '27:35:FB:EC:2C:82:C0:DD:5D:4D:24:C1:0F:36:6C:C2:F6:69:91:ED:6B:6B:80:15:BD:DE:2A:22:49:DC:2A:D1'
        ]
    }
}];
app.get('/.well-known/assetlinks.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.json(ASSET_LINKS);
});

app.get('/sw.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.send(swContent);
});

app.get('/api/version', (req, res) => {
    res.json({ hash: BUILD_HASH });
});

app.use(express.static(path.join(__dirname)));

const rooms = {};
const APP_ERROR_EVENT = 'appError';

function emitAppError(socket, message) {
    socket.emit(APP_ERROR_EVENT, message);
}

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
const roomGcInterval = setInterval(() => {
    const TTL = 2 * 60 * 60 * 1000;
    const now = Date.now();
    for (const [id, room] of Object.entries(rooms)) {
        if (room.started && room.lastTouchedAt && now - room.lastTouchedAt > TTL) {
            delete rooms[id];
            console.log(`ルーム削除（TTL）: ${id}`);
        }
    }
}, 10 * 60 * 1000);
if (typeof roomGcInterval.unref === 'function') {
    roomGcInterval.unref();
}

io.on('connection', (socket) => {
    console.log('接続:', socket.id);

    socket.on('createRoom', ({ playerName, playerCount, playerSettings, cpuSpeed, enabledCards, enabledLandmarks, clientVersion }) => {
        socket.clientVersion = clientVersion || 'unknown';
        playerName = sanitizeName(playerName);
        if (!playerName) { emitAppError(socket, '名前が無効です'); return; }
        let roomId;
        do { roomId = Math.random().toString(36).substr(2, 6).toUpperCase(); } while (rooms[roomId]);
        const reconnectToken = generateReconnectToken();
        const allLandmarks = gameRuntime.Player.landmarkNames();
        const validLandmarks = new Set(allLandmarks);
        const selectedLandmarks = Array.isArray(enabledLandmarks)
            ? enabledLandmarks.filter(name => validLandmarks.has(name))
            : allLandmarks;
        if (selectedLandmarks.length === 0) {
            emitAppError(socket, 'ランドマークは最低1つ必要です');
            return;
        }
        // ホストの人間枠を探す
        let hostIndex = 0;
        if (playerSettings && playerSettings.length > 0) {
            hostIndex = playerSettings.findIndex(s => s.type === "human");
            if (hostIndex === -1) {
                emitAppError(socket, 'オンライン対戦は最低1人の人間プレイヤーが必要です');
                return;
            }
        }
        rooms[roomId] = {
            enabledCards: enabledCards || null,
            enabledLandmarks: selectedLandmarks,
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

    socket.on('joinRoom', ({ roomId, playerName, clientVersion }) => {
        socket.clientVersion = clientVersion || 'unknown';
        playerName = sanitizeName(playerName);
        if (!playerName) { emitAppError(socket, '名前が無効です'); return; }
        const room = rooms[roomId];
        if (!room) { emitAppError(socket, 'ルームが見つかりません'); return; }
        if (room.started) { emitAppError(socket, 'ゲームはすでに開始されています'); return; }

        // 重複参加チェック
        if (room.players.some(p => p.id === socket.id)) {
            emitAppError(socket, 'すでにこのルームに参加しています');
            return;
        }
        if (room.players.some(p => p.name === playerName)) {
            emitAppError(socket, 'その名前はすでに使われています');
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
                emitAppError(socket, '参加できる枠がありません');
                return;
            }
            playerIndex = room.players.length;
        }

        if (playerIndex === -1) {
            emitAppError(socket, '参加できる枠がありません');
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
        let validation;
        try {
            validation = validateGameAction(room, socket, action, data);
        } catch (e) {
            console.error('validateGameAction error:', e);
            emitAppError(socket, '無効な操作です');
            return;
        }
        if (!validation.ok) {
            emitAppError(socket, '無効な操作です');
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
            compactRoomActionLog(room);
            room.lastTouchedAt = Date.now();
        }
        socket.to(roomId).emit('gameAction', { action, data: safeData, playerIndex: socket.playerIndex });
    });

    socket.on('rejoinRoom', ({ roomId, playerIndex, playerName, reconnectToken }) => {
        const room = rooms[roomId];
        if (!room) { emitAppError(socket, 'ROOM_NOT_FOUND'); return; }
        if (!room.started) { emitAppError(socket, 'ゲームはまだ開始されていません'); return; }

        const player = resolveRejoinPlayer(room, playerIndex, playerName, reconnectToken, socket.id);
        if (!player) { emitAppError(socket, '再接続情報が一致しません'); return; }

        socket.join(roomId);
        socket.roomId = roomId;
        socket.playerIndex = playerIndex;

        socket.emit('rejoinData', {
            gameStartPayload: room.gameStartPayload,
            stateSnapshot: room.stateSnapshot || null,
            actionLog: room.actionLog || [],
            playerIndex,
        });
        io.to(roomId).emit('playerRejoined', { playerIndex, playerName });
        console.log(`再接続: ${playerName} (ルーム: ${roomId})`);
    });

    // サーバー再起動後にホストがルームを復元する
    socket.on('recreateRoom', ({ roomId, gameStartPayload, stateSnapshot, actionLog, playerIndex, playerName }) => {
        if (!roomId || !gameStartPayload) { emitAppError(socket, '復元データが不完全です'); return; }
        if (rooms[roomId]) {
            // ルームが既に存在する場合は通常の再接続へ誘導
            emitAppError(socket, 'ROOM_NOT_FOUND'); // 再度rejoinRoomを試みさせる
            return;
        }
        const playerNames = gameStartPayload.playerNames || [];
        if (!Number.isInteger(playerIndex) || playerIndex < 0 || playerIndex >= playerNames.length) {
            emitAppError(socket, '復元データが不完全です'); return;
        }
        rooms[roomId] = {
            players: [{ id: socket.id, index: playerIndex, name: playerName, reconnectToken: '' }],
            playerSettings: gameStartPayload.playerSettings || [],
            maxPlayers: playerNames.length,
            started: true,
            restored: true,
            hostPlayerIndex: playerIndex,
            enabledCards: gameStartPayload.enabledCards || [],
            enabledLandmarks: gameStartPayload.enabledLandmarks || [],
            cpuSpeed: gameStartPayload.cpuSpeed || 1500,
            gameStartPayload,
            stateSnapshot: stateSnapshot || null,
            actionLog: actionLog || [],
            lastUndoState: null,
            lastTouchedAt: Date.now(),
        };
        socket.join(roomId);
        socket.roomId = roomId;
        socket.playerIndex = playerIndex;
        socket.emit('rejoinData', { gameStartPayload, stateSnapshot: null, actionLog: actionLog || [], playerIndex });
        console.log(`ルーム復元: ${roomId} by ${playerName}(${playerIndex})`);
    });

    socket.on('disconnect', () => {
        try {
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
                    if (disconnectedPlayer) disconnectedPlayer.id = null;
                    io.to(roomId).emit('playerDisconnected', {
                        playerIndex: socket.playerIndex,
                        playerName: disconnectedPlayer?.name || `プレイヤー${socket.playerIndex + 1}`,
                    });
                    // ホストが切断した場合、残存プレイヤーの中から新ホストを選出
                    if (socket.playerIndex === room.hostPlayerIndex) {
                        const remaining = getRemainingConnectedPlayers(room, io.sockets.sockets, socket.id);
                        if (remaining.length > 0) {
                            room.hostPlayerIndex = remaining[0].index;
                            io.to(roomId).emit('hostChanged', { newHostPlayerIndex: room.hostPlayerIndex });
                            console.log(`ホスト移譲: ${roomId} → プレイヤー${room.hostPlayerIndex}`);
                        }
                    }
                }
                console.log(`切断: ${socket.id} (ルーム: ${roomId})`);
            }
        } catch (e) {
            console.error('disconnect handler error:', e);
        }
    });
});

function resolveRejoinPlayer(room, playerIndex, playerName, reconnectToken, socketId) {
    let player = room.players.find(p =>
        p.index === playerIndex &&
        p.name === playerName &&
        p.reconnectToken === reconnectToken
    );
    if (!player && room.restored) {
        const names = room.gameStartPayload?.playerNames || [];
        if (Number.isInteger(playerIndex) && names[playerIndex] === playerName) {
            player = room.players.find(p => p.index === playerIndex && p.name === playerName);
            if (!player) {
                player = { id: socketId, index: playerIndex, name: playerName, reconnectToken: '' };
                room.players.push(player);
            }
        }
    }
    if (!player) return null;
    player.id = socketId;
    return player;
}

function getRemainingConnectedPlayers(room, sockets, disconnectedSocketId) {
    return room.players.filter(p =>
        p.id &&
        p.id !== disconnectedSocketId &&
        sockets.has(p.id)
    );
}

function serializeMirrorState(game, shopStock) {
    return {
        players: game.players.map(p => ({
            name: p.name,
            coins: p.coins,
            cards: p.cards.map(c => c.name),
            dormantIndices: p.dormantCards.map(dc => p.cards.indexOf(dc)).filter(i => i >= 0),
            landmarks: Object.assign({}, p.landmarks),
            itVentureCoins: p.itVentureCoins,
            hasYakusho: p.hasYakusho,
        })),
        currentPlayerIndex: game.currentPlayerIndex,
        phase: game.phase,
        log: [...game.log],
        lastDiceResult: game.lastDiceResult,
        lastDice1: game.lastDice1,
        lastDice2: game.lastDice2,
        builtThisTurn: game.builtThisTurn,
        pendingTV: game.pendingTV,
        pendingBusiness: game.pendingBusiness,
        pendingCleaning: game.pendingCleaning,
        pendingMover: game.pendingMover,
        pendingRenovation: game.pendingRenovation,
        pendingIT: game.pendingIT,
        usedReroll: game.usedReroll,
        pendingTunaDice: game.pendingTunaDice,
        turnCount: game.turnCount,
        hadAmusementParkAtRoll: game.hadAmusementParkAtRoll,
        shopStock: Object.assign({}, shopStock),
    };
}

function compactRoomActionLog(room) {
    if (!room.actionLog || room.actionLog.length <= MAX_ACTION_LOG_LENGTH) return;
    const mirror = createRoomMirror(room);
    if (!mirror) return;
    room.stateSnapshot = serializeMirrorState(mirror.game, mirror.shopStock);
    room.actionLog = [];
}

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
        'this.Card = Card; this.Player = Player; this.GameManager = GameManager; this.CARDS = CARDS; this.createCardByName = createCardByName; this.GAME_PHASES = GAME_PHASES; this.CARD_CATEGORIES = CARD_CATEGORIES; this.LANDMARK_NAMES = LANDMARK_NAMES;',
        context
    );
    return context;
}

function createRoomMirror(room) {
    if (!room.gameStartPayload) return null;
    const { GameManager, CARDS, createCardByName, Player } = gameRuntime;
    const { playerNames, playerSettings, playerOrder, enabledCards, enabledLandmarks } = room.gameStartPayload;
    const game = new GameManager(playerNames.length);
    game.enabledLandmarks = new Set((enabledLandmarks && enabledLandmarks.length > 0) ? enabledLandmarks : Player.landmarkNames());
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

    if (room.stateSnapshot) {
        restoreMirrorState(game, shopStock, room.stateSnapshot, createCardByName);
    }
    for (const { action, data } of room.actionLog || []) {
        applyActionToMirror(game, shopStock, action, data, createCardByName);
    }
    return { game, shopStock, cpuPlayers };
}

function restoreMirrorState(game, shopStock, state, createCardByName) {
    if (!state) return;
    game.players.forEach((p, i) => {
        const playerState = state.players[i];
        if (!playerState) return;
        p.name = playerState.name;
        p.coins = playerState.coins;
        p.cards = playerState.cards.map(name => createCardByName(name)).filter(Boolean);
        p.dormantCards = (playerState.dormantIndices || []).map(idx => p.cards[idx]).filter(Boolean);
        p.landmarks = Object.assign({}, playerState.landmarks);
        p.itVentureCoins = playerState.itVentureCoins || 0;
        p.hasYakusho = playerState.hasYakusho !== false;
    });
    Object.assign(shopStock, state.shopStock || {});
    game.currentPlayerIndex = state.currentPlayerIndex || 0;
    game.phase = state.phase || game.phase;
    game.log = state.log || [];
    game.lastDiceResult = state.lastDiceResult || 0;
    game.lastDice1 = state.lastDice1 || 0;
    game.lastDice2 = state.lastDice2 || 0;
    game.builtThisTurn = state.builtThisTurn || false;
    game.pendingTV = state.pendingTV || 0;
    game.pendingBusiness = state.pendingBusiness || 0;
    game.pendingCleaning = state.pendingCleaning || 0;
    game.pendingMover = state.pendingMover || 0;
    game.pendingRenovation = state.pendingRenovation || 0;
    game.pendingIT = state.pendingIT || false;
    game.usedReroll = state.usedReroll || false;
    game.pendingTunaDice = state.pendingTunaDice || null;
    game.turnCount = state.turnCount || 0;
    game.hadAmusementParkAtRoll = state.hadAmusementParkAtRoll || false;
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
    game.hadAmusementParkAtRoll = state.hadAmusementParkAtRoll || false;
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
        hadAmusementParkAtRoll: game.hadAmusementParkAtRoll,
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
    if (game.phase !== gameRuntime.GAME_PHASES.PENDING) return false;
    if (action === 'resolveBusiness') return game.pendingBusiness > 0;
    if (action === 'resolveCleaning') return game.pendingCleaning > 0;
    if (action === 'resolveMover') return game.pendingMover > 0;
    if (action === 'resolveRenovation') return game.pendingRenovation > 0;
    return false;
}

function validateBusinessPayload(game, data) {
    if (!hasPendingAction(game, 'resolveBusiness') || !isPlainObject(data)) return false;
    const { myCard, targetIndex, theirCard } = data;
    if (!isPlayerIndex(targetIndex, game)) {
        return false;
    }
    if (targetIndex === game.currentPlayerIndex) return false;
    const current = game.currentPlayer();
    const target = game.players[targetIndex];
    return !!game._resolveCardRef(current, myCard) &&
        !!game._resolveCardRef(target, theirCard);
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
    const cardRef = Object.prototype.hasOwnProperty.call(data, 'cardIndex') ? data.cardIndex : data.cardName;
    const { targetIndex } = data;
    if (!isPlayerIndex(targetIndex, game)) return false;
    if (targetIndex === game.currentPlayerIndex) return false;
    const current = game.currentPlayer();
    return !!game._resolveCardRef(current, cardRef);
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

    // playerOrderシャッフル後のゲーム内位置→元のプレイヤーインデックスに変換
    const playerOrder = room.gameStartPayload?.playerOrder;
    const originalCurrentIndex = playerOrder ? playerOrder[currentIndex] : currentIndex;

    if (currentIsCpu) {
        if (socket.playerIndex !== hostPlayerIndex) return { ok: false };
    } else if (socket.playerIndex !== originalCurrentIndex) {
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

    if (action === 'buildLandmark') {
        const name = data?.name;
        const enabledLandmarks = new Set(room.gameStartPayload?.enabledLandmarks || gameRuntime.Player.landmarkNames());
        const current = game.currentPlayer();
        const cost = gameRuntime.Player.landmarkCost(name);
        return {
            ok: enabledLandmarks.has(name) &&
                !game.builtThisTurn &&
                !current.landmarks[name] &&
                current.coins >= cost,
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
    const { ROLL, SELECT_DICE, REROLL_CONFIRM, HARBOR_CHOICE, PENDING, BUILD } = gameRuntime.GAME_PHASES;
    if (game.pendingIT) return new Set(['resolveIT']);
    switch (game.phase) {
        case ROLL:
            return new Set(['rollDice']);
        case SELECT_DICE:
            return new Set(['selectDice']);
        case REROLL_CONFIRM:
            return new Set(['rerollDice', 'skipReroll']);
        case HARBOR_CHOICE:
            return new Set(['resolveHarbor']);
        case PENDING: {
            const actions = new Set();
            if (game.pendingTV > 0) actions.add('resolveTV');
            if (game.pendingBusiness > 0) actions.add('resolveBusiness');
            if (game.pendingCleaning > 0) actions.add('resolveCleaning');
            if (game.pendingMover > 0) actions.add('resolveMover');
            if (game.pendingRenovation > 0) actions.add('resolveRenovation');
            return actions;
        }
        case BUILD:
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

        const versions = room.players.map(p => {
            const s = io.sockets.sockets.get(p.id);
            return s ? (s.clientVersion || 'unknown') : 'unknown';
        });
        const gameStartPayload = {
            enabledCards: room.enabledCards,
            enabledLandmarks: room.enabledLandmarks,
            playerNames,
            playerSettings: room.playerSettings,
            cpuSpeed: room.cpuSpeed,
            playerOrder,
            versions
        };
        rooms[roomId].gameStartPayload = gameStartPayload;
        rooms[roomId].stateSnapshot = null;
        rooms[roomId].actionLog = [];
        rooms[roomId].lastUndoState = null;
        rooms[roomId].lastTouchedAt = Date.now();
        io.to(roomId).emit('gameStart', gameStartPayload);
        console.log(`ゲーム開始: ${roomId} プレイヤー: ${playerNames.join(', ')}`);
    }
}

process.on('uncaughtException', (err) => {
    console.error('uncaughtException:', err);
});
process.on('unhandledRejection', (reason) => {
    console.error('unhandledRejection:', reason);
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
    server.listen(PORT, '0.0.0.0', () => {
        console.log(`サーバー起動: http://localhost:${PORT}`);
    });
}

module.exports = {
    __rooms: rooms,
    APP_ERROR_EVENT,
    emitAppError,
    resolveBuildHash,
    sanitizeName,
    buildPlayerList,
    resolveRejoinPlayer,
    getRemainingConnectedPlayers,
    serializeMirrorState,
    restoreMirrorState,
    compactRoomActionLog,
    createRoomMirror,
    applyActionToMirror,
    restoreUndoMirror,
    makeUndoStateFromMirror,
    validateBusinessPayload,
    validateCleaningPayload,
    validateMoverPayload,
    validateRenovationPayload,
    validateGameAction,
    getAllowedActions,
    checkGameStart,
    loadGameRuntime,
};
