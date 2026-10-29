const { test, expect } = require('@playwright/test');

// Keep layout fixtures independent of asynchronous SW update prompts.
// Explicit banner cases below and the PWA suite retain update coverage.
test.use({ serviceWorkers: 'block' });

async function prepare(page, viewport, count = 4, controlledCards = true) {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => { if (!localStorage.getItem('machikoroDesignTheme')) localStorage.setItem('machikoroDesignTheme', 'cardboard'); });
    await page.route('https://pagead2.googlesyndication.com/**', route => route.fulfill({ status: 200, body: '' }));
    await page.goto('/');
    await page.evaluate(({ count, controlledCards }) => {
        startGameNow(count, Array.from({ length: count }, (_, index) => ({ type: 'human', name: `街${index + 1}` })));
        const state = GameRuntimeState.runtime.snapshot();
        // Keep both settings and runtime roster consistent with controlled human seats.
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
}

// Controlled presentation fixtures verify camera/layout without claiming a
// naturally played match; ui-playthrough.spec.js covers real game progression.
async function snapshot(page) {
    return page.evaluate(() => GameSnapshot.serializeUndoState(GameRuntimeState.runtime.snapshot().game, SHOP_STOCK, Number.MAX_SAFE_INTEGER));
}

async function expectWholeTable(page, count) {
    await expect(page.locator('#cardboardTableCanvas > #cardboardSeats .cardboard-player')).toHaveCount(count);
    await expect(page.locator('#cardboardSeats #cardboardCenter #cardboardMarket')).toHaveCount(1);
    await expect(page.locator('#cardboardOverview, #cardboardDetails')).toHaveCount(0);
    await expect.poll(() => page.locator('#cardboardTableViewport').evaluate(viewport => {
        const clip = viewport.getBoundingClientRect();
        const nodes = [...viewport.querySelectorAll('.cardboard-player, #cardboardCenter')];
        const failures = [];
        const tolerance = 2;
        const contained = (bounds, outer) => bounds.width > 0 && bounds.height > 0 &&
            bounds.left >= outer.left - tolerance && bounds.top >= outer.top - tolerance &&
            bounds.right <= outer.right + tolerance && bounds.bottom <= outer.bottom + tolerance;
        if (clip.height < Math.min(180, innerHeight / 2)) failures.push('table viewport collapsed');
        if (nodes.length < 2) failures.push('table groups missing');
        const groups = nodes.map(node => ({
            node, bounds: node.getBoundingClientRect(),
            name: node.id || `player ${node.dataset.playerIndex}`,
        }));
        for (const group of groups) {
            if (!contained(group.bounds, clip)) failures.push(`${group.name} outside viewport`);
            for (const card of group.node.querySelectorAll('.cardboard-card')) {
                const bounds = card.getBoundingClientRect();
                if (!contained(bounds, group.bounds)) failures.push(`${group.name}/${card.dataset.cardName} outside owner`);
                if (!contained(bounds, clip)) failures.push(`${group.name}/${card.dataset.cardName} outside viewport`);
            }
        }
        for (let first = 0; first < groups.length; first++) {
            for (let second = first + 1; second < groups.length; second++) {
                const a = groups[first].bounds;
                const b = groups[second].bounds;
                const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
                const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
                if (width > tolerance && height > tolerance) failures.push(`${groups[first].name} overlaps ${groups[second].name}`);
            }
        }
        const market = viewport.querySelector('#cardboardMarket');
        const controls = [...market.querySelectorAll('.compact-market-header h2, .compact-market-header button, .compact-market-filter-disclosure > summary, .compact-market-goal-disclosure > summary')]
            .map(node => ({ node, bounds: node.getBoundingClientRect() }));
        for (let first = 0; first < controls.length; first++) {
            for (let second = first + 1; second < controls.length; second++) {
                const a = controls[first].bounds;
                const b = controls[second].bounds;
                if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 &&
                    Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) failures.push('market heading/control overlap');
            }
        }
        const title = market.querySelector('.compact-market-header h2');
        const titleRange = document.createRange();
        titleRange.selectNodeContents(title);
        const titleText = titleRange.getBoundingClientRect();
        for (const control of controls.filter(control => control.node !== title)) {
            const b = control.bounds;
            if (Math.min(titleText.right, b.right) - Math.max(titleText.left, b.left) > 1 &&
                Math.min(titleText.bottom, b.bottom) - Math.max(titleText.top, b.top) > 1) failures.push('market title text overlaps control');
        }
        return failures.slice(0, 8);
    })).toEqual([]);
}

async function expectOwnedCards(page) {
    const result = await page.evaluate(() => {
        const expected = GameRuntimeState.runtime.snapshot().game.players.map(player => {
            const cards = new Map();
            for (const card of player.cards) {
                const previous = cards.get(card.name);
                cards.set(card.name, { name:card.name, count:(previous?.count || 0)+1,
                    dice:card.diceNums.join('・'), color:card.color });
            }
            return [...cards.values()].sort((left,right)=>left.name.localeCompare(right.name)).map(card=>({
                name:card.name, dataName:card.name, count:`所有 ×${card.count}`, dice:card.dice,
                colorClass:`cardboard-card-${card.color}`, artCount:1, categoryIdentified:true,
            }));
        });
        const actual = expected.map((cards,index)=>{
            const panel = document.querySelector(`#cardboardSeats .cardboard-player[data-player-index="${index}"]`);
            return [...(panel?.querySelectorAll('.cardboard-card') || [])].map(card=>({
                name:card.querySelector('.cardboard-name')?.textContent,
                dataName:card.dataset.cardName,
                count:card.querySelector('.cardboard-count')?.textContent,
                dice:card.querySelector('.cardboard-dice')?.textContent,
                colorClass:[...card.classList].find(name=>/^cardboard-card-(?:blue|green|red|purple)$/.test(name)),
                artCount:card.querySelectorAll('.cardboard-art svg').length,
                categoryIdentified:/青|緑|赤|紫/.test(card.querySelector('.cardboard-category')?.textContent || ''),
            })).sort((left,right)=>left.name.localeCompare(right.name));
        });
        return {expected,actual};
    });
    expect(result.actual).toEqual(result.expected);
    const roster = await page.evaluate(() => {
        const players = GameRuntimeState.runtime.snapshot().game.players;
        return Array.from(document.querySelectorAll('#cardboardRoster .cardboard-roster-seat')).map(seat => {
            const player = players[Number(seat.dataset.cardboardPlayerIndex)];
            const total = seat.querySelector('.cardboard-roster-facilities');
            const parts = ['.cardboard-roster-coins', '.cardboard-roster-facilities', '.cardboard-roster-progress']
                .map(selector => seat.querySelector(selector).getBoundingClientRect());
            const bounds = seat.getBoundingClientRect();
            const name = seat.querySelector('.cardboard-roster-name').getBoundingClientRect();
            const disjoint = (a, b) => a.right <= b.left + 1 || b.right <= a.left + 1 || a.bottom <= b.top + 1 || b.bottom <= a.top + 1;
            const summary = seat.querySelector('.cardboard-roster-summary-text');
            return { count: Number(total.querySelector('b').textContent), expected: player.cards.length,
                aria: seat.getAttribute('aria-label').includes(`施設 ${player.cards.length}枚`),
                fixedHeight: Math.abs(bounds.height - 44) <= 1,
                fits: summary.scrollWidth <= summary.clientWidth + 1 && parts.every(part =>
                    part.width > 0 && part.left >= bounds.left && part.right <= bounds.right &&
                    part.top >= bounds.top && part.bottom <= bounds.bottom),
                separate: parts.every((part, index) => parts.slice(index + 1).every(other => disjoint(part, other))) && disjoint(parts[1], name),
                geometry: { bounds: bounds.toJSON(), parts: parts.map(part => part.toJSON()), summary: [summary.scrollWidth, summary.clientWidth] } };
        });
    });
    expect(roster.filter(seat => seat.count !== seat.expected || !seat.aria || !seat.fixedHeight || !seat.fits || !seat.separate),
        '所有総数は正本に一致し固定高の残高・枚数・目標を重ねない').toEqual([]);
}

async function cameraCommand(page, command) {
    const button = page.locator(`[data-cardboard-camera="${command}"]`);
    if (!await button.isVisible()) await page.locator('#cardboardMoreMenu > summary').click();
    await button.click();
}

for (const viewport of [{width:320,height:844},{width:390,height:844},{width:844,height:390},{width:1440,height:936}]) {
    test.describe(() => {
        // PCサイズはPCの描画密度で検証する。モバイル3サイズは各projectの端末設定を保つ。
        if (viewport.width === 1440) {
            test.use({ deviceScaleFactor: 1, isMobile: false, hasTouch: false });
        }
        test(`共通カード卓で全員の施設と中央市場を見渡せる ${viewport.width}`, async ({page}, testInfo) => {
            await prepare(page, viewport, 4);
            await expectWholeTable(page,4);
            await expectOwnedCards(page);
            await expect.poll(() => page.locator('#cardboardMarket .compact-market-header h2').getAttribute('data-scroll-hint')).toBe('↓ 下に施設');
            expect(await page.locator('.cardboard-roster-seat').evaluateAll(seats => seats.every(seat => {
                const bounds = seat.getBoundingClientRect();
                const progress = seat.querySelector('.cardboard-roster-progress b').getBoundingClientRect();
                return progress.left >= bounds.left && progress.right <= bounds.right;
            })), '固定HUDの目標進捗を切らない').toBe(true);
            await expect(page.locator('#cardboardMarket .compact-market-price').first()).toContainText('建設');
            await page.screenshot({path:testInfo.outputPath('card-table-overview.png')});
            const before = await snapshot(page);
            const camera = page.locator('#cardboardTableViewport');
            const fittedScale = Number(await camera.getAttribute('data-table-scale'));
            const seats = await page.locator('#cardboardSeats > .cardboard-player').evaluateAll(nodes => nodes.map(node => ({
                index: Number(node.dataset.playerIndex), side: node.dataset.seatPosition, angle: Number(node.dataset.tableAngle),
            })));
            expect(seats.map(seat => seat.angle).sort((a, b) => a - b)).toEqual([0, 90, 180, 270]);
            for (const side of ['top', 'left', 'right']) {
                const owner = seats.find(seat => seat.side === side);
                await page.locator(`#cardboardRoster [data-cardboard-player-index="${owner.index}"]`).click();
                await expect(camera).toHaveAttribute('data-table-angle', String((360 - owner.angle) % 360));
                await expect(camera).toHaveAttribute('data-table-focus-player', String(owner.index));
                await expect(page.locator('#cardboardViewHint strong')).toContainText(`街${owner.index + 1}`);
                await expect(page.locator('[data-cardboard-camera="back"]')).toBeEnabled();
                const facing = await page.locator(`#cardboardSeats > [data-player-index="${owner.index}"]`).evaluate(node => {
                    const matrix = new DOMMatrix(getComputedStyle(node.parentElement).transform)
                        .multiply(new DOMMatrix(getComputedStyle(node).transform));
                    return { a: matrix.a, b: matrix.b, c: matrix.c, d: matrix.d };
                });
                expect(facing.a).toBeGreaterThan(0);
                expect(facing.d).toBeGreaterThan(0);
                expect(Math.abs(facing.b) + Math.abs(facing.c)).toBeLessThan(0.00001);
                if (side === 'left') await page.screenshot({ path: testInfo.outputPath('card-table-left-readable.png') });
                await cameraCommand(page, 'back');
                await expect(camera).toHaveAttribute('data-table-angle', '0');
                await expect(page.locator('[data-cardboard-camera="back"]')).toBeDisabled();
                await expect(page.locator('#cardboardViewHint strong')).toHaveText('カード卓');
                await expect(camera).toHaveAttribute('data-table-scale', fittedScale.toFixed(3));
                await expectWholeTable(page, 4);
            }

            await cameraCommand(page, 'readable');
            await expect.poll(async()=>Number(await camera.getAttribute('data-table-scale'))).toBeGreaterThan(fittedScale);
            const readableScale = Number(await camera.getAttribute('data-table-scale'));
            await cameraCommand(page, 'in');
            await expect.poll(async()=>Number(await camera.getAttribute('data-table-scale'))).toBeGreaterThan(readableScale);
            // Keyboard pan exercises the native viewport, rather than changing its
            // scroll coordinates through evaluate.
            await camera.focus();
            await camera.press('Home');
            await cameraCommand(page, 'readable');
            for (let step = 0; step < 5 && !await camera.evaluate(viewport => viewport.scrollHeight > viewport.clientHeight + 1); step++) {
                await cameraCommand(page, 'in');
            }
            await camera.focus();
            await camera.press('ArrowLeft');
            const panBefore = await camera.evaluate(viewport=>viewport.scrollTop);
            expect(panBefore).toBeGreaterThan(0);
            await camera.press('ArrowUp');
            await expect.poll(()=>camera.evaluate(viewport=>viewport.scrollTop)).toBeLessThan(panBefore);
            await page.locator('.cardboard-roster-seat[data-cardboard-player-index="2"]').click();
            await expect(page.locator('.cardboard-player-selected')).toHaveAttribute('data-player-index','2');
            await page.locator('[data-cardboard-camera="market"]').click();
            await page.locator('[data-cardboard-camera="overview"]').click();
            await expectWholeTable(page,4);
            expect(await snapshot(page)).toEqual(before);

            await page.evaluate(()=>{
                const game=GameRuntimeState.runtime.snapshot().game;
                game.players.forEach((player,index)=>{
                    const names=innerWidth >= 1000 ? CARDS.slice(0,18).map(card=>card.name) : ['麦畑','パン屋','牧場','カフェ','森林','コンビニ'];
                    player.cards=Array.from({length:12+index*6},(_,n)=>createCardByName(names[n%names.length]));
                    Object.keys(player.landmarks).slice(0,index).forEach(name=>{player.landmarks[name]=true;});
                });
                render();
            });
            await expectWholeTable(page,4);
            await expect(page.locator('#cardboardTableViewport')).toHaveAttribute('data-table-mode','overview');
            await page.locator('[data-cardboard-camera="overview"]').click();
            await expectWholeTable(page,4);
            await expectOwnedCards(page);
            await page.screenshot({path:testInfo.outputPath('card-table-grown.png')});
            const grown = await snapshot(page);
            for (const theme of ['classic','sunset','plaza','cardboard']) {
                await page.evaluate(theme=>{const select=document.getElementById('gameDesignThemeSelect'); select.value=theme; select.dispatchEvent(new Event('change',{bubbles:true}));},theme);
                expect(await snapshot(page)).toEqual(grown);
                const actions = page.locator('#gameScreen .game-action-panel');
                await expect(actions).toHaveCount(1);
                await expect(actions).toBeVisible();
                if (theme !== 'cardboard') {
                    await expect(page.locator('#cardboardBoard')).toBeHidden();
                    expect(await actions.evaluate(panel => panel.closest('#cardboardBoard') === null)).toBe(true);
                } else {
                    await expect(page.locator('#cardboardBoard')).toBeVisible();
                    await expect(page.locator('#cardboardSeats > .cardboard-player')).toHaveCount(4);
                    expect(await actions.evaluate(panel => panel.closest('#cardboardActionSlot') !== null)).toBe(true);
                }
            }
            await expectWholeTable(page,4);
            await expectOwnedCards(page);

            // Explicit late presentation fixture, distinct from a natural match:
            // eighteen facility types and five landmarks per owner, without a win.
            await page.evaluate(() => {
                const game = GameRuntimeState.runtime.snapshot().game;
                game.players.forEach(player => {
                    player.cards = CARDS.slice(0, 18).map(card => createCardByName(card.name));
                    Object.keys(player.landmarks).forEach((name, index) => { player.landmarks[name] = index < 5; });
                });
                render();
            });
            await page.locator('[data-cardboard-camera="overview"]').click();
            await expectWholeTable(page, 4);
            await expectOwnedCards(page);
            await expect(page.locator('#cardboardSeats .cardboard-landmark-built')).toHaveCount(20);
            const late = await snapshot(page);
            if (viewport.width >= 844) {
                await expect(page.locator('#cardboardOwnerLabels .cardboard-owner-label')).toHaveCount(4);
                await expect.poll(() => page.locator('#cardboardOwnerLabels .cardboard-owner-label').evaluateAll(labels => {
                    const obstacles = [...document.querySelectorAll('#cardboardSeats .cardboard-card, #cardboardSeats .cardboard-landmark, #cardboardCenter')]
                        .map(card => card.getBoundingClientRect());
                    const viewport = document.getElementById('cardboardTableViewport');
                    const clip = viewport.getBoundingClientRect();
                    return labels.every(label => {
                        const bounds = label.getBoundingClientRect();
                        const distance = rect => Math.hypot(Math.max(rect.left - bounds.right, bounds.left - rect.right, 0),
                            Math.max(rect.top - bounds.bottom, bounds.top - rect.bottom, 0));
                        const owners = [...document.querySelectorAll('#cardboardSeats > .cardboard-player')];
                        const groupDistance = owner => Math.min(...[...owner.querySelectorAll('.cardboard-card')].map(card => distance(card.getBoundingClientRect())));
                        const own = owners.find(owner => owner.dataset.playerIndex === label.dataset.playerIndex);
                        const ownDistance = own ? groupDistance(own) : Infinity;
                        const otherDistance = Math.min(...owners.filter(owner => owner !== own).map(groupDistance));
                        return Number.isFinite(ownDistance) && ownDistance <= otherDistance + 0.5 && bounds.left >= clip.left + viewport.clientLeft &&
                            bounds.top >= clip.top + viewport.clientTop &&
                            bounds.right <= clip.left + viewport.clientLeft + viewport.clientWidth &&
                            bounds.bottom <= clip.top + viewport.clientTop + viewport.clientHeight && !obstacles.some(rect => Math.min(bounds.right, rect.right) > Math.max(bounds.left, rect.left) &&
                            Math.min(bounds.bottom, rect.bottom) > Math.max(bounds.top, rect.top));
                    });
                })).toBe(true);
            }
            await page.screenshot({ path: testInfo.outputPath('card-table-late.png') });
            const lateGeometry = await page.locator('#cardboardSeats > .cardboard-player').evaluateAll(owners =>
                owners.map(owner => ({ width: owner.offsetWidth, height: owner.offsetHeight })));
            await page.locator('[data-cardboard-camera="self"]').click();
            await expect(camera).toHaveAttribute('data-table-mode', 'free');
            await expect.poll(() => camera.evaluate(viewport => {
                const clip = viewport.getBoundingClientRect();
                const owner = viewport.querySelector('.cardboard-player[data-player-index="0"]');
                return [...owner.querySelectorAll('.cardboard-card')].filter(card => {
                    const bounds = card.getBoundingClientRect();
                    return bounds.width >= 68 && bounds.left >= clip.left && bounds.right <= clip.right &&
                        bounds.top >= clip.top && bounds.bottom <= clip.bottom &&
                        ['.cardboard-name', '.cardboard-dice', '.cardboard-count'].every(selector =>
                            card.querySelector(selector)?.textContent.trim());
                }).length;
            })).toBeGreaterThan(0);
            await expect.poll(() => camera.evaluate(viewport => {
                const clip = viewport.getBoundingClientRect();
                const cards = [...viewport.querySelectorAll('.cardboard-player[data-player-index="0"] .cardboard-card')];
                return cards.every(card => {
                    const bounds = card.getBoundingClientRect();
                    return bounds.left >= clip.left - 1 && bounds.right <= clip.right + 1;
                });
            }), { message: '終盤の正面閲覧は全列を横移動なしで読める幅に再配置する' }).toBe(true);
            await page.screenshot({ path: testInfo.outputPath('card-table-late-readable.png') });
            await page.locator('[data-cardboard-camera="back"]').click();
            await expectWholeTable(page, 4);
            expect(await page.locator('#cardboardSeats > .cardboard-player').evaluateAll(owners =>
                owners.map(owner => ({ width: owner.offsetWidth, height: owner.offsetHeight })))).toEqual(lateGeometry);
            expect(await snapshot(page)).toEqual(late);
        });
    });
}

for (const count of [2,3,5,10]) {
    test(`共通カード卓の人数適応 ${count}`, async ({page},testInfo)=>{
        await prepare(page,{width:844,height:390},count);
        await expectWholeTable(page,count);
        await expectOwnedCards(page);
        await page.screenshot({path:testInfo.outputPath(`card-table-${count}.png`)});
        const before=await snapshot(page);
        await page.locator(`.cardboard-roster-seat[data-cardboard-player-index="${count-1}"]`).click();
        await expect(page.locator('.cardboard-player-selected')).toHaveAttribute('data-player-index',String(count-1));
        await expect(page.locator('#cardboardSeats .cardboard-player')).toHaveCount(count);
        await page.locator('[data-cardboard-camera="overview"]').click();
        await expectWholeTable(page,count);
        expect(await snapshot(page)).toEqual(before);
        if (count === 2) {
            await page.evaluate(() => {
                const game = GameRuntimeState.runtime.snapshot().game;
                game.players.forEach(player => { player.cards = CARDS.slice(0,18).map(card=>createCardByName(card.name)); });
                render();
            });
            await expectWholeTable(page,2);
            await expectOwnedCards(page);
            expect(await page.locator('#cardboardSeats .cardboard-card').evaluateAll(cards=>Math.min(...cards.map(card=>card.getBoundingClientRect().width)))).toBeGreaterThanOrEqual(44);
            await page.screenshot({path:testInfo.outputPath('card-table-2-grown.png')});
            await page.evaluate(() => {
                GameRuntimeState.runtime.snapshot().game.players.forEach(player => {
                    Object.keys(player.landmarks).forEach((name, index) => { player.landmarks[name] = index < 5; });
                });
                render();
            });
            const railOwners = page.locator('#cardboardSeats > [data-table-landmark-rail="true"]');
            await expect(railOwners).toHaveCount(2);
            await expectWholeTable(page, 2);
            await expectOwnedCards(page);
            await expect(page.locator('#cardboardSeats .cardboard-landmark-built')).toHaveCount(10);
            expect(await page.locator('#cardboardSeats .cardboard-card').evaluateAll(cards =>
                Math.min(...cards.map(card => card.getBoundingClientRect().width)))).toBeGreaterThanOrEqual(40);
            const footprint = () => page.locator('#cardboardSeats').evaluate(world => ({
                width: world.offsetWidth, height: world.offsetHeight,
            }));
            const railFootprint = await footprint();
            const table = page.locator('#cardboardTableViewport');
            const railScale = await table.getAttribute('data-table-scale');
            const railState = await snapshot(page);
            await page.screenshot({path:testInfo.outputPath('card-table-2-landmarks-beside.png')});
            await page.locator('[data-cardboard-camera="self"]').click();
            await expect(railOwners).toHaveCount(0);
            await page.locator('[data-cardboard-camera="back"]').click();
            await expect(railOwners).toHaveCount(2);
            await expect(table).toHaveAttribute('data-table-scale', railScale);
            expect(await footprint()).toEqual(railFootprint);
            await page.locator('[data-cardboard-camera="market"]').click();
            await page.locator('#cardboardMarket .compact-market-filter-disclosure > summary').click();
            await expect(page.locator('#cardboardMarketDialog')).toBeVisible();
            await expect(railOwners).toHaveCount(2);
            expect(await footprint()).toEqual(railFootprint);
            await page.locator('#cardboardMarketClose').click();
            await page.locator('[data-cardboard-camera="overview"]').click();
            await expectWholeTable(page, 2);
            expect(await snapshot(page)).toEqual(railState);

            await page.evaluate(() => {
                GameSetupState.runtime.setCpuSpeed(3000);
                document.getElementById('cpuSpeed').value = '3000';
                startGameNow(2, Array.from({ length: 2 }, (_, index) => ({
                    type: 'cpu', difficulty: 'weak', name: `CPU${index + 1}`,
                })));
            });
            await expect(page.locator('#cardboardActionSlot #gameConnectivityPanel')).toBeVisible();
            await expect(page.locator('#gameActivityStatus')).toContainText('CPU');
            await expectWholeTable(page, 2);
            expect(await page.evaluate(() => {
                const roster = document.getElementById('cardboardRoster').getBoundingClientRect();
                const activity = document.getElementById('gameConnectivityPanel').getBoundingClientRect();
                return activity.top >= roster.bottom && activity.bottom <= innerHeight;
            }), 'CPU通知は所有者HUDを覆わず操作欄へ収まる').toBe(true);
            await page.screenshot({path:testInfo.outputPath('card-table-2-cpu-dock.png')});
        }
    });
}

test('共通カード卓は6〜9人の各人数でも市場と全所有者を保つ', async ({ page }, testInfo) => {
    for (const count of [6, 7, 8, 9]) {
        await prepare(page, { width: 844, height: 390 }, count);
        await expectWholeTable(page, count);
        await expectOwnedCards(page);
        const before = await snapshot(page);
        await page.locator('[data-cardboard-camera="market"]').click();
        await page.locator('[data-cardboard-camera="back"]').click();
        await expectWholeTable(page, count);
        expect(await snapshot(page)).toEqual(before);
        await page.screenshot({ path: testInfo.outputPath(`card-table-${count}.png`) });
    }
});

test('10人の320px縦持ちでも全員の所有カードと市場を俯瞰できる',async({page},testInfo)=>{
    await prepare(page,{width:320,height:844},10);
    await expectWholeTable(page,10);
    await expectOwnedCards(page);
    await page.screenshot({path:testInfo.outputPath('card-table-10-portrait.png')});
});

for (const viewport of [{width:390,height:844},{width:844,height:390}]) {
    test(`共通カード卓の市場から建設して全員のカードへ戻れる ${viewport.width}`,async({page})=>{
        await prepare(page,viewport,4);
        await page.evaluate(()=>{const game=GameRuntimeState.runtime.snapshot().game;game.phase=GAME_PHASES.BUILD;game.builtThisTurn=false;render();});
        await page.locator('[data-cardboard-camera="market"]').click();
        const purchase=page.locator('#cardboardMarket .compact-market-buy:not([disabled])').first();
        const name=await purchase.getAttribute('data-card-name');
        const before=await page.evaluate(()=>{const player=GameRuntimeState.runtime.snapshot().game.players[0];return{count:player.cards.length,coins:player.coins};});
        const ownerName=await page.evaluate(()=>GameRuntimeState.runtime.snapshot().game.players[0].name);
        await purchase.click();
        await expect.poll(()=>page.evaluate(()=>GameRuntimeState.runtime.snapshot().game.players[0].cards.length)).toBe(before.count+1);
        expect(await page.evaluate(()=>GameRuntimeState.runtime.snapshot().game.players[0].coins)).toBeLessThan(before.coins);
        await expect(page.locator('#cardboardCurrentResult')).toContainText(ownerName);
        await expect(page.locator('#cardboardCurrentResult')).toContainText(name);
        await page.locator('[data-cardboard-camera="overview"]').click();
        await expectWholeTable(page,4);
        await expectOwnedCards(page);
        expect(name).toBeTruthy();
    });
}

for(const viewport of [{width:320,height:844},{width:844,height:390},{width:1440,height:936}]) {
    test(`更新通知が出ていてもカード卓と収支を操作できる ${viewport.width}`,async({page})=>{
        await prepare(page,viewport,4);
        const before=await snapshot(page);
        await page.evaluate(()=>setPwaBannerVisible('pwaUpdateBanner',true));
        await expect(page.locator('#pwaUpdateBanner')).toBeVisible();
        await page.locator('[data-cardboard-camera="market"]').click();
        await page.locator('[data-cardboard-camera="overview"]').click();
        await page.locator('#cardboardEventDetails > summary').click();
        await expect(page.locator('#cardboardEventDetails')).toHaveAttribute('open','');
        await expect(page.locator('#pwaUpdateBanner')).toBeVisible();
        expect(await page.evaluate(() => {
            const banner = document.getElementById('pwaUpdateBanner').getBoundingClientRect();
            const actions = document.getElementById('cardboardActionSlot').getBoundingClientRect();
            const receipt = document.getElementById('cardboardDiceReceipt').getBoundingClientRect();
            return actions.bottom <= banner.top + 1 && receipt.bottom <= banner.top + 1;
        }), '更新通知は操作と開いた収支欄を覆わない').toBe(true);
        expect(await snapshot(page)).toEqual(before);
    });
}

// Back restores the view immediately before inspection, including a manually
// panned readable view; it does not merely reset the whole table.
test('市場確認から直前の倍率と位置へ戻れる', async ({ page }) => {
    await prepare(page, { width: 390, height: 844 }, 4);
    const camera = page.locator('#cardboardTableViewport');
    const readView = () => camera.evaluate(viewport => ({
        scale: Number(viewport.dataset.tableScale),
        left: viewport.scrollLeft, top: viewport.scrollTop,
        mode: viewport.dataset.tableMode,
    }));
    const before = await snapshot(page);
    await page.locator('[data-cardboard-camera="market"]').click();
    await page.locator('[data-cardboard-camera="back"]').click();
    await expectWholeTable(page, 4);
    await cameraCommand(page, 'readable');
    await camera.focus();
    await camera.press('ArrowRight');
    await camera.press('ArrowUp');
    const previous = await readView();
    await page.locator('[data-cardboard-camera="market"]').click();
    await page.locator('[data-cardboard-camera="back"]').click();
    await expect.poll(readView).toEqual(previous);
    expect(await snapshot(page)).toEqual(before);
});

test('2指ピンチは卓を拡大しゲーム状態を変えない', async ({ page, browserName }, testInfo) => {
    await prepare(page, { width: 390, height: 844 }, 4);
    const camera = page.locator('#cardboardTableViewport');
    await expectWholeTable(page, 4);
    const before = await snapshot(page);
    const scale = Number(await camera.getAttribute('data-table-scale'));
    const bounds = await camera.boundingBox();
    const x = bounds.x + bounds.width / 2;
    const y = bounds.y + bounds.height / 2;
    if (browserName !== 'chromium') {
        // Playwright exposes native multi-touch through CDP only. This branch
        // checks WebKit's DOM handlers, not native iOS gesture arbitration.
        testInfo.annotations.push({ type: 'input', description: 'Synthetic DOM touch; native multi-touch is covered by Chromium CDP only.' });
        const prevented = await camera.evaluate((viewport, point) => {
            const dispatch = (type, distance) => {
                const event = new Event(type, { bubbles: true, cancelable: true });
                Object.defineProperty(event, 'touches', { value: distance === null ? [] : [
                    { clientX: point.x - distance, clientY: point.y },
                    { clientX: point.x + distance, clientY: point.y },
                ] });
                viewport.dispatchEvent(event);
                return event.defaultPrevented;
            };
            dispatch('touchstart', 40);
            const moves = [50, 65, 80].map(distance => dispatch('touchmove', distance));
            dispatch('touchend', null);
            return moves;
        }, { x, y });
        expect(prevented).toEqual([true, true, true]);
        await expect.poll(async () => Number(await camera.getAttribute('data-table-scale'))).toBeGreaterThan(scale * 1.5);
        await expect(camera).toHaveAttribute('data-table-mode', 'free');
        expect(await page.evaluate(() => visualViewport.scale)).toBe(1);
        expect(await snapshot(page)).toEqual(before);
        return;
    }
    const client = await page.context().newCDPSession(page);
    await client.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
    let touching = false;
    try {
        await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [
            { x: x - 40, y, id: 0 }, { x: x + 40, y, id: 1 },
        ] });
        touching = true;
        for (const distance of [50, 65, 80]) {
            await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [
                { x: x - distance, y, id: 0 }, { x: x + distance, y, id: 1 },
            ] });
        }
        await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        touching = false;
        await expect.poll(async () => Number(await camera.getAttribute('data-table-scale'))).toBeGreaterThan(scale * 1.5);
        await expect(camera).toHaveAttribute('data-table-mode', 'free');
        expect(await page.evaluate(() => visualViewport.scale)).toBe(1);
        expect(await snapshot(page)).toEqual(before);
    } finally {
        if (touching) await client.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
        await client.detach();
    }
});

test('回転した所有カードは一度の選択で正面と詳細を開き直前の俯瞰へ戻れる', async ({ page }) => {
    await prepare(page, { width: 844, height: 390 }, 4);
    const viewport = page.locator('#cardboardTableViewport');
    const before = await viewport.evaluate(element => ({ scale: element.dataset.tableScale,
        left: element.scrollLeft, top: element.scrollTop }));
    const stateBefore = await snapshot(page);
    const card = page.locator('#cardboardSeats > [data-seat-position="left"] .cardboard-card').first();
    const name = await card.getAttribute('data-card-name');
    await card.click();
    await expect(viewport).toHaveAttribute('data-table-angle', '270');
    await expect(page.locator('#cardDetailModal')).toBeVisible();
    await expect(page.locator('#cardDetailModal')).toContainText(name);
    await page.keyboard.press('Escape');
    await expect(card).toBeFocused();
    await cameraCommand(page, 'back');
    await expect(viewport).toHaveAttribute('data-table-angle', '0');
    expect(await viewport.getAttribute('data-table-scale')).toBe(before.scale);
    const restored = await viewport.evaluate(element => ({ left: element.scrollLeft, top: element.scrollTop }));
    expect(Math.abs(restored.left - before.left)).toBeLessThanOrEqual(1);
    expect(Math.abs(restored.top - before.top)).toBeLessThanOrEqual(1);
    expect(await snapshot(page)).toEqual(stateBefore);
});


for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
test(`市場の絞り込みはカード数に応じて棚高を縮め全体復帰で状態を変えない ${viewport.width}`, async ({ page }) => {
    await prepare(page, viewport, 4);
    await page.evaluate(() => {
        const game = GameRuntimeState.runtime.snapshot().game;
        game.phase = GAME_PHASES.BUILD;
        game.builtThisTurn = false;
        game.players[0].coins = 0;
        setCardFilter('');
        render();
    });
    const before = await snapshot(page);
    await page.locator('[data-cardboard-camera="market"]').click();
    const market = page.locator('#cardboardCenter');
    const oldRows = Number(await market.evaluate(node => node.style.getPropertyValue('--table-market-rows')));
    const oldHeight = await page.locator('#cardboardMarket .compact-market-facilities').evaluate(node => node.offsetHeight);
    const filterSummary = page.locator('#cardboardMarket .compact-market-filter-disclosure > summary');
    if (viewport.width === 390) { await filterSummary.focus(); await filterSummary.press('Enter'); }
    else await filterSummary.click();
    await expect(page.locator('#cardboardMarketDialog')).toBeVisible();
    await page.locator('#cardboardMarket [data-card-filter="affordable"]').click({ timeout: 10000 });
    await page.locator('#cardboardMarketClose').click();
    await expect(page.locator('#cardboardMarket .compact-market-filter-disclosure > summary')).toBeFocused();
    await expect.poll(() => market.evaluate((node, previousHeight) => {
        const cards = node.querySelectorAll('.compact-market-facilities .compact-market-item').length;
        const columns = Number(node.style.getPropertyValue('--table-market-columns'));
        const rows = Number(node.style.getPropertyValue('--table-market-rows'));
        return rows === Math.max(1, Math.ceil(cards / columns)) &&
            node.querySelector('.compact-market-facilities').offsetHeight < previousHeight;
    }, oldHeight)).toBe(true);
    expect(oldRows).toBeGreaterThan(1);
    await page.locator('[data-cardboard-camera="overview"]').click();
    await expectWholeTable(page, 4);
    expect(await snapshot(page)).toEqual(before);
});
}

// Only a deliberate inspection dismisses the brief greeting. Automatic layout
// and camera refreshes retain it, and the persistent turn HUD stays available.
for (const viewport of [{ width: 320, height: 844 }, { width: 390, height: 844 },
    { width: 844, height: 390 }, { width: 1440, height: 936 }]) {
    test(`明示的な正面閲覧だけがHUD手番通知を閉じて手番と対局状態を維持する ${viewport.width}px`, async ({ page }, testInfo) => {
        await prepare(page, viewport, 4);
        await page.evaluate(() => {
            // The table displays completed landmarks; make an actual built station
            // available before recording the immutable inspection baseline.
            GameRuntimeState.runtime.snapshot().game.players[0].landmarks[LANDMARK_NAMES.STATION] = true;
            render();
        });
        const before = await snapshot(page);
        const greeting = page.locator('#turnAnnouncer');
        for (const action of ['roster', 'self', 'readable', 'card', 'landmark']) {
            if (action === 'card' || action === 'landmark') await cameraCommand(page, 'self');
            const status = await page.evaluate(async () => {
                const game = GameRuntimeState.runtime.snapshot().game;
                // render queues the same automatic geometry work as a normal UI
                // refresh. It must not be interpreted as deliberate inspection.
                render();
                const startedAt = performance.now();
                showTurnAnnouncer(game.currentPlayer().name, false, game.currentPlayerIndex);
                const hasCue = () => document.getElementById('cardboardBoard').classList.contains('cardboard-turn-cue');
                const initialHudCue = hasCue();
                const automaticFrames = [];
                for (let frame = 0; frame < 3; frame++) {
                    await new Promise(resolve => requestAnimationFrame(resolve));
                    automaticFrames.push({ elapsed:performance.now()-startedAt, hudCue:hasCue() });
                }
                // A busy renderer can spend the full 1300ms lifetime in three
                // frames. Test early dismissal separately from natural expiry,
                // then start a fresh cue for the explicit inspection below.
                showTurnAnnouncer(game.currentPlayer().name, false, game.currentPlayerIndex);
                return { display: document.getElementById('turnAnnouncer').style.display,
                    initialHudCue, automaticFrames, showDurationMs:UiTurnAnnouncer.showDurationMs,
                    hudCue:hasCue(),
                    status: document.getElementById('turnStatusAnnouncer').textContent,
                    current: document.querySelector('#cardboardRoster [aria-current="true"]').textContent };
            });
            expect(status.display, `${action}: 中央通知でカード卓を隠さない`).toBe('none');
            expect(status.initialHudCue, `${action}: HUDの手番強調を開始する`).toBe(true);
            expect(status.automaticFrames.filter(frame => frame.elapsed < status.showDurationMs && !frame.hudCue),
                `${action}: 1300msの自然終了前に自動配置が通知を消さない ${JSON.stringify(status.automaticFrames)}`).toEqual([]);
            expect(status.hudCue, `${action}: 明示的な閲覧の前に新しい通知が存在する`).toBe(true);
            if (action === 'roster') await page.locator('#cardboardRoster [data-cardboard-player-index="1"]').click();
            else if (action === 'self' || action === 'readable') await cameraCommand(page, action);
            else {
                const owner = page.locator('#cardboardSeats > [data-player-index="0"]');
                await owner.locator(action === 'card' ? '.cardboard-card' : '.cardboard-landmark-built').first().click();
                await expect(page.locator('#cardDetailModal')).toBeVisible();
            }
            await expect(greeting).toBeHidden();
            await expect(page.locator('#cardboardBoard')).not.toHaveClass(/cardboard-turn-cue/);
            expect(await page.evaluate(() => turnAnnouncerTimerController.snapshot().timerAttached), `${action}: 明示的な閲覧で通知timerも解除する`).toBe(false);
            await expect(page.locator('#turnStatusAnnouncer')).toHaveText(status.status);
            const turnSeat = page.locator('#cardboardRoster [aria-current="true"]');
            await expect(turnSeat).toBeVisible();
            await expect(turnSeat).toHaveText(status.current);
            expect(await snapshot(page)).toEqual(before);
            if (action === 'card' || action === 'landmark') await page.keyboard.press('Escape');
        }
        await cameraCommand(page, 'overview');
        await expectWholeTable(page, 4);
        // Capture separately so screenshot I/O cannot consume the transient cue
        // before the inspection action being tested.
        await page.evaluate(() => {
            const game = GameRuntimeState.runtime.snapshot().game;
            showTurnAnnouncer(game.currentPlayer().name, false, game.currentPlayerIndex);
        });
        await page.screenshot({ path: testInfo.outputPath(`hud-turn-cue-${viewport.width}.png`) });
        await page.evaluate(() => dismissTurnGreeting());

    });

}


test('正面の全38施設はカードと原画を縮めず経済効果を表示し戻ると俯瞰へ戻る', async ({ page }, testInfo) => {
    await prepare(page, { width: 390, height: 844 }, 4);
    await page.evaluate(() => {
        const game = GameRuntimeState.runtime.snapshot().game;
        game.players[0].cards = CARDS.map(card => createCardByName(card.name));
        game.players[0].dormantCards = [game.players[0].cards[0]];
        render();
    });
    const before = await snapshot(page);
    const owner = page.locator('#cardboardSeats > [data-player-index="0"]');
    await expect(owner.locator('.cardboard-dormant')).toHaveCount(1);
    const native = await owner.locator('.cardboard-card').evaluateAll(cards => cards.map(card => ({
        width: card.offsetWidth, height: card.offsetHeight, art: card.querySelector('.cardboard-art').offsetHeight,
    })));
    await page.locator('#cardboardRoster [data-cardboard-player-index="0"]').click();
    await expect(owner).toHaveClass(/cardboard-player-reading/);
    const tableViewport = page.locator('#cardboardTableViewport');
    // Initial seat inspection starts at the owner's real first row.
    await expect.poll(() => owner.locator('.cardboard-card').first().evaluate(card => {
        const bounds = card.getBoundingClientRect();
        const clip = document.getElementById('cardboardTableViewport').getBoundingClientRect();
        return bounds.left >= clip.left && bounds.right <= clip.right && bounds.top >= clip.top && bounds.bottom <= clip.bottom;
    })).toBe(true);
    const inspect = async () => owner.locator('.cardboard-card').evaluateAll(cards => {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        return cards.map(card => {
            const effect = card.querySelector('.cardboard-effect');
            const style = getComputedStyle(effect);
            const text = getComputedStyle(effect, '::before');
            context.font = `${text.fontWeight} ${text.fontSize} ${text.fontFamily}`;
            const available = effect.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
            const name = card.querySelector('.cardboard-name');
            const badge = card.querySelector('.cardboard-dormant, .cardboard-activation');
            return { name: card.dataset.cardName, width: card.offsetWidth, height: card.offsetHeight,
                art: card.querySelector('.cardboard-art').offsetHeight,
                effect: effect.dataset.effectShort, display: style.display,
                measured: context.measureText(effect.dataset.effectShort).width, available,
                fits: context.measureText(effect.dataset.effectShort).width <= available + 0.5,
                nameFits: name.scrollHeight <= name.clientHeight + 1,
                badgeSeparate: !badge || effect.offsetTop + effect.offsetHeight <= badge.offsetTop ||
                    effect.offsetTop >= badge.offsetTop + badge.offsetHeight,
                effectFits: effect.scrollHeight <= effect.clientHeight + 1,
            };
        });
    });
    for (const viewport of [{ width: 320, height: 720 }, { width: 390, height: 844 },
        { width: 844, height: 390 }, { width: 1440, height: 900 }]) {
        const anchor = await owner.evaluate(player => {
            const viewport = document.getElementById('cardboardTableViewport');
            const clip = viewport.getBoundingClientRect();
            const x = clip.left + viewport.clientLeft + viewport.clientWidth / 2;
            const y = clip.top + viewport.clientTop + viewport.clientHeight / 2;
            const cards = Array.from(player.querySelectorAll('.cardboard-card')).map(card => {
                const bounds = card.getBoundingClientRect();
                return { name: card.dataset.cardName, bounds,
                    distance: (bounds.left + bounds.width / 2 - x) ** 2 + (bounds.top + bounds.height / 2 - y) ** 2 };
            }).filter(card => card.bounds.right > clip.left && card.bounds.left < clip.right &&
                card.bounds.bottom > clip.top && card.bounds.top < clip.bottom).sort((a, b) => a.distance - b.distance);
            return { name: cards[0].name, scale: viewport.dataset.tableScale, angle: viewport.dataset.tableAngle };
        });
        const oldWidth = await page.evaluate(() => innerWidth);
        await page.setViewportSize(viewport);
        if (oldWidth !== viewport.width) {
            await expect.poll(() => owner.evaluate((player, name) => {
                const viewport = document.getElementById('cardboardTableViewport');
                const clip = viewport.getBoundingClientRect();
                const card = Array.from(player.querySelectorAll('.cardboard-card')).find(card => card.dataset.cardName === name);
                const bounds = card.getBoundingClientRect();
                return Math.abs(bounds.left + bounds.width / 2 - (clip.left + viewport.clientLeft + viewport.clientWidth / 2)) < 2 &&
                    Math.abs(bounds.top + bounds.height / 2 - (clip.top + viewport.clientTop + viewport.clientHeight / 2)) < 2;
            }, anchor.name)).toBe(true);
        }
        await expect(tableViewport).toHaveAttribute('data-table-scale', anchor.scale);
        await expect(tableViewport).toHaveAttribute('data-table-angle', anchor.angle);
        await expect(tableViewport).toHaveAttribute('data-table-focus-player', '0');
        const result = await inspect();
        expect(result).toHaveLength(38);
        expect(result.map(({ width, height, art }) => ({ width, height, art }))).toEqual(native);
        expect(result.filter(card => !card.effect || card.display === 'none' || !card.fits || !card.nameFits || !card.badgeSeparate || !card.effectFits)).toEqual([]);
        expect(await snapshot(page)).toEqual(before);
        await page.screenshot({ path: testInfo.outputPath(`economy-reading-${viewport.width}.png`) });
    }
    await page.locator('[data-cardboard-camera="overview"]').click();
    await expect(owner).not.toHaveClass(/cardboard-player-reading/);
    await expect(owner.locator('.cardboard-effect').first()).toBeHidden();
    expect(await snapshot(page)).toEqual(before);
});


test('高密度4人の再配置は閲覧中カードと倍率を保ち戻ると新しい卓を一望できる', async ({ page }, testInfo) => {
    await prepare(page, { width: 844, height: 390 }, 4);
    await page.evaluate(() => {
        const game = GameRuntimeState.runtime.snapshot().game;
        game.players.forEach(player => {
            player.cards = CARDS.slice(0, 12).map(card => createCardByName(card.name));
            Object.keys(player.landmarks).forEach((name, index) => { player.landmarks[name] = index < 5; });
        });
        render();
    });
    await expectWholeTable(page, 4);
    const world = page.locator('#cardboardSeats');
    await expect(world).toHaveAttribute('data-table-packing', 'cross');
    await cameraCommand(page, 'self');
    const viewport = page.locator('#cardboardTableViewport');
    const anchor = await page.locator('#cardboardSeats > [data-player-index="0"]').evaluate(owner => {
        const viewport = document.getElementById('cardboardTableViewport'), clip = viewport.getBoundingClientRect();
        const x = clip.left + viewport.clientLeft + viewport.clientWidth / 2;
        const y = clip.top + viewport.clientTop + viewport.clientHeight / 2;
        const cards = Array.from(owner.querySelectorAll('.cardboard-card')).map(card => ({ card, rect: card.getBoundingClientRect() }))
            .filter(({ rect }) => rect.right > clip.left && rect.left < clip.right && rect.bottom > clip.top && rect.top < clip.bottom)
            .sort((a, b) => (a.rect.left + a.rect.width / 2 - x) ** 2 + (a.rect.top + a.rect.height / 2 - y) ** 2 -
                ((b.rect.left + b.rect.width / 2 - x) ** 2 + (b.rect.top + b.rect.height / 2 - y) ** 2));
        return { name: cards[0].card.dataset.cardName, scale: viewport.dataset.tableScale, angle: viewport.dataset.tableAngle };
    });
    const key = await world.getAttribute('data-table-layout-key');
    // Presentation growth fixture: only this explicit edit changes game state.
    await page.evaluate(() => {
        const game = GameRuntimeState.runtime.snapshot().game;
        game.players.forEach(player => { player.cards = CARDS.slice(0, 18).map(card => createCardByName(card.name)); });
        render();
    });
    const grown = await snapshot(page);
    await expect(world).toHaveAttribute('data-table-packing', 'pinwheel');
    expect(await world.getAttribute('data-table-layout-key')).not.toBe(key);
    await expect(viewport).toHaveAttribute('data-table-focus-player', '0');
    await expect(viewport).toHaveAttribute('data-table-scale', anchor.scale);
    await expect(viewport).toHaveAttribute('data-table-angle', anchor.angle);
    await expect.poll(() => page.locator('#cardboardSeats > [data-player-index="0"]').evaluate((owner, name) => {
        const viewport = document.getElementById('cardboardTableViewport'), clip = viewport.getBoundingClientRect();
        const rect = Array.from(owner.querySelectorAll('.cardboard-card')).find(card => card.dataset.cardName === name).getBoundingClientRect();
        return Math.abs(rect.left + rect.width / 2 - (clip.left + viewport.clientLeft + viewport.clientWidth / 2)) < 2 &&
            Math.abs(rect.top + rect.height / 2 - (clip.top + viewport.clientTop + viewport.clientHeight / 2)) < 2;
    }, anchor.name)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('pinwheel-growth-reading.png') });
    await cameraCommand(page, 'back');
    await expectWholeTable(page, 4);
    await expect(viewport).toHaveAttribute('data-table-mode', 'overview');
    await expectOwnedCards(page);
    const minimumWidth = await page.locator('#cardboardSeats .cardboard-card').evaluateAll(cards =>
        Math.min(...cards.map(card => {
            const rect = card.getBoundingClientRect();
            // Measure the same 160px card edge at every seat rotation.
            return Math.max(rect.width, rect.height);
        })));
    expect(minimumWidth).toBeGreaterThanOrEqual(31);
    expect(await snapshot(page)).toEqual(grown);
    await page.screenshot({ path: testInfo.outputPath('pinwheel-growth-overview.png') });
});

test('CPU処理通知で盤面が縮む最初の描画から施設とランドマークを俯瞰できる', async ({ page }, testInfo) => {
    await prepare(page, { width: 390, height: 844 }, 2, false);
    await page.evaluate(() => {
        const game = GameRuntimeState.runtime.snapshot().game;
        const cards = ['麦畑', 'パン屋', 'カフェ', 'コンビニ', '貸金業', '出版社', 'ピザ屋', '家具工場', 'ITベンチャー'];
        game.players.forEach((player, index) => {
            player.cards = cards.slice(0, index ? 6 : 9).map(createCardByName);
            Object.keys(player.landmarks).slice(0, index + 2).forEach(name => { player.landmarks[name] = true; });
        });
        render();
        acceptHotseatHandoff();
    });
    await cameraCommand(page, 'overview');
    await expectWholeTable(page, 2);
    // Stage the real station choice before rendering it, so the next UI
    // update grows both the choice row and the processing notification.
    await page.evaluate(() => GameRuntimeState.runtime.snapshot().game.rollDice());
    const before = await snapshot(page);
    expect(await page.evaluate(() => GameRuntimeState.runtime.snapshot().game.phase === GAME_PHASES.SELECT_DICE)).toBe(true);
    const frames = [];
    for (const visible of [true]) {
        const frame = await page.evaluate(visible => new Promise(resolve => {
            const viewport = document.getElementById('cardboardTableViewport');
            const previousHeight = viewport.clientHeight;
            const measure = () => {
                const clip = viewport.getBoundingClientRect();
                const items = [...viewport.querySelectorAll('.cardboard-player, #cardboardCenter, .cardboard-card, .cardboard-landmark-built')];
                const obstacles = [...viewport.querySelectorAll('.cardboard-card, .cardboard-landmark, #cardboardCenter')]
                    .map(element => element.getBoundingClientRect());
                const labelFailures = [...viewport.querySelectorAll('.cardboard-owner-label')].flatMap(label => {
                    const bounds = label.getBoundingClientRect();
                    return obstacles.some(rect => Math.min(bounds.right, rect.right) > Math.max(bounds.left, rect.left) &&
                        Math.min(bounds.bottom, rect.bottom) > Math.max(bounds.top, rect.top))
                        ? [{ owner:label.dataset.playerIndex, bounds:bounds.toJSON() }] : [];
                });
                return { visible, previousHeight, height:viewport.clientHeight, labelFailures,
                    count:items.length, builtCount:viewport.querySelectorAll('.cardboard-landmark-built').length, failures:items.flatMap(element => {
                        const bounds = element.getBoundingClientRect();
                        return bounds.width <= 0 || bounds.height <= 0 || bounds.left < clip.left - 2 || bounds.top < clip.top - 2 ||
                            bounds.right > clip.right + 2 || bounds.bottom > clip.bottom + 2
                            ? [{ name:element.dataset.cardName || element.dataset.landmarkName || element.id,
                                bounds:bounds.toJSON(), clip:clip.toJSON() }] : [];
                    }) };
            };
            let synchronous;
            const observer = new ResizeObserver(() => {
                if (viewport.clientHeight === previousHeight) return;
                observer.disconnect();
                // The product observer refits before paint. Inspect the first
                // frame, rather than polling until a delayed refit masks a clip.
                requestAnimationFrame(() => resolve({ ...measure(), synchronous }));
            });
            observer.observe(viewport);
            render();
            UiGameStatusEffects.applyActivityStatus({ visible, kind:'checking', announceLabel:'CPUが処理中', detail:'次の行動を検討しています' }, {
                container:document.getElementById('gameActivityStatus'), label:document.getElementById('gameActivityStatusLabel'),
                elapsed:document.getElementById('gameActivityStatusElapsed'), detail:document.getElementById('gameActivityStatusDetail'),
            });
            // updateGameActivityStatus applies both the effect and this parent
            // visibility. Reproduce that presentation change without running CPU actions.
            document.getElementById('gameConnectivityPanel').style.display = visible ? 'grid' : 'none';
            const synced = CardBoardField.syncViewport();
            // Same JavaScript task: RO has not yet delivered this size change.
            synchronous = { ...measure(), synced };
        }), visible);
        expect(frame.synchronous.count).toBeGreaterThan(15);
        expect(frame.synchronous.builtCount).toBe(5);
        expect(frame.synchronous.height).not.toBe(frame.synchronous.previousHeight);
        expect(frame.synchronous.failures, JSON.stringify(frame.synchronous)).toEqual([]);
        expect(frame.synchronous.labelFailures, JSON.stringify(frame.synchronous)).toEqual([]);
        expect(frame.count).toBeGreaterThan(15);
        expect(frame.builtCount).toBe(5);
        expect(frame.height).not.toBe(frame.previousHeight);
        expect(frame.failures, JSON.stringify(frame)).toEqual([]);
        expect(frame.labelFailures, JSON.stringify(frame)).toEqual([]);
        expect(await snapshot(page)).toEqual(before);
        frames.push(frame);
    }
    await page.evaluate(() => {
        UiGameStatusEffects.applyActivityStatus({ visible:false }, { container:document.getElementById('gameActivityStatus') });
        document.getElementById('gameConnectivityPanel').style.display = 'none';
    });
    await expectWholeTable(page, 2);
    await testInfo.attach('cpu-notice-first-frames', { body:JSON.stringify(frames, null, 2), contentType:'application/json' });
    await page.screenshot({ path:testInfo.outputPath('cpu-notice-overview.png') });
    await cameraCommand(page, 'readable');
    const reading = await page.evaluate(() => {
        const viewport = document.getElementById('cardboardTableViewport');
        const view = () => ({ mode:viewport.dataset.tableMode, scale:viewport.dataset.tableScale,
            angle:viewport.dataset.tableAngle, focus:viewport.dataset.tableFocusPlayer,
            transform:document.getElementById('cardboardSeats').style.transform });
        const before = view();
        const previousHeight = viewport.clientHeight;
        const panel = document.getElementById('gameConnectivityPanel');
        const activity = document.getElementById('gameActivityStatus');
        const panelDisplay = panel.style.display, activityDisplay = activity.style.display;
        activity.style.display = 'flex';
        panel.style.display = 'grid';
        const height = viewport.clientHeight;
        const synced = CardBoardField.syncViewport();
        const after = view();
        panel.style.display = panelDisplay;
        activity.style.display = activityDisplay;
        return { before, after, previousHeight, height, synced };
    });
    expect(reading.before.mode).toBe('free');
    expect(reading.height).not.toBe(reading.previousHeight);
    expect(reading.synced).toBe(false);
    expect(reading.after).toEqual(reading.before);
    expect(await snapshot(page)).toEqual(before);
});


for (const width of [390, 844]) test(`終盤の所属ラベルで通常の名前を全文読める ${width}px`, async ({ page }) => {
    await prepare(page, { width, height: width === 844 ? 390 : 844 }, 4, false);
    await page.evaluate(() => {
        const game = GameRuntimeState.runtime.snapshot().game;
        game.players.forEach((player, index) => {
            player.name = `プレイヤー${index + 1}`;
            player.cards = CARDS.slice(0, 18).map(card => createCardByName(card.name));
            Object.keys(player.landmarks).forEach((name, landmarkIndex) => { player.landmarks[name] = landmarkIndex < 5; });
        });
        render();
    });
    await cameraCommand(page, 'overview');
    const labels = page.locator('#cardboardOwnerLabels .cardboard-owner-label');
    await expect(labels).toHaveCount(4);
    await expect.poll(() => labels.evaluateAll(elements => elements.every(label => {
        const bounds = label.getBoundingClientRect();
        const obstacles = [...document.querySelectorAll('#cardboardSeats .cardboard-card, #cardboardSeats .cardboard-landmark, #cardboardCenter')];
        return label.scrollWidth <= label.clientWidth && !obstacles.some(element => {
            const rect = element.getBoundingClientRect();
            return Math.min(bounds.right, rect.right) > Math.max(bounds.left, rect.left) &&
                Math.min(bounds.bottom, rect.bottom) > Math.max(bounds.top, rect.top);
        });
    })), '通常名は全文表示し施設と市場を覆わない').toBe(true);
});

// The DOM can grow a second card row before its queued ResizeObserver runs.
// The same render must update world geometry, not briefly clip an opponent.
test('所有施設が一行から増えた描画で相手のカードを卓上端に切らない', async ({ page }) => {
    await prepare(page, { width: 844, height: 390 }, 2, false);
    await page.evaluate(() => {
        const game = GameRuntimeState.runtime.snapshot().game;
        game.players[0].cards = CARDS.slice(0, 5).map(card => createCardByName(card.name));
        game.players[1].cards = CARDS.slice(0, 7).map(card => createCardByName(card.name));
        render();
    });
    await cameraCommand(page, 'overview');
    await expectWholeTable(page, 2);
    const result = await page.evaluate(() => {
        const game = GameRuntimeState.runtime.snapshot().game;
        game.players[1].cards.push(createCardByName(CARDS[7].name));
        const before = GameSnapshot.serializeUndoState(game, SHOP_STOCK, Number.MAX_SAFE_INTEGER);
        render();
        const viewport = document.getElementById('cardboardTableViewport');
        const clip = viewport.getBoundingClientRect();
        const outside = [...document.querySelectorAll('#cardboardSeats .cardboard-card, #cardboardSeats .cardboard-landmark')]
            .filter(element => {
                const rect = element.getBoundingClientRect();
                return rect.width > 0 && rect.height > 0 && (rect.left < clip.left + viewport.clientLeft ||
                    rect.top < clip.top + viewport.clientTop || rect.right > clip.left + viewport.clientLeft + viewport.clientWidth ||
                    rect.bottom > clip.top + viewport.clientTop + viewport.clientHeight);
            }).map(element => ({ name: element.getAttribute('data-card-name') || element.getAttribute('data-landmark-name'),
                bounds: element.getBoundingClientRect().toJSON() }));
        return { outside, before, after: GameSnapshot.serializeUndoState(game, SHOP_STOCK, Number.MAX_SAFE_INTEGER) };
    });
    expect(result.outside, '次のRAFを待たず全実カードを新しい盤面へ収める').toEqual([]);
    expect(result.after).toEqual(result.before);
});
