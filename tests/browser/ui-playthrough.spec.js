const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');

test.use({
    serviceWorkers: 'block',
    video: 'off',
    trace: { mode: 'retain-on-failure', screenshots: false, snapshots: false, sources: true },
});

// Opt-in only; never seed dice or replace the human seat with an automatic CPU.
// RUN_UI_PLAYTHROUGH=1 runs a full game; UI_PLAYTHROUGH_STOP_AFTER=6 is a labelled
// partial smoke run and must not be reported as a completed game or human review.
test('人間席の実UI操作とCPU弱で開始から結果まで進める', async ({ page }, testInfo) => {
    test.skip(process.env.RUN_UI_PLAYTHROUGH !== '1', '任意実行のUI対局');
    test.setTimeout(25 * 60 * 1000);
    const playerCountInput = process.env.UI_PLAYTHROUGH_PLAYER_COUNT ?? '2';
    if (!/^(?:[2-9]|10)$/.test(playerCountInput)) throw new Error('Invalid UI playthrough player count');
    const playerCount = Number(playerCountInput);
    const stopAfter = Number(process.env.UI_PLAYTHROUGH_STOP_AFTER) || 0;
    if (!Number.isInteger(stopAfter) || stopAfter < 0) throw new Error('Invalid partial action limit');
    const viewportWidth = Number(process.env.UI_PLAYTHROUGH_WIDTH ||
        (process.env.UI_PLAYTHROUGH_LANDSCAPE === '1' ? 844 : 390));
    const viewports = { 320: { width: 320, height: 568 }, 390: { width: 390, height: 844 },
        844: { width: 844, height: 390 }, 1440: { width: 1440, height: 900 } };
    if (!Object.hasOwn(viewports, viewportWidth)) throw new Error('Invalid UI playthrough viewport');
    const viewport = viewports[viewportWidth];
    const cpuSpeedMs = Number(process.env.UI_PLAYTHROUGH_CPU_SPEED || 1500);
    if (!Number.isInteger(cpuSpeedMs) || cpuSpeedMs < 100 || cpuSpeedMs > 3000 || cpuSpeedMs % 100 !== 0) {
        throw new Error('Invalid CPU speed');
    }
    const started = Date.now();
    const report = { mode: stopAfter ? 'partial-ui-smoke' : 'automated-human-seat-ui',
        viewport, playerCount, cpuSpeedMs, completed: false, humanActions: 0, clicks: 0, keyboardActions: 0, cpuWaitMs: 0, actions: [], screenshots: [], pageErrors: [] };
    const stages = new Set();
    page.on('pageerror', error => report.pageErrors.push(error.message));
    const capture = async stage => {
        if (stages.has(stage)) return;
        stages.add(stage);
        if (stage === 'midgame') {
            await page.evaluate(metadata => {
                const frames = [];
                window.midgameGeometrySample = (label, timestamp = performance.now()) => {
                    const viewport = document.getElementById('cardboardTableViewport');
                    const world = document.getElementById('cardboardSeats');
                    const game = GameRuntimeState.runtime.snapshot().game;
                    const rect = element => element?.getBoundingClientRect().toJSON() || null;
                    const viewportRect = viewport.getBoundingClientRect();
                    const clip = { left:viewportRect.left + viewport.clientLeft, top:viewportRect.top + viewport.clientTop };
                    clip.right = clip.left + viewport.clientWidth;
                    clip.bottom = clip.top + viewport.clientHeight;
                    const entries = [...world.querySelectorAll('.cardboard-player, .cardboard-landmark-built')].map(element => {
                        const bounds = element.getBoundingClientRect();
                        const outside = [bounds.left < clip.left - 1 && 'left', bounds.top < clip.top - 1 && 'top',
                            bounds.right > clip.right + 1 && 'right', bounds.bottom > clip.bottom + 1 && 'bottom'].filter(Boolean);
                        return { kind:element.classList.contains('cardboard-player') ? 'owner' : 'landmark',
                            owner:element.closest('.cardboard-player')?.dataset.playerIndex,
                            name:element.dataset.landmarkName || element.querySelector('.cardboard-player-heading-name')?.textContent || element.textContent.trim(),
                            angle:element.closest('.cardboard-player')?.dataset.tableAngle,
                            rect:bounds.toJSON(), native:{left:element.offsetLeft,top:element.offsetTop,width:element.offsetWidth,height:element.offsetHeight},
                            visible:element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden', outside };
                    });
                    const angle = Number(viewport.dataset.tableAngle || 0);
                    const quarterTurn = Math.abs(angle % 180) === 90;
                    const fit = (width, height) => Math.max(0.04, Math.min(1.8, viewport.clientWidth / Math.max(1,width), viewport.clientHeight / Math.max(1,height)));
                    return { label, timestamp, metadata,
                        game:{turn:game.turnCount,phase:game.phase,actor:game.currentPlayerIndex},
                        viewport:{rect:viewportRect.toJSON(),clip,clientWidth:viewport.clientWidth,clientHeight:viewport.clientHeight,
                            scrollLeft:viewport.scrollLeft,scrollTop:viewport.scrollTop,scrollWidth:viewport.scrollWidth,scrollHeight:viewport.scrollHeight,
                            mode:viewport.dataset.tableMode,scale:viewport.dataset.tableScale,angle:viewport.dataset.tableAngle,
                            focusPlayer:viewport.dataset.tableFocusPlayer},
                        world:{width:world.offsetWidth,height:world.offsetHeight,rect:rect(world),transform:getComputedStyle(world).transform,
                            packing:world.dataset.tablePacking,layoutKey:world.dataset.tableLayoutKey,readingSeat:world.dataset.tableReadingSeat},
                        expectedFit:fit(world.offsetWidth,world.offsetHeight),
                        expectedFitAtCurrentAngle:fit(quarterTurn ? world.offsetHeight : world.offsetWidth,quarterTurn ? world.offsetWidth : world.offsetHeight),
                        panels:Object.fromEntries(['cardboardActionSlot','gameConnectivityPanel','gameActivityStatus','cardboardRoster','cardboardCameraTools'].map(id => {
                            const element = document.getElementById(id);
                            return [id,{rect:rect(element),display:element ? getComputedStyle(element).display : null,text:element?.textContent.trim()}];
                        })),
                        market:rect(document.getElementById('cardboardCenter')), entries,
                        outside:entries.filter(entry => entry.visible && entry.outside.length) };
                };
                // RAF callbacks run before paint. These samples diagnose timing;
                // one transient RAF alone does not prove a visible clipping bug.
                // Start without awaiting eight frames, so the original screenshot
                // timing is not delayed until a resize/fit has recovered.
                window.midgameGeometryFrames = new Promise(resolve => {
                    const sample = timestamp => {
                        frames.push(window.midgameGeometrySample(`raf-${frames.length + 1}`, timestamp));
                        if (frames.length === 8) resolve(frames);
                        else requestAnimationFrame(sample);
                    };
                    requestAnimationFrame(sample);
                });
            }, { humanActions:report.humanActions, actionCount:report.actions.length, lastAction:report.actions.slice(-1) });
        }
        const hud = await page.evaluate(() => {
            if (document.querySelector('.winner-screen')) return { overviewVisible: true, activityOverlapsRoster: false };
            const overview = document.querySelector('[data-cardboard-camera="overview"]').getBoundingClientRect();
            const tools = document.getElementById('cardboardCameraTools').getBoundingClientRect();
            const roster = document.getElementById('cardboardRoster').getBoundingClientRect();
            const activity = document.getElementById('gameConnectivityPanel').getBoundingClientRect();
            return {
                overviewVisible: overview.width > 0 && overview.left >= Math.max(0, tools.left) - 1 &&
                    overview.right <= Math.min(innerWidth, tools.right) + 1,
                activityOverlapsRoster: activity.width > 0 && activity.height > 0 &&
                    Math.min(activity.right, roster.right) - Math.max(activity.left, roster.left) > 1 &&
                    Math.min(activity.bottom, roster.bottom) - Math.max(activity.top, roster.top) > 1,
            };
        });
        expect(hud.overviewVisible, `${stage}: 全体への入口を隠さない`).toBe(true);
        expect(hud.activityOverlapsRoster, `${stage}: 処理通知で所有者を覆わない`).toBe(false);
        const file = testInfo.outputPath(`ui-playthrough-${stage}.png`);
        const beforeScreenshot = stage === 'midgame' ? await page.evaluate(() => window.midgameGeometrySample('before-screenshot')) : null;
        await page.screenshot({ path: file, fullPage: false });
        if (stage === 'midgame') {
            const geometry = await page.evaluate(async before => {
                const afterScreenshot = window.midgameGeometrySample('after-screenshot');
                // Read all eight diagnostic frames only after the original
                // screenshot has been captured; never wait to make it fit.
                return { beforeScreenshot:before, afterScreenshot, frames:await window.midgameGeometryFrames };
            }, beforeScreenshot);
            const diagnosticFile = testInfo.outputPath('ui-playthrough-midgame-geometry.json');
            await fs.writeFile(diagnosticFile, JSON.stringify(geometry, null, 2));
            await testInfo.attach('midgame-geometry', { path:diagnosticFile, contentType:'application/json' });
        }
        await testInfo.attach(stage, { path: file, contentType: 'image/png' });
        report.screenshots.push(stage);
    };
    const click = async (locator, description) => {
        await expect(locator, description).toHaveCount(1);
        await expect(locator, description).toBeVisible();
        await expect(locator, description).toBeEnabled();
        const at = Date.now();
        await locator.click({ timeout: 10000 });
        report.clicks++;
        return Date.now() - at;
    };
    const read = () => page.evaluate(() => {
        const runtime = GameRuntimeState.runtime.snapshot();
        const game = runtime.game;
        if (!game) throw new Error('Game has not started');
        const winner = game.checkWinner();
        const humanIndex = runtime.cpuPlayers.findIndex(cpu => !cpu);
        const goalNames = [...getEnabledLandmarkSelection()];
        const goals = game.players.map(player => goalNames.filter(name => player.landmarks[name] === true).length);
        return { key: JSON.stringify(GameSnapshot.serializeGameState(game, SHOP_STOCK, { pendingActionsFor: GameManager.serializedPendingActionsFor, logLimit: 0 })),
            humanIndex, actor: game.currentPlayerIndex, turn: game.turnCount, phase: game.phase,
            winner: winner ? winner.name : null, goals, goalCount: goalNames.length };
    });
    const advise = () => page.evaluate(() => {
        const game = GameRuntimeState.runtime.snapshot().game;
        const before = JSON.stringify(GameSnapshot.serializeGameState(game, SHOP_STOCK, { pendingActionsFor: GameManager.serializedPendingActionsFor, logLimit: 0 }));
        // This separate adviser chooses only. Never call doTurn/execute/apply.
        const adviser = new CPU('strong');
        let proposal;
        switch (game.phase) {
        case GAME_PHASES.ROLL: proposal = { action: 'rollDice', data: {} }; break;
        case GAME_PHASES.SELECT_DICE: proposal = { action: 'selectDiceCount', data: { useTwo: adviser.chooseDiceCount(game) } }; break;
        case GAME_PHASES.REROLL_CONFIRM: proposal = { action: adviser.chooseReroll(game) ? 'rerollDice' : 'skipReroll', data: {} }; break;
        case GAME_PHASES.HARBOR_CHOICE: proposal = { action: 'resolveHarbor', data: { useBonus: adviser.chooseHarbor(game) } }; break;
        case GAME_PHASES.PENDING: proposal = CPU.choosePendingAction(game, adviser, { clearFallback: false }); break;
        case GAME_PHASES.BUILD: proposal = game.builtThisTurn ? null : adviser.chooseBuildAction(game, SHOP_STOCK);
            proposal = proposal || { action: 'nextTurn', data: {} }; break;
        default: throw new Error(`Unsupported human phase: ${game.phase}`);
        }
        if (before !== JSON.stringify(GameSnapshot.serializeGameState(game, SHOP_STOCK, { pendingActionsFor: GameManager.serializedPendingActionsFor, logLimit: 0 }))) {
            throw new Error('The adviser mutated canonical game state');
        }
        if (!proposal) throw new Error('No safe UI proposal for pending effect');
        const data = { ...proposal.data };
        if (proposal.action === 'resolveBusiness' && !data.skip) {
            const indexOf = (player, ref) => Number.isInteger(ref) ? ref : player.cards.findIndex(card => card.name === ref);
            data.myCard = indexOf(game.currentPlayer(), data.myCard);
            data.theirCard = indexOf(game.players[data.targetIndex], data.theirCard);
        }
        return { action: proposal.action, data };
    });
    const attribute = value => JSON.stringify(String(value));
    const execute = async ({ action, data }) => {
        const choice = (name, attributes = '') => page.locator(`#gameScreen [data-action=${attribute(name)}]${attributes}:visible`);
        const pending = (name, attributes = '') => page.locator(`#pendingModal [data-action=${attribute(name)}]${attributes}:visible`);
        if (action === 'buildCard' || action === 'buildLandmark') {
            // Use the existing direct construction shortcut. Camera inspection
            // is exercised separately, rather than adding two moves per buy.
            const beforeMarket = await read();
            await click(page.locator('#btnBuildShortcut'), '建設候補を見る');
            expect((await read()).key, '市場を開いても対局状態を変えない').toBe(beforeMarket.key);
            report.marketOpens = (report.marketOpens || 0) + 1;
            if (action === 'buildLandmark') {
                const goals = page.locator('#cardboardMarketDialog .compact-market-goal-disclosure');
                if (!(await goals.evaluate(element => element.open))) {
                    await click(goals.locator(':scope > summary'), 'ランドマーク一覧を開く');
                }
            }
            const key = action === 'buildCard' ? 'data-card-name' : 'data-landmark-name';
            const value = action === 'buildCard' ? data.cardName : data.name;
            await click(page.locator(`#cardboardMarketDialog [data-action=${attribute(action)}][${key}=${attribute(value)}]`), `建設 ${value}`);
            if (await page.locator('#cardboardMarketDialog').isVisible()) {
                await page.keyboard.press('Escape');
                report.keyboardActions++;
                await expect(page.locator('#cardboardMarketDialog')).toBeHidden();
                await expect(page.locator('#cardboardMarket details[open]')).toHaveCount(0);
            }
            // Return to the common table after the actual purchase, while a
            // completed game keeps its result screen as the primary display.
            if (!(await read()).winner) {
                await click(page.locator('[data-cardboard-camera="overview"]'), '全員の施設カードへ戻る');
            }
        } else if (action === 'rollDice' || action === 'nextTurn') {
            await click(page.locator(action === 'rollDice' ? '#btnRoll' : '#btnSkip'), action);
            if (action === 'nextTurn' && await page.locator('#confirmModal').isVisible()) {
                await click(page.locator('#confirmOkBtn'), '建設を見送り手番を終了');
            }
        } else if (action === 'selectDiceCount') {
            await click(choice(action, `[data-use-two="${data.useTwo}"]`), action);
        } else if (action === 'rerollDice' || action === 'skipReroll') {
            await click(choice(action), action);
        } else if (action === 'resolveHarbor') {
            await click(choice(action, `[data-use-bonus="${data.useBonus}"]`), action);
        } else if (action === 'resolveBusiness') {
            if (data.skip) await click(pending('skipBusiness'), '交換を見送る');
            else {
                await click(pending('selectBusinessCard', `[data-input-id="myCardSelect"][data-idx="${data.myCard}"]`), '渡す施設');
                await click(pending('selectBusinessCard', `[data-input-id="theirCardSelect_${data.targetIndex}"][data-idx="${data.theirCard}"]`), '受け取る施設');
                await click(pending(action, `[data-target-index="${data.targetIndex}"]`), '施設を交換');
            }
        } else if (action === 'resolveMover') {
            await click(pending('selectBusinessCard', `[data-input-id="moverCardSelect"][data-idx="${data.cardIndex}"]`), '渡す施設');
            await click(pending(action, `[data-target-index="${data.targetIndex}"]`), action);
        } else if (action === 'resolveTV') {
            await click(pending(action, `[data-target-index="${data.targetIndex}"]`), action);
        } else if (action === 'resolveCleaning') {
            await click(pending(action, `[data-card-name=${attribute(data.cardName)}]`), action);
        } else if (action === 'resolveRenovation') {
            await click(pending(action, `[data-landmark-name=${attribute(data.landmarkName)}]`), action);
        } else if (action === 'resolveIT') {
            await click(pending(action, `[data-do-save="${data.doSave}"]`), action);
        } else throw new Error(`No DOM adapter for ${action}`);
    };
    let lastState = null;
    let capturedDiceMotion = false;
    try {
        await page.setViewportSize(viewport);
        await page.route('https://pagead2.googlesyndication.com/**', route => route.fulfill({ status: 200, body: '' }));
        await page.goto('/', { waitUntil: 'domcontentloaded' });
        // All setup changes go through visible controls and their real handlers.
        await click(page.locator('#tabTournament'), '表示設定へ');
        await click(page.locator('#designSwitcher > summary'), '画面デザイン設定');
        await page.locator('#designThemeSelect').selectOption('cardboard');
        await click(page.locator('#tabLocal'), 'ローカル対局設定へ');
        await click(page.locator('#customGameSetup > summary'), '対局設定');
        await expect(page.locator('#playerCount')).toHaveText('2人');
        for (let count = 2; count < playerCount; count++) {
            await click(page.locator('[data-ui-action="changeCount"][data-delta="1"][aria-controls="playerCount"]'), 'プレイ人数を増やす');
            await expect(page.locator('#playerCount')).toHaveText(`${count + 1}人`);
        }
        await page.locator('[data-ui-change="localPlayerType"][data-player-index="0"]').selectOption('human');
        for (let index = 1; index < playerCount; index++) {
            await page.locator(`[data-ui-change="localPlayerType"][data-player-index="${index}"]`).selectOption('weak');
        }
        if (cpuSpeedMs !== 1500) {
            const flow = page.locator('#customGameSetup .play-flow-settings > summary');
            await click(flow, 'CPU速度の設定');
            const speed = page.locator('#cpuSpeed');
            await speed.focus();
            await speed.press('Home');
            report.keyboardActions++;
            for (let value = 100; value < cpuSpeedMs; value += 100) {
                await speed.press('ArrowRight');
                report.keyboardActions++;
            }
            await expect(speed).toHaveValue(String(cpuSpeedMs));
            await click(flow, 'CPU速度の設定を閉じる');
        }
        await click(page.locator('#btnStart'), '開始設定を確認');
        await click(page.locator('#confirmOkBtn'), '対局開始');
        await expect(page.locator('#gameScreen')).toBeVisible();
        expect(await page.evaluate(() => GameSetupState.runtime.snapshot().cpuSpeed)).toBe(cpuSpeedMs);
        lastState = await read();
        expect(lastState.humanIndex).toBeGreaterThanOrEqual(0);
        const lineup = await page.evaluate(() => GameRuntimeState.runtime.snapshot().cpuPlayers.map(cpu => cpu ? cpu.difficulty : 'human'));
        expect(lineup).toHaveLength(playerCount);
        expect(lineup.filter(kind => kind === 'human')).toHaveLength(1);
        expect(lineup.filter(kind => kind === 'weak')).toHaveLength(playerCount - 1);
        await capture('start');
        for (let step = 0; step < 1200; step++) {
            lastState = await read();
            await expect(page.locator('#crashScreen')).toBeHidden();
            if (lastState.winner) {
                await expect(page.locator('.winner-screen')).toBeVisible();
                report.completed = true;
                report.winner = lastState.winner;
                await capture('winner');
                break;
            }
            if (!report.cameraReview && lastState.turn >= 12 &&
                    lastState.actor === lastState.humanIndex && lastState.phase === 'roll') {
                // Inspect a real opponent collection without moving the game
                // forward. Record these two UI clicks separately from turns.
                const viewportNode = page.locator('#cardboardTableViewport');
                // Canonical turn changes precede the presentation's layout
                // and camera RAFs. Compare settled views, not the previous
                // turn's transient fit scale captured between those frames.
                const settledView = await viewportNode.evaluate(async viewport => {
                    const frames = [];
                    let repeated = 0;
                    let previous = '';
                    for (let frame = 0; frame < 120; frame++) {
                        await new Promise(resolve => requestAnimationFrame(resolve));
                        const world = viewport.querySelector('#cardboardSeats');
                        const sample = { scale: viewport.getAttribute('data-table-scale'),
                            angle: viewport.getAttribute('data-table-angle'),
                            mode: viewport.getAttribute('data-table-mode'),
                            width: viewport.clientWidth, height: viewport.clientHeight,
                            worldWidth: world.offsetWidth, worldHeight: world.offsetHeight };
                        frames.push(sample);
                        const key = JSON.stringify(sample);
                        repeated = key === previous ? repeated + 1 : 0;
                        previous = key;
                        const expectedFit = Math.min(sample.width / sample.worldWidth, sample.height / sample.worldHeight);
                        const fitCurrent = sample.mode !== 'overview' || Math.abs(Number(sample.scale) - expectedFit) <= 0.0006;
                        if (repeated >= 3 && fitCurrent) return { ...sample, frames };
                    }
                    throw new Error(`Card table did not settle: ${JSON.stringify(frames.slice(-8))}`);
                });
                const initialScale = settledView.scale;
                const initialAngle = settledView.angle;
                const targetIndex = (lastState.humanIndex + 1) % lineup.length;
                const cameraStarted = Date.now();
                report.cameraReview = { turn: lastState.turn, targetIndex, initialScale, initialAngle,
                    settledView, restored: false, stateUnchanged: false };
                await click(page.locator(`#cardboardRoster [data-cardboard-player-index="${targetIndex}"]`), '相手の所有施設を正面で確認');
                await expect(viewportNode).toHaveAttribute('data-table-focus-player', String(targetIndex));
                const readableScale = await viewportNode.getAttribute('data-table-scale');
                await capture('midgame-opponent-upright');
                await click(page.locator('[data-cardboard-camera="back"]'), '確認前の卓へ戻る');
                report.cameraReview.restoredView = await viewportNode.evaluate(viewport => {
                    const world = viewport.querySelector('#cardboardSeats');
                    return { scale: viewport.getAttribute('data-table-scale'), angle: viewport.getAttribute('data-table-angle'),
                        width: viewport.clientWidth, height: viewport.clientHeight,
                        worldWidth: world.offsetWidth, worldHeight: world.offsetHeight };
                });
                await expect(viewportNode).toHaveAttribute('data-table-scale', initialScale);
                await expect(viewportNode).toHaveAttribute('data-table-angle', initialAngle);
                expect((await read()).key, '正面閲覧と復帰で対局を変更しない').toBe(lastState.key);
                report.cameraReview = { ...report.cameraReview, turn: lastState.turn, targetIndex, clicks: 2,
                    initialScale, readableScale, initialAngle, settledView, restored: true,
                    stateUnchanged: true, elapsedMs: Date.now() - cameraStarted };
            }
            if (lastState.turn >= 20) await capture('midgame');
            if (Math.max(...lastState.goals) >= lastState.goalCount - 1) await capture('late-game');
            if (lastState.actor !== lastState.humanIndex) {
                const at = Date.now();
                const key = lastState.key;
                await expect.poll(async () => (await read()).key, { timeout: 60000, intervals: [250, 500] }).not.toBe(key);
                report.cpuWaitMs += Date.now() - at;
                continue;
            }
            const proposal = await advise();
            const before = lastState;
            const at = Date.now();
            if (before.phase === 'pending') await capture('special-effect');
            await execute(proposal);
            if (!capturedDiceMotion && ['rollDice', 'selectDiceCount'].includes(proposal.action)) {
                const rolling = await page.locator('#diceResult .rolling').count();
                // A station can make rollDice open the dice-count choice. In
                // that case capture the first actual roll after choosing it.
                if (rolling) {
                    capturedDiceMotion = true;
                    const motionStart = Date.now();
                    report.diceMotion = [];
                    for (const [index, targetMs] of [0, 180, 450, 800, 1200].entries()) {
                        const remaining = targetMs - (Date.now() - motionStart);
                        if (remaining > 0) await page.waitForTimeout(remaining);
                        await capture(`dice-motion-${index}`);
                        report.diceMotion.push({ index, targetMs, elapsedMs: Date.now() - motionStart });
                    }
                }
            }
            await expect.poll(async () => (await read()).key, { timeout: 15000, intervals: [100, 250] }).not.toBe(before.key);
            report.humanActions++;
            report.actions.push({ action: proposal.action, turn: before.turn, phase: before.phase, elapsedMs: Date.now() - at });
            if (proposal.action === 'rollDice' || proposal.action === 'selectDiceCount') await capture('first-roll');
            if (proposal.action === 'buildCard' || proposal.action === 'buildLandmark') await capture('first-build');
            if (stopAfter && report.humanActions >= stopAfter) break;
        }
        if (!stopAfter) expect(report.completed, 'UI対局は勝者まで到達する').toBe(true);
        expect(report.pageErrors).toEqual([]);
    } catch (error) {
        report.failure = String(error);
        report.lastState = lastState;
        await capture('failure').catch(() => {});
        await testInfo.attach('ui-failure-dom.txt', { body: await page.locator('body').innerText().catch(() => 'unavailable'), contentType: 'text/plain' });
        throw error;
    } finally {
        report.elapsedMs = Date.now() - started;
        report.lastTurn = lastState?.turn;
        const file = testInfo.outputPath('ui-playthrough-summary.json');
        await fs.mkdir(testInfo.outputDir, { recursive: true });
        await fs.writeFile(file, JSON.stringify(report, null, 2));
        await testInfo.attach('ui-playthrough-summary', { path: file, contentType: 'application/json' });
    }
});
