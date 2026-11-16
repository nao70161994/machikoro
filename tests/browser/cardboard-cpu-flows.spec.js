const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');

// Run the actual mobile project settings, including DPR and touch support.
// Preserve real actions and CPU scheduling while fixing only the random input.
test.use({ serviceWorkers: 'block', video: 'off',
    trace: { mode: 'retain-on-failure', screenshots: false, snapshots: false, sources: true } });

for (const artControl of (process.env.CARD_TABLE_ART_CONTROL ? ['legacy', 'empty'] : [''])) {
test.describe(artControl || '通常アート', () => {
for (const dense of [false, true]) {
for (const viewport of [{ width: 844, height: 390 }, { width: 320, height: 568 }]) {
if (artControl && (!dense || viewport.width !== 844)) continue;
test(`標準CPUの一括結果は7収支routeを手番内に完走する ${viewport.width}px${dense ? ' 終盤' : ''}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.addInitScript(() => localStorage.setItem('machikoroDesignTheme', 'cardboard'));
    await page.route('https://pagead2.googlesyndication.com/**', route => route.fulfill({ status: 200, body: '' }));
    await page.addInitScript(() => {
        const profile = window.cpuFrameProfile = { frames: [], heartbeats: [], observers: [] };
        for (const kind of ['ResizeObserver', 'MutationObserver']) {
            const Native = window[kind];
            if (!Native) continue;
            window[kind] = class extends Native {
                constructor(callback) {
                    const label = `${callback.name || 'anonymous'}: ${String(callback).slice(0, 120)}`;
                    super((entries, observer) => {
                        const startedAt = performance.now();
                        try { callback(entries, observer); }
                        finally {
                            if (profile.observers.length < 1000) profile.observers.push({ kind, label, startedAt,
                                endedAt: performance.now(), count: entries.length,
                                targets: entries.slice(0, 8).map(entry => ({ id: entry.target.id || entry.target.nodeName,
                                    width: entry.contentRect?.width, height: entry.contentRect?.height })) });
                        }
                    });
                }
            };
        }
        const nativeRequest = window.requestAnimationFrame.bind(window);
        const labels = new WeakMap();
        window.requestAnimationFrame = callback => {
            if (!labels.has(callback)) labels.set(callback, `${callback.name || 'anonymous'}: ${String(callback).slice(0, 120)}`);
            const requestedAt = performance.now();
            return nativeRequest(timestamp => {
                const startedAt = performance.now();
                try { callback(timestamp); }
                finally {
                    if (profile.frames.length < 2000) profile.frames.push({ requestedAt, timestamp, startedAt,
                        endedAt: performance.now(), label: labels.get(callback) });
                }
            });
        };
        let last = performance.now();
        const timer = setInterval(() => {
            const now = performance.now();
            if (profile.heartbeats.length < 500) profile.heartbeats.push({ at: now, gap: now - last });
            else clearInterval(timer);
            last = now;
        }, 200);
    });
    if (artControl) await page.route('**/js/uiBuildMenu.js', async route => {
        const response = await route.fetch();
        const source = await response.text();
        const original = 'if (tableArtFailures.has(motif)) return renderFacilityArt(name, landmark, category);';
        expect(source.split(original)).toHaveLength(2);
        const replacement = artControl === 'legacy' ? 'return renderFacilityArt(name, landmark, category);'
            : 'return `<svg class="sunset-facility-art facility-scene-${scene}" viewBox="${viewBox}" aria-hidden="true" focusable="false"></svg>`;';
        await route.fulfill({ response, body: source.replace(original, replacement) });
    });
    await page.goto('/');
    await page.evaluate(dense => {
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
            if (dense) {
                // Grow the visible collection without adding any die-3 effect:
                // the same seven real routes must still resolve and finish.
                const quiet = CARDS.filter(card => !card.diceNums.includes(3));
                player.cards.push(...quiet.map(card => createCardByName(card.name)));
                for (const card of quiet) SHOP_STOCK[card.name]--;
                if (index === 0) {
                    // Two incoming corn coins plus the bakery balance the
                    // three café payments: show an actual zero net as well.
                    player.cards.push(createCardByName('コーン畑'));
                    SHOP_STOCK['コーン畑']--;
                }
            }
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
                            amount: Number(element.dataset.amount), mode: element.dataset.mode, routeLabelDisplay: getComputedStyle(element, '::after').display,
                            subjects: JSON.parse(element.dataset.subjects || '[]'), text: element.textContent };
                        record('transfer-created', { ...data, delay: timing?.delay, duration: timing?.duration,
                            netGeometryMs: element.closest('.cardboard-transfers')?.dataset.netGeometryMs,
                            netPlannerMs: element.closest('.cardboard-transfers')?.dataset.netPlannerMs });
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
        observer.observe(document.body, { childList: true, subtree: true, characterData: true });
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
                        opacity: Number(getComputedStyle(element).opacity),
                        rect: element.getBoundingClientRect().toJSON() };
                }).filter(actor => actor.state === 'running' && actor.time >= 60 && actor.time < 540);
                if (actors.length && trace.geometry.length < 120) {
                    const overlaps = actors.flatMap((actor, index) => actors.slice(index + 1).flatMap(other => {
                        const a = actor.rect, b = other.rect;
                        const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
                        const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
                        return width > 0 && height > 0 ? [{ first: [actor.from, actor.to], second: [other.from, other.to], width, height }] : [];
                    }));
                    const labels = [...document.querySelectorAll('.cardboard-owner-label')].map(label => ({
                        owner: label.dataset.playerIndex, rect: label.getBoundingClientRect().toJSON() }));
                    const labelOverlaps = actors.flatMap(actor => labels.flatMap(label => {
                        const a = actor.rect, b = label.rect;
                        return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
                            ? [{ route: [actor.from, actor.to], owner: label.owner }] : [];
                    }));
                    const badgeElements = [...document.querySelectorAll('.cardboard-owner-net')];
                    const protectedElements = [...document.querySelectorAll('.cardboard-owner-label, .cardboard-card, .cardboard-landmark, #cardboardCenter, #cardboardControls, #cardboardCameraTools, #cardboardRoster, #cardboardViewHint')];
                    const badges = badgeElements.map(badge => ({ owner: Number(badge.dataset.playerIndex), net: Number(badge.dataset.net),
                        text: badge.textContent, scrollWidth: badge.scrollWidth, clientWidth: badge.clientWidth, rect: badge.getBoundingClientRect().toJSON(), aria: badge.getAttribute('aria-label') }));
                    const collides = (a, b) => a.width > 0 && a.height > 0 && b.width > 0 && b.height > 0 &&
                        a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
                    const badgeOverlaps = badges.flatMap((badge, index) => [
                        ...badges.slice(index + 1).filter(other => collides(badge.rect, other.rect)).map(other => ({ owner: badge.owner, otherOwner: other.owner })),
                        ...protectedElements.filter(element => collides(badge.rect, element.getBoundingClientRect()))
                            .map(element => ({ owner: badge.owner, obstacle: element.id || element.className })),
                    ]);
                    const labelRects = labels.map(label => ({ ...label, owner: Number(label.owner) }));
                    const badgeOwners = badges.every(badge => {
                        const distance = label => Math.hypot((badge.rect.left + badge.rect.right) / 2 - (label.rect.left + label.rect.right) / 2,
                            (badge.rect.top + badge.rect.bottom) / 2 - (label.rect.top + label.rect.bottom) / 2);
                        const own = labelRects.find(label => label.owner === badge.owner);
                        return own && labelRects.every(label => distance(own) <= distance(label));
                    });
                    trace.geometry.push({ at: performance.now() - trace.startedAt, actors, overlaps, labelOverlaps, badges, badgeOverlaps, badgeOwners,
                        badgeStatus: document.querySelector('.cardboard-transfers')?.dataset.netBadges });
                    if (!captured) { captured = true; resolve(); }
                }
                requestAnimationFrame(sample);
            };
            requestAnimationFrame(sample);
        });
    }, dense);
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
            return { ...window.cpuEventTimeline, frameProfile: window.cpuFrameProfile,
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
        expect(created.every(event => event.delay === 0 && event.duration === 600 && event.mode === 'parallel')).toBe(true);
        expect(created.every(event => event.routeLabelDisplay === 'none'), '飛行coinに読み取り用の経路文字を重ねない').toBe(true);
        for (const event of created) {
            expect(event.text).toBe('●');
            expect(event.amount).toBe(event.from === 'null' && event.to === '0' ? dense ? 3 : 2 : 1);
            expect(event.subjects.slice().sort()).toEqual((event.from === 'null'
                ? event.to === '0' ? ['コーン畑', 'パン屋'] : ['コーン畑'] : ['カフェ']).sort());
        }
        expect(evidence.events.filter(event => event.kind === 'turn-change')).toHaveLength(1);
        expect(evidence.snapshot).toBeTruthy();
        expect(evidence.diceRngCalls).toBeGreaterThan(0);
        expect(evidence.geometry.length, '実時間が進んだrouteの矩形を採取する').toBeGreaterThan(0);
        // Coins can physically share their source. Readable owner amounts,
        // rather than the tiny coin glyphs, must remain separate and unobscured.
        for (const sample of evidence.geometry) {
            expect(sample.labelOverlaps, '移動coinが所有者名を覆わない').toEqual([]);
            expect(sample.badgeStatus, JSON.stringify(sample)).toBe('complete');
            expect(sample.badges.map(({ owner, net }) => ({ owner, net })).sort((a, b) => a.owner - b.owner))
                .toEqual([{ owner: 0, net: dense ? 0 : -1 }, { owner: 1, net: 2 }, { owner: 2, net: 2 }, { owner: 3, net: 2 }]);
            expect(sample.badges.map(badge => badge.text)).toEqual([dense ? '0' : '−1', '+2', '+2', '+2']);
            expect(sample.badges.every(badge => badge.aria === `街${badge.owner + 1}の直近に解決した収支、${badge.net < 0 ? 'マイナス' : badge.net > 0 ? 'プラス' : ''}${Math.abs(badge.net)}コイン`)).toBe(true);
            expect(sample.badges.every(badge => badge.scrollWidth <= badge.clientWidth), '全桁を札の幅内へ表示する').toBe(true);
            expect(sample.badgeOwners, JSON.stringify(sample)).toBe(true);
            expect(sample.badgeOverlaps, JSON.stringify(sample)).toEqual([]);
        }
        expect([...new Set(evidence.geometry.flatMap(sample => sample.actors.filter(actor => actor.opacity > 0.5)
            .map(routeKey)))].sort(), '全7経路に実時間60〜540msの描画frameが必要').toEqual(expectedRoutes);
        for (const key of expectedRoutes) {
            const positions = evidence.geometry.flatMap(sample => sample.actors.filter(actor => routeKey(actor) === key && actor.opacity > 0.5)
                .map(actor => ({ x: actor.rect.x, y: actor.rect.y, time: actor.time })));
            expect(positions.some(first => positions.some(second => second.time > first.time &&
                Math.hypot(second.x - first.x, second.y - first.y) > 0.5)), `${key}: 静止DOMでなく異なる実frameで位置が進むこと ${JSON.stringify(positions)}`).toBe(true);
        }
        expect(evidence.events.filter(event => event.kind === 'tag-start'), '自動結果は個別captionを順次起動しない').toEqual([]);
        const changedAt = evidence.events.find(event => event.kind === 'turn-change').at;
        expect(finished.every(event => event.at < changedAt)).toBe(true);
    }
});

}
}

});
}

test('RAF対照: 空の同一モバイル文脈でも7経路が600msで描画される', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 844, height: 390 });
    await page.route('**/__raf-control', route => route.fulfill({ contentType: 'text/html',
        body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}.coin{position:absolute;width:16px;height:16px;background:gold;border-radius:50%}</style><body></body>' }));
    await page.goto('/__raf-control');
    await page.screenshot({ path: testInfo.outputPath('raf-control-start.png') });
    const evidence = await page.evaluate(() => new Promise(resolve => {
        const startedAt = performance.now();
        const finished = [], samples = [];
        const actors = Array.from({ length: 7 }, (_, index) => {
            const element = document.createElement('span');
            element.className = 'coin';
            element.style.top = `${20 + index * 40}px`;
            element.style.left = '20px';
            document.body.appendChild(element);
            const animation = element.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(400px)' }],
                { duration: 600, easing: 'linear', fill: 'both' });
            animation.pause();
            animation.currentTime = 0;
            animation.finished.then(() => finished.push({ index, at: performance.now() - startedAt }));
            return { element, animation };
        });
        let stopped = false;
        const sample = () => {
            if (stopped) return;
            samples.push({ at: performance.now() - startedAt, actors: actors.map(({ element, animation }) => ({
                time: animation.currentTime, state: animation.playState, x: element.getBoundingClientRect().left })) });
            requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
        requestAnimationFrame(() => requestAnimationFrame(() => actors.forEach(({ animation }) => animation.play())));
        setTimeout(() => {
            stopped = true;
            resolve({ finished, samples, elapsed: performance.now() - startedAt, dpr: devicePixelRatio, visible: !document.hidden });
        }, 1500);
    }));
    const file = testInfo.outputPath('raf-control.json');
    await fs.writeFile(file, JSON.stringify(evidence, null, 2));
    await testInfo.attach('raf-control', { path: file, contentType: 'application/json' });
    expect(evidence.finished).toHaveLength(7);
    expect(evidence.finished.every(event => event.at < 1500)).toBe(true);
    for (let index = 0; index < 7; index++) {
        const positions = evidence.samples.filter(sample => sample.actors[index].time >= 60 && sample.actors[index].time < 540)
            .map(sample => sample.actors[index].x);
        expect(new Set(positions).size).toBeGreaterThanOrEqual(2);
    }
});

test('静止盤面対照: 終盤の実カード卓上で7経路を描画する', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 844, height: 390 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.addInitScript(() => localStorage.setItem('machikoroDesignTheme', 'cardboard'));
    await page.route('https://pagead2.googlesyndication.com/**', route => route.fulfill({ status: 200, body: '' }));
    await page.addInitScript(hide => { window.staticTableHideGame = hide; }, process.env.STATIC_TABLE_HIDE_GAME === '1');
    await page.goto('/');
    await page.evaluate(() => {
        startGameNow(4, Array.from({ length: 4 }, (_, index) => ({ type: 'cpu', difficulty: 'weak', name: `街${index + 1}` })));
        cancelCpuSchedule('static-table-control');
        const game = GameRuntimeState.runtime.snapshot().game;
        game.currentPlayerIndex = 0;
        game.players.forEach((player, index) => {
            player.name = `街${index + 1}`;
            player.cards = ['コーン畑', 'パン屋', 'カフェ', ...CARDS.filter(card => !card.diceNums.includes(3)).map(card => card.name)]
                .map(name => createCardByName(name));
            if (index === 0) player.cards.push(createCardByName('コーン畑'));
            player.coins = 30;
            Object.keys(player.landmarks).forEach(name => { player.landmarks[name] = false; });
        });
        setTutorialEnabled(false);
        render();
    });
    await expect(page.locator('.cardboard-owner-label')).toHaveCount(4);
    await page.screenshot({ path: testInfo.outputPath('static-table-start.png') });
    const evidence = await page.evaluate(() => new Promise(resolve => {
        const game = GameRuntimeState.runtime.snapshot().game;
        const before = JSON.stringify(GameSnapshot.serializeUndoState(game, SHOP_STOCK, Number.MAX_SAFE_INTEGER));
        const events = { participantNames: game.players.map(player => player.name), activations: [
            ...[1, 2, 3].map(owner => ({ from: 0, to: owner, amount: 1, subject: 'カフェ', facility: true, owner })),
            ...[0, 1, 2, 3].map(owner => ({ from: null, to: owner, amount: owner === 0 ? 2 : 1, subject: 'コーン畑', facility: true, owner })),
            { from: null, to: 0, amount: 1, subject: 'パン屋', facility: true, owner: 0 },
        ] };
        const controller = CardBoardTransfers.create();
        const startedAt = performance.now();
        controller.play({ container: document.getElementById('cardboardBoard'), overlayRoot: document.body, events, simultaneous: true });
        // Diagnostic only: keep the independent fixed plane and its measured
        // paths, but remove the game subtree from layout/paint after creation.
        if (window.staticTableHideGame) document.getElementById('gameScreen').style.display = 'none';
        const finished = [], samples = [];
        const actors = [...document.querySelectorAll('.cardboard-transfer')].map(element => {
            const animation = element.getAnimations()[0];
            const route = `${element.dataset.from}>${element.dataset.to}`;
            animation.finished.then(() => finished.push({ route, at: performance.now() - startedAt })).catch(() => {});
            return { element, animation, route };
        });
        let stopped = false;
        const sample = () => {
            if (stopped) return;
            samples.push({ at: performance.now() - startedAt, actors: actors.map(({ element, animation, route }) => ({
                route, time: animation.currentTime, state: animation.playState, connected: element.isConnected,
                opacity: Number(getComputedStyle(element).opacity), rect: element.getBoundingClientRect().toJSON() })) });
            requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
        setTimeout(() => {
            stopped = true;
            const unchanged = before === JSON.stringify(GameSnapshot.serializeUndoState(game, SHOP_STOCK, Number.MAX_SAFE_INTEGER));
            resolve({ finished, samples, unchanged, elapsed: performance.now() - startedAt });
            controller.clear();
        }, 1500);
    }));
    const file = testInfo.outputPath('static-table-control.json');
    await fs.writeFile(file, JSON.stringify(evidence, null, 2));
    await testInfo.attach('static-table-control', { path: file, contentType: 'application/json' });
    expect(evidence.unchanged).toBe(true);
    expect(evidence.finished).toHaveLength(7);
    expect(evidence.finished.every(event => event.at < 1500)).toBe(true);
    for (const route of ['0>1', '0>2', '0>3', 'null>0', 'null>1', 'null>2', 'null>3']) {
        const positions = evidence.samples.flatMap(sample => sample.actors.filter(actor => actor.route === route &&
            actor.connected && actor.opacity > 0.5 && actor.time >= 60 && actor.time < 540)
            .map(actor => `${actor.rect.left}:${actor.rect.top}`));
        expect(new Set(positions).size, route).toBeGreaterThanOrEqual(2);
    }
});
