'use strict';

const UiIncomePreviewPanel = (() => {
    function escape(value) {
        return String(value ?? '').replace(/[&<>"']/g, character =>
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
    }
    function amount(value) {
        if (!Number.isFinite(value)) return '—';
        const rounded = Math.round(value * 100) / 100;
        return `${rounded > 0 ? '+' : ''}${rounded}`;
    }
    function buildResultHtml(result) {
        if (!result?.available) return '<p class="income-preview-unavailable">この状態では正確に試算できません。対戦を進めてから再度お試しください。</p>';
        const rows = result.rows.map(row => {
            const range = row.target.min !== row.target.max
                ? `<small>範囲 ${escape(amount(row.target.min))}〜${escape(amount(row.target.max))}</small>` : '';
            const pending = row.pending.map(note => escape(note.label)).join('、');
            return `<tr><th scope="row">${row.dice}${row.harborApplied ? ` → ${row.effectiveDice}（港）` : ''}</th><td>${escape(amount(row.target.mean))}${range}</td><td>${pending || '選択なし'}</td></tr>`;
        }).join('');
        return `<p class="income-preview-expected">出目の確率を含む平均：${escape(amount(result.target.mean))}コイン</p><div class="income-preview-table-scroll"><table><caption>各出目が出た場合の純収支（別ダイスは確率平均）</caption><thead><tr><th scope="col">出目</th><th scope="col">この出目の平均</th><th scope="col">未解決の選択効果</th></tr></thead><tbody>${rows}</tbody></table></div><ul class="income-preview-notes">${result.notes.map(note => `<li>${escape(note)}</li>`).join('')}</ul>`;
    }
    function fingerprint(game) {
        return JSON.stringify([game.currentPlayerIndex, game.turnCount, game.phase,
            [...(game.enabledLandmarks || [])], game.players.map(player => {
                const dormant = new Set(player.dormantCards || []);
                return [player.name, player.coins, player.itVentureCoins, player.hasYakusho,
                    player.landmarks, player.cards.map(card => [card.name, dormant.has(card)])];
            })]);
    }
    function create(dependencies) {
        const d = dependencies || {};
        if (!d.document || typeof d.document.getElementById !== 'function' ||
                typeof d.getGame !== 'function' || typeof d.getSelectedPlayerIndex !== 'function' ||
                !d.preview || typeof d.preview.evaluate !== 'function' ||
                typeof d.stationName !== 'string' || typeof d.harborName !== 'string') {
            throw new TypeError('Income preview panel adapters are required');
        }
        let root = null, signature = null, selected = null, initialized = false;
        let gameRef = null, sessionRef = null;
        const query = selector => root?.querySelector(selector);
        const clear = () => {
            const output = query('[data-income-result]');
            if (output) output.innerHTML = '';
        };
        const readIndex = (selector, game) => {
            const index = Number(query(selector)?.value);
            return Number.isInteger(index) && index >= 0 && index < game.players.length ? index : 0;
        };
        function updateDiceOptions(game, preferredDice) {
            const roller = readIndex('[data-income-roller]', game);
            const dice = query('[data-income-dice]');
            const harbor = query('[data-income-harbor]');
            if (!dice || !harbor) return;
            const two = !!game.players[roller].landmarks[d.stationName];
            const previous = preferredDice || dice.value;
            dice.innerHTML = `<option value="1">1個振り</option>${two ? '<option value="2">2個振り（駅）</option>' : ''}`;
            dice.value = two && previous === '2' ? '2' : '1';
            harbor.disabled = dice.value !== '2' || !game.players[roller].landmarks[d.harborName];
            if (harbor.disabled) harbor.checked = false;
        }
        function refresh(game = d.getGame()) {
            if (!root || !game?.players?.length) {
                if (root) { root.innerHTML = ''; signature = null; selected = null; gameRef = null; sessionRef = null; }
                return false;
            }
            const focus = d.document.activeElement;
            const focusedField = focus && root.contains?.(focus) ? focus.dataset?.incomeField : null;
            const previousDice = query('[data-income-dice]')?.value;
            const previousHarbor = query('[data-income-harbor]')?.checked === true;
            const target = readIndex('[data-income-target]', game);
            const roller = query('[data-income-roller]') ? readIndex('[data-income-roller]', game) : game.currentPlayerIndex;
            const requested = d.getSelectedPlayerIndex();
            const nextSelected = Number.isInteger(requested) && game.players[requested] ? requested : game.currentPlayerIndex;
            const nextSignature = fingerprint(game);
            const nextSession = typeof d.getSession === 'function' ? d.getSession() : game;
            if (signature === nextSignature && selected === nextSelected && gameRef === game && sessionRef === nextSession) return false;
            const isNewGame = sessionRef !== nextSession;
            const nextTarget = isNewGame || selected !== nextSelected ? nextSelected : target;
            const nextRoller = isNewGame ? game.currentPlayerIndex : roller;
            const names = game.players.map((player, index) => `<option value="${index}">席${index + 1} ${escape(player.name)}</option>`).join('');
            root.innerHTML = `<h3>試算する条件</h3><p class="income-preview-help">現在の所持金・施設での試算です。選択効果は未解決として表示します。</p><div class="income-preview-controls"><label>収支を見る人<select data-income-target data-income-field="target" aria-label="収支を見る人">${names}</select></label><label>振る人<select data-income-roller data-income-field="roller" aria-label="ダイスを振る人">${names}</select></label><label>ダイス<select data-income-dice data-income-field="dice" aria-label="ダイスの数"></select></label><label><input type="checkbox" data-income-harbor data-income-field="harbor">港：合計10以上で毎回+2する別候補</label><button type="button" data-income-calculate data-income-field="calculate">選んだ条件で試算する</button></div><div data-income-result></div>`;
            query('[data-income-target]').value = String(nextTarget);
            query('[data-income-roller]').value = String(nextRoller);
            updateDiceOptions(game, !isNewGame ? previousDice : null);
            if (!isNewGame && !query('[data-income-harbor]').disabled) {
                query('[data-income-harbor]').checked = previousHarbor;
            }
            sessionRef = nextSession;
            signature = nextSignature; selected = nextSelected; gameRef = game;
            if (focusedField) query(`[data-income-field="${focusedField}"]`)?.focus({ preventScroll: true });
            return true;
        }
        function init() {
            if (initialized) return true;
            root = d.document.getElementById('plazaPlayerInsightsIncome');
            if (!root) return false;
            root.addEventListener('change', () => {
                const game = d.getGame();
                if (!game?.players?.length) return;
                updateDiceOptions(game);
                clear();
            });
            root.addEventListener('click', event => {
                if (!event.target?.closest?.('[data-income-calculate]')) return;
                const game = d.getGame();
                // Revalidate stale controls before calculating; a state update
                // must never leave a previous receipt displayed as current.
                refresh(game);
                if (!game?.players?.length) return;
                const result = d.preview.evaluate(game, {
                    playerIndex: readIndex('[data-income-target]', game),
                    rollerIndex: readIndex('[data-income-roller]', game),
                    diceCount: Number(query('[data-income-dice]').value),
                    harborBonus: query('[data-income-harbor]').checked === true,
                });
                const targetName = game.players[readIndex('[data-income-target]', game)].name;
                const rollerName = game.players[readIndex('[data-income-roller]', game)].name;
                const condition = `<p class="income-preview-context">${escape(targetName)}の収支 / ${escape(rollerName)}が${escape(query('[data-income-dice]').value)}個振り${query('[data-income-harbor]').checked ? '（港で10以上は+2）' : ''}</p>`;
                query('[data-income-result]').innerHTML = condition + buildResultHtml(result);
            });
            initialized = true;
            refresh();
            return true;
        }
        return Object.freeze({ init, refresh });
    }
    return Object.freeze({ create, buildResultHtml });
})();
if (typeof module !== 'undefined' && module.exports) module.exports = UiIncomePreviewPanel;
if (typeof window !== 'undefined') window.UiIncomePreviewPanel = UiIncomePreviewPanel;
if (typeof globalThis !== 'undefined') globalThis.UiIncomePreviewPanel = UiIncomePreviewPanel;
