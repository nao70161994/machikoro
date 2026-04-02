// tests/server.test.js

const request = require('supertest');
const app = require('../app');

// XSS Prevention Tests

test('XSS Prevention: should not allow script tags in user inputs', async () => {
    const response = await request(app)
        .post('/submit')
        .send({ input: '<script>alert(1)</script>' });

    expect(response.text).not.toContain('<script>');
});

test('XSS Prevention: should not allow onerror attribute in inputs', async () => {
    const response = await request(app)
        .post('/submit')
        .send({ input: '<img src=x onerror=alert(1)>' });

    expect(response.text).not.toContain('onerror');
});

// Action Validation Tests

test('Action Validation: should return error for invalid action', async () => {
    const response = await request(app)
        .post('/action')
        .send({ action: 'invalidAction' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid action');
});

test('Action Validation: should allow valid actions', async () => {
    const response = await request(app)
        .post('/action')
        .send({ action: 'validAction' });

    expect(response.status).toBe(200);
});

// Cheat Detection Tests

test('Cheat Detection: should detect modified game state', async () => {
    const response = await request(app)
        .post('/cheat-detection')
        .send({ gameState: 'modified' });

    expect(response.body.cheatDetected).toBe(true);
});

test('Cheat Detection: should allow valid game states', async () => {
    const response = await request(app)
        .post('/cheat-detection')
        .send({ gameState: 'valid' });

    expect(response.body.cheatDetected).toBe(false);
});

// Server Functionality Tests

test('Server Functionality: should return status 200 for root endpoint', async () => {
    const response = await request(app).get('/');
    expect(response.status).toBe(200);
});

test('Server Functionality: should return a specific value from an endpoint', async () => {
    const response = await request(app).get('/specific-endpoint');
    expect(response.body.value).toBe('expectedValue');
});

test('Server Functionality: should handle requests without crashing', async () => {
    const response = await request(app).get('/another-endpoint');
    expect(response.status).toBe(200);
});

test('Server Functionality: should return error for unknown endpoint', async () => {
    const response = await request(app).get('/unknown');
    expect(response.status).toBe(404);
});

test('Server Functionality: should return JSON response for API endpoints', async () => {
    const response = await request(app).get('/api/data');
    expect(response.headers['content-type']).toMatch(/json/);
});

test('Server Functionality: should respond to OPTIONS requests', async () => {
    const response = await request(app).options('/api/data');
    expect(response.status).toBe(204);
});

test('Server Functionality: should allow POST requests with JSON payload', async () => {
    const response = await request(app)
        .post('/api/data')
        .send({ key: 'value' });
    expect(response.status).toBe(200);
});

