const CPUDiagnostics = Object.freeze({
    profileMeasure(cpu, label, fn) {
        if (!cpu.profileStats) return fn();
        const startedAt = CPU._nowMs();
        try {
            return fn();
        } finally {
            const entry = cpu.profileStats[label] || (cpu.profileStats[label] = { calls: 0, timeMs: 0 });
            entry.calls++;
            entry.timeMs = Number((entry.timeMs + (CPU._nowMs() - startedAt)).toFixed(3));
        }
    },

    profileCount(cpu, label, amount = 1) {
        if (!cpu.profileStats) return;
        const entry = cpu.profileStats[label] || (cpu.profileStats[label] = { count: 0 });
        entry.count = (entry.count || 0) + amount;
    },

    traceV2Simple(cpu, key, amount = 1) {
        if (!cpu.expertTraceStats || !cpu._isExpertV2Simple()) return;
        cpu.expertTraceStats[key] = (cpu.expertTraceStats[key] || 0) + amount;
    },

    traceV2SimpleBuildOption(cpu, prefix, option) {
        if (!option) return;
        if (option.type === 'landmark') {
            cpu._traceV2Simple(`${prefix}:landmark:${option.name}`);
            return;
        }
        if (option.type === 'card' && option.card) {
            cpu._traceV2Simple(`${prefix}:card:${option.card.name}`);
        }
    },

    traceV2SimpleBuildBreakdown(cpu, option, breakdown, chosen = false) {
        if (!cpu.expertTraceStats || !cpu._isExpertV2Simple() || !option || !breakdown) return;
        const name = option.type === 'card' && option.card ? option.card.name : option.name;
        if (!name) return;
        const prefix = `buildBreakdown:${option.type}:${name}`;
        cpu._traceV2Simple(`${prefix}:considered`);
        cpu._traceV2Simple(`${prefix}:baseEvTotal`, breakdown.baseEv || 0);
        cpu._traceV2Simple(`${prefix}:comboUnlockBonusTotal`, breakdown.comboUnlockBonus || 0);
        cpu._traceV2Simple(`${prefix}:tempoBonusTotal`, breakdown.tempoBonus || 0);
        cpu._traceV2Simple(`${prefix}:scoreTotal`, breakdown.total || 0);
        if (chosen) cpu._traceV2Simple(`${prefix}:chosen`);
    },

    profileSummary(profileStats) {
        if (!profileStats) return [];
        return Object.entries(profileStats)
            .map(([label, value]) => Object.assign({ label }, value))
            .sort((a, b) => (b.timeMs || 0) - (a.timeMs || 0) || (b.count || 0) - (a.count || 0) || a.label.localeCompare(b.label));
    },
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CPUDiagnostics };
}
