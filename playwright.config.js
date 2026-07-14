const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
    testDir: './tests/browser',
    timeout: 45000,
    expect: { timeout: 10000 },
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'line',
    use: {
        baseURL: 'http://127.0.0.1:3210',
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
    },
    projects: [
        {
            name: 'mobile-webkit',
            use: {
                ...devices['iPhone 13'],
                serviceWorkers: 'allow',
            },
        },
    ],
    webServer: {
        command: 'PORT=3210 node server.js',
        url: 'http://127.0.0.1:3210/api/version',
        reuseExistingServer: !process.env.CI,
    },
});
