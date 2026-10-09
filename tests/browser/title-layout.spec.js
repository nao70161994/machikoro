const { test, expect } = require('@playwright/test');
const fs = require('fs/promises');
const path = require('path');

test.use({ serviceWorkers: 'block' });

const VIEWPORTS = [
    { width: 320, height: 844, name: 'phone-320' },
    { width: 390, height: 844, name: 'phone-390' },
    { width: 844, height: 390, name: 'landscape-844' },
    { width: 1440, height: 936, name: 'desktop-1440' },
];

for (const viewport of VIEWPORTS) {
    test(`タイトル背景と保存再開UIは全幅で操作できる ${viewport.name}`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.addInitScript(() => {
            localStorage.setItem('machikoroDesignTheme', 'cardboard');
            localStorage.setItem('machikoroTutorialEnabled', 'false');
        });
        await page.route('https://pagead2.googlesyndication.com/**', route => route.fulfill({ status: 200, body: '' }));
        await page.goto('/');
        await page.evaluate(() => {
            pwaInstallDismiss();
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
            const body = document.body;
            const title = document.getElementById('titleScreen');
            const canvas = document.getElementById('cityCanvas');
            const resumeButton = document.getElementById('btnResume');
            const removeButton = document.getElementById('btnDeleteSave');
            const generationSelect = document.getElementById('localSaveGeneration');
            const rect = element => {
                const value = element.getBoundingClientRect();
                return { left: value.left, right: value.right, top: value.top, bottom: value.bottom,
                    width: value.width, height: value.height };
            };
            const centerTarget = button => {
                const value = button.getBoundingClientRect();
                if (value.top < 0 || value.bottom > innerHeight || value.left < 0 || value.right > innerWidth) return false;
                const hit = document.elementFromPoint(value.left + value.width / 2, value.top + value.height / 2);
                return hit === button || button.contains(hit);
            };
            return {
                documentWidth: document.documentElement.scrollWidth,
                body: rect(body), bodyMaxWidth: getComputedStyle(body).maxWidth,
                title: rect(title), canvas: rect(canvas), canvasCssWidth: getComputedStyle(canvas).width,
                canvasBufferWidth: canvas.width,
                resume: rect(resumeButton), remove: rect(removeButton),
                generationSelectStyle: {
                    background: getComputedStyle(generationSelect).backgroundColor,
                    color: getComputedStyle(generationSelect).color,
                    colorScheme: getComputedStyle(generationSelect).colorScheme,
                },
                removeWhiteSpace: getComputedStyle(removeButton).whiteSpace,
                resumeTextFits: resumeButton.scrollWidth <= resumeButton.clientWidth,
                resumeHit: centerTarget(resumeButton), removeHit: centerTarget(removeButton),
            };
        });
        expect(layout.documentWidth, JSON.stringify(layout)).toBeLessThanOrEqual(viewport.width + 1);
        expect(layout.body.left, JSON.stringify(layout)).toBe(0);
        expect(layout.body.width, JSON.stringify(layout)).toBe(viewport.width);
        expect(layout.bodyMaxWidth).toBe('none');
        expect(layout.title.left).toBe(0);
        expect(Math.abs(layout.title.width - viewport.width)).toBeLessThanOrEqual(1);
        expect(layout.canvas.left).toBe(0);
        expect(Math.abs(layout.canvas.width - viewport.width)).toBeLessThanOrEqual(1);
        expect(Math.abs(parseFloat(layout.canvasCssWidth) - viewport.width)).toBeLessThanOrEqual(1);
        expect(layout.canvasBufferWidth).toBe(Math.min(1920, viewport.width));
        expect(layout.resume.width, JSON.stringify(layout)).toBeGreaterThanOrEqual(100);
        expect(layout.resume.height).toBeGreaterThanOrEqual(44);
        expect(layout.remove.width).toBeGreaterThanOrEqual(64);
        expect(layout.remove.height).toBeGreaterThanOrEqual(44);
        expect(layout.removeWhiteSpace).toBe('nowrap');
        expect(layout.generationSelectStyle).toEqual({
            background: 'rgb(24, 45, 63)', color: 'rgb(255, 244, 223)', colorScheme: 'dark',
        });
        expect(layout.resumeTextFits).toBe(true);
        expect(layout.resumeHit).toBe(true);
        expect(layout.removeHit).toBe(true);
        const screenshotPath = testInfo.outputPath(`title-${viewport.name}.png`);
        const screenshot = await page.screenshot({ path: screenshotPath });
        await testInfo.attach('全幅タイトルと保存再開操作', { path: screenshotPath, contentType: 'image/png' });
        if (process.env.CARDBOARD_REVIEW_ARTIFACT_DIR) {
            const artifactDir = path.resolve(process.env.CARDBOARD_REVIEW_ARTIFACT_DIR);
            await fs.mkdir(artifactDir, { recursive: true });
            await fs.writeFile(path.join(artifactDir, `title-${viewport.name}.png`), screenshot);
        }

        await page.locator('#btnDeleteSave').click();
        await expect(page.locator('#confirmModal')).toBeVisible();
        await expect(page.locator('#confirmMessage')).toContainText('セーブデータを削除しますか');
        await page.locator('#confirmCancelBtn').click();
        await expect(page.locator('#confirmModal')).toBeHidden();
        await page.locator('#btnResume').click();
        await expect(page.locator('#gameScreen')).toBeVisible();
        await expect(page.locator('#titleScreen')).toBeHidden();
    });
}
