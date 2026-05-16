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
const ROOM_LIFECYCLE_LIMITS = Object.freeze({
    startedRoomTtlMs: 2 * 60 * 60 * 1000,
    pendingRoomTtlMs: 30 * 60 * 1000,
    maxRooms: 500,
    createRoomRateLimitMs: 5000,
});
const RESTORE_PAYLOAD_LIMITS = Object.freeze({
    maxJsonBytes: 1024 * 1024,
    maxActionLogEntries: 1000,
    maxStringLength: 4000,
    maxTotalStringChars: 200000,
    maxPlayerCardRefs: 5000,
});

function resolveBuildHash() {
    if (process.env.BUILD_HASH) return process.env.BUILD_HASH;
    try {
        return execSync('git rev-parse --short HEAD', { timeout: 3000 }).toString().trim();
    } catch {
        return Date.now().toString(36);
    }
}

function injectServiceWorkerBuildHash(content, buildHash) {
    return String(content).replace(/'machikoro-v[^']*'/, `'machikoro-${buildHash}'`);
}

function injectIndexBuildHash(content, buildHash) {
    const script = `<script>window.MACHIKORO_CLIENT_VERSION=${JSON.stringify(buildHash)};</script>`;
    return String(content).replace('</head>', `    ${script}\n</head>`);
}

const BUILD_HASH = require.main === module ? resolveBuildHash() : (process.env.BUILD_HASH || 'test');
if (require.main === module) {
    console.log(`Build hash: ${BUILD_HASH}`);
}

// sw.jsにビルドハッシュを注入して返す（staticより前に登録する必要がある）
const swTemplate = fs.readFileSync(path.join(__dirname, 'sw.js'), 'utf8');
const swContent = injectServiceWorkerBuildHash(swTemplate, BUILD_HASH);
const indexTemplate = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const indexContent = injectIndexBuildHash(indexTemplate, BUILD_HASH);
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

function sendIndexWithBuildHash(req, res) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.send(indexContent);
}

app.get('/', sendIndexWithBuildHash);
app.get('/index.html', sendIndexWithBuildHash);

app.use(express.static(path.join(__dirname)));

const rooms = {};
const APP_ERROR_EVENT = 'appError';

function emitAppError(socket, message) {
    socket.emit(APP_ERROR_EVENT, message);
}

function requirePlainSocketPayload(socket, payload) {
    if (isPlainObject(payload)) return true;
    emitAppError(socket, '無効なリクエストです');
    return false;
}

function roomTimestamp(value) {
    return Number.isFinite(value) ? value : 0;
}

function isRoomExpired(room, now = Date.now()) {
    if (!room) return false;
    const ttl = room.started
        ? ROOM_LIFECYCLE_LIMITS.startedRoomTtlMs
        : ROOM_LIFECYCLE_LIMITS.pendingRoomTtlMs;
    const touchedAt = roomTimestamp(room.lastTouchedAt) || roomTimestamp(room.createdAt);
    return touchedAt > 0 && now - touchedAt > ttl;
}

function cleanupExpiredRooms(now = Date.now(), targetRooms = rooms) {
    let deleted = 0;
    for (const [id, room] of Object.entries(targetRooms)) {
        if (isRoomExpired(room, now)) {
            delete targetRooms[id];
            deleted++;
            console.log(`ルーム削除（TTL）: ${id}`);
        }
    }
    return deleted;
}

function canCreateRoomForSocket(socket, now = Date.now()) {
    const lastCreatedAt = roomTimestamp(socket && socket.lastCreateRoomAt);
    return lastCreatedAt === 0 || now - lastCreatedAt >= ROOM_LIFECYCLE_LIMITS.createRoomRateLimitMs;
}

function markCreateRoomForSocket(socket, now = Date.now()) {
    if (socket) socket.lastCreateRoomAt = now;
}

function validateCreateRoomLifecycle(socket, now = Date.now(), targetRooms = rooms) {
    cleanupExpiredRooms(now, targetRooms);
    if (Object.keys(targetRooms).length >= ROOM_LIFECYCLE_LIMITS.maxRooms) {
        return { ok: false, message: 'ルーム数が上限に達しています。しばらくしてから再試行してください' };
    }
    if (!canCreateRoomForSocket(socket, now)) {
        return { ok: false, message: 'ルーム作成が短時間に連続しています。少し待ってから再試行してください' };
    }
    return { ok: true };
}

function sanitizeName(name) {
    return String(name || '').trim().slice(0, 20).replace(/[<>&"'`]/g, '');
}

function cpuDifficultyLabel(difficulty) {
    if (difficulty === 'weak') return '弱';
    if (difficulty === 'normal') return '普';
    if (difficulty === 'strong') return '強';
    if (difficulty === 'rl') return '学';
    return '最強';
}

const ALLOWED_CPU_DIFFICULTIES = new Set(['weak', 'normal', 'strong', 'expert', 'rl']);
const ALLOWED_RL_MODEL_IDS = new Set([
    'self-only-4p-h256-lr1e5-5000-seed103',
    'self-only-both-h256-lr2e5-5000-seed71-rewardcap-top3',
    'self-only-both-h256-lr2e5-5000-seed70-rewardcap',
    'self-only-both-h256-lr2e5-5000-seed69-rewardcap',
]);

function normalizePlayerSettings(playerSettings, playerCount) {
    if (!Array.isArray(playerSettings)) {
        return Array.from({ length: playerCount }, () => ({ type: 'human', difficulty: 'normal' }));
    }
    const normalized = playerSettings.slice(0, playerCount).map((setting) => {
        if (!setting || setting.type !== 'cpu') return { type: 'human', difficulty: 'normal' };
        const difficulty = ALLOWED_CPU_DIFFICULTIES.has(setting.difficulty) ? setting.difficulty : 'normal';
        const normalized = { type: 'cpu', difficulty };
        if (difficulty === 'rl' && ALLOWED_RL_MODEL_IDS.has(setting.rlModelId)) {
            normalized.rlModelId = setting.rlModelId;
        }
        return normalized;
    });
    while (normalized.length < playerCount) {
        normalized.push({ type: 'human', difficulty: 'normal' });
    }
    return normalized;
}

function hasInvalidRlModelId(playerSettings) {
    if (!Array.isArray(playerSettings)) return false;
    return playerSettings.some(setting =>
        setting?.type === 'cpu' &&
        setting.difficulty === 'rl' &&
        typeof setting.rlModelId === 'string' &&
        !ALLOWED_RL_MODEL_IDS.has(setting.rlModelId)
    );
}

function hasMissingRlModelId(playerSettings) {
    if (!Array.isArray(playerSettings)) return false;
    return playerSettings.some(setting =>
        setting?.type === 'cpu' &&
        setting.difficulty === 'rl' &&
        typeof setting.rlModelId !== 'string'
    );
}

function hasInvalidOnlineRlModelSettings(playerSettings) {
    return hasMissingRlModelId(playerSettings) || hasInvalidRlModelId(playerSettings);
}

function normalizeCpuSpeed(cpuSpeed) {
    const value = Number(cpuSpeed);
    if (!Number.isFinite(value)) return 1500;
    return Math.max(0, Math.min(5000, Math.floor(value)));
}

function normalizeEnabledCards(enabledCards) {
    const allCards = gameRuntime.CARDS.map(card => card.name);
    if (!Array.isArray(enabledCards)) return allCards;
    const validCards = new Set(allCards);
    const selected = enabledCards.filter(name => validCards.has(name));
    return selected.length > 0 ? [...new Set(selected)] : allCards;
}

function generateReconnectToken() {
    if (typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return crypto.randomBytes(16).toString('hex');
}

const ROOM_ID_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

function generateRoomId(existingRooms = rooms) {
    let roomId;
    do {
        roomId = '';
        for (let i = 0; i < 6; i++) {
            roomId += ROOM_ID_ALPHABET[Math.floor(Math.random() * ROOM_ID_ALPHABET.length)];
        }
    } while (existingRooms[roomId]);
    return roomId;
}

function hashReconnectToken(token) {
    return token ? crypto.createHash('sha256').update(String(token)).digest('hex') : '';
}

function acceptedClientActionKey(playerIndex, clientActionId) {
    return `${playerIndex}:${clientActionId}`;
}

function findAcceptedClientAction(room, clientActionId, playerIndex) {
    if (!room || typeof clientActionId !== 'string' || !clientActionId || !Number.isInteger(playerIndex)) return null;
    const matchesPlayer = entry => entry && entry.clientActionId === clientActionId && entry.playerIndex === playerIndex;
    const key = acceptedClientActionKey(playerIndex, clientActionId);
    if (room.acceptedClientActions && matchesPlayer(room.acceptedClientActions[key])) {
        return room.acceptedClientActions[key];
    }
    if (room.acceptedClientActions && matchesPlayer(room.acceptedClientActions[clientActionId])) {
        return room.acceptedClientActions[clientActionId];
    }
    return (room.actionLog || []).find(matchesPlayer) || null;
}

function rememberAcceptedClientAction(room, actionEntry) {
    if (!room || !actionEntry || typeof actionEntry.clientActionId !== 'string' || !actionEntry.clientActionId || !Number.isInteger(actionEntry.playerIndex)) return;
    if (!room.acceptedClientActions) room.acceptedClientActions = {};
    room.acceptedClientActions[acceptedClientActionKey(actionEntry.playerIndex, actionEntry.clientActionId)] = actionEntry;
    const ids = Object.keys(room.acceptedClientActions);
    if (ids.length > 100) {
        ids.sort((a, b) => (room.acceptedClientActions[a].seq || 0) - (room.acceptedClientActions[b].seq || 0));
        for (const id of ids.slice(0, ids.length - 100)) delete room.acceptedClientActions[id];
    }
}

// 開始済み/未開始ルームのGC。未開始roomはspam対策として短めに削除する。
const roomGcInterval = setInterval(() => {
    cleanupExpiredRooms(Date.now(), rooms);
}, 10 * 60 * 1000);
if (typeof roomGcInterval.unref === 'function') {
    roomGcInterval.unref();
}

io.on('connection', (socket) => {
    console.log('接続:', socket.id);

    socket.on('createRoom', (payload) => {
        if (!requirePlainSocketPayload(socket, payload)) return;
        let { playerName, playerCount, playerSettings, cpuSpeed, enabledCards, enabledLandmarks, clientVersion } = payload;
        socket.clientVersion = clientVersion || 'unknown';
        playerName = sanitizeName(playerName);
        if (!playerName) { emitAppError(socket, '名前が無効です'); return; }
        playerCount = Number(playerCount);
        if (!Number.isInteger(playerCount) || playerCount < 2 || playerCount > 10) {
            emitAppError(socket, 'プレイヤー数が無効です');
            return;
        }
        if (hasInvalidOnlineRlModelSettings(playerSettings)) {
            emitAppError(socket, 'RLモデルIDが無効です');
            return;
        }
        playerSettings = normalizePlayerSettings(playerSettings, playerCount);
        cpuSpeed = normalizeCpuSpeed(cpuSpeed);
        const now = Date.now();
        const roomLifecycle = validateCreateRoomLifecycle(socket, now, rooms);
        if (!roomLifecycle.ok) {
            emitAppError(socket, roomLifecycle.message);
            return;
        }
        const roomId = generateRoomId();
        const reconnectToken = generateReconnectToken();
        const selectedCards = normalizeEnabledCards(enabledCards);
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
        markCreateRoomForSocket(socket, now);
        rooms[roomId] = {
            createdAt: now,
            lastTouchedAt: now,
            enabledCards: selectedCards,
            enabledLandmarks: selectedLandmarks,
            players: [{ id: socket.id, name: playerName, index: hostIndex, reconnectToken }],
            hostPlayerIndex: hostIndex,
            hostEpoch: 0,
            actionSeq: 0,
            acceptedClientActions: {},
            maxPlayers: playerCount,
            playerSettings,
            cpuSpeed,
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

    socket.on('joinRoom', (payload) => {
        if (!requirePlainSocketPayload(socket, payload)) return;
        let { roomId, playerName, clientVersion } = payload;
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
        room.lastTouchedAt = Date.now();
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

    socket.on('gameAction', (payload) => {
        if (!requirePlainSocketPayload(socket, payload)) return;
        const { action, data, clientActionId } = payload;
        const roomId = socket.roomId;
        if (!roomId) return;
        const room = rooms[roomId];
        if (!room || !room.started) return;
        if (!isActiveRoomSocket(room, socket)) {
            emitAppError(socket, 'INVALID_SESSION');
            return;
        }
        const acceptedAction = findAcceptedClientAction(room, clientActionId, socket.playerIndex);
        if (acceptedAction) {
            socket.emit('actionAccepted', acceptedAction);
            return;
        }
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
            safeData = { state: room.lastUndoState || validation.mirror.lastUndoState };
            room.lastUndoState = null;
        } else if (action === 'nextTurn') {
            room.lastUndoState = null;
        }
        const actionSeq = nextRoomActionSeq(room);
        const actionEntry = { action, data: safeData, playerIndex: socket.playerIndex, seq: actionSeq };
        if (typeof clientActionId === 'string') actionEntry.clientActionId = clientActionId;
        rememberAcceptedClientAction(room, actionEntry);
        if (room.actionLog) {
            room.actionLog.push(actionEntry);
            compactRoomActionLog(room);
            room.lastTouchedAt = Date.now();
        }
        socket.to(roomId).emit('gameAction', actionEntry);
        socket.emit('actionAccepted', actionEntry);
    });

    socket.on('rejoinRoom', (payload) => {
        if (!requirePlainSocketPayload(socket, payload)) return;
        const { roomId, playerIndex, playerName, reconnectToken } = payload;
        const room = rooms[roomId];
        if (!room) { emitAppError(socket, 'ROOM_NOT_FOUND'); return; }
        if (!room.started) { emitAppError(socket, 'ゲームはまだ開始されていません'); return; }
        const expectedReconnectTokenHash = getExpectedReconnectTokenHash(room, playerIndex, playerName);
        if (!expectedReconnectTokenHash || hashReconnectToken(reconnectToken) !== expectedReconnectTokenHash) {
            emitAppError(socket, 'INVALID_TOKEN');
            return;
        }

        detachExistingPlayerSocket(room, roomId, playerIndex, socket.id);
        const player = resolveRejoinPlayer(room, playerIndex, playerName, reconnectToken, socket.id);
        if (!player) { emitAppError(socket, '再接続情報が一致しません'); return; }

        socket.join(roomId);
        socket.roomId = roomId;
        socket.playerIndex = playerIndex;
        room.lastTouchedAt = Date.now();

        socket.emit('rejoinData', {
            gameStartPayload: room.gameStartPayload,
            stateSnapshot: room.stateSnapshot || null,
            actionLog: room.actionLog || [],
            playerIndex,
            hostPlayerIndex: room.hostPlayerIndex,
            hostEpoch: room.hostEpoch || 0,
        });
        io.to(roomId).emit('playerRejoined', { playerIndex, playerName });
        console.log(`再接続: ${playerName} (ルーム: ${roomId})`);
    });

    // サーバー再起動後にホストがルームを復元する
    socket.on('recreateRoom', (payload) => {
        handleRecreateRoom(socket, payload);
    });

    socket.on('disconnect', () => {
        handleSocketDisconnect(io, socket);
    });
});

function handleSocketDisconnect(io, socket) {
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
                if (!disconnectedPlayer || disconnectedPlayer.id !== socket.id) return;
                disconnectedPlayer.id = null;
                io.to(roomId).emit('playerDisconnected', {
                    playerIndex: socket.playerIndex,
                    playerName: disconnectedPlayer.name || `プレイヤー${socket.playerIndex + 1}`,
                });
                // ホストが切断した場合、残存プレイヤーの中から新ホストを選出
                if (socket.playerIndex === room.hostPlayerIndex) {
                    const remaining = getRemainingConnectedPlayers(room, io.sockets.sockets, socket.id);
                    if (remaining.length > 0) {
                        setRoomHostPlayerIndex(room, remaining[0].index);
                        io.to(roomId).emit('hostChanged', { newHostPlayerIndex: room.hostPlayerIndex, hostEpoch: room.hostEpoch || 0 });
                        console.log(`ホスト移譲: ${roomId} → プレイヤー${room.hostPlayerIndex}`);
                    }
                }
            }
            console.log(`切断: ${socket.id} (ルーム: ${roomId})`);
        }
    } catch (e) {
        console.error('disconnect handler error:', e);
    }
}

function setRoomHostPlayerIndex(room, hostPlayerIndex) {
    if (room.hostPlayerIndex !== hostPlayerIndex) {
        room.hostEpoch = (Number.isInteger(room.hostEpoch) ? room.hostEpoch : 0) + 1;
    }
    room.hostPlayerIndex = hostPlayerIndex;
    if (room.gameStartPayload && typeof room.gameStartPayload === 'object') {
        room.gameStartPayload.hostPlayerIndex = hostPlayerIndex;
        room.gameStartPayload.hostEpoch = room.hostEpoch || 0;
    }
}

function nextRoomActionSeq(room) {
    const current = Number.isInteger(room.actionSeq) ? room.actionSeq : restorePayloadRank(room.gameStartPayload, room.stateSnapshot, room.actionLog).actionSeq;
    room.actionSeq = current + 1;
    if (room.gameStartPayload && typeof room.gameStartPayload === 'object') {
        room.gameStartPayload.actionSeq = room.actionSeq;
    }
    return room.actionSeq;
}

function restorePayloadRank(gameStartPayload, stateSnapshot, actionLog) {
    const hostEpoch = Number.isInteger(gameStartPayload?.hostEpoch) ? gameStartPayload.hostEpoch : 0;
    const seqValues = [
        Number.isInteger(gameStartPayload?.actionSeq) ? gameStartPayload.actionSeq : 0,
        Number.isInteger(stateSnapshot?.actionSeq) ? stateSnapshot.actionSeq : 0,
    ];
    if (Array.isArray(actionLog)) {
        for (const entry of actionLog) {
            if (Number.isInteger(entry?.seq)) seqValues.push(entry.seq);
        }
    }
    return { hostEpoch, actionSeq: Math.max(0, ...seqValues) };
}

function isIncomingRestoreNewer(room, gameStartPayload, stateSnapshot, actionLog) {
    const currentRank = restorePayloadRank(room.gameStartPayload, room.stateSnapshot, room.actionLog);
    const current = {
        hostEpoch: Number.isInteger(room.hostEpoch) ? room.hostEpoch : currentRank.hostEpoch,
        actionSeq: Number.isInteger(room.actionSeq) ? room.actionSeq : currentRank.actionSeq,
    };
    const incoming = restorePayloadRank(gameStartPayload, stateSnapshot, actionLog);
    return incoming.hostEpoch > current.hostEpoch ||
        (incoming.hostEpoch === current.hostEpoch && incoming.actionSeq > current.actionSeq);
}

function canReplaceRestoredRoom(room, playerIndex, gameStartPayload, stateSnapshot, actionLog) {
    if (!room || room.restored !== true) return false;
    if (!Number.isInteger(playerIndex) || gameStartPayload?.hostPlayerIndex !== playerIndex) return false;
    const currentRank = restorePayloadRank(room.gameStartPayload, room.stateSnapshot, room.actionLog);
    const currentHostEpoch = Number.isInteger(room.hostEpoch) ? room.hostEpoch : currentRank.hostEpoch;
    const incomingRank = restorePayloadRank(gameStartPayload, stateSnapshot, actionLog);
    if (Number.isInteger(room.hostPlayerIndex) &&
            room.hostPlayerIndex !== playerIndex &&
            incomingRank.hostEpoch <= currentHostEpoch) {
        return false;
    }
    return incomingRank.hostEpoch > currentHostEpoch ||
        (incomingRank.hostEpoch === currentHostEpoch &&
            incomingRank.actionSeq > (Number.isInteger(room.actionSeq) ? room.actionSeq : currentRank.actionSeq));
}

function resolveRejoinPlayer(room, playerIndex, playerName, reconnectToken, socketId) {
    const expectedReconnectTokenHash = getExpectedReconnectTokenHash(room, playerIndex, playerName);
    if (!expectedReconnectTokenHash || hashReconnectToken(reconnectToken) !== expectedReconnectTokenHash) return null;

    let player = room.players.find(p => p.index === playerIndex && p.name === playerName);
    if (!player) {
        player = {
            id: socketId,
            index: playerIndex,
            name: playerName,
            reconnectToken: '',
            reconnectTokenHash: expectedReconnectTokenHash,
        };
        room.players.push(player);
    } else if (!player.reconnectTokenHash) {
        player.reconnectTokenHash = expectedReconnectTokenHash;
    }
    player.id = socketId;
    return player;
}

function detachSocketFromRoom(socketId, roomId, message = 'INVALID_SESSION') {
    if (!socketId) return;
    const oldSocket = io.sockets.sockets.get(socketId);
    if (!oldSocket) return;
    emitAppError(oldSocket, message);
    oldSocket.leave(roomId);
    if (oldSocket.roomId === roomId) {
        oldSocket.roomId = null;
        oldSocket.playerIndex = null;
    }
}

function detachExistingPlayerSocket(room, roomId, playerIndex, newSocketId) {
    const existing = room?.players?.find(p => p.index === playerIndex);
    if (!existing || !existing.id || existing.id === newSocketId) return;
    detachSocketFromRoom(existing.id, roomId, 'INVALID_SESSION');
}

function detachRoomSockets(roomId, room, message = 'ROOM_REPLACED') {
    if (!room || !Array.isArray(room.players)) return;
    for (const player of room.players) {
        detachSocketFromRoom(player.id, roomId, message);
        player.id = null;
    }
}

function isActiveRoomSocket(room, socket) {
    if (!room || !socket || !Number.isInteger(socket.playerIndex)) return false;
    const player = room.players.find(p => p.index === socket.playerIndex);
    return !!player && player.id === socket.id;
}

function getExpectedReconnectTokenHash(room, playerIndex, playerName) {
    const player = room.players.find(p => p.index === playerIndex && p.name === playerName);
    if (player?.reconnectTokenHash) return player.reconnectTokenHash;
    if (player?.reconnectToken) return hashReconnectToken(player.reconnectToken);

    const names = room.gameStartPayload?.playerNames || [];
    const reconnectTokenHashes = room.gameStartPayload?.reconnectTokenHashes;
    if (!Number.isInteger(playerIndex) || names[playerIndex] !== playerName || !Array.isArray(reconnectTokenHashes)) {
        return '';
    }
    return reconnectTokenHashes[playerIndex] || '';
}

function handleRecreateRoom(socket, payload = {}) {
    if (!isPlainObject(payload)) {
        emitAppError(socket, '復元データが不完全です');
        return;
    }
    if (!validateRestorePayloadLimits(payload).ok) {
        emitAppError(socket, '復元データが大きすぎます');
        return;
    }
    const { roomId, gameStartPayload, stateSnapshot, actionLog, playerIndex, playerName, reconnectToken } = payload;
    if (!roomId || !gameStartPayload || !reconnectToken) {
        emitAppError(socket, '復元データが不完全です');
        return;
    }
    if (rooms[roomId]) {
        const room = rooms[roomId];
        if (!room.started) {
            emitAppError(socket, '同じルームIDが既に使用されています');
            return;
        }
        const incomingCanReplace = isValidGameStartPayload(gameStartPayload, Array.isArray(gameStartPayload.playerNames) ? gameStartPayload.playerNames.length : 0) &&
            !hasInvalidOnlineRlModelSettings(gameStartPayload.playerSettings) &&
            Number.isInteger(playerIndex) &&
            getExpectedReconnectTokenHash({ players: [], gameStartPayload }, playerIndex, playerName) &&
            hashReconnectToken(reconnectToken) === getExpectedReconnectTokenHash({ players: [], gameStartPayload }, playerIndex, playerName) &&
            canReplaceRestoredRoom(room, playerIndex, gameStartPayload, stateSnapshot, actionLog);
        if (!incomingCanReplace) {
            const expectedReconnectTokenHash = getExpectedReconnectTokenHash(room, playerIndex, playerName);
            if (!expectedReconnectTokenHash || hashReconnectToken(reconnectToken) !== expectedReconnectTokenHash) {
                emitAppError(socket, 'INVALID_TOKEN');
                return;
            }
            detachExistingPlayerSocket(room, roomId, playerIndex, socket.id);
            const player = resolveRejoinPlayer(room, playerIndex, playerName, reconnectToken, socket.id);
            if (!player) {
                emitAppError(socket, '再接続情報が一致しません');
                return;
            }
            socket.join(roomId);
            socket.roomId = roomId;
            socket.playerIndex = playerIndex;
            const hostPlayer = room.players.find(p => p.index === room.hostPlayerIndex);
            if (!hostPlayer?.id || !io.sockets.sockets.has(hostPlayer.id)) {
                setRoomHostPlayerIndex(room, playerIndex);
                io.to(roomId).emit('hostChanged', { newHostPlayerIndex: room.hostPlayerIndex, hostEpoch: room.hostEpoch || 0 });
                console.log(`ホスト再選出: ${roomId} → プレイヤー${room.hostPlayerIndex}`);
            }
            room.lastTouchedAt = Date.now();
            socket.emit('rejoinData', {
                gameStartPayload: room.gameStartPayload,
                stateSnapshot: room.stateSnapshot || null,
                actionLog: room.actionLog || [],
                playerIndex,
                hostPlayerIndex: room.hostPlayerIndex,
                hostEpoch: room.hostEpoch || 0,
            });
            io.to(roomId).emit('playerRejoined', { playerIndex, playerName });
            return;
        }
    }
    if (!Array.isArray(gameStartPayload.playerNames)) {
        emitAppError(socket, '復元データが不完全です');
        return;
    }
    const playerNames = gameStartPayload.playerNames;
    if (!isValidGameStartPayload(gameStartPayload, playerNames.length)) {
        emitAppError(socket, '復元データが不完全です');
        return;
    }
    if (hasInvalidOnlineRlModelSettings(gameStartPayload.playerSettings)) {
        emitAppError(socket, 'RLモデルIDが無効です');
        return;
    }
    gameStartPayload.playerSettings = normalizePlayerSettings(gameStartPayload.playerSettings, playerNames.length);
    if (!Number.isInteger(playerIndex) || playerIndex < 0 || playerIndex >= playerNames.length) {
        emitAppError(socket, '復元データが不完全です');
        return;
    }
    const expectedReconnectTokenHash = getExpectedReconnectTokenHash({ players: [], gameStartPayload }, playerIndex, playerName);
    if (!expectedReconnectTokenHash || hashReconnectToken(reconnectToken) !== expectedReconnectTokenHash) {
        emitAppError(socket, 'INVALID_TOKEN');
        return;
    }
    if (!Number.isInteger(gameStartPayload.hostPlayerIndex) || gameStartPayload.hostPlayerIndex !== playerIndex) {
        emitAppError(socket, '復元は元のホストのみ実行できます');
        return;
    }
    const reconnectTokenHashes = Array.isArray(gameStartPayload.reconnectTokenHashes) ? gameStartPayload.reconnectTokenHashes : [];
    const restoredPlayers = playerNames
        .map((name, index) => {
            const setting = gameStartPayload.playerSettings?.[index];
            const reconnectTokenHash = reconnectTokenHashes[index];
            if (setting?.type === 'cpu' || !reconnectTokenHash) return null;
            return {
                id: index === playerIndex ? socket.id : null,
                index,
                name,
                reconnectToken: '',
                reconnectTokenHash,
            };
        })
        .filter(Boolean);
    const restoredRank = restorePayloadRank(gameStartPayload, stateSnapshot, actionLog);
    gameStartPayload.hostEpoch = restoredRank.hostEpoch;
    gameStartPayload.actionSeq = restoredRank.actionSeq;
    const restoredRoom = {
        players: restoredPlayers,
        playerSettings: gameStartPayload.playerSettings,
        maxPlayers: playerNames.length,
        started: true,
        restored: true,
        hostPlayerIndex: playerIndex,
        hostEpoch: restoredRank.hostEpoch,
        actionSeq: restoredRank.actionSeq,
        enabledCards: gameStartPayload.enabledCards || [],
        enabledLandmarks: gameStartPayload.enabledLandmarks || [],
        cpuSpeed: gameStartPayload.cpuSpeed || 1500,
        gameStartPayload,
        stateSnapshot: sanitizeClientStateSnapshot(stateSnapshot, playerNames.length),
        acceptedClientActions: {},
        actionLog: Array.isArray(actionLog)
            ? actionLog.filter(entry => entry && typeof entry.action === 'string')
                .map(entry => {
                    const normalized = { action: entry.action, data: entry.data || {} };
                    if (Number.isInteger(entry.playerIndex)) normalized.playerIndex = entry.playerIndex;
                    if (Number.isInteger(entry.seq)) normalized.seq = entry.seq;
                    if (typeof entry.clientActionId === 'string') normalized.clientActionId = entry.clientActionId;
                    return normalized;
                })
            : [],
        lastUndoState: null,
        lastTouchedAt: Date.now(),
    };
    for (const entry of restoredRoom.actionLog) rememberAcceptedClientAction(restoredRoom, entry);
    const restoredMirror = createRoomMirror(restoredRoom);
    if (!restoredMirror) {
        emitAppError(socket, '復元データが壊れています');
        return;
    }
    restoredRoom.lastUndoState = restoredMirror?.lastUndoState || null;
    restoredRoom.stateSnapshot = serializeMirrorState(
        restoredMirror.game,
        restoredMirror.shopStock,
        restoredRoom.lastUndoState,
        restoredRoom.actionSeq
    );
    restoredRoom.actionLog = [];
    if (rooms[roomId]) {
        detachRoomSockets(roomId, rooms[roomId], 'ROOM_REPLACED');
        delete rooms[roomId];
    }
    rooms[roomId] = restoredRoom;
    socket.join(roomId);
    socket.roomId = roomId;
    socket.playerIndex = playerIndex;
    socket.emit('rejoinData', {
        gameStartPayload,
        stateSnapshot: restoredRoom.stateSnapshot,
        actionLog: restoredRoom.actionLog,
        playerIndex,
        hostPlayerIndex: playerIndex,
        hostEpoch: restoredRoom.hostEpoch || 0,
    });
    console.log(`ルーム復元: ${roomId} by ${playerName}(${playerIndex})`);
}

function validateRestorePayloadLimits(payload, limits = RESTORE_PAYLOAD_LIMITS) {
    if (!isPlainObject(payload)) return { ok: false, reason: 'not-object' };
    let jsonBytes = 0;
    try {
        jsonBytes = Buffer.byteLength(JSON.stringify(payload), 'utf8');
    } catch {
        return { ok: false, reason: 'json' };
    }
    if (jsonBytes > limits.maxJsonBytes) return { ok: false, reason: 'json-size', jsonBytes };
    if (Array.isArray(payload.actionLog) && payload.actionLog.length > limits.maxActionLogEntries) {
        return { ok: false, reason: 'action-log-length', actionLogEntries: payload.actionLog.length };
    }

    const stats = { stringChars: 0, playerCardRefs: 0 };
    const visit = (value, key = '', depth = 0) => {
        if (depth > 20) return false;
        if (typeof value === 'string') {
            if (value.length > limits.maxStringLength) return false;
            stats.stringChars += value.length;
            return stats.stringChars <= limits.maxTotalStringChars;
        }
        if (Array.isArray(value)) {
            if ((key === 'cards' || key === 'playerCardNames') && value.every(item => typeof item === 'string' || Array.isArray(item))) {
                stats.playerCardRefs += countNestedStrings(value);
                if (stats.playerCardRefs > limits.maxPlayerCardRefs) return false;
            }
            for (const item of value) {
                if (!visit(item, key, depth + 1)) return false;
            }
            return true;
        }
        if (isPlainObject(value)) {
            for (const [childKey, childValue] of Object.entries(value)) {
                if (!visit(childValue, childKey, depth + 1)) return false;
            }
        }
        return true;
    };

    if (!visit(payload)) {
        return { ok: false, reason: 'content-size', stringChars: stats.stringChars, playerCardRefs: stats.playerCardRefs };
    }
    return { ok: true, jsonBytes, actionLogEntries: Array.isArray(payload.actionLog) ? payload.actionLog.length : 0, playerCardRefs: stats.playerCardRefs };
}

function countNestedStrings(value) {
    if (typeof value === 'string') return 1;
    if (!Array.isArray(value)) return 0;
    return value.reduce((sum, item) => sum + countNestedStrings(item), 0);
}

function sanitizeClientStateSnapshot(stateSnapshot, playerCount) {
    if (!isPlainObject(stateSnapshot)) return null;
    const sanitized = Object.assign({}, stateSnapshot);
    if (sanitized.undoState != null &&
        !isValidUndoState(sanitized.undoState, playerCount, gameRuntime.createCardByName)) {
        sanitized.undoState = null;
    }
    return sanitized;
}

function isValidGameStartPayload(payload, playerCount) {
    if (!Number.isInteger(playerCount) || playerCount < 2 || playerCount > 10) return false;
    if (!Array.isArray(payload.playerNames) ||
        payload.playerNames.length !== playerCount ||
        payload.playerNames.some(name => typeof name !== 'string')) return false;
    if (payload.playerSettings != null &&
        (!Array.isArray(payload.playerSettings) ||
        (payload.playerSettings.length !== 0 && payload.playerSettings.length !== playerCount))) return false;
    if (payload.playerOrder != null) {
        if (!Array.isArray(payload.playerOrder) || payload.playerOrder.length !== playerCount) return false;
        const sorted = [...payload.playerOrder].sort((a, b) => a - b);
        for (let i = 0; i < playerCount; i++) {
            if (sorted[i] !== i) return false;
        }
    }
    if (!Number.isInteger(payload.hostPlayerIndex) ||
        payload.hostPlayerIndex < 0 ||
        payload.hostPlayerIndex >= playerCount) return false;
    const knownCards = new Set(gameRuntime.CARDS.map(card => card.name));
    if (payload.enabledCards != null &&
        (!Array.isArray(payload.enabledCards) || payload.enabledCards.some(name => !knownCards.has(name)))) return false;
    const knownLandmarks = new Set(gameRuntime.Player.landmarkNames());
    if (payload.enabledLandmarks != null &&
        (!Array.isArray(payload.enabledLandmarks) ||
        payload.enabledLandmarks.length === 0 ||
        payload.enabledLandmarks.some(name => !knownLandmarks.has(name)))) return false;
    if (payload.cpuSpeed != null && (!Number.isFinite(payload.cpuSpeed) || payload.cpuSpeed < 0)) return false;
    return true;
}

function getRemainingConnectedPlayers(room, sockets, disconnectedSocketId) {
    return room.players.filter(p =>
        p.id &&
        p.id !== disconnectedSocketId &&
        sockets.has(p.id)
    );
}

function serializeMirrorState(game, shopStock, undoState = null, actionSeq = 0) {
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
        undoState: undoState || null,
        actionSeq,
    };
}

function compactRoomActionLog(room) {
    if (!room.actionLog || room.actionLog.length <= MAX_ACTION_LOG_LENGTH) return;
    const mirror = createRoomMirror(room);
    if (!mirror) return;
    room.lastUndoState = mirror.lastUndoState || null;
    room.stateSnapshot = serializeMirrorState(mirror.game, mirror.shopStock, room.lastUndoState, room.actionSeq || 0);
    room.actionLog = [];
}

function buildPlayerList(room) {
    if (room.playerSettings.length === 0) {
        return room.players.map(p => p.name);
    }
    return room.playerSettings.map((s, i) => {
        if (s.type === "cpu") {
            const diffLabel = cpuDifficultyLabel(s.difficulty);
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
        'this.Card = Card; this.Player = Player; this.GameManager = GameManager; this.CARDS = CARDS; this.createCardByName = createCardByName; this.getInitialCardStock = getInitialCardStock; this.GAME_PHASES = GAME_PHASES; this.GAME_ACTIONS = GAME_ACTIONS; this.GAME_PHASE_ACTIONS = GAME_PHASE_ACTIONS; this.CARD_CATEGORIES = CARD_CATEGORIES; this.LANDMARK_NAMES = LANDMARK_NAMES;',
        context
    );
    return context;
}

function createRoomMirror(room) {
    if (!room.gameStartPayload) return null;
    const { GameManager, CARDS, createCardByName, getInitialCardStock, Player } = gameRuntime;
    const { playerNames, playerSettings, playerOrder, enabledCards, enabledLandmarks } = room.gameStartPayload;
    const game = new GameManager(playerNames.length);
    game.enabledLandmarks = new Set((enabledLandmarks && enabledLandmarks.length > 0) ? enabledLandmarks : Player.landmarkNames());
    const shopStock = {};
    const enabled = new Set(enabledCards || CARDS.map(c => c.name));
    for (const card of CARDS) {
        shopStock[card.name] = enabled.has(card.name) ? getInitialCardStock(card, playerNames.length) : 0;
    }

    const order = playerOrder || playerNames.map((_, i) => i);
    for (let i = 0; i < playerNames.length; i++) {
        const originalIndex = order[i];
        game.players[i].name = playerNames[originalIndex];
    }
    const cpuPlayers = (playerSettings && playerSettings.length > 0)
        ? order.map(originalIndex => playerSettings[originalIndex]?.type === 'cpu')
        : game.players.map(() => false);

    let lastUndoState = null;
    if (room.stateSnapshot) {
        if (!validateMirrorSnapshot(room.stateSnapshot, playerNames.length, createCardByName, Player)) {
            return null;
        }
        if (!validateSnapshotAgainstRoomConfig(room.stateSnapshot, room, playerNames.length)) {
            return null;
        }
        restoreMirrorState(game, shopStock, room.stateSnapshot, createCardByName);
        lastUndoState = room.stateSnapshot.undoState || null;
    }
    for (const entry of room.actionLog || []) {
        if (!entry || typeof entry.action !== 'string') continue;
        try {
            if (!validateReplayAction(room, game, shopStock, entry, lastUndoState, cpuPlayers)) {
                return null;
            }
            if (entry.action === 'buildCard' || entry.action === 'buildLandmark') {
                lastUndoState = makeUndoStateFromMirror(game, shopStock);
            }
            const replayData = entry.action === 'undoBuild' ? { state: lastUndoState } : entry.data;
            if (applyActionToMirror(game, shopStock, entry.action, replayData, createCardByName) === false) {
                return null;
            }
            if (entry.action === 'undoBuild' || entry.action === 'nextTurn') {
                lastUndoState = null;
            }
        } catch {
            return null;
        }
    }
    return { game, shopStock, cpuPlayers, lastUndoState };
}

function validateMirrorSnapshot(state, playerCount, createCardByName, PlayerClass) {
    if (!isPlainObject(state)) return false;
    if (!Array.isArray(state.players) || state.players.length !== playerCount) return false;
    const landmarkNames = new Set(PlayerClass.landmarkNames());
    for (const playerState of state.players) {
        if (!isPlainObject(playerState)) return false;
        if (Object.prototype.hasOwnProperty.call(playerState, 'name') &&
            typeof playerState.name !== 'string') return false;
        if (Object.prototype.hasOwnProperty.call(playerState, 'coins') &&
            (!Number.isInteger(playerState.coins) || playerState.coins < 0)) return false;
        if (Object.prototype.hasOwnProperty.call(playerState, 'cards')) {
            if (!Array.isArray(playerState.cards) ||
                playerState.cards.some(name => !createCardByName(name))) return false;
        }
        const cardCount = Array.isArray(playerState.cards) ? playerState.cards.length : 0;
        if (Object.prototype.hasOwnProperty.call(playerState, 'dormantIndices')) {
            if (!Array.isArray(playerState.dormantIndices) ||
                hasDuplicateValues(playerState.dormantIndices) ||
                playerState.dormantIndices.some(idx => !Number.isInteger(idx) || idx < 0 || idx >= cardCount)) return false;
            const cardNames = Array.isArray(playerState.cards) ? playerState.cards : [];
            for (const idx of playerState.dormantIndices) {
                const card = createCardByName(cardNames[idx]);
                if (card?.category === gameRuntime.CARD_CATEGORIES.MAJOR) return false;
            }
        }
        if (Object.prototype.hasOwnProperty.call(playerState, 'landmarks')) {
            if (!isPlainObject(playerState.landmarks)) return false;
            for (const [name, built] of Object.entries(playerState.landmarks)) {
                if (!landmarkNames.has(name) || typeof built !== 'boolean') return false;
            }
        }
        if (Object.prototype.hasOwnProperty.call(playerState, 'itVentureCoins') &&
            (!Number.isInteger(playerState.itVentureCoins) || playerState.itVentureCoins < 0)) return false;
        if (Object.prototype.hasOwnProperty.call(playerState, 'hasYakusho') &&
            typeof playerState.hasYakusho !== 'boolean') return false;
    }
    if (Object.prototype.hasOwnProperty.call(state, 'shopStock')) {
        if (!isPlainObject(state.shopStock)) return false;
        for (const [name, count] of Object.entries(state.shopStock)) {
            if (!createCardByName(name) || !Number.isInteger(count) || count < 0) return false;
        }
    }
    if (Object.prototype.hasOwnProperty.call(state, 'currentPlayerIndex') &&
        (!Number.isInteger(state.currentPlayerIndex) || state.currentPlayerIndex < 0 || state.currentPlayerIndex >= playerCount)) return false;
    if (Object.prototype.hasOwnProperty.call(state, 'phase') &&
        !Object.values(gameRuntime.GAME_PHASES).includes(state.phase)) return false;
    if (Object.prototype.hasOwnProperty.call(state, 'log') && !Array.isArray(state.log)) return false;
    for (const field of ['lastDiceResult', 'lastDice1', 'lastDice2', 'turnCount']) {
        if (Object.prototype.hasOwnProperty.call(state, field) &&
            (!Number.isInteger(state[field]) || state[field] < 0)) return false;
    }
    for (const field of ['pendingTV', 'pendingBusiness', 'pendingCleaning', 'pendingMover', 'pendingRenovation']) {
        if (Object.prototype.hasOwnProperty.call(state, field) &&
            (!Number.isInteger(state[field]) || state[field] < 0)) return false;
    }
    for (const field of ['builtThisTurn', 'pendingIT', 'usedReroll', 'hadAmusementParkAtRoll']) {
        if (Object.prototype.hasOwnProperty.call(state, field) &&
            typeof state[field] !== 'boolean') return false;
    }
    if (Object.prototype.hasOwnProperty.call(state, 'pendingTunaDice') &&
        state.pendingTunaDice !== null &&
        (!Array.isArray(state.pendingTunaDice) ||
            state.pendingTunaDice.length !== 2 ||
            state.pendingTunaDice.some(value => !isValidDieValue(value)))) return false;
    if (Object.prototype.hasOwnProperty.call(state, 'undoState') &&
        state.undoState !== null &&
        !isValidUndoState(state.undoState, playerCount, createCardByName)) return false;
    return true;
}

function isValidUndoState(state, playerCount, createCardByName) {
    if (!isPlainObject(state)) return false;
    if (!Array.isArray(state.playerCoins) || state.playerCoins.length !== playerCount) return false;
    if (!Array.isArray(state.playerCardNames) || state.playerCardNames.length !== playerCount) return false;
    if (!Array.isArray(state.playerLandmarks) || state.playerLandmarks.length !== playerCount) return false;
    if (Object.prototype.hasOwnProperty.call(state, 'playerItVenture') &&
        (!Array.isArray(state.playerItVenture) || state.playerItVenture.length !== playerCount)) return false;
    if (!isPlainObject(state.shopStock)) return false;
    if (Object.prototype.hasOwnProperty.call(state, 'log') && !Array.isArray(state.log)) return false;
    if (Object.prototype.hasOwnProperty.call(state, 'builtThisTurn') && typeof state.builtThisTurn !== 'boolean') return false;
    if (state.playerCoins.some(coins => !Number.isInteger(coins) || coins < 0)) return false;
    const landmarkNames = new Set(gameRuntime.Player.landmarkNames());
    for (let i = 0; i < playerCount; i++) {
        const cardNames = state.playerCardNames[i];
        if (!Array.isArray(cardNames) || cardNames.some(name => !createCardByName(name))) return false;
        const dormantIndices = state.playerDormantIndices?.[i] || [];
        if (!Array.isArray(dormantIndices) ||
            hasDuplicateValues(dormantIndices) ||
            dormantIndices.some(idx => !Number.isInteger(idx) || idx < 0 || idx >= cardNames.length)) return false;
        for (const idx of dormantIndices) {
            const card = createCardByName(cardNames[idx]);
            if (card?.category === gameRuntime.CARD_CATEGORIES.MAJOR) return false;
        }
        if (!isPlainObject(state.playerLandmarks[i])) return false;
        for (const [name, built] of Object.entries(state.playerLandmarks[i])) {
            if (!landmarkNames.has(name) || typeof built !== 'boolean') return false;
        }
        const itVentureCoins = state.playerItVenture?.[i] ?? 0;
        if (!Number.isInteger(itVentureCoins) || itVentureCoins < 0) return false;
        if (state.playerHasYakusho && typeof state.playerHasYakusho[i] !== 'boolean') return false;
    }
    return Object.entries(state.shopStock)
        .every(([name, count]) => createCardByName(name) && Number.isInteger(count) && count >= 0);
}

function validateSnapshotAgainstRoomConfig(state, room, playerCount) {
    if (!isPlainObject(state)) return false;
    const enabledCards = new Set(room.gameStartPayload?.enabledCards || gameRuntime.CARDS.map(card => card.name));
    const enabledLandmarks = new Set(room.gameStartPayload?.enabledLandmarks || gameRuntime.Player.landmarkNames());
    if (!validateSnapshotCardAndStockConfig(state.players, state.shopStock, enabledCards, playerCount)) return false;
    if (!validateSnapshotLandmarkConfig(state.players, enabledLandmarks)) return false;
    if (state.undoState) {
        if (!validateSnapshotCardAndStockConfig(
            state.undoState.playerCardNames?.map((cardNames, index) => ({ cards: cardNames, landmarks: state.undoState.playerLandmarks?.[index] })),
            state.undoState.shopStock,
            enabledCards,
            playerCount
        )) return false;
        if (!validateSnapshotLandmarkConfig(
            state.undoState.playerLandmarks?.map(landmarks => ({ landmarks })),
            enabledLandmarks
        )) return false;
    }
    return true;
}

function validateSnapshotCardAndStockConfig(playersState, shopStockState, enabledCards, playerCount) {
    if (!Array.isArray(playersState)) return false;
    const stockState = isPlainObject(shopStockState) ? shopStockState : {};
    const initialCardNames = new Set(['麦畑', 'パン屋']);
    const disabledInitialCardCounts = {};
    for (const playerState of playersState) {
        const cardNames = Array.isArray(playerState?.cards) ? playerState.cards : [];
        for (const name of cardNames) {
            if (!enabledCards.has(name)) {
                if (!initialCardNames.has(name)) return false;
                disabledInitialCardCounts[name] = (disabledInitialCardCounts[name] || 0) + 1;
            }
        }
    }
    for (const count of Object.values(disabledInitialCardCounts)) {
        if (count > playerCount) return false;
    }
    for (const card of gameRuntime.CARDS) {
        if (!enabledCards.has(card.name)) {
            if (Object.prototype.hasOwnProperty.call(stockState, card.name) && stockState[card.name] !== 0) return false;
            continue;
        }
        const initialStock = enabledCards.has(card.name)
            ? gameRuntime.getInitialCardStock(card, playerCount)
            : 0;
        const stockCount = Object.prototype.hasOwnProperty.call(stockState, card.name)
            ? stockState[card.name]
            : initialStock;
        if (!Number.isInteger(stockCount) || stockCount < 0 || stockCount > initialStock) return false;
    }
    return true;
}

function validateSnapshotLandmarkConfig(playersState, enabledLandmarks) {
    if (!Array.isArray(playersState)) return false;
    for (const playerState of playersState) {
        const landmarks = playerState?.landmarks;
        if (landmarks == null) continue;
        if (!isPlainObject(landmarks)) return false;
        for (const [name, built] of Object.entries(landmarks)) {
            if (built === true && !enabledLandmarks.has(name)) return false;
        }
    }
    return true;
}

function hasDuplicateValues(values) {
    return new Set(values).size !== values.length;
}

function validateReplayAction(room, game, shopStock, entry, lastUndoState, cpuPlayers) {
    const { action, data } = entry;
    if (!validateReplayActor(room, game, entry, cpuPlayers)) return false;
    if (!getAllowedActions(game).has(action)) return false;
    return validateActionPayloadForState(room, game, shopStock, action, data, {
        undoState: lastUndoState,
        requireUndoPayload: true,
    });
}

function validateReplayActor(room, game, entry, cpuPlayers) {
    const currentIndex = game.currentPlayerIndex;
    const playerOrder = room.gameStartPayload?.playerOrder;
    const originalCurrentIndex = playerOrder ? playerOrder[currentIndex] : currentIndex;
    if (!Number.isInteger(entry.playerIndex)) return false;
    const settings = room.gameStartPayload?.playerSettings || [];
    const playerCount = Array.isArray(room.gameStartPayload?.playerNames)
        ? room.gameStartPayload.playerNames.length
        : settings.length;
    if (entry.playerIndex < 0 || entry.playerIndex >= playerCount) return false;
    if (cpuPlayers[currentIndex]) {
        const hostPlayerIndex = Number.isInteger(room.hostPlayerIndex)
            ? room.hostPlayerIndex
            : room.gameStartPayload?.hostPlayerIndex;
        return Number.isInteger(hostPlayerIndex) &&
            entry.playerIndex === hostPlayerIndex &&
            settings[entry.playerIndex]?.type !== 'cpu';
    }
    return entry.playerIndex === originalCurrentIndex;
}

function restoreMirrorState(game, shopStock, state, createCardByName) {
    if (!state) return;
    const playersState = Array.isArray(state.players) ? state.players : [];
    game.players.forEach((p, i) => {
        const playerState = playersState[i];
        if (!playerState) return;
        p.name = playerState.name;
        p.coins = Number.isFinite(playerState.coins) ? playerState.coins : p.coins;
        const cardNames = Array.isArray(playerState.cards) ? playerState.cards : [];
        p.cards = cardNames.map(name => createCardByName(name)).filter(Boolean);
        const dormantIndices = Array.isArray(playerState.dormantIndices) ? playerState.dormantIndices : [];
        p.dormantCards = dormantIndices.map(idx => p.cards[idx]).filter(Boolean);
        p.landmarks = Object.assign(
            {},
            p.landmarks,
            playerState.landmarks && typeof playerState.landmarks === 'object' ? playerState.landmarks : {}
        );
        p.itVentureCoins = playerState.itVentureCoins || 0;
        p.hasYakusho = playerState.hasYakusho !== false;
    });
    Object.assign(shopStock, state.shopStock || {});
    game.currentPlayerIndex = Number.isInteger(state.currentPlayerIndex) &&
        state.currentPlayerIndex >= 0 && state.currentPlayerIndex < game.players.length
        ? state.currentPlayerIndex
        : 0;
    game.phase = state.phase || game.phase;
    game.log = Array.isArray(state.log) ? state.log : [];
    game.lastDiceResult = state.lastDiceResult || 0;
    game.lastDice1 = state.lastDice1 || 0;
    game.lastDice2 = state.lastDice2 || 0;
    game.builtThisTurn = state.builtThisTurn || false;
    if (typeof game.resetPendingState === 'function') game.resetPendingState();
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
    if (!isPlainObject(data)) return false;
    switch (action) {
        case 'rollDice':
            game.rollDice(data.forceDice, data.tunaDice);
            return true;
        case 'selectDice':
            game.selectDiceCount(data.useTwo, data.d1, data.d2, data.tunaDice);
            return true;
        case 'skipReroll':
            game.skipReroll();
            return true;
        case 'rerollDice':
            game.rerollDice(data.forceDice, data.tunaDice);
            return true;
        case 'resolveHarbor':
            return game.resolveHarbor(data.useBonus) !== false;
        case 'resolveTV':
            return game.resolveTV(data.targetIndex) !== false;
        case 'resolveBusiness':
            return game.resolveBusiness(data.myCard, data.targetIndex, data.theirCard) !== false;
        case 'resolveCleaning':
            return game.resolveCleaning(data.cardName) !== false;
        case 'resolveMover':
            return game.resolveMover(data.cardIndex ?? data.cardName, data.targetIndex) !== false;
        case 'resolveRenovation':
            return game.resolveRenovation(data.landmarkName) !== false;
        case 'resolveIT':
            return game.resolveIT(data.doSave) !== false;
        case 'buildCard': {
            const card = createCardByName(data.cardName);
            if (!card || !game.buildCard(card)) return false;
            shopStock[data.cardName]--;
            return true;
        }
        case 'buildLandmark':
            return game.buildLandmark(data.name) !== false;
        case 'undoBuild':
            return restoreUndoMirror(game, shopStock, data.state, createCardByName);
        case 'nextTurn':
            return game.nextTurn() !== false;
        default:
            return false;
    }
}

function restoreUndoMirror(game, shopStock, state, createCardByName) {
    if (!state ||
        !Array.isArray(state.playerCoins) ||
        !Array.isArray(state.playerCardNames) ||
        !Array.isArray(state.playerLandmarks) ||
        !state.shopStock
    ) return false;
    game.players.forEach((p, i) => {
        p.coins = state.playerCoins[i];
        p.cards = state.playerCardNames[i].map(name => createCardByName(name)).filter(Boolean);
        p.dormantCards = (state.playerDormantIndices?.[i] || []).map(idx => p.cards[idx]).filter(Boolean);
        p.landmarks = Object.assign({}, p.landmarks, state.playerLandmarks[i]);
        p.itVentureCoins = state.playerItVenture?.[i] ?? 0;
        p.hasYakusho = state.playerHasYakusho?.[i] !== false;
    });
    Object.assign(shopStock, state.shopStock);
    game.builtThisTurn = state.builtThisTurn === true;
    game.log = Array.isArray(state.log) ? [...state.log] : [];
    game.hadAmusementParkAtRoll = state.hadAmusementParkAtRoll || false;
    return true;
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
    return gameRuntime.GameManager.pendingActionsFor(game)
        .some(pending => pending.action === action);
}

function validateBusinessPayload(game, data) {
    if (!hasPendingAction(game, 'resolveBusiness') || !isPlainObject(data)) return false;
    const { myCard, targetIndex, theirCard } = data;
    if (!isPlayerIndex(targetIndex, game)) {
        return false;
    }
    if (targetIndex === game.currentPlayerIndex) return false;
    if (!Number.isInteger(myCard) || !Number.isInteger(theirCard)) return false;
    const current = game.currentPlayer();
    const target = game.players[targetIndex];
    return !!game._resolveCardRef(current, myCard) &&
        !!game._resolveCardRef(target, theirCard);
}

function validateCleaningPayload(game, data) {
    if (!hasPendingAction(game, 'resolveCleaning') || !isPlainObject(data)) return false;
    if (!isNonEmptyString(data.cardName)) return false;
    const targetCard = gameRuntime.createCardByName(data.cardName);
    if (!targetCard || targetCard.category === gameRuntime.CARD_CATEGORIES.MAJOR) return false;
    return game.players.some(player =>
        player.cards.some(card => card.name === data.cardName && card.category !== gameRuntime.CARD_CATEGORIES.MAJOR && !player.isDormant(card))
    );
}

function validateMoverPayload(game, data) {
    if (!hasPendingAction(game, 'resolveMover') || !isPlainObject(data)) return false;
    const cardRef = Number.isInteger(data.cardIndex) ? data.cardIndex : data.cardName;
    const { targetIndex } = data;
    if (!isPlayerIndex(targetIndex, game)) return false;
    if (targetIndex === game.currentPlayerIndex) return false;
    if (!Number.isInteger(cardRef) && !isNonEmptyString(cardRef)) return false;
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

function isValidDieValue(value) {
    return Number.isInteger(value) && value >= 1 && value <= 6;
}

function validateTunaDiceFromData(data) {
    if (!isPlainObject(data) || !Object.prototype.hasOwnProperty.call(data, 'tunaDice') || data.tunaDice == null) {
        return true;
    }
    return Array.isArray(data.tunaDice) &&
        data.tunaDice.length === 2 &&
        data.tunaDice.every(isValidDieValue);
}

function validateRollDicePayload(data, game = null) {
    if (!isPlainObject(data)) return false;
    if (data.forceDice == null) {
        return !!game &&
            !!game.currentPlayer().landmarks[gameRuntime.LANDMARK_NAMES.STATION] &&
            validateTunaDiceFromData(data);
    }
    if (!isValidDieValue(data.forceDice)) return false;
    return validateTunaDiceFromData(data);
}

function validateSelectDicePayload(data) {
    if (!isPlainObject(data)) return false;
    if (typeof data.useTwo !== 'boolean') return false;
    const hasDiceCount = Object.prototype.hasOwnProperty.call(data, 'diceCount');
    const diceCount = hasDiceCount ? data.diceCount : (data.useTwo ? 2 : 1);
    if (diceCount !== 1 && diceCount !== 2) return false;
    if (hasDiceCount && data.useTwo !== (diceCount === 2)) return false;
    if (!isValidDieValue(data.d1)) return false;
    if (diceCount === 2) {
        if (!isValidDieValue(data.d2)) return false;
    } else if (Object.prototype.hasOwnProperty.call(data, 'd2') && data.d2 != null && data.d2 !== 0 && !isValidDieValue(data.d2)) {
        return false;
    }
    return validateTunaDiceFromData(data);
}

function validateRerollDicePayload(data) {
    if (!isPlainObject(data) || !isValidDieValue(data.forceDice)) return false;
    return validateTunaDiceFromData(data);
}

function validateResolveHarborPayload(data) {
    return isPlainObject(data) && typeof data.useBonus === 'boolean';
}

function validateResolveITPayload(data) {
    return isPlainObject(data) && typeof data.doSave === 'boolean';
}

function validateResolveTVPayload(game, data) {
    return isPlainObject(data) &&
        Number.isInteger(data.targetIndex) &&
        data.targetIndex >= 0 &&
        data.targetIndex < game.players.length &&
        data.targetIndex !== game.currentPlayerIndex;
}

function validateBuildCardPayload(room, game, shopStock, data) {
    const cardName = data?.cardName;
    const enabledCards = new Set(room.gameStartPayload?.enabledCards || gameRuntime.CARDS.map(c => c.name));
    const card = gameRuntime.createCardByName(cardName);
    const current = game.currentPlayer();
    return !!card &&
        enabledCards.has(cardName) &&
        (shopStock[cardName] || 0) > 0 &&
        !game.builtThisTurn &&
        current.coins >= card.cost &&
        !(card.color === 'purple' && current.countCardIncludingDormant(card.name) > 0);
}

function validateBuildLandmarkPayload(room, game, data) {
    const name = data?.name;
    const enabledLandmarks = new Set(room.gameStartPayload?.enabledLandmarks || gameRuntime.Player.landmarkNames());
    const current = game.currentPlayer();
    const cost = gameRuntime.Player.landmarkCost(name);
    return gameRuntime.Player.isKnownLandmark(name) &&
        enabledLandmarks.has(name) &&
        !game.builtThisTurn &&
        !current.landmarks[name] &&
        current.coins >= cost;
}

// Payload-only validator. Actor authority and phase/action allowance must be checked by the caller.
function validateActionPayloadForState(room, game, shopStock, action, data, options = {}) {
    if (action === 'rollDice') return validateRollDicePayload(data, game);
    if (action === 'selectDice') return validateSelectDicePayload(data);
    if (action === 'rerollDice') return validateRerollDicePayload(data);
    if (action === 'skipReroll') return isPlainObject(data);
    if (action === 'resolveHarbor') return validateResolveHarborPayload(data);
    if (action === 'resolveTV') return validateResolveTVPayload(game, data);
    if (action === 'resolveBusiness') return validateBusinessPayload(game, data);
    if (action === 'resolveCleaning') return validateCleaningPayload(game, data);
    if (action === 'resolveMover') return validateMoverPayload(game, data);
    if (action === 'resolveRenovation') return validateRenovationPayload(game, data);
    if (action === 'resolveIT') return validateResolveITPayload(data);
    if (action === 'buildCard') return validateBuildCardPayload(room, game, shopStock, data);
    if (action === 'buildLandmark') return validateBuildLandmarkPayload(room, game, data);
    if (action === 'undoBuild') {
        return !!options.undoState &&
            game.builtThisTurn &&
            (!options.requireUndoPayload || isPlainObject(data));
    }
    if (action === 'nextTurn') return isPlainObject(data);
    return false;
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

    return {
        ok: validateActionPayloadForState(room, game, shopStock, action, data, {
            undoState: room.lastUndoState || mirror.lastUndoState,
            requireUndoPayload: false,
        }),
        mirror,
    };
}

function getAllowedActions(game) {
    return gameRuntime.GameManager.allowedActionsFor(game);
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
                    const diffLabel = cpuDifficultyLabel(s.difficulty);
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
            hostPlayerIndex: room.hostPlayerIndex,
            hostEpoch: room.hostEpoch || 0,
            actionSeq: room.actionSeq || 0,
            versions,
            reconnectTokenHashes: playerNames.map((_, index) => {
                const player = room.players.find(p => p.index === index);
                return player?.reconnectToken ? hashReconnectToken(player.reconnectToken) : '';
            })
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
    requirePlainSocketPayload,
    ROOM_LIFECYCLE_LIMITS,
    isRoomExpired,
    cleanupExpiredRooms,
    canCreateRoomForSocket,
    markCreateRoomForSocket,
    validateCreateRoomLifecycle,
    RESTORE_PAYLOAD_LIMITS,
    validateRestorePayloadLimits,
    resolveBuildHash,
    injectServiceWorkerBuildHash,
    injectIndexBuildHash,
    sanitizeName,
    cpuDifficultyLabel,
    ALLOWED_RL_MODEL_IDS,
    normalizePlayerSettings,
    hasInvalidOnlineRlModelSettings,
    normalizeCpuSpeed,
    normalizeEnabledCards,
    isActiveRoomSocket,
    findAcceptedClientAction,
    rememberAcceptedClientAction,
    generateRoomId,
    nextRoomActionSeq,
    restorePayloadRank,
    buildPlayerList,
    resolveRejoinPlayer,
    handleSocketDisconnect,
    handleRecreateRoom,
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
    validateRollDicePayload,
    validateSelectDicePayload,
    validateRerollDicePayload,
    validateResolveHarborPayload,
    validateResolveITPayload,
    validateResolveTVPayload,
    validateBuildCardPayload,
    validateBuildLandmarkPayload,
    validateActionPayloadForState,
    validateGameAction,
    getAllowedActions,
    checkGameStart,
    loadGameRuntime,
};
