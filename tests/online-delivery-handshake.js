const path = require('path');

const clientBundlePath = path.join(path.dirname(require.resolve('socket.io/package.json')), 'client-dist', 'socket.io.js');
const connectClient = require(clientBundlePath);
const originArg = process.argv.find(arg => arg.startsWith('--origin='));
const originIndex = process.argv.indexOf('--origin');
const origin = originArg
    ? originArg.slice('--origin='.length)
    : (originIndex >= 0 ? process.argv[originIndex + 1] : '');

if (!origin) {
    console.error('usage: node tests/online-delivery-handshake.js --origin https://example.com');
    process.exit(2);
}

const socket = connectClient(origin, {
    forceNew: true,
    reconnection: false,
    timeout: 30000,
    transports: ['websocket'],
});
const timer = setTimeout(() => {
    socket.close();
    console.error('Socket.IO handshake timed out: ' + origin);
    process.exit(1);
}, 35000);
socket.once('connect', () => {
    clearTimeout(timer);
    console.log('Socket.IO handshake ok: ' + origin);
    socket.close();
});
socket.once('connect_error', error => {
    clearTimeout(timer);
    console.error('Socket.IO handshake failed: ' + error.message);
    socket.close();
    process.exit(1);
 });
