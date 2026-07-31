'use strict';

const UiTutorial = (() => {
    function getHints(current, options) {
        const affordableCards = options.cards.filter(card =>
            options.enabledCards.has(card.name) &&
            options.getShopStockCount(options.shopStock, card) > 0 &&
            current.coins >= card.cost &&
            !(card.color === "purple" && current.countCardIncludingDormant(card.name) > 0)
        ).sort((a, b) => a.cost - b.cost);
        const affordableLandmarks = Object.entries(current.landmarks)
            .filter(([name, built]) =>
                options.enabledLandmarks.has(name) &&
                !built &&
                name !== options.landmarkNames.YAKUSHO &&
                current.coins >= options.landmarkCost(name)
            )
            .sort((a, b) => options.landmarkCost(a[0]) - options.landmarkCost(b[0]));
        return { affordableCards, affordableLandmarks };
    }

    function getMessage(options) {
        const game = options.game;
        if (!game) return { title: "", body: "", tags: [] };
        const current = game.currentPlayer();
        const isMyTurn = !options.isOnlineGame || game.currentPlayerIndex === options.myPlayerIndex;
        const isCPUTurn = !!options.currentCpuPlayerAt(game.currentPlayerIndex);
        const levelText = options.tutorialLevel === 'advanced' ? '上級者向け' : '初心者向け';
        const phases = options.phases;
        if (!isMyTurn) {
            return {
                title: `${levelText}ガイド`,
                body: options.tutorialLevel === 'advanced'
                    ? `${current.name}の操作待ちです。相手の次ターン購入圏と、現在のログから発動帯の偏りを確認してください。`
                    : `${current.name}の操作待ちです。ログと盤面を見ながら次の購入候補を確認してください。`,
                tags: [current.name, '待機中']
            };
        }
        if (isCPUTurn) return { title: `${levelText}ガイド`, body: `${current.name}はCPUです。処理が終わるまで待ちます。ログで収入差を確認してください。`, tags: ['CPUターン'] };
        if (game.phase === phases.ROLL) return { title: `${levelText}ガイド`, body: options.tutorialLevel === 'advanced' ? "サイコロ前です。自分の発動帯と相手の赤カード帯を見て、今回は安全重視か上振れ狙いかを決めます。" : "サイコロを振って収入処理を開始します。赤・青・緑・紫の順に効果が解決されます。", tags: ['サイコロ前', `所持 ${current.coins}コイン`] };
        if (game.phase === phases.SELECT_DICE) return { title: `${levelText}ガイド`, body: options.tutorialLevel === 'advanced' ? "駅の選択です。2個は高コスト緑や港・遊園地と相性が良い一方、赤カード帯にも入りやすくなります。" : "駅の効果です。1個なら安全、2個なら高い出目や港・遊園地を狙えます。", tags: ['駅', '1個/2個選択'] };
        if (game.phase === phases.REROLL_CONFIRM) return { title: `${levelText}ガイド`, body: options.tutorialLevel === 'advanced' ? `電波塔です。現在 ${game.lastDiceResult}。自分の緑紫発動と相手の赤発動の損得差で判断します。` : `電波塔の効果です。現在の出目 ${game.lastDiceResult} を使うか、振り直すか決めてください。`, tags: ['電波塔', `現在 ${game.lastDiceResult}`] };
        if (game.phase === phases.HARBOR_CHOICE) return { title: `${levelText}ガイド`, body: options.tutorialLevel === 'advanced' ? `港の選択です。合計 ${game.lastDiceResult} を ${game.lastDiceResult + 2} に寄せることで、発動する青緑赤の帯がどう変わるか確認します。` : `港の効果です。合計 ${game.lastDiceResult} に +2 して有利な発動帯へ寄せられるか確認してください。`, tags: ['港', `候補 ${game.lastDiceResult}/${game.lastDiceResult + 2}`] };
        if (game.pendingTV > 0) return { title: `${levelText}ガイド`, body: options.tutorialLevel === 'advanced' ? "テレビ局です。最多所持コインだけでなく、次ターンに大型建設へ届く相手を崩すと効果的です。" : "テレビ局です。所持コインが多い相手を選ぶと効率が高いです。", tags: ['テレビ局'] };
        if (game.pendingBusiness > 0) return { title: `${levelText}ガイド`, body: options.tutorialLevel === 'advanced' ? "ビジネスセンターです。休業中カードを押し付けるか、高コスト施設を奪うかで盤面差を作れます。" : "ビジネスセンターです。同名カードでも個別に選べます。休業中カードを渡すかも含めて選んでください。", tags: ['ビジネスセンター', '個別選択'] };
        if (game.pendingCleaning > 0) return { title: `${levelText}ガイド`, body: options.tutorialLevel === 'advanced' ? "清掃業です。枚数が多い施設名を止めると収入差を広げやすいです。次の出目帯も意識してください。" : "清掃業です。選んだ名前の施設は全員分まとめて休業になります。枚数が多い施設を狙うと得です。", tags: ['清掃業'] };
        if (game.pendingMover > 0) return { title: `${levelText}ガイド`, body: options.tutorialLevel === 'advanced' ? "引越し屋です。低効率施設や休業中施設を渡して+4しつつ、相手の次ターン期待値を調整できます。" : "引越し屋です。休業中カードも渡せます。渡した先でも休業状態はそのまま残ります。", tags: ['引越し屋', '+4コイン'] };
        if (game.pendingRenovation > 0) return { title: `${levelText}ガイド`, body: options.tutorialLevel === 'advanced' ? "改装屋です。建て直し優先度の低いランドマークを戻して、今ターンの購入効率を優先します。" : "改装屋です。今すぐ8コインが欲しいときに、優先度の低いランドマークを戻します。", tags: ['改装屋', '+8コイン'] };
        if (game.pendingIT) return { title: `${levelText}ガイド`, body: options.tutorialLevel === 'advanced' ? "ITベンチャーです。奪取予定人数と次巡の安全性を見て、積立を厚くするか判断します。" : "ITベンチャーです。1コイン積み立てると、次回以降の奪取額が増えます。", tags: ['ITベンチャー'] };
        if (game.phase === phases.BUILD) {
            if (game.builtThisTurn) return { title: `${levelText}ガイド`, body: options.tutorialLevel === 'advanced' ? "建設済みです。ログ要約を見て、このターンの収支が狙い通りだったか確認してから終了します。" : "このターンの建設は終わっています。問題なければターン終了してください。", tags: ['建設済み'] };
            const { affordableCards, affordableLandmarks } = getHints(current, options);
            if (!affordableCards.length && !affordableLandmarks.length) {
                return { title: `${levelText}ガイド`, body: options.tutorialLevel === 'advanced' ? "建設不可です。次に欲しい帯の施設を決め、相手の赤カードを踏みにくい出目戦略を意識します。" : "今の所持コインでは建設できません。建設せずにターン終了して次の収入を狙います。", tags: ['建設不可'] };
            }
            const hints = [];
            if (affordableCards[0]) hints.push(`施設 ${affordableCards[0].name}（${affordableCards[0].cost}コイン）`);
            if (affordableLandmarks[0]) hints.push(`ランドマーク ${affordableLandmarks[0][0]}（${options.landmarkCost(affordableLandmarks[0][0])}コイン）`);
            return {
                title: `${levelText}ガイド`,
                body: options.tutorialLevel === 'advanced'
                    ? `建設フェーズです。最安候補は ${hints.join(" / ")} です。直近ログで伸びた帯をさらに太らせるか、弱い帯を補うかで選びます。`
                    : `建設フェーズです。${hints.join("、")} が候補です。ログを見て不足している収入帯を補ってください。`,
                tags: [`所持 ${current.coins}コイン`, `候補 ${affordableCards.length + affordableLandmarks.length}件`]
            };
        }
        return { title: `${levelText}ガイド`, body: "盤面を確認して次の行動を選んでください。", tags: [] };
    }

    function buildControlView(enabled, level) {
        const active = !!enabled;
        return Object.freeze({
            enabled: active,
            selectedLevel: level,
            toggleText: active ? '💡 ガイド ON' : '💡 ガイド OFF',
            levelText: level === 'advanced' ? '🧠 上級者' : '🌱 初心者',
            active,
        });
    }

    function buildHtml(message, escapeHtml) {
        const normalizedMessage = message || {};
        const tags = Array.isArray(normalizedMessage.tags) ? normalizedMessage.tags : [];
        return `
        <div class="tutorial-title">${escapeHtml(normalizedMessage.title || "GUIDE")}</div>
        <div class="tutorial-body">${escapeHtml(normalizedMessage.body || "")}</div>
        ${tags.length ? `<div class="tutorial-meta">${tags.map(tag => `<span class="tutorial-tag">${escapeHtml(tag)}</span>`).join("")}</div>` : ""}
    `;
    }

    return Object.freeze({ getHints, getMessage, buildControlView, buildHtml });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = UiTutorial;
if (typeof window !== 'undefined') window.UiTutorial = UiTutorial;
if (typeof globalThis !== 'undefined') globalThis.UiTutorial = UiTutorial;
