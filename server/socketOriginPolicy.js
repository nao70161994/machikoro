'use strict';

function socketRequestHeader(req, name) {
    if (!req) return '';
    const headers = req.headers || {};
    return String(headers[name.toLowerCase()] || headers[name] || '').trim();
}

function normalizeSocketOrigin(value) {
    const text = String(value || '').trim();
    if (!text) return '';
    try {
        return new URL(text).origin;
    } catch (_error) {
        return '';
    }
}

function socketRequestBaseOrigin(req) {
    const host = socketRequestHeader(req, 'host');
    if (!host) return '';
    const forwardedProto = socketRequestHeader(req, 'x-forwarded-proto')
        .split(',')[0]
        .trim();
    const protocol = forwardedProto || (req && req.socket && req.socket.encrypted ? 'https' : 'http');
    return normalizeSocketOrigin(protocol + '://' + host);
}

function socketAllowedOrigins(req, env = process.env) {
    const configured = String(env.SOCKET_ALLOWED_ORIGINS || '')
        .split(',')
        .map(normalizeSocketOrigin)
        .filter(Boolean);
    const sameOrigin = socketRequestBaseOrigin(req);
    if (sameOrigin) configured.push(sameOrigin);
    return Array.from(new Set(configured));
}

function isSocketOriginAllowed(req, env = process.env) {
    const rawOrigin = socketRequestHeader(req, 'origin');
    if (!rawOrigin) return true;
    const origin = normalizeSocketOrigin(rawOrigin);
    return !!origin && socketAllowedOrigins(req, env).includes(origin);
}

function makeSocketAllowRequest(env = process.env) {
    return function allowSocketRequest(req, callback) {
        callback(null, isSocketOriginAllowed(req, env));
    };
}

module.exports = Object.freeze({
    socketRequestHeader,
    normalizeSocketOrigin,
    socketRequestBaseOrigin,
    socketAllowedOrigins,
    isSocketOriginAllowed,
    makeSocketAllowRequest,
});
