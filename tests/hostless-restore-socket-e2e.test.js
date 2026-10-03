'use strict';

const assert = require('assert');
const http = require('http');
const { Server } = require('socket.io');
const connectClient = require('socket.io-client');
const { runTest } = require('./helpers/test-utils');
const { makeOnceSocketEvent } = require('./helpers/socket-e2e');
const { createHostlessRestoreCoordinator } = require('../server/hostlessRestoreCoordinator');
const { createHostlessRestoreRuntime } = require('../server/hostlessRestoreRuntime');

function createClock() {
    let now = 0;
    let nextId = 1;
    const timers = new Map();
    return {
        now: () => now,
        setTimeout(callback, delay) {
            const id = nextId++;
            timers.set(id, { at: now + delay, callback });
            return id;
        },
        clearTimeout(id) {
            timers.delete(id);
        },
        advance(ms) {
            const target = now + ms;
            while (true) {
                const due = Array.from(timers.entries())
                    .filter(([, timer]) => timer.at <= target)
                    .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
                if (!due) break;
                const [id, timer] = due;
                timers.delete(id);
                now = timer.at;
                timer.callback();
            }
            now = target;
        },
    };
}

function connect(origin) {
    return connectClient(origin, {
        transports: ['websocket'],
        forceNew: true,
        reconnection: false,
    });
}

async function waitFor(predicate, message) {
    const deadline = Date.now() + 2000;
    while (!predicate()) {
        if (Date.now() >= deadline) throw new Error(message);
        await new Promise(resolve => setTimeout(resolve, 5));
    }
}

function onceEventMatching(socket, eventName, predicate) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            socket.off(eventName, handler);
            reject(new Error(eventName + ' matching event timed out'));
        }, 2000);
        function handler(payload) {
            if (!predicate(payload)) return;
            clearTimeout(timer);
            socket.off(eventName, handler);
            resolve(payload);
        }
        socket.on(eventName, handler);
    });
}

runTest('hostless restore Socket E2E: 複数接続の猶予・候補合意・本人確認・承認配信を完了する', async () => {
    const httpServer = http.createServer();
    const io = new Server(httpServer, { transports: ['websocket'] });
    const clock = createClock();
    const timers = makeOnceSocketEvent({ setTimeout, clearTimeout });
    const approved = [];
    const limits = {
        hostGraceMs: 60,
        collectionMs: 30,
        confirmationMs: 60,
        retentionMs: 120,
    };
    let runtime;
    const coordinator = createHostlessRestoreCoordinator({
        now: clock.now,
        setTimeout: clock.setTimeout,
        clearTimeout: clock.clearTimeout,
        limits,
        onEvent: event => runtime.handleCoordinatorEvent(event),
    });
    const gateway = {
        validateRequest(payload) {
            return {
                ok: true,
                roomId: payload.roomId,
                playerIndex: payload.playerIndex,
                generation: payload.generation,
                attemptCount: payload.attemptCount,
            };
        },
        prepareCandidate(socket, payload) {
            return {
                ok: true,
                roomId: payload.roomId,
                attemptCount: payload.attemptCount,
                candidate: {
                    playerIndex: payload.playerIndex,
                    playerType: 'human',
                    socketId: socket.id,
                    capabilityVersion: 1,
                    generation: payload.generation,
                    rank: { hostEpoch: 2, actionSeq: 12 },
                    canonicalHash: 'a'.repeat(64),
                    completed: false,
                    payload: {
                        playerIndex: payload.playerIndex,
                        gameStartPayload: { hostlessRestoreCount: payload.attemptCount },
                    },
                },
            };
        },
    };
    runtime = createHostlessRestoreRuntime({
        io,
        coordinator,
        gateway,
        hasRoom: () => false,
        approveCandidate: (_socket, payload, metadata) => {
            approved.push({ payload, metadata });
            return { ok: true };
        },
    });
    io.on('connection', socket => runtime.registerSocket(socket));
    await new Promise((resolve, reject) => {
        httpServer.once('error', reject);
        httpServer.listen(0, '127.0.0.1', resolve);
    });

    const origin = 'http://127.0.0.1:' + httpServer.address().port;
    const first = connect(origin);
    const second = connect(origin);
    const outsider = connect(origin);
    const clients = [first, second, outsider];
    try {
        await Promise.all(clients.map(socket => timers(socket, 'connect')));
        const firstStatus = timers(first, 'hostlessRestoreStatus');
        const secondStatus = timers(second, 'hostlessRestoreStatus');
        first.emit('requestHostlessRestore', {
            roomId: 'E2E123', playerIndex: 1, generation: 4, attemptCount: 0,
        });
        second.emit('requestHostlessRestore', {
            roomId: 'E2E123', playerIndex: 2, generation: 4, attemptCount: 0,
        });
        assert.strictEqual((await firstStatus).reason, 'waiting-for-host');
        assert.strictEqual((await secondStatus).reason, 'waiting-for-host');
        assert.strictEqual(runtime.inspect('E2E123').requesterCount, 2);

        const firstCollect = timers(first, 'hostlessRestoreCollect');
        const secondCollect = timers(second, 'hostlessRestoreCollect');
        clock.advance(limits.hostGraceMs - 1);
        assert.strictEqual(runtime.inspect('E2E123').coordinator.stage, 'host-grace');
        clock.advance(1);
        assert.strictEqual((await firstCollect).timeoutMs, limits.collectionMs);
        assert.strictEqual((await secondCollect).timeoutMs, limits.collectionMs);
        assert.strictEqual(runtime.inspect('E2E123').coordinator.stage, 'collecting');

        const candidate = playerIndex => ({
            roomId: 'E2E123',
            playerIndex,
            generation: 4,
            attemptCount: 0,
        });
        first.emit('submitHostlessRestoreCandidate', candidate(1));
        second.emit('submitHostlessRestoreCandidate', candidate(2));
        await waitFor(
            () => runtime.inspect('E2E123').coordinator.candidateCount === 2,
            'both connected players should submit candidates before collection expires'
        );

        const firstConfirmation = timers(first, 'hostlessRestoreConfirmation');
        const firstQuorumStatus = onceEventMatching(
            first,
            'hostlessRestoreStatus',
            status => status.reason === 'quorum-ready'
        );
        const secondQuorumStatus = onceEventMatching(
            second,
            'hostlessRestoreStatus',
            status => status.reason === 'quorum-ready'
        );
        clock.advance(limits.collectionMs - 1);
        assert.strictEqual(runtime.inspect('E2E123').coordinator.stage, 'collecting');
        clock.advance(1);
        assert.strictEqual((await firstQuorumStatus).reason, 'quorum-ready');
        assert.strictEqual((await secondQuorumStatus).candidateCount, 2);
        assert.strictEqual((await firstConfirmation).candidateCount, 2);
        assert.strictEqual(runtime.inspect('E2E123').coordinator.confirmationPlayerIndex, 1);

        let outsiderApproved = false;
        outsider.on('hostlessRestoreApproved', () => { outsiderApproved = true; });
        const secondConfirmation = timers(second, 'hostlessRestoreConfirmation');
        outsider.emit('confirmHostlessRestore', { roomId: 'E2E123', approved: true });
        first.emit('confirmHostlessRestore', { roomId: 'E2E123', approved: false });
        assert.strictEqual((await secondConfirmation).candidateCount, 2);
        assert.strictEqual(runtime.inspect('E2E123').coordinator.confirmationPlayerIndex, 2);

        const firstApproved = timers(first, 'hostlessRestoreApproved');
        const secondApproved = timers(second, 'hostlessRestoreApproved');
        second.emit('confirmHostlessRestore', { roomId: 'E2E123', approved: true });
        const [firstResult, secondResult] = await Promise.all([firstApproved, secondApproved]);
        await new Promise(resolve => setTimeout(resolve, 20));
        assert.strictEqual(firstResult.provisional, true);
        assert.strictEqual(secondResult.hostPlayerIndex, 2);
        assert.strictEqual(outsiderApproved, false);
        assert.strictEqual(approved.length, 1);
        assert.strictEqual(approved[0].payload.playerIndex, 2);
        assert.strictEqual(approved[0].metadata.candidateCount, 2);
        assert.strictEqual(runtime.inspect('E2E123').coordinator, null);
    } finally {
        clients.forEach(socket => socket.close());
        await new Promise(resolve => io.close(resolve));
    }
});
