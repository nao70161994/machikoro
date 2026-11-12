const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const espree = require('espree');

// Diagnostic candidate only: keep this untracked file off the primary Nightly
// for the seven aggregated monetary routes. No product action/scheduler overrides.
test.use({ serviceWorkers: 'block', video: 'off', deviceScaleFactor: 1, isMobile: false, hasTouch: false,
    trace: { mode: 'retain-on-failure', screenshots: false, snapshots: false, sources: true } });

// Function-body instrumentation is diagnostic only. try/finally and timer
// reads can affect JIT/optimization, so durations are not an uninstrumented A/B.
const profileTargets = {
    'cardBoardField.js': new Set(['updateOwnerLabels', 'syncOwnerLabels', 'draw', 'updateMarket', 'replaceHtml', 'positionBuildNotice']),
    'cardTableCamera.js': new Set(['paint', 'layout', 'focusCard', 'syncLayout', 'refresh', 'applyReading']),
    'cardTableLayout.js': new Set(['layout', 'ownerSize', 'marketSize', 'applyOwnerShape']),
    'cardBoardActivationTags.js': new Set(['show', 'play', 'clear']),
    'cardBoardTransfers.js': new Set(['play', 'retarget', 'clear', 'stopMotion']),
};
function instrumentBodies(source, filename) {
    const ast = espree.parse(source, { ecmaVersion: 'latest', sourceType: 'script', range: true });
    const inserts = [];
    const visit = node => {
        if (!node || typeof node !== 'object') return;
        if (node.type === 'FunctionDeclaration' && profileTargets[filename].has(node.id?.name)) {
            const suffix = node.range[0];
            const profile = `__cpuPaintProfile${suffix}`;
            const start = `__cpuPaintStart${suffix}`;
            const end = `__cpuPaintEnd${suffix}`;
            const directives = node.body.body.filter(statement => statement.type === 'ExpressionStatement' && statement.directive);
            const opening = directives.length ? directives.at(-1).range[1] : node.body.range[0] + 1;
            inserts.push({ offset: opening, text: `
const ${profile}=globalThis.__cpuPaintProfile;const ${start}=${profile}?.active?performance.now():null;try{
` });
            inserts.push({ offset: node.body.range[1] - 1, text: `
}finally{if(${start}!==null){try{const ${end}=performance.now();if(${profile}.records.length<500)${profile}.records.push({file:${JSON.stringify(filename)},name:${JSON.stringify(node.id.name)},at:${start}-${profile}.startedAt,duration:${end}-${start},endedAfterTurn:!${profile}.active});}catch{}}}
` });
        }
        for (const [key, value] of Object.entries(node)) {
            if (key === 'range') continue;
            if (Array.isArray(value)) value.forEach(visit);
            else if (value && typeof value === 'object') visit(value);
        }
    };
    visit(ast);
    for (const insert of inserts.sort((a, b) => b.offset - a.offset)) {
        source = source.slice(0, insert.offset) + insert.text + source.slice(insert.offset);
    }
    // Validate nested insertions as JavaScript before fulfilling any response.
    espree.parse(source, { ecmaVersion: 'latest', sourceType: 'script' });
    return source;
}

for (const treatment of ['normal']) {
test(`標準CPUの描画分離診断 ${treatment}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 936 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.addInitScript(() => localStorage.setItem('machikoroDesignTheme', 'cardboard'));
    await page.route('https://pagead2.googlesyndication.com/**', route => route.fulfill({ status: 200, body: '' }));
    await page.route(/\/js\/(cardBoardField|cardTableCamera|cardTableLayout|cardBoardActivationTags|cardBoardTransfers)\.js(?:\?.*)?$/, async route => {
        const response = await route.fetch();
        const filename = new URL(route.request().url()).pathname.split('/').pop();
        await route.fulfill({ response, body: instrumentBodies(await response.text(), filename) });
    });
    await page.goto('/');
    // Diagnostic interventions only: retain the actual actions, dice, scheduler
    // and canonical game; isolate whole-card animation and caption painting.
    if (treatment !== 'normal') await page.addStyleTag({ content: `
        html[data-design="cardboard"] #cardboardBoard .cardboard-card {
            animation: none !important;
            will-change: auto !important;
        }
        ${treatment === 'static-cards-no-caption' ? '.cardboard-activation-tag { display: none !important; }' : ''}
    ` });
    await page.evaluate(treatment => {
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
            treatment, cpuSpeed: 1500, cpuDifficulties: runtime.cpuPlayers.map(cpu => cpu?.difficulty), events: [] };
        window.__cpuPaintProfile = { active: true, startedAt: trace.startedAt, records: [],
            limit: 500, method: 'AST function-body try/finally; inclusive durations; instrumentation/JIT overhead possible' };
        let resolveFirstTransfer, resolveTurn;
        window.cpuEventFirstTransfer = new Promise(resolve => { resolveFirstTransfer = resolve; });
        window.cpuEventTurnChanged = new Promise(resolve => { resolveTurn = resolve; });
        let rollRecorded = false, turnRecorded = false;
        const added = new WeakSet(), removed = new WeakSet();
        const sampledTransfers = [];
        const stopAtTurnChange = () => {
            const current = GameRuntimeState.runtime.snapshot().game;
            if (turnRecorded) return true;
            if (current.turnCount === initialTurn && current.currentPlayerIndex === initialActor) return false;
            turnRecorded = true;
            window.__cpuPaintProfile.active = false;
            trace.events.push({ kind: 'turn-change', at: performance.now() - trace.startedAt,
                turn: current.turnCount, actor: current.currentPlayerIndex });
            trace.final = { turn: current.turnCount, actor: current.currentPlayerIndex,
                phase: current.phase, log: JSON.parse(JSON.stringify(current.log)) };
            trace.snapshot = GameSnapshot.serializeUndoState(current, SHOP_STOCK, Number.MAX_SAFE_INTEGER);
            trace.diceRngCalls = diceRngCalls;
            observer.disconnect();
            cancelCpuSchedule('seven-flow-diagnostic-one-turn-complete');
            resolveTurn();
            return true;
        };
        const record = (kind, data = {}) => {
            if (stopAtTurnChange()) return;
            trace.events.push({ kind, at: performance.now() - trace.startedAt, ...data });
        };
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
            stopAtTurnChange();
        };
        const actorNodes = node => node.nodeType === Node.ELEMENT_NODE
            ? [node, ...node.querySelectorAll('.cardboard-activation-tag, .cardboard-transfer')]
                .filter(element => element.matches('.cardboard-activation-tag, .cardboard-transfer')) : [];
        const observer = new MutationObserver(records => {
            if (stopAtTurnChange()) return;
            for (const mutation of records) {
                for (const node of mutation.addedNodes) for (const element of actorNodes(node)) {
                    if (added.has(element)) continue;
                    added.add(element);
                    if (element.matches('.cardboard-activation-tag')) {
                        record('tag-start', { name: element.querySelector('strong')?.textContent, text: element.textContent });

                    } else {
                        const animation = element.getAnimations()[0];
                        const timing = animation?.effect?.getTiming();
                        sampledTransfers.push({ element, animation });
                        const data = { owner: element.dataset.owner, name: element.dataset.facility,
                            step: element.dataset.step, route: element.dataset.route,
                            from: element.dataset.from, to: element.dataset.to,
                            subjects: JSON.parse(element.dataset.subjects || '[]'), text: element.textContent };
                        record('transfer-created', { ...data, delay: timing?.delay, duration: timing?.duration });
                        resolveFirstTransfer();
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
                    if (removed.has(element)) continue;
                    removed.add(element);
                    record(element.matches('.cardboard-activation-tag') ? 'tag-end' : 'transfer-removed',
                        { name: element.dataset.facility || element.querySelector('strong')?.textContent,
                            owner: element.dataset.owner, text: element.textContent });
                }
            }
            inspect();
        });
        observer.observe(document.getElementById('cardboardBoard'), { childList: true, subtree: true, characterData: true });
        window.stopCpuEventObservation = () => observer.disconnect();
        trace.geometry = [];
        trace.animationFrames = [];
        let previousFrameAt = null;
        window.cpuFirstActiveFlow = new Promise(resolve => {
            let captured = false;
            const sample = timestamp => {
                if (stopAtTurnChange()) return;
                const now = performance.now();
                if (sampledTransfers.length && trace.animationFrames.length < 200) {
                    trace.animationFrames.push({ at: now - trace.startedAt, timestamp,
                        gapMs: previousFrameAt === null ? null : now - previousFrameAt,
                        actors: sampledTransfers.map(({ element, animation }) => ({
                            from: element.dataset.from, to: element.dataset.to,
                            connected: element.isConnected, currentTime: animation?.currentTime ?? null,
                            startTime: animation?.startTime ?? null, playState: animation?.playState ?? null,
                        })) });
                }
                previousFrameAt = now;
                const actors = [...document.querySelectorAll('.cardboard-transfer')].map(element => {
                    const animation = element.getAnimations()[0];
                    return { from: element.dataset.from, to: element.dataset.to,
                        time: Number(animation?.currentTime), state: animation?.playState,
                        rect: element.getBoundingClientRect().toJSON() };
                }).filter(actor => actor.state === 'running' && actor.time >= 60 && actor.time < 540);
                if (actors.length && trace.geometry.length < 120) {
                    const overlaps = actors.flatMap((actor, index) => actors.slice(index + 1).flatMap(other => {
                        const a = actor.rect, b = other.rect;
                        const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
                        const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
                        return width > 0 && height > 0 ? [{ first: [actor.from, actor.to], second: [other.from, other.to], width, height }] : [];
                    }));
                    trace.geometry.push({ at: performance.now() - trace.startedAt, actors, overlaps });
                    if (!captured) { captured = true; resolve(); }
                }
                requestAnimationFrame(sample);
            };
            requestAnimationFrame(sample);
        });
    }, treatment);
    await page.screenshot({ path: testInfo.outputPath('cpu-events-start.png') });
    await page.evaluate(() => scheduleCPU());
    try {
        await expect.poll(() => page.evaluate(() => window.cpuEventTimeline.events.some(event => event.kind === 'transfer-created')), { timeout: 15000 }).toBe(true);
        await expect.poll(() => page.evaluate(() => window.cpuEventTimeline.geometry.length), { timeout: 15000 }).toBeGreaterThan(0);
        await page.screenshot({ path: testInfo.outputPath('cpu-events-during.png') });
        await expect.poll(() => page.evaluate(() => window.cpuEventTimeline.events.some(event => event.kind === 'turn-change')), { timeout: 15000 }).toBe(true);
        await page.screenshot({ path: testInfo.outputPath('cpu-events-next-turn.png') });
    } finally {
        const evidence = await page.evaluate(() => {
            window.stopCpuEventObservation();
            window.__cpuPaintProfile.active = false;
            return { ...window.cpuEventTimeline, callbackProfile: window.__cpuPaintProfile,
                diceRngCalls: window.cpuEventTimeline.diceRngCalls ?? window.cpuDiagnosticDiceCalls() };
        });
        const file = testInfo.outputPath('cpu-events-timeline.json');
        await fs.writeFile(file, JSON.stringify(evidence, null, 2));
        await testInfo.attach('cpu-events-timeline', { path: file, contentType: 'application/json' });
        for (const name of ['start', 'during', 'next-turn']) {
            const path = testInfo.outputPath(`cpu-events-${name}.png`);
            if (await fs.stat(path).catch(() => null)) await testInfo.attach(`cpu-events-${name}`, { path, contentType: 'image/png' });
        }
        const expected = ['街2/カフェ', '街3/カフェ', '街4/カフェ',
            '街1/コーン畑', '街2/コーン畑', '街3/コーン畑', '街4/コーン畑', '街1/パン屋'].sort();
        expect(evidence.resolvedGroups, '正本の実出目3が8施設groupを解決したこと').toEqual(expected);
        const created = evidence.events.filter(event => event.kind === 'transfer-created');
        const finished = evidence.events.filter(event => event.kind === 'transfer-finished');
        const expectedRoutes = ['0>1', '0>2', '0>3', 'null>0', 'null>1', 'null>2', 'null>3'].sort();
        const routeKey = event => `${event.from}>${event.to}`;
        expect(created.map(routeKey).sort()).toEqual(expectedRoutes);
        expect(finished.map(routeKey).sort()).toEqual(expectedRoutes);
        expect(evidence.events.filter(event => event.kind === 'transfer-cancelled')).toEqual([]);
        expect(created.every(event => event.delay === 0 && event.duration === 600)).toBe(true);
        for (const event of created) {
            expect(event.text).toBe(`${event.from === 'null' && event.to === '0' ? 2 : 1}コイン`);
            expect(event.subjects.slice().sort()).toEqual((event.from === 'null'
                ? event.to === '0' ? ['コーン畑', 'パン屋'] : ['コーン畑'] : ['カフェ']).sort());
        }
        expect(evidence.events.filter(event => event.kind === 'turn-change')).toHaveLength(1);
        expect(evidence.snapshot).toBeTruthy();
        expect(evidence.diceRngCalls).toBeGreaterThan(0);
        expect(evidence.geometry.length, '実時間が進んだrouteの矩形を採取する').toBeGreaterThan(0);
        expect(evidence.geometry.flatMap(sample => sample.overlaps), JSON.stringify(evidence.geometry)).toEqual([]);
    }
});

}
