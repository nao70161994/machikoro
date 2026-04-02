const request = require('supertest');
const app = require('../app'); // Adjust the path based on your app structure

describe('Server Tests', () => {
    // XSS Protection Tests
    it('should prevent XSS attacks in input fields', async () => {
        const res = await request(app)
            .post('/api/input')
            .send({ input: '<script>alert("XSS")</script>' });
        expect(res.statusCode).toEqual(400); // Expect a bad request response
    });

    // Action Validation Tests
    it('should validate actions before processing', async () => {
        const res = await request(app)
            .post('/api/action')
            .send({ actionType: 'invalidAction' });
        expect(res.statusCode).toEqual(400); // Invalid action
    });

    it('should allow valid actions', async () => {
        const res = await request(app)
            .post('/api/action')
            .send({ actionType: 'validAction' });
        expect(res.statusCode).toEqual(200); // Valid action processed
    });

    // Cheat Detection Tests
    it('should detect cheat attempts', async () => {
        const res = await request(app)
            .post('/api/game')
            .send({ actions: ['invalidMove'] });
        expect(res.body).toHaveProperty('cheatDetected', true);
    });

    it('should not detect cheats on valid plays', async () => {
        const res = await request(app)
            .post('/api/game')
            .send({ actions: ['validMove'] });
        expect(res.body).toHaveProperty('cheatDetected', false);
    });

    // Room Management Tests
    it('should create a room successfully', async () => {
        const res = await request(app)
            .post('/api/rooms')
            .send({ roomName: 'Test Room' });
        expect(res.statusCode).toEqual(201); // Room created
    });

    it('should not create a duplicate room', async () => {
        await request(app)
            .post('/api/rooms')
            .send({ roomName: 'Test Room' });
        const res = await request(app)
            .post('/api/rooms')
            .send({ roomName: 'Test Room' });
        expect(res.statusCode).toEqual(409); // Conflict on duplicate
    });

    it('should list all rooms', async () => {
        const res = await request(app).get('/api/rooms');
        expect(res.statusCode).toEqual(200);
        expect(Array.isArray(res.body)).toBeTruthy(); // Expect an array of rooms
    });

    it('should delete a room successfully', async () => {
        const res = await request(app)
            .delete('/api/rooms/Test Room');
        expect(res.statusCode).toEqual(200); // Room deleted
    });

    it('should prevent deletion of non-existent rooms', async () => {
        const res = await request(app)
            .delete('/api/rooms/NonExistentRoom');
        expect(res.statusCode).toEqual(404); // Not found
    });

    it('should manage room settings correctly', async () => {
        const res = await request(app)
            .put('/api/rooms/Test Room/settings')
            .send({ setting: 'newValue' });
        expect(res.statusCode).toEqual(200); // Settings updated
    });

    it('should fail to manage settings of non-existent rooms', async () => {
        const res = await request(app)
            .put('/api/rooms/NonExistentRoom/settings')
            .send({ setting: 'newValue' });
        expect(res.statusCode).toEqual(404); // Not found
    });

    // Additional tests can be added here
});
