'use strict';

// Shared receipt renderer. Existing plaza classes remain the visual compatibility contract.
const UiTurnReceipt = (() => {
    function buildReceiptHtml(receipt, escapeHtml) {
        if (!receipt || typeof escapeHtml !== 'function') return '';
        const escape = value => escapeHtml(String(value));
        const name = index => receipt.participantNames?.[index] || receipt.balances.find(balance => balance.index === index)?.name || '';
        const important = receipt.important.map(event => `<li class="plaza-important-event plaza-important-${event.kind}">${escape(event.message)}</li>`).join('');
        const dice = receipt.dice ? `<p class="plaza-receipt-dice">出目 ${escape(receipt.dice.values.join('+') || receipt.dice.base)}${receipt.dice.values.length > 1 ? `=${escape(receipt.dice.base)}` : ''}${receipt.dice.harbor ? ` → ${escape(receipt.dice.effective)}（港）` : ''}${receipt.dice.rerolled ? '（振り直し）' : ''}</p>` : '';
        const balances = receipt.balances.map(balance => `<li data-receipt-player-index="${balance.index}">${escape(balance.name)}：ログ確認分 収入${escape(balance.income)} / 支払い${escape(balance.payment)}（確認済み施設差引${balance.facilityNet >= 0 ? '+' : ''}${escape(balance.facilityNet)}）</li>`).join('');
        const activations = receipt.activations.map(event => {
            const route = event.from !== null && event.to !== null
                ? `${name(event.from)} → ${name(event.to)}` : name(event.to === null ? event.from : event.to);
            const sign = event.to === null ? '-' : event.from === null ? '+' : '';
            return `<li class="plaza-receipt-activation">${escape(route)}：${escape(event.subject)} ${sign}${escape(event.amount)}コイン${event.count > 1 ? `（${escape(event.count)}回）` : ''}</li>`;
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
        const featured = receipt.activations.filter(event => event.facility &&
            (event.from === receipt.actorIndex || event.to === receipt.actorIndex)).slice(0, 2);
        const featuredHtml = featured.length ? `<p class="plaza-receipt-featured">${featured.map(event => `${escape(event.subject)}${event.count > 1 ? ` 発動${escape(event.count)}回` : ''} ${event.amount === 0 ? '' : event.from === receipt.actorIndex ? '-' : '+'}${escape(event.amount)}コイン`).join(' / ')}</p>` : '';
        const hasDetails = receipt.important.length || receipt.activations.length || receipt.unparsed.length;
        return `<section class="plaza-event-receipt" aria-label="今回の出目と確認できた収支">${headline}${dice}${featuredHtml}<p class="plaza-receipt-totals">${shortBalances}${receipt.incomplete ? '<span>特殊効果は詳細へ</span>' : ''}</p>${hasDetails ? `<details class="plaza-receipt-details"><summary>発動・支払いの内訳${receipt.incomplete ? '（未集計あり）' : ''}</summary>${incomplete}<ul class="plaza-important-events">${important}</ul><ul class="plaza-receipt-balances">${balances}</ul><ul class="plaza-receipt-activations">${activations}${omitted}${fallback}</ul></details>` : ''}</section>`;
    }
    return Object.freeze({ buildHtml: buildReceiptHtml });
})();
if (typeof module !== 'undefined' && module.exports) module.exports = UiTurnReceipt;
if (typeof window !== 'undefined') window.UiTurnReceipt = UiTurnReceipt;
