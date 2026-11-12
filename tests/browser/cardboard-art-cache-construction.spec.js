const { test, expect, devices } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');

// Diagnostic only: a successful A/B run is not a commercial-quality claim.
// Eight fresh-browser cases use ABBA treatment order, no retries or screenshots in the window.
// OS filesystem/GPU cache is not controlled; finite samples do not prove causality.
test.describe.configure({ mode: 'default', retries: 0 });
test.use({ serviceWorkers: 'block', video: 'off',
    trace: { mode: 'retain-on-failure', screenshots: false, snapshots: false, sources: true } });

async function prepare(page, viewport, count = 4, controlledCards = true) {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => { if (!localStorage.getItem('machikoroDesignTheme')) localStorage.setItem('machikoroDesignTheme', 'cardboard'); });
    await page.route('https://pagead2.googlesyndication.com/**', route => route.fulfill({ status: 200, body: '' }));
    await page.goto('/');
    await page.evaluate(({ count, controlledCards }) => {
        startGameNow(count, Array.from({ length: count }, (_, index) => ({ type: 'human', name: `街${index + 1}` })));
        const state = GameRuntimeState.runtime.snapshot();
        // Use actual human settings as well as a controlled human roster;
        // clearing CPU objects alone leaves shuffled CPU presentation settings.
        GameRuntimeState.runtime.setCpuPlayers(Array.from({ length: count }, () => null));
        cancelCpuSchedule('cardboard-view');
        state.game.currentPlayerIndex = 0;
        state.game.players.forEach((player, index) => {
            player.name = `街${index + 1}`;
            if (controlledCards) player.cards = Array.from({ length: index ? 2 : 4 }, () => createCardByName(index ? 'カフェ' : '麦畑'));
            player.coins = 30;
        });
        // Keep the turn context consistent with the controlled seat order.
        state.game.log = [];
        state.game.addLog(LOG_TYPES.SYSTEM, `👤 ${state.game.currentPlayer().name}のターン`);
        setTutorialEnabled(false);
        render();
        acceptHotseatHandoff();
    }, { count, controlledCards });
    await expect(page.locator('#cardboardSeats > .cardboard-player')).toHaveCount(count);
    await expect(page.locator('#cardboardTableViewport')).toHaveAttribute('data-table-scale', /[0-9]/);
    if (!await page.locator('#cardboardEventDetails').evaluate(element => element.open)) await page.locator('#cardboardEventDetails > summary').click();
}
const state = page => page.evaluate(() => GameSnapshot.serializeUndoState(GameRuntimeState.runtime.snapshot().game, SHOP_STOCK, Number.MAX_SAFE_INTEGER));
async function camera(page, command) {
    const button = page.locator(`[data-cardboard-camera="${command}"]`);
    if (!await button.isVisible()) await page.locator('#cardboardMoreMenu > summary').click();
    await button.click();
}
for (const viewport of [{width:390,height:844},{width:1440,height:936}]) {
for (const [order, treatment] of ['original','image','image','original'].entries()) {
    test(`image cache cold-browser ${viewport.width} ${order + 1} ${treatment}`, async ({playwright, browserName}, testInfo) => {
        // Each case launches a browser, not merely a new context. Preserve the
        // original mobile-webkit DPR3 even at 1440 for this causal comparison.
        const browser = await playwright[browserName].launch();
        try {
        const context = await browser.newContext({...devices['iPhone 13'], viewport, serviceWorkers:'block'});
        const page = await context.newPage();
        const variant = 'A'; // Original hit test in both rendering treatments.
        const requests = [];
        page.on('requestfinished', request => {
            if (request.url().includes('/icons/facility-art')) requests.push({url:request.url(), timing:request.timing(), finishedAt:Date.now()});
        });
        page.on('response', response => {
            if (response.url().includes('/icons/facility-art')) requests.push({url:response.url(),status:response.status(),responseAt:Date.now()});
        });
        page.on('requestfailed', request => {
            if (request.url().includes('/icons/facility-art')) requests.push({url:request.url(), timing:request.timing(), failure:request.failure(), failedAt:Date.now()});
        });
        for (const name of ['cardBoardField.js','uiBuildMenu.js','ui.js']) {
            const file = treatment === 'original'
                ? path.join(__dirname,'../fixtures/art-cache-baseline',name+'.txt') : path.join(__dirname,'../../js',name);
            const source = await fs.readFile(file,'utf8');
            await page.route(`**/js/${name}*`, route => route.fulfill({status:200,contentType:'application/javascript',body:source}));
        }
        const pageErrors = [];
        page.on('pageerror', error => pageErrors.push({at:Date.now(), message:error.message, stack:error.stack}));
        let purchased = null;
        let moving = null;
        let notice = null;
        let failure = null;
        try {
        await prepare(page, viewport, 2, false);
        await page.evaluate(() => {
            const game = GameRuntimeState.runtime.snapshot().game;
            game.players[0].cards = ['麦畑','牧場','パン屋','森林','花畑','フラワーショップ'].map(createCardByName);
            game.players[0].coins = 30;
            render();
        });
        if (viewport.updateBanner) {
            await page.evaluate(() => setPwaBannerVisible('pwaUpdateBanner', true));
            await expect(page.locator('#pwaUpdateBanner')).toBeVisible();
        }
        await page.locator('#btnRoll').click();
        await expect.poll(() => page.evaluate(() => GameRuntimeState.runtime.snapshot().game.phase)).toBe('build');
        await expect(page.locator('#cardboardBoard')).not.toHaveClass(/cardboard-new-roll/);
        await expect(page.locator('.cardboard-activation-tag')).toHaveCount(0);
        // A hidden stale caption is a presentation fixture, not an active
        // animation. It must not suppress a fresh construction acknowledgment.
        await page.evaluate(() => {
            const stale = document.createElement('div');
            stale.className = 'cardboard-activation-tag';
            stale.hidden = true;
            stale.style.display = 'none';
            document.getElementById('cardboardBoard').appendChild(stale);
        });
        await camera(page, 'market');
        await page.locator('#cardboardMarket .compact-market-expand').click();
        // Record both transient layers from before the purchase. Their actual
        // frame evidence is collected without screenshots or extended lifetimes.
        await page.evaluate(hitTest => {
            let closedAt = null;
            const startedAt = performance.now();
            window.constructionDiagnostic = { hitTest, heartbeat: [], heartbeatCount: 0, maxGap: 0,
                visibility: [{at:performance.now(), hidden:document.hidden}], exceptions: [], hitTests: [] };
            const diagnostic = window.constructionDiagnostic;
            diagnostic.imageEvents = [];
            const imageEvent = event => {
                if (event.target?.localName === 'image' && diagnostic.imageEvents.length < 150) {
                    diagnostic.imageEvents.push({type:event.type,at:performance.now(),afterClose:closedAt === null ? null : performance.now()-closedAt,href:event.target.getAttribute('href')});
                }
            };
            document.addEventListener('load',imageEvent,true);
            document.addEventListener('error',imageEvent,true);
            const nativeFrame = window.requestAnimationFrame.bind(window);
            let previousHeartbeat = null;
            const beat = timestamp => {
                const now = performance.now();
                const gap = previousHeartbeat === null ? 0 : now - previousHeartbeat;
                previousHeartbeat = now;
                diagnostic.heartbeatCount++;
                diagnostic.maxGap = Math.max(diagnostic.maxGap, gap);
                if (diagnostic.heartbeat.length < 300) diagnostic.heartbeat.push({at:now, timestamp, afterClose:closedAt === null ? null : now-closedAt, gap, hidden:document.hidden});
                diagnostic.heartbeatHandle = nativeFrame(beat);
            };
            diagnostic.heartbeatHandle = nativeFrame(beat);
            window.constructionTrace = { frames: [], mutations: [], cancellations: [], tasks: [], beforeClose: null };
            // Observe callback cost without changing scheduling or animation time.
            const requestFrame = window.requestAnimationFrame;
            window.requestAnimationFrame = function (callback) {
                const scheduledBy = closedAt !== null && window.constructionTrace.tasks.length < 120 ? new Error().stack : null;
                return requestFrame.call(window, function (timestamp) {
                    const begin = performance.now();
                    const keyBefore = document.getElementById('cardboardSeats')?.dataset.tableLayoutKey;
                    try { return callback.call(window, timestamp); }
                    finally {
                        if (closedAt !== null && window.constructionTrace.tasks.length < 120) {
                            window.constructionTrace.tasks.push({ afterClose:begin-closedAt,
                                duration:performance.now()-begin, callback:callback.name, scheduledBy,
                                keyBefore, keyAfter:document.getElementById('cardboardSeats')?.dataset.tableLayoutKey });
                        }
                    }
                });
            };
            // Distinguish a flight that finishes between paints from one cancelled
            // by a later camera/scroll update; retain the normal animation clock.
            const cancelAnimation = Animation.prototype.cancel;
            Animation.prototype.cancel = function () {
                if (this.effect?.target?.id === 'cardboardBuildFlight') {
                    window.constructionTrace.cancellations.push({ at:performance.now()-startedAt,
                        currentTime:this.currentTime, playState:this.playState, stack:new Error().stack });
                }
                return cancelAnimation.call(this);
            };
            window.constructionGuardSnapshot = () => {
                const viewport = document.getElementById('cardboardTableViewport');
                const card = document.querySelector('#cardboardSeats [data-player-index="0"] .cardboard-card[data-card-name="麦畑"]');
                const marketCard = document.querySelector('#cardboardMarket [data-action="buildCard"][data-card-name="麦畑"]')?.closest('.compact-market-item');
                const rect = element => element?.getBoundingClientRect().toJSON();
                return { at:performance.now()-startedAt, hidden:document.hidden,
                    reducedMotion:document.body.classList.contains('accessibility-reduced-motion') || matchMedia('(prefers-reduced-motion: reduce)').matches,
                    phase:GameRuntimeState.runtime.snapshot().game.phase,
                    viewport:rect(viewport), target:rect(card), origin:rect(marketCard), shelf:rect(marketCard?.closest('.compact-market-facilities')),
                    cameraAngle:viewport.dataset.tableAngle, ownerAngle:card?.closest('.cardboard-player')?.dataset.tableAngle,
                    suppressors:[...document.querySelectorAll('#cardboardBoard #diceResult .rolling, #cardboardDiceConfirmation, #cardboardBoard .cardboard-preview-playing, #cardboardBoard .cardboard-activation-tag')].map(element => ({
                        className:element.className, display:getComputedStyle(element).display, visibility:getComputedStyle(element).visibility,
                        rects:element.getClientRects().length })),
                    viewportSize:{width:innerWidth,height:innerHeight},
                    screen:visualViewport ? {left:visualViewport.offsetLeft,top:visualViewport.offsetTop,width:visualViewport.width,height:visualViewport.height} : null };
            };
            window.constructionTraceObserver = new MutationObserver(records => {
                for (const record of records) for (const [kind, nodes] of [['add',record.addedNodes],['remove',record.removedNodes]]) {
                    for (const node of nodes) if (node.id === 'cardboardBuildFlight' || node.id === 'cardboardBuildNotice') {
                        let sameScrollRetained = null;
                        if (kind === 'add' && node.id === 'cardboardBuildFlight') {
                            // A focus command can deliver its native scroll event
                            // after the new flight exists, without another move.
                            document.getElementById('cardboardTableViewport').dispatchEvent(new Event('scroll'));
                            sameScrollRetained = node.isConnected;
                        }
                        window.constructionTrace.mutations.push({ kind, id:node.id, at:performance.now()-startedAt, sameScrollRetained,
                            animations:node.getAnimations().map(animation => ({currentTime:animation.currentTime,playState:animation.playState,duration:animation.effect.getTiming().duration})) });
                    }
                }
            });
            window.constructionTraceObserver.observe(document.getElementById('cardboardBoard'), {childList:true});
            document.getElementById('cardboardMarketClose').addEventListener('click', () => {
                closedAt = performance.now();
                diagnostic.closedAt = closedAt;
                window.constructionTrace.beforeClose = window.constructionGuardSnapshot();
            }, { once: true, capture: true });
            const captureNotice = element => {
                const bounds = element.getBoundingClientRect();
                const table = document.getElementById('cardboardTableViewport').getBoundingClientRect();
                const receiptClosed = !document.getElementById('cardboardEventDetails').open;
                const svg = element.querySelector('svg');
                const svgBounds = svg.getBoundingClientRect();
                const artVisible = getComputedStyle(svg).display !== 'none' && svgBounds.width > 0 && svgBounds.height > 0;
                const screen = visualViewport;
                const pointerEvents = getComputedStyle(element).pointerEvents;
                const previousPointerEvents = element.style.pointerEvents;
                let paintedAboveExistingPanels = null;
                const hitStarted = performance.now();
                try {
                    // Keep both target geometry reads in B; omit only the
                    // pointer-events mutation and elementsFromPoint queries.
                    if (hitTest) element.style.pointerEvents = 'auto';
                    const coverage = ['strong', '.cardboard-build-notice-art'].every(selector => {
                        const target = element.querySelector(selector).getBoundingClientRect();
                        if (!hitTest) return true;
                        const top = document.elementsFromPoint(target.left + target.width / 2, target.top + target.height / 2)[0];
                        return top === element || element.contains(top);
                    });
                    if (hitTest) paintedAboveExistingPanels = coverage;
                } finally {
                    if (hitTest) element.style.pointerEvents = previousPointerEvents;
                    diagnostic.hitTests.push({at:hitStarted, afterClose:hitStarted-closedAt, duration:performance.now()-hitStarted, performed:hitTest});
                }
                return { elapsedAfterClose:performance.now() - closedAt, opacity:Number(getComputedStyle(element).opacity),
                    text:element.textContent, art:element.querySelectorAll('svg').length,
                    pointerEvents, paintedAboveExistingPanels, receiptClosed, artVisible,
                    insideTable:bounds.left>=table.left && bounds.top>=table.top && bounds.right<=table.right && bounds.bottom<=table.bottom,
                    insideScreen:bounds.left>=(screen?.offsetLeft || 0) && bounds.top>=(screen?.offsetTop || 0) &&
                        bounds.right<=(screen?.offsetLeft || 0)+(screen?.width || innerWidth) &&
                        bounds.bottom<=(screen?.offsetTop || 0)+(screen?.height || innerHeight) };
            };
            window.constructionMovingFrame = new Promise(resolve => {
                const inspect = () => {
                    const flight = document.getElementById('cardboardBuildFlight');
                    const animation = flight?.getAnimations()[0];
                    const elapsed = Number(animation?.currentTime);
                    if (closedAt !== null && window.constructionTrace.frames.length < 120) {
                        window.constructionTrace.frames.push({afterClose:performance.now()-closedAt, flight:!!flight,
                            animations:flight?.getAnimations().map(value => ({currentTime:value.currentTime,playState:value.playState,duration:value.effect.getTiming().duration})) || []});
                    }
                    if (flight && animation && elapsed >= 60 && elapsed < 400) {
                        const bounds = flight.getBoundingClientRect();
                        resolve({ name:flight.dataset.cardName, elapsed, duration:animation.effect.getTiming().duration,
                            arrivalStarted:!!document.querySelector('#cardboardSeats .cardboard-card-newly-built'),
                            pointerEvents:getComputedStyle(flight).pointerEvents,
                            insideScreen:bounds.left>=0 && bounds.top>=0 && bounds.right<=innerWidth && bounds.bottom<=innerHeight });
                    } else if (closedAt !== null && performance.now() - closedAt >= 1500) {
                        resolve({ error: 'fresh purchase flight was not observed while moving' });
                    } else requestAnimationFrame(inspect);
                };
                requestAnimationFrame(inspect);
            });
            window.constructionNoticeFrame = new Promise(resolve => {
                const inspect = () => {
                    const element = document.getElementById('cardboardBuildNotice');
                    if (closedAt !== null && element && Number(getComputedStyle(element).opacity) >= 0.9) {
                        resolve(captureNotice(element));
                    } else if (closedAt !== null && performance.now() - closedAt >= 2500) {
                        resolve({ error: 'fresh construction notice never reached a painted frame' });
                    } else requestAnimationFrame(inspect);
                };
                requestAnimationFrame(inspect);
            });
        }, variant === 'A');
        await page.locator('#cardboardMarketDialog [data-action="buildCard"][data-card-name="麦畑"]').click();
        purchased = await state(page);
        await page.locator('#cardboardMarketClose').click();
        moving = await page.evaluate(() => window.constructionMovingFrame);
        notice = await page.evaluate(() => window.constructionNoticeFrame);
        const flightDiagnostic = await page.evaluate(() => ({ ...window.constructionTrace, current:window.constructionGuardSnapshot() }));
        await fs.writeFile(testInfo.outputPath(`facility-flight-diagnostic-${viewport.width}.json`), JSON.stringify({moving,flightDiagnostic}, null, 2));
        expect(moving.name, JSON.stringify({moving,flightDiagnostic})).toBe('麦畑');
        expect(flightDiagnostic.mutations.filter(change => change.kind === 'add' && change.id === 'cardboardBuildFlight')
            .every(change => change.sameScrollRetained === true)).toBe(true);
        expect(moving.duration).toBe(480);
        expect(moving.arrivalStarted, '到着先の祝福はカードの飛行完了後に始まる').toBe(false);
        expect(moving.pointerEvents).toBe('none');
        expect(moving.insideScreen).toBe(true);
        await expect(page.locator('#cardboardBuildFlight')).toHaveCount(0);

        expect(notice.text).toContain('街1が建設');
        expect(notice.text).toContain('麦畑');
        expect(notice.text).toContain('建設費 1コイン');
        expect(notice.art).toBe(1);
        expect(notice.artVisible).toBe(true);
        expect(notice.pointerEvents).toBe('none');
        if (variant === 'A') expect(notice.paintedAboveExistingPanels).toBe(true);
        else expect(notice.paintedAboveExistingPanels).toBeNull();
        expect(notice.receiptClosed).toBe(true);
        expect(notice.insideTable).toBe(true);
        expect(notice.insideScreen).toBe(true);
        await fs.writeFile(testInfo.outputPath(`facility-construction-frame-${viewport.width}.json`), JSON.stringify({moving, notice}, null, 2));
        expect(await state(page)).toEqual(purchased);
        await page.evaluate(() => window.constructionTraceObserver.disconnect());
        await page.locator('.cardboard-activation-tag[hidden]').evaluateAll(elements => elements.forEach(element => element.remove()));
        } catch (error) {
            failure = { message: error.message, stack: error.stack };
            throw error;
        } finally {
            let collectedBrowser = null;
            let collectionError = null;
            try {
                collectedBrowser = await page.evaluate(async () => {
                    const diagnostic = window.constructionDiagnostic;
                    const settled = diagnostic?.closedAt != null
                        ? await Promise.race([Promise.allSettled([window.constructionMovingFrame, window.constructionNoticeFrame]),
                            new Promise(resolve => setTimeout(() => resolve({collectionTimeout:true}), 3000))]) : null;
                    if (diagnostic?.heartbeatHandle) cancelAnimationFrame(diagnostic.heartbeatHandle);
                    window.constructionTraceObserver?.disconnect();
                    return { diagnostic, trace:window.constructionTrace,
                        current:window.constructionGuardSnapshot?.(), resources:performance.getEntriesByType('resource').filter(entry=>entry.name.includes('/icons/facility-art')).map(entry=>entry.toJSON()), settled };
                });
            } catch (error) { collectionError = {message:error.message, stack:error.stack}; }
            let finalState = null;
            try { finalState = await state(page); }
            catch (error) { collectionError = {...collectionError, canonicalError:error.message}; }
            await fs.writeFile(testInfo.outputPath('construction-paint-diagnostic.json'), JSON.stringify({
                variant, treatment, order, requests, cacheLabel:'fresh-browser; OS filesystem/GPU cache not controlled', orderLimitation:'ABBA order; finite samples do not establish causality', viewport, qualification:'diagnostic CPU-free fixture; not commercial or physical-device validation',
                moving, notice, failure, pageErrors, collectionError, browser:collectedBrowser,
                purchased, finalState, canonicalUnchanged:purchased !== null && finalState !== null
                    ? JSON.stringify(purchased) === JSON.stringify(finalState) : null,
                result:failure ? 'failed' : 'passed'
            }, null, 2));
            await context.close();
        }
        } finally {
            await browser.close();
        }
    });
}

}
