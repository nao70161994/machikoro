'use strict';

/**
 * Selects the extracted effect executor only when its plan is authoritative
 * and the executor is available. Legacy diagnostics remain stable for callers.
 * @param {{enabled?: boolean, authoritativePlan?: boolean, executorAvailable?: boolean,
 *     planFallbackReason?: string, preserveEmptyPlanFallbackReason?: boolean}} input
 * @returns {{source: string, fallbackReason: string}}
 */
function selectOnlineEffectExecutor(input = {}) {
    const enabled = input.enabled === true;
    const authoritativePlan = input.authoritativePlan === true;
    const executorAvailable = input.executorAvailable === true;
    const useExecutor = enabled && authoritativePlan && executorAvailable;
    return Object.freeze({
        source: useExecutor ? 'executor' : (enabled ? 'legacy-fallback' : 'legacy'),
        fallbackReason: useExecutor || !enabled
            ? ''
            : (!authoritativePlan
                ? String(input.planFallbackReason || (input.preserveEmptyPlanFallbackReason === true
                    ? '' : 'effect-plan-not-authoritative'))
                : 'executor-unavailable'),
    });
}

const OnlineEffectAuthority = Object.freeze({ selectExecutor: selectOnlineEffectExecutor });

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { OnlineEffectAuthority };
}
if (typeof window !== 'undefined') window.OnlineEffectAuthority = OnlineEffectAuthority;
if (typeof globalThis !== 'undefined') globalThis.OnlineEffectAuthority = OnlineEffectAuthority;
