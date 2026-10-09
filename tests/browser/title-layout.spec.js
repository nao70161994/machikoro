const { test, expect } = require('@playwright/test');

test.use({ serviceWorkers: 'block' });

const VIEWPORTS = [
    { width: 320, height: 844, name: 'phone-320' },
    { width: 390, height: 844, name: 'phone-390' },
    { width: 844, height: 390, name: 'landscape-844' },
    { width: 1440, height: 936, name: 'desktop-1440' },
];

for (const viewport of VIEWPORTS) {
    test(`タイトル背景と保存再開UIが画面幅に収まる ${viewport.name}`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.addInitScript(() => {
            localStorage.setItem('machikoroDesignTheme', 'cardboard');
            localStorage.setItem('machikoroTutorialEnabled', 'false');
        });
        await page.route('https://pagead2.googlesyndication.com/**', route => route.fulfill({ status: 200, body: '' }));
        await page.goto('/');
        await page.evaluate(() => {
            startGameNow(2, Array.from({ length: 2 }, (_, index) => ({ type: 'human', name: `街${index + 1}` })));
            cancelCpuSchedule('title-layout-save-fixture');
            GameRuntimeState.runtime.setCpuPlayers([null, null]);
            setTutorialEnabled(false);
            acceptHotseatHandoff();
            saveGameState();
            GameRuntimeState.runtime.snapshot().game.players[0].coins += 1;
            saveGameState();
        });
        await page.reload();
        await expect(page.locator('#resumeSection')).toBeVisible();
        await expect(page.locator('#localSaveGenerationLabel')).toBeVisible();
        await expect(page.locator('#localSaveGenerationLabel')).toContainText('再開する保存データ');
        const layout = await page.evaluate(() => {
            const title = document.getElementById('titleScreen');
            const backdrop = getComputedStyle(title, '::before');
            const canvas = document.getElementById('cityCanvas').getBoundingClientRect();
            const resume = document.getElementById('btnResume').getBoundingClientRect();
            const remove = document.getElementById('btnDeleteSave').getBoundingClientRect();
            const resumeButton = document.getElementById('btnResume');
            const removeButton = document.getElementById('btnDeleteSave');
            const centerTarget = button => {
                const rect = button.getBoundingClientRect();
                if (rect.top < 0 || rect.bottom > innerHeight || rect.left < 0 || rect.right > innerWidth) return false;
                const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
                return hit === button || button.contains(hit);
            };
            return {
                document: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
                title: title.getBoundingClientRect().toJSON(),
                backdrop: { position: backdrop.position, zIndex: backdrop.zIndex, background: backdrop.backgroundImage },
                canvas: canvas.toJSON(),
                resume: resume.toJSON(),
                remove: remove.toJSON(),
                resumeTextFits: resumeButton.scrollWidth <= resumeButton.clientWidth,
                resumeHit: centerTarget(resumeButton),
                removeHit: centerTarget(removeButton),
            };
        });
        expect(layout.document[0], JSON.stringify(layout)).toBeLessThanOrEqual(viewport.width + 1);
        expect(layout.backdrop.position).toBe('fixed');
        expect(layout.backdrop.background).toContain('gradient');
        expect(layout.canvas.left).toBeLessThanOrEqual(0);
        expect(layout.canvas.right).toBeGreaterThanOrEqual(viewport.width - 1);
        expect(layout.resume.width).toBeGreaterThanOrEqual(100);
        expect(layout.resume.height).toBeGreaterThanOrEqual(44);
        expect(layout.remove.width).toBeGreaterThanOrEqual(44);
        expect(layout.remove.height).toBeGreaterThanOrEqual(44);
        expect(layout.resumeTextFits).toBe(true);
        expect(layout.resumeHit).toBe(true);
        expect(layout.removeHit).toBe(true);
        const path = testInfo.outputPath(`title-${viewport.name}.png`);
        await page.screenshot({ path });
        await testInfo.attach('タイトルと中断ゲームの実画面', { path, contentType: 'image/png' });
    });
}
