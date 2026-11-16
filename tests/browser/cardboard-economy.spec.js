const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');

// Controlled actual cards/rules, not a natural match or physical device review.
// Keep the existing mobile project settings and ordinary presentation timing.
test.use({ serviceWorkers: 'block', video: 'off',
    trace: { mode: 'retain-on-failure', screenshots: false, snapshots: false, sources: true } });

const canonical = page => page.evaluate(() => {
    const runtime = GameRuntimeState.runtime.snapshot();
    return GameSnapshot.serializeGameState(runtime.game, SHOP_STOCK, {
        pendingActionsFor: GameManager.serializedPendingActionsFor,
        undoState: runtime.undoState, logLimit: Number.MAX_SAFE_INTEGER,
    });
});

for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 },
    { width: 844, height: 390 }, { width: 1440, height: 936 }]) {
    test(`所有38施設の基本効果は固定寸法で全文を収め状態帯と正面表示を守る ${viewport.width}`, async ({ page }, testInfo) => {
        const evidence = [];
        await page.setViewportSize(viewport);
        await page.addInitScript(() => localStorage.setItem('machikoroDesignTheme', 'cardboard'));
        await page.route('https://pagead2.googlesyndication.com/**', route => route.fulfill({ status: 200, body: '' }));
        await page.goto('/');
        const names = await page.evaluate(() => {
            startGameNow(4, Array.from({ length: 4 }, (_, index) => ({ type: 'human', name: `街${index + 1}` })));
            GameRuntimeState.runtime.setCpuPlayers([null, null, null, null]);
            cancelCpuSchedule('cardboard-economy-fixture');
            const game = GameRuntimeState.runtime.snapshot().game;
            game.currentPlayerIndex = 0;
            game.players.forEach(player => {
                player.coins = 30;
                Object.keys(player.landmarks).forEach(name => { player.landmarks[name] = false; });
            });
            // One of every real facility on a rotated opponent seat. This
            // avoids multiplying the large art fixture over all four owners.
            game.players[1].cards = CARDS.map(card => createCardByName(card.name));
            for (const card of game.players[1].cards) if (!['麦畑', 'パン屋'].includes(card.name)) SHOP_STOCK[card.name]--;
            game.log = [];
            game.addLog(LOG_TYPES.SYSTEM, `👤 ${game.currentPlayer().name}のターン`);
            setTutorialEnabled(false);
            render();
            acceptHotseatHandoff();
            return CARDS.map(card => card.name).sort();
        });
        expect(names).toHaveLength(38);
        await page.evaluate(() => document.fonts.ready);
        const dialog = page.locator('#cardboardMarketDialog');
        async function closeMarket() {
            if (await dialog.isVisible()) await page.locator('#cardboardMarketClose').click();
            await expect(dialog).not.toBeVisible();
        }
        async function camera(command) {
            const button = page.locator(`[data-cardboard-camera="${command}"]`);
            if (!await button.isVisible()) await page.locator('#cardboardMoreMenu > summary').click();
            await button.click();
        }
        async function measure(stage, reading) {
            const result = await page.evaluate(() => {
                const panel = document.querySelector('#cardboardSeats .cardboard-player[data-player-index="1"]');
                const intersects = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
                const contains = (outer, inner) => inner.left >= outer.left && inner.right <= outer.right &&
                    inner.top >= outer.top && inner.bottom <= outer.bottom;
                return { angle: panel.dataset.tableAngle, reading: panel.classList.contains('cardboard-player-reading'),
                    cards: [...panel.querySelectorAll('.cardboard-card')].map(card => {
                        const effect = card.querySelector('.cardboard-effect');
                        const name = card.querySelector('.cardboard-name');
                        const art = card.querySelector('.cardboard-art');
                        const dormant = card.querySelector('.cardboard-dormant');
                        const style = getComputedStyle(effect);
                        const pseudo = getComputedStyle(effect, '::before');
                        const visible = style.display !== 'none' && style.visibility === 'visible';
                        const text = panel.classList.contains('cardboard-player-reading')
                            ? effect.dataset.effectShort : effect.dataset.effectOverview;
                        // Render the exact computed pseudo font and text in an
                        // untransformed probe: real shaping, not character estimates.
                        const probe = document.createElement('span');
                        Object.assign(probe.style, { position: 'fixed', left: '0', top: '0', display: 'inline-block',
                            padding: '0', margin: '0', border: '0', whiteSpace: 'nowrap',
                            fontFamily: pseudo.fontFamily, fontSize: pseudo.fontSize, fontWeight: pseudo.fontWeight,
                            fontStyle: pseudo.fontStyle, fontStretch: pseudo.fontStretch, fontVariant: pseudo.fontVariant,
                            letterSpacing: pseudo.letterSpacing, lineHeight: pseudo.lineHeight });
                        probe.textContent = text;
                        document.body.appendChild(probe);
                        const range = document.createRange();
                        range.selectNodeContents(probe);
                        const glyph = range.getBoundingClientRect();
                        const measured = { width: glyph.width, height: glyph.height };
                        probe.remove();
                        const box = effect.getBoundingClientRect();
                        const cardBox = card.getBoundingClientRect();
                        const nameBox = name.getBoundingClientRect();
                        return { name: card.dataset.cardName, width: card.offsetWidth, height: card.offsetHeight,
                            artHeight: art.offsetHeight, nameHeight: name.offsetHeight,
                            activated: card.classList.contains('cardboard-card-activated'), dormant: Boolean(dormant),
                            count: card.querySelector('.cardboard-count-value').textContent,
                            restText: dormant?.textContent, visible, text, content: pseudo.content, font: pseudo.font,
                            fullText: effect.textContent, title: effect.title, aria: card.getAttribute('aria-label'),
                            expectedFull: getEffectText(createCardByName(card.dataset.cardName)),
                            expectedShort: getEffectText(createCardByName(card.dataset.cardName), true),
                            availableWidth: effect.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
                            availableHeight: effect.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom),
                            measured, insideCard: contains(cardBox, box), overlapsName: intersects(box, nameBox),
                            overlapsArt: intersects(box, art.getBoundingClientRect()),
                            overlapsRest: dormant ? intersects(box, dormant.getBoundingClientRect()) : false };
                    }) };
            });
            evidence.push({ stage, ...result });
            expect(result.reading).toBe(reading);
            expect(result.cards.map(card => card.name).sort()).toEqual(names);
            if (!reading) expect(Number(result.angle) % 180).not.toBe(0);
            for (const card of result.cards) {
                expect(card.width).toBe(160);
                expect(card.height).toBe(134);
                expect(card.artHeight).toBe(62);
                expect(card.nameHeight).toBe(reading ? 20 : 24);
                expect(card.fullText).toBe(card.expectedFull);
                expect(card.title).toBe(card.expectedFull);
                expect(card.aria).toContain(card.expectedFull);
                const expectedVisible = !card.activated && (reading || !card.dormant);
                expect(card.visible, `${stage}/${card.name}`).toBe(expectedVisible);
                if (!expectedVisible) continue;
                expect(card.content).toBe(JSON.stringify(card.text));
                if (reading) expect(card.text).toBe(card.expectedShort);
                else expect(card.text.startsWith('基本 ') || card.text === '効果は詳細へ').toBe(true);
                expect(card.measured.width, `${stage}/${card.name}: ${JSON.stringify(card)}`).toBeLessThanOrEqual(card.availableWidth);
                expect(card.measured.height, `${stage}/${card.name}: ${JSON.stringify(card)}`).toBeLessThanOrEqual(card.availableHeight);
                expect(card.insideCard, `${stage}/${card.name}`).toBe(true);
                expect(card.overlapsName, `${stage}/${card.name}`).toBe(false);
                expect(card.overlapsArt, `${stage}/${card.name}`).toBe(false);
                expect(card.overlapsRest, `${stage}/${card.name}`).toBe(false);
            }
            return result;
        }
        try {
            await closeMarket();
            await camera('overview');
            const before = await canonical(page);
            await measure('all-overview', false);
            await page.screenshot({ path: testInfo.outputPath(`economy-overview-${viewport.width}.png`) });
            await page.locator('#cardboardRoster [data-cardboard-player-index="1"]').click();
            await measure('all-reading', true);
            await camera('back');
            expect(await canonical(page)).toEqual(before);
            await page.evaluate(() => {
                const game = GameRuntimeState.runtime.snapshot().game;
                const player = game.players[1];
                player.cards.push(createCardByName('森林'));
                SHOP_STOCK['森林']--;
                player.makeDormant(player.cards.find(card => card.name === '森林'));
                render();
            });
            const resting = await canonical(page);
            const rest = await measure('partial-rest-overview', false);
            expect(rest.cards.find(card => card.name === '森林').count).toBe('×2');
            expect(rest.cards.find(card => card.name === '森林').restText).toBe('休業 1枚 / 稼働 1枚');
            await page.locator('#cardboardRoster [data-cardboard-player-index="1"]').click();
            await measure('partial-rest-reading', true);
            await camera('back');
            expect(await canonical(page)).toEqual(resting);
            await page.evaluate(() => {
                const game = GameRuntimeState.runtime.snapshot().game;
                game.rollDice(3);
                if (game.lastDiceResult !== 3 || game.phase !== GAME_PHASES.BUILD) throw new Error('Expected real die-3 resolution');
                render();
            });
            await closeMarket();
            await expect(page.locator('#cardboardBoard')).not.toHaveClass(/cardboard-new-roll/);
            const resolved = await canonical(page);
            await camera('overview');
            const active = await measure('resolved-overview', false);
            expect(active.cards.find(card => card.name === 'コーン畑').activated).toBe(true);
            await page.locator('#cardboardRoster [data-cardboard-player-index="1"]').click();
            await measure('resolved-reading', true);
            await page.screenshot({ path: testInfo.outputPath(`economy-status-reading-${viewport.width}.png`) });
            await camera('back');
            expect(await canonical(page)).toEqual(resolved);
        } finally {
            await fs.writeFile(testInfo.outputPath(`economy-${viewport.width}.json`), JSON.stringify(evidence, null, 2));
        }
    });
}
