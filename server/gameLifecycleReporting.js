'use strict';

function makeGameLifecycleReporting({ truncateText }) {
    function lifecycleEventTitle(event) {
        if (event === 'play-start') return '[ダイスシティ] Game Started';
        if (event === 'victory') return '[ダイスシティ] Victory';
        return '[ダイスシティ] Game Finished';
    }

    function normalizeLifecycleMode(value) {
        return value === 'online' ? 'online' : 'local';
    }

    function normalizeLifecycleInteger(value, min, max, fallback = 0) {
        const number = Number(value);
        if (!Number.isInteger(number)) return fallback;
        return Math.max(min, Math.min(max, number));
    }

    function normalizeLifecycleSessionId(value) {
        return String(value || '')
            .trim()
            .replace(/[^A-Za-z0-9._:-]/g, '')
            .slice(0, 80);
    }

    function normalizeLifecycleCpuDifficulty(value) {
        const text = String(value || '').trim();
        return ['weak', 'normal', 'strong', 'expert', 'rl'].includes(text) ? text : '';
    }

    function lifecycleCpuDifficultyLabel(difficulty) {
        if (difficulty === 'weak') return 'Weak';
        if (difficulty === 'normal') return 'Normal';
        if (difficulty === 'strong') return 'Strong';
        if (difficulty === 'rl') return 'RL';
        if (difficulty === 'expert') return 'Expert';
        return '';
    }

    function normalizeGameLifecyclePayload(input, now = Date.now()) {
        const payload = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
        const event = String(payload.event || '').trim();
        if (!['play-start', 'play-finish', 'victory'].includes(event)) {
            return { ok: false, reason: 'invalid_event' };
        }
        const playerCount = normalizeLifecycleInteger(payload.playerCount, 2, 10, 0);
        if (playerCount < 2) return { ok: false, reason: 'invalid_player_count' };
        const cpuCount = normalizeLifecycleInteger(payload.cpuCount, 0, playerCount, 0);
        const winnerKind = ['human', 'cpu'].includes(payload.winnerKind) ? payload.winnerKind : '';
        const winnerCpuDifficulty = winnerKind === 'cpu'
            ? normalizeLifecycleCpuDifficulty(payload.winnerCpuDifficulty)
            : '';
        const sessionId = normalizeLifecycleSessionId(payload.sessionId);
        if (!sessionId) return { ok: false, reason: 'invalid_session_id' };
        return {
            ok: true,
            report: {
                event,
                mode: normalizeLifecycleMode(payload.mode),
                playerCount,
                cpuCount,
                turn: normalizeLifecycleInteger(payload.turn, 0, 10000, 0),
                winnerKind,
                winnerCpuDifficulty,
                sessionId,
                appVersion: truncateText(payload.appVersion || '', 80),
                timestamp: new Date(now).toISOString(),
            },
        };
    }

    function appendLifecycleWinnerLines(lines, report) {
        if (!report.winnerKind) return;
        lines.push('winnerKind=' + report.winnerKind);
        if (report.winnerKind === 'cpu' && report.winnerCpuDifficulty) {
            lines.push('winnerDifficulty=' + report.winnerCpuDifficulty);
        }
    }

    function formatNtfyGameLifecycleMessage(report) {
        const lines = [
            'event=' + report.event,
            'mode=' + report.mode,
            'players=' + report.playerCount,
            'cpu=' + report.cpuCount,
        ];
        appendLifecycleWinnerLines(lines, report);
        if (report.turn) lines.push('turn=' + report.turn);
        if (report.appVersion) lines.push('version=' + report.appVersion);
        return lines.join('\n');
    }

    return Object.freeze({
        lifecycleEventTitle,
        normalizeLifecycleMode,
        normalizeLifecycleInteger,
        lifecycleCpuDifficultyLabel,
        normalizeLifecycleSessionId,
        normalizeLifecycleCpuDifficulty,
        normalizeGameLifecyclePayload,
        formatNtfyGameLifecycleMessage,
    });
}

module.exports = { makeGameLifecycleReporting };
