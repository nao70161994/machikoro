const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');

// Diagnostic candidate only: keep this untracked file off the primary Nightly
// until the eight-group presentation contract is resolved. No product overrides.
test.use({ serviceWorkers: 'block', video: 'off', deviceScaleFactor: 1, isMobile: false, hasTouch: false,
    trace: { mode: 'retain-on-failure', screenshots: false, snapshots: false, sources: true } });

test('標準CPUの1手番で8施設すべての発動紹介が実際に開始する', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 936 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.addInitScript(() => localStorage.setItem('machikoroDesignTheme', 'cardboard'));
    await page.route('https://pagead2.googlesyndication.com/**', route => route.fulfill({ status: 200, body: '' }));
    await page.goto('/');
    await page.evaluate(() => {
        startGameNow(4, Array.from({ length: 4 }, (_, index) => ({ type: 'cpu', difficulty: 'weak', name: `街${index + 1}` })));
        cancelCpuSchedule('eight-group-diagnostic-setup');
        GameSetupState.runtime.setCpuSpeed(1500);
        const speed = document.getElementById('cpuSpeed');
        speed.value = '1500';
        const runtime = GameRuntimeState.runtime.snapshot();
        const game = runtime.game;
        game.currentPlayerIndex = 0;
        game.players.forEach((player, index) => {
            player.name = `街${index + 1}`;
            player.cards = ['コーン畑', 'パン屋', 'カフェ'].map(name => createCardByName(name));
            player.coins = 30;
            Object.keys(player.landmarks).forEach(name => { player.landmarks[name] = false; });
            SHOP_STOCK['コーン畑']--;
            SHOP_STOCK['カフェ']--;
        });
        game.log = [];
        game.addLog(LOG_TYPES.SYSTEM, `👤 ${game.currentPlayer().name}のターン`);
        setTutorialEnabled(false);
        render();
        // The browser's dice source uses crypto, with Math.random only as its
        // fallback. Control that input without replacing actions or scheduling.
        const nativeRandomValues = crypto.getRandomValues.bind(crypto);
        let diceRngCalls = 0;
        crypto.getRandomValues = buffer => {
            if (buffer instanceof Uint8Array && buffer.length === 1) {
                diceRngCalls++;
                buffer[0] = 2; // (2 % 6) + 1 = 3; no station or reroll landmark.
                return buffer;
            }
            return nativeRandomValues(buffer);
        };
        Math.random = () => 0.4; // Reproducible weak CPU tie-breaking.
        window.cpuDiagnosticDiceCalls = () => diceRngCalls;
        const initialTurn = game.turnCount;
        const initialActor = game.currentPlayerIndex;
        const trace = window.cpuEventTimeline = { startedAt: performance.now(), initialTurn, initialActor,
            cpuSpeed: 1500, cpuDifficulties: runtime.cpuPlayers.map(cpu => cpu?.difficulty), events: [] };
        let resolveFirstTag, resolveTurn;
        window.cpuEventFirstTag = new Promise(resolve => { resolveFirstTag = resolve; });
        window.cpuEventTurnChanged = new Promise(resolve => { resolveTurn = resolve; });
        let rollRecorded = false, turnRecorded = false;
        const record = (kind, data = {}) => trace.events.push({ kind, at: performance.now() - trace.startedAt, ...data });
        const inspect = () => {
            const game = GameRuntimeState.runtime.snapshot().game;
            if (!rollRecorded && game.lastDiceResult === 3) {
                rollRecorded = true;
                const events = UiTurnEvents.project(game.log, { players: game.players, logTypes: LOG_TYPES, turnPlayerIndex: initialActor,
                    cardNames: CARDS.map(card => card.name), landmarkNames: Player.landmarkNames(), maxActivations: 1000 });
                trace.resolvedGroups = [...new Set(events.activations.filter(event => event.facility)
                    .map(event => `${game.players[event.owner ?? event.to ?? event.from]?.name}/${event.subject}`))].sort();
                record('resolved-roll', { phase: game.phase, dice: game.lastDiceResult });
            }
            if (!turnRecorded && (game.turnCount !== initialTurn || game.currentPlayerIndex !== initialActor)) {
                turnRecorded = true;
                record('turn-change', { turn: game.turnCount, actor: game.currentPlayerIndex });
                cancelCpuSchedule('eight-group-diagnostic-one-turn-complete');
                resolveTurn();
            }
        };
        const actorNodes = node => node.nodeType === Node.ELEMENT_NODE
            ? [node, ...node.querySelectorAll('.cardboard-activation-tag, .cardboard-transfer')]
                .filter(element => element.matches('.cardboard-activation-tag, .cardboard-transfer')) : [];
        const observer = new MutationObserver(records => {
            for (const mutation of records) {
                for (const node of mutation.addedNodes) for (const element of actorNodes(node)) {
                    if (element.matches('.cardboard-activation-tag')) {
                        record('tag-start', { name: element.querySelector('strong')?.textContent, text: element.textContent });
                        resolveFirstTag();
                    } else {
                        const animation = element.getAnimations()[0];
                        const timing = animation?.effect?.getTiming();
                        const data = { owner: element.dataset.owner, name: element.dataset.facility,
                            step: element.dataset.step, route: element.dataset.route };
                        record('transfer-created', { ...data, delay: timing?.delay, duration: timing?.duration });
                        if (animation) {
                            // A timer observes the existing animation; it never changes its clock.
                            setTimeout(() => record('transfer-start-sample', { ...data,
                                connected: element.isConnected, currentTime: animation.currentTime,
                                playState: animation.playState }), Number(timing.delay) + 1);
                            animation.finished.then(() => record('transfer-finished', data))
                                .catch(() => record('transfer-cancelled', { ...data, currentTime: animation.currentTime }));
                        }
                    }
                }
                for (const node of mutation.removedNodes) for (const element of actorNodes(node)) {
                    record(element.matches('.cardboard-activation-tag') ? 'tag-end' : 'transfer-removed',
                        { name: element.dataset.facility || element.querySelector('strong')?.textContent,
                            owner: element.dataset.owner, text: element.textContent });
                }
            }
            inspect();
        });
        observer.observe(document.getElementById('cardboardBoard'), { childList: true, subtree: true, characterData: true });
        window.stopCpuEventObservation = () => observer.disconnect();
    });
    await page.screenshot({ path: testInfo.outputPath('cpu-events-start.png') });
    await page.evaluate(() => scheduleCPU());
    try {
        await expect.poll(() => page.evaluate(() => window.cpuEventTimeline.events.some(event => event.kind === 'tag-start')), { timeout: 15000 }).toBe(true);
        await page.screenshot({ path: testInfo.outputPath('cpu-events-during.png') });
        await expect.poll(() => page.evaluate(() => window.cpuEventTimeline.events.some(event => event.kind === 'turn-change')), { timeout: 15000 }).toBe(true);
        await page.screenshot({ path: testInfo.outputPath('cpu-events-next-turn.png') });
    } finally {
        const evidence = await page.evaluate(() => {
            window.stopCpuEventObservation();
            const game = GameRuntimeState.runtime.snapshot().game;
            return { ...window.cpuEventTimeline, diceRngCalls: window.cpuDiagnosticDiceCalls(), final: { turn: game.turnCount, actor: game.currentPlayerIndex,
                phase: game.phase, log: game.log },
                snapshot: GameSnapshot.serializeUndoState(game, SHOP_STOCK, Number.MAX_SAFE_INTEGER) };
        });
        const file = testInfo.outputPath('cpu-events-timeline.json');
        await fs.writeFile(file, JSON.stringify(evidence, null, 2));
        await testInfo.attach('cpu-events-timeline', { path: file, contentType: 'application/json' });
        for (const name of ['start', 'during', 'next-turn']) {
            const path = testInfo.outputPath(`cpu-events-${name}.png`);
            if (await fs.stat(path).catch(() => null)) await testInfo.attach(`cpu-events-${name}`, { path, contentType: 'image/png' });
        }
        const observed = [...new Set(evidence.events.filter(event => event.kind === 'tag-start').map(event => {
            const owner = ['街1', '街2', '街3', '街4'].find(name => event.text.includes(`${name} · `));
            return `${owner}/${event.name}`;
        }))].sort();
        const expected = ['街2/カフェ', '街3/カフェ', '街4/カフェ',
            '街1/コーン畑', '街2/コーン畑', '街3/コーン畑', '街4/コーン畑', '街1/パン屋'].sort();
        expect(evidence.resolvedGroups, '正本の実出目3が8施設groupを解決したこと').toEqual(expected);
        expect(observed, JSON.stringify(evidence.events)).toEqual(expected);
    }
});
