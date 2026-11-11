const { test, expect } = require('@playwright/test');

test.use({ serviceWorkers: 'block' });

test('発動カードの合成ヒントは実演出条件だけで有効になり市場と静止時には残らない', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.addInitScript(() => localStorage.setItem('machikoroDesignTheme', 'cardboard'));
    await page.route('https://pagead2.googlesyndication.com/**', route => route.fulfill({ status: 200, body: '' }));
    await page.goto('/');
    await page.evaluate(() => {
        startGameNow(2, [{ type: 'human', name: '街1' }, { type: 'human', name: '街2' }]);
        const runtime = GameRuntimeState.runtime.snapshot();
        GameRuntimeState.runtime.setCpuPlayers([null, null]);
        cancelCpuSchedule('cardboard-compositing');
        runtime.game.currentPlayerIndex = 0;
        runtime.game.log = [];
        runtime.game.addLog(LOG_TYPES.SYSTEM, `👤 ${runtime.game.currentPlayer().name}のターン`);
        setTutorialEnabled(false);
        render();
        acceptHotseatHandoff();
        runtime.game.rollDice([3]);
        render();
    });
    await expect(page.locator('#cardboardSeats .cardboard-card-activated').first()).toBeVisible();
    // Exercise the exact CSS lifecycle conditions on an actual result card.
    // These controlled presentation states do not claim elapsed-animation timing.
    const observations = await page.evaluate(() => {
        const board = document.getElementById('cardboardBoard');
        const preview = document.getElementById('cardboardEventDetails');
        const card = board.querySelector('.cardboard-card-activated');
        const state = () => ({ hint: getComputedStyle(card).willChange, animation: getComputedStyle(card).animationName });
        const reset = () => {
            board.classList.remove('cardboard-new-roll', 'cardboard-roll-reviewed');
            preview.classList.remove('cardboard-preview-playing');
            card.classList.remove('cardboard-card-additional-activation');
        };
        reset();
        const idle = state();
        board.classList.add('cardboard-new-roll');
        const roll = state();
        board.classList.add('cardboard-roll-reviewed');
        const reviewed = state();
        reset();
        card.classList.add('cardboard-card-additional-activation');
        const additional = state();
        reset();
        preview.classList.add('cardboard-preview-playing');
        const replay = state();
        document.body.classList.add('accessibility-reduced-motion');
        const appReduced = state();
        document.body.classList.remove('accessibility-reduced-motion');
        reset();
        return { idle, roll, reviewed, additional, replay, appReduced,
            phase: GameRuntimeState.runtime.snapshot().game.phase };
    });
    expect(observations.phase).toBe('build');
    for (const stage of ['idle', 'reviewed']) expect(observations[stage]).toEqual({ hint: 'auto', animation: 'none' });
    for (const stage of ['roll', 'additional', 'replay']) {
        expect(observations[stage]).toEqual({ hint: 'transform, opacity', animation: 'cardboard-card-activate' });
    }
    expect(observations.appReduced).toEqual({ hint: 'auto', animation: 'none' });
    await page.locator('#cardboardMarket .compact-market-expand').click();
    await expect(page.locator('#cardboardMarketDialog')).toBeVisible();
    await expect(page.locator('#cardboardSeats .cardboard-card-activated').first()).toHaveCSS('will-change', 'auto');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const osReduced = await page.evaluate(() => {
        document.getElementById('cardboardEventDetails').classList.add('cardboard-preview-playing');
        const style = getComputedStyle(document.querySelector('#cardboardSeats .cardboard-card-activated'));
        return { hint: style.willChange, animation: style.animationName };
    });
    expect(osReduced).toEqual({ hint: 'auto', animation: 'none' });
});
