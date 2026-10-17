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
    const stopAfter = Number(process.env.UI_PLAYTHROUGH_STOP_AFTER) || 0;
    if (!Number.isInteger(stopAfter) || stopAfter < 0) throw new Error('Invalid partial action limit');
    const viewport = process.env.UI_PLAYTHROUGH_LANDSCAPE === '1'
        ? { width: 844, height: 390 } : { width: 390, height: 844 };
    const cpuSpeedMs = Number(process.env.UI_PLAYTHROUGH_CPU_SPEED || 1500);
    if (!Number.isInteger(cpuSpeedMs) || cpuSpeedMs < 100 || cpuSpeedMs > 3000 || cpuSpeedMs % 100 !== 0) {
        throw new Error('Invalid CPU speed');
    }
    const started = Date.now();
    const report = { mode: stopAfter ? 'partial-ui-smoke' : 'automated-human-seat-ui',
        viewport, cpuSpeedMs, completed: false, humanActions: 0, clicks: 0, keyboardActions: 0, cpuWaitMs: 0, actions: [], screenshots: [], pageErrors: [] };
    const stages = new Set();
    page.on('pageerror', error => report.pageErrors.push(error.message));
    const capture = async stage => {
        if (stages.has(stage)) return;
        stages.add(stage);
        const file = testInfo.outputPath(`ui-playthrough-${stage}.png`);
        await page.screenshot({ path: file, fullPage: false });
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
            // Move the shared table through its visible camera control before
            // opening the market; the canvas may currently show another seat.
            const beforeCamera = await read();
            await click(page.locator('[data-cardboard-camera="market"]'), '中央市場へ移動');
            expect((await read()).key, '盤面の移動は対局状態を変えない').toBe(beforeCamera.key);
            await click(page.locator('#cardboardMarket .compact-market-expand'), '市場を開く');
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
        await page.locator('[data-ui-change="localPlayerType"][data-player-index="0"]').selectOption('human');
        await page.locator('[data-ui-change="localPlayerType"][data-player-index="1"]').selectOption('weak');
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
        expect(lineup.filter(kind => kind === 'human')).toHaveLength(1);
        expect(lineup.filter(kind => kind === 'weak')).toHaveLength(1);
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
