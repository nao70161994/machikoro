const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
test.use({serviceWorkers:'block', video:'off'});
// Repeatable presentation comparison, not a naturally played match.
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

async function cameraCommand(page, command) {
    const button = page.locator(`[data-cardboard-camera="${command}"]`);
    if (!await button.isVisible()) await page.locator('#cardboardMoreMenu > summary').click();
    await button.click();
}
const candidatePath = path.join(__dirname, '../../js/cardTableLayout.js');
for (const viewport of [{width:320,height:568},{width:390,height:844},{width:844,height:390},{width:1440,height:900}]) {
    for (const scene of ['early', 'late']) {
        densityCase(viewport, 2, scene);
    }
}
densityCase({width:390,height:844}, 4, 'late');
function densityCase(viewport, count, scene) {
    test.describe(`portrait density context ${count}p ${scene} ${viewport.width}`, () => {
    if (viewport.width === 1440) test.use({deviceScaleFactor:1, isMobile:false, hasTouch:false});
    test(`portrait density comparison ${count}p ${scene} ${viewport.width}`, async ({page}, testInfo) => {
        const candidate = await fs.readFile(candidatePath, 'utf8');
        const baseline = candidate.replace(': densePortraitOpponents ? [1, 2, 3, 4, 6, 8] : [1, 2, 3, 4];', ': [1, 2, 3, 4];');
        expect(baseline).not.toBe(candidate);
        let source = baseline;
        await page.route('**/js/cardTableLayout.js*', route => route.fulfill({status:200, contentType:'application/javascript', body:source}));
        const samples = [];
        for (const treatment of ['before', 'after']) {
            source = treatment === 'before' ? baseline : candidate;
            await prepare(page, viewport, count, false);
            const natural = count === 4 ? require('../fixtures/owner-late-390-natural.json') : null;
            await page.evaluate(({scene, natural}) => {
                const game = GameRuntimeState.runtime.snapshot().game;
                game.phase = GAME_PHASES.BUILD;
                game.builtThisTurn = true;
                if (natural) {
                    game.currentPlayerIndex = natural.game.actor;
                    game.turnCount = natural.game.turn;
                    game.builtThisTurn = natural.snapshot.builtThisTurn;
                    game.players.forEach((player, index) => {
                        player.name = natural.names[index];
                        player.cards = natural.snapshot.playerCardNames[index].map(createCardByName);
                        player.coins = natural.snapshot.playerCoins[index];
                        Object.assign(player.landmarks, natural.snapshot.playerLandmarks[index]);
                    });
                    Object.assign(SHOP_STOCK, natural.snapshot.shopStock);
                } else if (scene === 'late') {
                    game.players.forEach((player, index) => {
                        player.cards = CARDS.slice(0, index ? 24 : 14).map(card => createCardByName(card.name));
                        Object.keys(player.landmarks).forEach((name, i) => {player.landmarks[name] = i < (index ? 2 : 5);});
                    });
                }
                render();
                acceptHotseatHandoff();
            }, {scene, natural});
            await cameraCommand(page, 'overview');
            await expectWholeTable(page, count);
            const canonical = await snapshot(page);
            const geometry = await page.evaluate(() => {
                const viewport = document.getElementById('cardboardTableViewport');
                const clip = viewport.getBoundingClientRect();
                const rect = element => element.getBoundingClientRect().toJSON();
                const cards = [...viewport.querySelectorAll('.cardboard-card, .cardboard-landmark-built')].map(element => ({owner:element.closest('.cardboard-player')?.dataset.playerIndex, rect:rect(element)}));
                const labels = [...document.querySelectorAll('.cardboard-owner-label')].map(element => ({owner:element.dataset.playerIndex, text:element.textContent, rect:rect(element), complete:element.scrollWidth <= element.clientWidth + 1 && element.scrollHeight <= element.clientHeight + 1}));
                const market = rect(document.getElementById('cardboardCenter'));
                const overlaps = (a,b) => Math.min(a.right,b.right)-Math.max(a.left,b.left)>1 && Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1;
                const inside = r => r.left >= clip.left-1 && r.right <= clip.right+1 && r.top >= clip.top-1 && r.bottom <= clip.bottom+1;
                return {scale:Number(viewport.dataset.tableScale), angle:viewport.dataset.tableAngle, clip:clip.toJSON(), market, cards, labels,
                    columns:[...document.querySelectorAll('#cardboardSeats > .cardboard-player')].map(element => ({owner:element.dataset.playerIndex, columns:element.querySelector('.cardboard-cards')?.style.gridTemplateColumns, ownerColumns:element.style.getPropertyValue('--table-owner-columns')})),
                    outside:[...cards.map(x=>x.rect),...labels.map(x=>x.rect),market].filter(r=>!inside(r)),
                    collisions:labels.filter(label=>cards.some(card=>overlaps(label.rect,card.rect)) || overlaps(label.rect,market)),
                    cardMarketCollisions:cards.filter(card=>overlaps(card.rect,market)),
                    cardCollisions:cards.filter((card,i)=>cards.slice(i+1).some(other=>overlaps(card.rect,other.rect)))};
            });
            samples.push({treatment,geometry});
            // Persist evidence before any assertion, including a failing layout.
            await fs.writeFile(testInfo.outputPath('density-comparison.json'), JSON.stringify({viewport,count,scene,fixture:'controlled comparison, not real UI progression',samples},null,2));
            expect(geometry.outside, JSON.stringify(geometry)).toEqual([]);
            expect(geometry.collisions).toEqual([]);
            expect(geometry.cardMarketCollisions).toEqual([]);
            expect(geometry.cardCollisions).toEqual([]);
            expect(geometry.labels).toHaveLength(count);
            expect(geometry.labels.every(label=>label.complete)).toBe(true);
            await page.screenshot({path:testInfo.outputPath(`density-${treatment}.png`)});
            await page.locator('#cardboardRoster [data-cardboard-player-index="1"]').click();
            await expect(page.locator('#cardboardTableViewport')).not.toHaveAttribute('data-table-angle', '0');
            await cameraCommand(page, 'back');
            await expectWholeTable(page,count);
            await expect(page.locator('#cardboardTableViewport')).toHaveAttribute('data-table-angle', geometry.angle);
            await expect.poll(() => page.locator('#cardboardTableViewport').getAttribute('data-table-scale')).toBe(String(geometry.scale.toFixed(3)));
            expect(await snapshot(page)).toEqual(canonical);
        }
        expect(samples[1].geometry.scale).toBeGreaterThanOrEqual(samples[0].geometry.scale - 0.001);
        if (count === 2 && scene === 'late' && viewport.width === 320) {
            expect(samples[1].geometry.scale).toBeGreaterThanOrEqual(samples[0].geometry.scale * 1.05);
        }
        if (count === 4 || scene === 'early' || viewport.width > viewport.height) {
            expect(samples[1].geometry.scale).toBe(samples[0].geometry.scale);
        }
    });
    });
}
