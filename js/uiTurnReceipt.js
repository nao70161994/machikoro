'use strict';

// Shared receipt renderer. Existing plaza classes remain the visual compatibility contract.
const UiTurnReceipt = (() => {
    function buildReceiptHtml(receipt, escapeHtml) {
        if (!receipt || typeof escapeHtml !== 'function') return '';
        const escape = value => escapeHtml(String(value));
        const name = index => index === 'pool' ? '分配プール' : index === null ? '銀行'
            : receipt.participantNames?.[index] || receipt.balances.find(balance => balance.index === index)?.name ||
                (Number.isInteger(index) ? `席${index + 1}` : '');
        const shortName = index => Number.isInteger(index) ? `席${index + 1}` : name(index);
        const important = receipt.important.map(event => `<li class="plaza-important-event plaza-important-${event.kind}">${escape(event.message)}</li>`).join('');
        const dice = receipt.dice ? `<p class="plaza-receipt-dice">出目 ${escape(receipt.dice.values.join('+') || receipt.dice.base)}${receipt.dice.values.length > 1 ? `=${escape(receipt.dice.base)}` : ''}${receipt.dice.harbor ? ` → ${escape(receipt.dice.effective)}（港）` : ''}${receipt.dice.rerolled ? '（振り直し）' : ''}</p>` : '';
        const balances = receipt.balances.map(balance => `<li data-receipt-player-index="${balance.index}">${escape(balance.name)}：ログ確認分 収入${escape(balance.income)} / 支払い${escape(balance.payment)}（確認済み施設差引${balance.facilityNet >= 0 ? '+' : ''}${escape(balance.facilityNet)}）</li>`).join('');
        const activations = receipt.activations.map(event => {
            const route = `${name(event.from)} → ${name(event.to)}`;
            const sign = event.to === null ? '-' : event.from === null ? '+' : '';
            const owner = Number.isInteger(event.owner) ? `${name(event.owner)}の` : '';
            return `<li class="plaza-receipt-activation">${escape(route)}：${escape(owner + event.subject)} ${sign}${escape(event.amount)}コイン${event.count > 1 ? `（${escape(event.count)}回）` : ''}</li>`;
        }).join('');
        const incomplete = receipt.incomplete
            ? `<p class="plaza-receipt-incomplete">未集計の記録${escape(receipt.unparsedCount)}件。以下の収支は確認できた分のみです。</p>` : '';
        const omitted = receipt.omittedActivations ? `<li>ほか${escape(receipt.omittedActivations)}件（履歴で確認）</li>` : '';
        const fallback = receipt.unparsed.map(message => `<li class="plaza-receipt-fallback">${escape(message)}</li>`).join('');
        const headline = receipt.important[0]
            ? `<p class="plaza-important-event plaza-important-${receipt.important[0].kind}">${escape(receipt.important[0].message)}</p>` : '';
        const shortBalances = receipt.balances.map(balance => {
            const net = balance.income - balance.payment;
            return `<span>${escape(balance.name)} ${net >= 0 ? '+' : ''}${escape(net)}</span>`;
        }).join('');
        // Give the compact, always-visible line a sample of the whole chain.
        // Filtering to the active player hid opponent-owned red/blue facilities.
        const activationSummaries = new Map();
        for (const event of receipt.activations) {
            if (!event.facility) continue;
            const repeats = Number.isSafeInteger(event.count) && event.count > 0 ? event.count : 1;
            if (event.activation) {
                const previous = activationSummaries.get(event.activation);
                activationSummaries.set(event.activation, previous
                    ? { ...previous, repeats: Math.max(previous.repeats, repeats) }
                    : { event, repeats, typed: true });
            } else {
                // Legacy log entries do not identify a facility owner or a
                // shared activation across multiple payment routes.
                activationSummaries.set(Symbol(), { event, repeats, typed: false });
            }
        }
        const visibleActivations = [...activationSummaries.values()];
        const facilityActivationCount = visibleActivations.reduce((total, summary) => summary.typed &&
            Number.isSafeInteger(total + summary.repeats) ? total + summary.repeats : total, 0);
        const featured = visibleActivations.slice(0, 3).map(summary => ({
            ...summary.event, count: summary.repeats, typedActivation: summary.typed,
        }));
        const featuredHtml = receipt.turnContextKnown !== false && (featured.length || facilityActivationCount) ? `<p class="plaza-receipt-featured">${facilityActivationCount
            ? `<span class="plaza-receipt-activation-count">施設発動${escape(facilityActivationCount)}回</span>` : ''}${featured.map(event => {
            const route = `${shortName(event.from)} → ${shortName(event.to)}`;
            const owner = Number.isInteger(event.owner) ? `${shortName(event.owner)}・` : '';
            const sign = event.amount === 0 ? '' : event.from === null ? '+' : event.to === null ? '−' : '→';
            const repeat = event.count > 1 ? `（${escape(event.count)}${event.typedActivation ? '回' : '件'}）` : '';
            const flow = event.amount === 0 ? 'neutral'
                : event.from === null ? 'incoming' : event.to === null ? 'outgoing' : 'neutral';
            const routeDescription = flow === 'outgoing' ? `${name(event.from)}から銀行へ支払い`
                : flow === 'incoming' ? `銀行から${name(event.to)}へ受け取り`
                    : event.amount ? `${name(event.from)}から${name(event.to)}へ移動` : '移動なし';
            const description = `${Number.isInteger(event.owner) ? `${name(event.owner)}の` : ''}${event.subject}。${routeDescription}`;
            const largeReceipt = event.to !== null && event.amount >= 5 ? ' data-large="true"' : '';
            return `<span class="plaza-receipt-transfer" data-flow="${flow}"${largeReceipt} aria-label="${escape(`${description}、${event.amount}コイン`)}" title="${escape(description)}"><strong>${escape(owner + event.subject)}</strong> ${escape(route)} <b>${sign}${escape(event.amount)}コイン</b>${repeat}</span>`;
        }).join(' / ')}</p>` : '';
        const hasDetails = receipt.important.length || receipt.activations.length || receipt.unparsed.length;
        return `<section class="plaza-event-receipt" aria-label="今回の出目と確認できた収支">${headline}${dice}${featuredHtml}<p class="plaza-receipt-totals">${shortBalances}${receipt.incomplete ? '<span>特殊効果は詳細へ</span>' : ''}</p>${hasDetails ? `<details class="plaza-receipt-details"><summary>発動・支払いの内訳${receipt.incomplete ? '（未集計あり）' : ''}</summary>${incomplete}<ul class="plaza-important-events">${important}</ul><ul class="plaza-receipt-balances">${balances}</ul><ul class="plaza-receipt-activations">${activations}${omitted}${fallback}</ul></details>` : ''}</section>`;
    }
    return Object.freeze({ buildHtml: buildReceiptHtml });
})();
if (typeof module !== 'undefined' && module.exports) module.exports = UiTurnReceipt;
if (typeof window !== 'undefined') window.UiTurnReceipt = UiTurnReceipt;
