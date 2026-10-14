const { test, expect } = require('@playwright/test');
const fs = require('fs/promises');
const path = require('path');

test.use({ serviceWorkers: 'block' });

const VIEWPORTS = [
    { width: 320, height: 568, name: 'short-phone-320' },
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
        await expect(page.locator('#localResumeMarketDetails')).toContainText('2人対戦');
        await expect(page.locator('#localResumeMarketDetails')).toHaveAttribute('aria-live', 'polite');
        await expect(page.locator('#btnResume')).toHaveAttribute('aria-describedby', 'localResumeMarketDetails');
        await expect(page.locator('#localSaveGenerationLabel')).toBeVisible();
        await expect(page.locator('#localSaveGenerationLabel')).toContainText('再開する保存データを選択');
        expect(await page.locator('#localSaveGeneration option').allTextContents()).toEqual([
            '最新の保存データ', '1回前の保存データ',
        ]);
        const layout = await page.evaluate(() => {
            const body = document.body;
            const title = document.getElementById('titleScreen');
            const titleHeader = title.querySelector('.title-header');
            const titleHeading = title.querySelector('#titleHeading');
            const canvas = document.getElementById('cityCanvas');
            const resumeButton = document.getElementById('btnResume');
            const removeButton = document.getElementById('btnDeleteSave');
            const resumeActions = document.querySelector('.local-resume-actions');
            const generationLabel = document.getElementById('localSaveGenerationLabel');
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
                design: document.documentElement.dataset.design,
                documentWidth: document.documentElement.scrollWidth,
                body: rect(body), bodyMaxWidth: getComputedStyle(body).maxWidth,
                title: rect(title), titleHeader: rect(titleHeader), titleHeading: rect(titleHeading),
                heroDisplay: getComputedStyle(title.querySelector('.sunset-hero')).display,
                canvasDisplay: getComputedStyle(canvas).display,
                canvas: rect(canvas), canvasCssWidth: getComputedStyle(canvas).width,
                canvasBufferWidth: canvas.width,
                resume: rect(resumeButton), remove: rect(removeButton),
                resumeActionsColumns: getComputedStyle(resumeActions).gridTemplateColumns,
                generationLabel: rect(generationLabel),
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
        expect(layout.titleHeader.top, JSON.stringify(layout)).toBeGreaterThanOrEqual(0);
        expect(layout.titleHeading.top, JSON.stringify(layout)).toBeGreaterThanOrEqual(0);
        if (viewport.name === 'short-phone-320') expect(layout.heroDisplay).toBe('none');
        expect(layout.design).toBe('cardboard');
        expect(layout.canvasDisplay).toBe('none');
        expect(layout.canvasBufferWidth).toBe(Math.min(1920, viewport.width));
        expect(layout.resume.width, JSON.stringify(layout)).toBeGreaterThanOrEqual(100);
        expect(layout.resume.height).toBeGreaterThanOrEqual(44);
        expect(layout.remove.width).toBeGreaterThanOrEqual(64);
        expect(layout.remove.height).toBeGreaterThanOrEqual(44);
        expect(layout.resumeActionsColumns.split(' ').length).toBe(2);
        expect(layout.generationLabel.bottom).toBeLessThanOrEqual(layout.resume.top);
        expect(layout.removeWhiteSpace).toBe('nowrap');
        expect(layout.generationSelectStyle).toEqual({
            background: 'rgb(255, 253, 245)', color: 'rgb(24, 52, 71)', colorScheme: 'light',
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

test('横持ちの夕暮れタイトルは中断対局の操作をバナー上に保つ', async ({ page }) => {
    await page.setViewportSize({ width: 844, height: 390 });
    await page.addInitScript(() => {
        localStorage.setItem('machikoroDesignTheme', 'plaza');
        localStorage.setItem('machikoroTutorialEnabled', 'false');
    });
    await page.route('https://pagead2.googlesyndication.com/**', route => route.fulfill({ status: 200, body: '' }));
    await page.goto('/');
    await page.evaluate(() => {
        pwaInstallDismiss();
        startGameNow(2, Array.from({ length: 2 }, (_, index) => ({ type: 'human', name: `街${index + 1}` })));
        cancelCpuSchedule('title-landscape-save-fixture');
        GameRuntimeState.runtime.setCpuPlayers([null, null]);
        acceptHotseatHandoff();
        saveGameState();
        GameRuntimeState.runtime.snapshot().game.players[0].coins += 1;
        saveGameState();
    });
    await page.reload();
    await expect(page.locator('#resumeSection')).toBeVisible();
    await page.evaluate(() => {
        document.body.classList.add('pwa-banner-open');
        document.getElementById('pwaInstallBanner').style.display = 'block';
    });
    const layout = await page.evaluate(() => {
        const rect = selector => document.querySelector(selector).getBoundingClientRect();
        const title = document.getElementById('titleScreen').getBoundingClientRect();
        const banner = rect('#pwaInstallBanner');
        const resume = rect('#btnResume');
        const remove = rect('#btnDeleteSave');
        return {
            titleBottom: title.bottom,
            bannerTop: banner.top,
            controlsBottom: Math.max(resume.bottom, remove.bottom),
            resumeHeight: resume.height,
            removeHeight: remove.height,
            columns: getComputedStyle(document.getElementById('resumeSection')).gridTemplateColumns,
        };
    });
    expect(layout.columns.split(' ').length, JSON.stringify(layout)).toBe(2);
    expect(layout.resumeHeight).toBeGreaterThanOrEqual(44);
    expect(layout.removeHeight).toBeGreaterThanOrEqual(44);
    expect(layout.controlsBottom, JSON.stringify(layout)).toBeLessThanOrEqual(Math.min(layout.titleBottom, layout.bannerTop));
});

test('長いオンライン再接続情報でもボタン列とタイトル幅を保つ', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 844 });
    await page.addInitScript(() => localStorage.setItem('machikoroDesignTheme', 'cardboard'));
    await page.goto('/');
    await page.evaluate(() => {
        const section = document.getElementById('onlineResumeSection');
        section.style.display = 'block';
        document.getElementById('onlineResumeDescription').textContent =
            `🌐 ${'オンライン参加者'.repeat(4)} として ROOM-ABCDEFGHIJKLMNOPQRST に再接続できます`;
    });
    await expect(page.getByRole('region', { name: '中断したオンライン対局' })).toBeVisible();
    const buttons = page.locator('.online-resume-actions button');
    await expect(buttons).toHaveCount(2);
    await expect(buttons.first()).toHaveCSS('white-space', 'nowrap');
    const layout = await page.evaluate(() => {
        const description = document.getElementById('onlineResumeDescription').getBoundingClientRect();
        const reconnect = document.querySelector('[data-ui-action="reconnectOnline"]').getBoundingClientRect();
        const remove = document.querySelector('[data-ui-action="deleteOnlineSession"]').getBoundingClientRect();
        return { width: document.documentElement.scrollWidth, description, reconnect, remove };
    });
    expect(layout.width).toBeLessThanOrEqual(320);
    expect(layout.description.width).toBeLessThan(300);
    expect(layout.reconnect.top).toBe(layout.remove.top);
    expect(layout.reconnect.height).toBeGreaterThanOrEqual(44);
    expect(layout.remove.height).toBeGreaterThanOrEqual(44);
});

test('保存再開の手番名が長くてもタイトル幅を押し広げない', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 844 });
    await page.addInitScript(() => localStorage.setItem('machikoroDesignTheme', 'cardboard'));
    await page.goto('/');
    await page.evaluate(() => {
        startGameNow(2, [{ type: 'human', name: 'PlayerNameWithoutSpaces'.repeat(5) },
            { type: 'human', name: '相手' }]);
        GameRuntimeState.runtime.setCpuPlayers([null, null]);
        GameRuntimeState.runtime.snapshot().game.currentPlayerIndex = 0;
        setTutorialEnabled(false);
        acceptHotseatHandoff();
        saveGameState();
    });
    await page.reload();
    await expect(page.locator('#resumeSection')).toBeVisible();
    await expect(page.locator('#localResumeMarketDetails')).toContainText('手番');
    await expect(page.locator('#localResumeMarketDetails')).toContainText('PlayerNameWithoutSpaces');
    const layout = await page.evaluate(() => {
        const details = document.getElementById('localResumeMarketDetails');
        const bounds = details.getBoundingClientRect();
        return { documentWidth: document.documentElement.scrollWidth,
            contentWidth: details.clientWidth, contentScrollWidth: details.scrollWidth,
            right: bounds.right, viewport: innerWidth };
    });
    expect(layout.documentWidth).toBeLessThanOrEqual(320);
    expect(layout.right).toBeLessThanOrEqual(320);
    expect(layout.contentScrollWidth).toBeLessThanOrEqual(layout.contentWidth + 1);
});

test('高コントラスト時のPWA更新通知は黒地白枠で読める', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 844 });
    await page.goto('/');
    await page.evaluate(() => {
        document.body.classList.add('accessibility-high-contrast');
        document.getElementById('pwaUpdateBanner').style.display = 'block';
    });
    const banner = page.locator('#pwaUpdateBanner');
    await expect(banner).toBeVisible();
    await expect(banner).toHaveCSS('background-color', 'rgb(0, 0, 0)');
    await expect(banner).toHaveCSS('border-top-color', 'rgb(255, 255, 255)');
    await expect(banner.locator('.pwa-banner-text')).toHaveCSS('color', 'rgb(255, 255, 255)');
    await expect(banner.locator('.pwa-banner-btn')).toHaveCSS('background-color', 'rgb(255, 230, 109)');
    await expect(banner.locator('.pwa-banner-dismiss')).toHaveCSS('background-color', 'rgb(0, 0, 0)');
});

test('CPU再準備中の再開ボタンは状態を伝えReduced Motionで回転を止める', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
        document.getElementById('resumeSection').style.display = 'flex';
        const button = document.getElementById('btnResume');
        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
        button.textContent = '対戦相手を準備中…';
    });
    const button = page.locator('#btnResume');
    await expect(button).toBeDisabled();
    await expect(button).toHaveAttribute('aria-busy', 'true');
    await expect(button).toContainText('対戦相手を準備中…');
    await expect(button).toHaveCSS('align-items', 'center');
    await expect(button).toHaveCSS('justify-content', 'center');
    const standardAnimation = await button.evaluate(element => getComputedStyle(element, '::after').animationName);
    expect(standardAnimation).toBe('resumeStatusSpin');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const animation = await button.evaluate(element => getComputedStyle(element, '::after').animationName);
    expect(animation).toBe('none');
});
