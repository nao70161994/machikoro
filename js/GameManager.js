class GameManager {
    constructor(playerCount) {
        this.players = [];
        this.currentPlayerIndex = 0;
        this.lastDiceResult = 0;
        this.lastDice1 = 0;
        this.lastDice2 = 0;
        this.phase = "roll";
        this.log = [];
        this.builtThisTurn = false;
        this.pendingTV = 0;
        this.pendingBusiness = 0;
        this.pendingCleaning = 0;
        this.pendingMover = 0;
        this.pendingRenovation = 0;
        this.pendingIT = false;
        this.usedReroll = false;
        this.pendingTunaDice = null;
        this.turnCount = 0;
        this.enabledLandmarks = new Set(Player.landmarkNames());
        this.hadAmusementParkAtRoll = false;

        for (let i = 0; i < playerCount; i++) {
            const p = new Player(`プレイヤー${i + 1}`);
            p.addCard(new Card("麦畑", 1, [1], 1, "blue", "農園", "normal"));
            p.addCard(new Card("パン屋", 1, [2,3], 1, "green", "飲食店", "normal"));
            this.players.push(p);
        }

    }

    currentPlayer() { return this.players[this.currentPlayerIndex]; }

    _resolveCardRef(player, ref) {
        if (!player) return null;
        if (Number.isInteger(ref)) {
            const card = player.cards[ref];
            return (card && card.category !== "大施設") ? card : null;
        }
        return player.cards.find(c => c.name === ref && c.category !== "大施設") || null;
    }

    rollDice(forceDice = null, tunaDice = null) {
        if (this.phase !== "roll") return;
        if (this.currentPlayer().landmarks["駅"]) {
            this.phase = "selectDice";
            this.pendingTunaDice = tunaDice;
            this.addLog(`🚉 駅：1個か2個か選んでください`);
        } else {
            const d1 = forceDice !== null ? forceDice : Math.floor(Math.random() * 6) + 1;
            this.lastDice1 = 0;
            this.lastDice2 = 0;
            this.lastDiceResult = d1;
            this.hadAmusementParkAtRoll = this.currentPlayer().landmarks["遊園地"];
            this.addLog(`🎲 ${d1} が出ました`);
            this.afterRoll(tunaDice);
        }
    }

    selectDiceCount(useTwo, forceDice1 = null, forceDice2 = null, tunaDice = null) {
        if (this.phase !== "selectDice") return;
        if (useTwo) {
            const d1 = forceDice1 !== null ? forceDice1 : Math.floor(Math.random() * 6) + 1;
            const d2 = forceDice2 !== null ? forceDice2 : Math.floor(Math.random() * 6) + 1;
            this.lastDice1 = d1;
            this.lastDice2 = d2;
            this.lastDiceResult = d1 + d2;
            this.hadAmusementParkAtRoll = this.currentPlayer().landmarks["遊園地"];
            this.addLog(`🎲 ${d1}+${d2}=${this.lastDiceResult}`);
        } else {
            const d1 = forceDice1 !== null ? forceDice1 : Math.floor(Math.random() * 6) + 1;
            this.lastDice1 = d1;
            this.lastDice2 = 0;
            this.lastDiceResult = d1;
            this.hadAmusementParkAtRoll = this.currentPlayer().landmarks["遊園地"];
            this.addLog(`🎲 ${d1} が出ました`);
        }
        this.afterRoll(tunaDice || this.pendingTunaDice);
    }

    afterRoll(tunaDice = null) {
        if (this.currentPlayer().landmarks["電波塔"] && !this.usedReroll) {
            this.phase = "rerollConfirm";
            this.pendingTunaDice = tunaDice;
        } else {
            this.applyHarborOrIncome(tunaDice);
        }
    }

    rerollDice(forceDice = null, tunaDice = null) {
        if (this.phase !== "rerollConfirm") return;
        this.usedReroll = true;
        this.lastDiceResult = 0;
        this.lastDice1 = 0;
        this.lastDice2 = 0;
        this.log = [];
        this.addLog("📡 電波塔で振り直します");
        this.phase = "roll";
        this.rollDice(forceDice, tunaDice);
    }

    skipReroll() {
        if (this.phase !== "rerollConfirm") return;
        this.applyHarborOrIncome(this.pendingTunaDice);
    }

    applyHarborOrIncome(tunaDice = null) {
        const useTwo = this.lastDice1 > 0 && this.lastDice2 > 0;
        if (useTwo && this.currentPlayer().landmarks["港"] && this.lastDiceResult >= 10) {
            this.phase = "harborChoice";
            this.pendingTunaDice = tunaDice;
            this.addLog(`⚓ 港効果：合計${this.lastDiceResult}に+2しますか？`);
        } else {
            this.processIncome(tunaDice);
        }
    }

    resolveHarbor(useBonus, tunaDice = null) {
        if (useBonus) {
            this.lastDiceResult += 2;
            this.addLog(`⚓ 港効果+2 → ${this.lastDiceResult}`);
        } else {
            this.addLog(`→ そのまま ${this.lastDiceResult} を使用`);
        }
        this.processIncome(tunaDice || this.pendingTunaDice);
    }

    // 緑カードの収入額を計算する共有メソッド。
    // _processGreen・CPU._cardActivationValue・CPU.evalCard が参照することで
    // ゲームロジックと CPU 予測の乖離を防ぐ。
    // 副作用（pendingMover++ など）を持つカードは含まない。
    static calcCardIncome(card, owner, game) {
        switch (card.effect) {
            case CARD_EFFECTS.CHEESE:
                return owner.countCard("牧場") * card.income;
            case CARD_EFFECTS.FURNITURE:
                return (owner.countCard("森林") + owner.countCard("鉱山")) * card.income;
            case CARD_EFFECTS.MARKET:
                return owner.cards.filter(c => c.category === "農園" && !owner.isDormant(c)).length * card.income;
            case CARD_EFFECTS.FLOWER:
                return owner.countCard("花畑") * card.income;
            case CARD_EFFECTS.FOODWAREHOUSE:
                return owner.cards.filter(c => c.category === "飲食店" && !owner.isDormant(c)).length * card.income;
            case CARD_EFFECTS.FEWLANDMARK:
            case CARD_EFFECTS.CORNFIELD: {
                const built = Object.values(owner.landmarks).filter(v => v).length;
                return built <= 1 ? card.income : 0;
            }
            case CARD_EFFECTS.WINERY:
                return owner.cards.filter(c => c.name === "ブドウ園" && !owner.isDormant(c)).length * card.income;
            case CARD_EFFECTS.DRINKFACTORY:
                return game.players.reduce((sum, p) =>
                    sum + p.cards.filter(c => c.category === "飲食店" && !p.isDormant(c)).length, 0) * card.income;
            default: {
                let amount = card.income;
                if (owner.landmarks["ショッピングモール"] &&
                    (card.category === "飲食店" || card.category === "商店")) amount += 1;
                return amount;
            }
        }
    }

    processIncome(tunaDice = null) {
        const dice = this.lastDiceResult;
        const current = this.currentPlayer();
        const ci = this.currentPlayerIndex;

        this._processRed(current, ci, dice);
        this._processBlue(dice, tunaDice);
        this._processGreen(current, dice);
        this._processPurple(current, ci, dice);

        // 役所：建設フェーズ開始時コイン0なら+1
        if (current.coins === 0 && current.hasYakusho) {
            current.coins += 1;
            this.addLog(`🏛️ 役所効果 → +1コイン`);
        }

        if (!this.pendingTV && !this.pendingBusiness &&
            !this.pendingCleaning && !this.pendingMover && !this.pendingRenovation) {
            this.phase = "build";
        } else {
            this.phase = "pending";
        }
    }

    _processRed(current, ci, dice) {
        for (let i = 0; i < this.players.length; i++) {
            if (i === ci) continue;
            const other = this.players[i];
            for (const card of other.cards) {
                if (other.isDormant(card)) continue;
                if (card.color !== "red" || !card.diceNums.includes(dice)) continue;
                if (card.effect === CARD_EFFECTS.HARBOR_RED && !other.landmarks["港"]) continue;

                if (card.effect === CARD_EFFECTS.FRENCHR) {
                    const built = Object.values(current.landmarks).filter(v => v).length;
                    if (built < 2) continue;
                    const steal = Math.min(card.income, current.coins);
                    current.coins -= steal;
                    other.coins += steal;
                    this.addLog(`🍽️ ${other.name}の高級フレンチ発動 → ${steal}コイン獲得`);
                    continue;
                }

                if (card.effect === CARD_EFFECTS.MEMBERBAR) {
                    const built = Object.values(current.landmarks).filter(v => v).length;
                    if (built < 3) continue;
                    const steal = current.coins;
                    current.coins = 0;
                    other.coins += steal;
                    this.addLog(`🍸 ${other.name}の会員制BAR発動 → ${steal}コイン全奪取`);
                    continue;
                }

                let amount = card.income;
                if (other.landmarks["ショッピングモール"] &&
                    (card.category === "飲食店" || card.category === "商店")) amount += 1;
                amount = Math.min(amount, current.coins);
                current.coins -= amount;
                other.coins += amount;
                this.addLog(`💸 ${other.name}の${card.name}発動 → ${amount}コイン獲得`);
            }
        }
    }

    _processBlue(dice, tunaDice) {
        for (const p of this.players) {
            for (const card of p.cards) {
                if (p.isDormant(card)) continue;
                if (card.color !== "blue" || !card.diceNums.includes(dice)) continue;

                if (card.effect === CARD_EFFECTS.CORNFIELD) {
                    const built = Object.values(p.landmarks).filter(v => v).length;
                    if (built > 1) continue;
                    p.coins += card.income;
                    this.addLog(`🌽 ${p.name}のコーン畑発動 → +${card.income}コイン`);
                    continue;
                }
                if (card.effect === CARD_EFFECTS.HARBOR) {
                    if (!p.landmarks["港"]) continue;
                    p.coins += card.income;
                    this.addLog(`🐟 ${p.name}の${card.name}発動 → +${card.income}コイン`);
                } else if (card.effect === CARD_EFFECTS.TUNA) {
                    if (!p.landmarks["港"]) continue;
                    const t1 = tunaDice ? tunaDice[0] : Math.floor(Math.random() * 6) + 1;
                    const t2 = tunaDice ? tunaDice[1] : Math.floor(Math.random() * 6) + 1;
                    const earn = t1 + t2;
                    p.coins += earn;
                    this.addLog(`🐟 ${p.name}のマグロ漁船発動 → 🎲${t1}+${t2}=${earn}コイン`);
                } else {
                    p.coins += card.income;
                    this.addLog(`🌾 ${p.name}の${card.name}発動 → +${card.income}コイン`);
                }
            }
        }
    }

    _processGreen(current, dice) {
        for (const card of current.cards) {
            if (current.isDormant(card)) continue;
            if (card.color !== "green" || !card.diceNums.includes(dice)) continue;

            // 副作用を持つカードは先に処理して continue
            if (card.effect === CARD_EFFECTS.WINERY) {
                const dormantWinery = current.dormantCards.find(c => c.name === "ワイナリー");
                if (dormantWinery) current.revive(dormantWinery);
                const amount = GameManager.calcCardIncome(card, current, this);
                if (amount > 0) {
                    current.coins += amount;
                    this.addLog(`🍷 ワイナリー発動 → +${amount}コイン`);
                    current.makeDormant(card);
                    this.addLog(`💤 ワイナリーが休業`);
                }
                continue;
            }
            if (card.effect === CARD_EFFECTS.MOVER) {
                this.pendingMover++;
                this.addLog(`🚚 引越し屋発動 → 渡す施設を選んでください`);
                continue;
            }
            if (card.effect === CARD_EFFECTS.LOAN) continue;
            if (card.effect === CARD_EFFECTS.RENOVATION) {
                const builtLandmarks = Object.entries(current.landmarks)
                    .filter(([name, built]) => built && name !== "役所");
                if (builtLandmarks.length > 0) {
                    this.pendingRenovation++;
                    this.addLog(`🔨 改装屋発動 → 戻すランドマークを選んでください`);
                } else {
                    this.addLog(`🔨 改装屋：建設済みランドマークがないため不発`);
                }
                continue;
            }

            const amount = GameManager.calcCardIncome(card, current, this);
            if (amount > 0) {
                current.coins += amount;
                this.addLog(`🏪 ${card.name}発動 → +${amount}コイン`);
            }
        }

        // 貸金業：自分のターンに5か6が出たら枚数×2コイン支払い
        if (dice === 5 || dice === 6) {
            const loanCount = current.cards.filter(c => c.effect === CARD_EFFECTS.LOAN).length;
            if (loanCount > 0) {
                const pay = Math.min(loanCount * 2, current.coins);
                current.coins -= pay;
                this.addLog(`💳 貸金業×${loanCount}：${pay}コイン支払い`);
            }
        }
    }

    _processPurple(current, ci, dice) {
        for (const card of current.cards) {
            if (current.isDormant(card)) continue;
            if (card.color !== "purple" || !card.diceNums.includes(dice)) continue;

            if (card.effect === CARD_EFFECTS.STADIUM) {
                let total = 0;
                for (let i = 0; i < this.players.length; i++) {
                    if (i === ci) continue;
                    const steal = Math.min(2, this.players[i].coins);
                    this.players[i].coins -= steal;
                    total += steal;
                }
                current.coins += total;
                this.addLog(`🏟️ スタジアム発動 → +${total}コイン`);
            } else if (card.effect === CARD_EFFECTS.TV) {
                this.pendingTV++;
                this.addLog(`📺 テレビ局発動 → 対象プレイヤーを選んでください`);
            } else if (card.effect === CARD_EFFECTS.BUSINESS) {
                this.pendingBusiness++;
                this.addLog(`🏢 ビジネスセンター発動 → 交換する施設を選んでください`);
            } else if (card.effect === CARD_EFFECTS.PUBLISHER) {
                let total = 0;
                for (let i = 0; i < this.players.length; i++) {
                    if (i === ci) continue;
                    const count = this.players[i].cards.filter(
                        c => (c.category === "飲食店" || c.category === "商店") && !this.players[i].isDormant(c)).length;
                    const steal = Math.min(count, this.players[i].coins);
                    this.players[i].coins -= steal;
                    total += steal;
                    if (steal > 0) this.addLog(`📰 ${this.players[i].name}から${steal}コイン`);
                }
                current.coins += total;
                this.addLog(`📰 出版社発動 → 合計+${total}コイン`);
            } else if (card.effect === CARD_EFFECTS.TAXOFFICE) {
                let total = 0;
                for (let i = 0; i < this.players.length; i++) {
                    if (i === ci) continue;
                    if (this.players[i].coins >= 10) {
                        const steal = Math.floor(this.players[i].coins / 2);
                        this.players[i].coins -= steal;
                        total += steal;
                        this.addLog(`🏛️ ${this.players[i].name}から${steal}コイン`);
                    }
                }
                current.coins += total;
                this.addLog(`🏛️ 税務署発動 → 合計+${total}コイン`);
            } else if (card.effect === CARD_EFFECTS.CLEANING) {
                this.pendingCleaning++;
                this.addLog(`🧹 清掃業発動 → 休業にする施設を選んでください`);
            } else if (card.effect === CARD_EFFECTS.ITSTARTUP) {
                let total = 0;
                for (let i = 0; i < this.players.length; i++) {
                    if (i === ci) continue;
                    const steal = Math.min(current.itVentureCoins, this.players[i].coins);
                    this.players[i].coins -= steal;
                    total += steal;
                }
                current.coins += total;
                this.addLog(`💻 ITベンチャー発動 → 積立${current.itVentureCoins}コイン × ${this.players.length - 1}人 → +${total}コイン`);
            } else if (card.effect === CARD_EFFECTS.PARK) {
                const total = this.players.reduce((sum, p) => sum + p.coins, 0);
                const each = Math.floor(total / this.players.length);
                const remainder = total - each * this.players.length;
                for (const p of this.players) p.coins = each;
                current.coins += remainder;
                this.addLog(`🌳 公園発動 → 全員${each}コインに均等分配`);
            }
        }
    }

    resolveTV(targetIndex) {
        const current = this.currentPlayer();
        const target = this.players[targetIndex];
        if (!target || target === current) {
            this.addLog(`❌ 対象プレイヤーを選び直してください`);
            return;
        }
        const steal = Math.min(5, target.coins);
        target.coins -= steal;
        current.coins += steal;
        this.addLog(`📺 ${target.name}から${steal}コイン奪いました`);
        this.pendingTV--;
        this._checkPending();
    }

    resolveBusiness(myCardRef, targetIndex, theirCardRef) {
        const current = this.currentPlayer();
        const target = this.players[targetIndex];
        if (!target || target === current) { this.addLog(`❌ 交換相手を選び直してください`); return; }
        const myCard = this._resolveCardRef(current, myCardRef);
        const theirCard = this._resolveCardRef(target, theirCardRef);
        if (!myCard || !theirCard) { this.addLog(`❌ 交換できない施設です`); return; }
        const myCardWasDormant = current.isDormant(myCard);
        const theirCardWasDormant = target.isDormant(theirCard);
        current.revive(myCard);
        target.revive(theirCard);
        current.cards.splice(current.cards.indexOf(myCard), 1);
        target.cards.splice(target.cards.indexOf(theirCard), 1);
        current.cards.push(theirCard);
        target.cards.push(myCard);
        if (theirCardWasDormant) current.makeDormant(theirCard);
        if (myCardWasDormant) target.makeDormant(myCard);
        this.addLog(`🔄 ${myCard.name} ⇔ ${target.name}の${theirCard.name} を交換しました`);
        this.pendingBusiness--;
        this._checkPending();
    }

    resolveCleaning(cardName) {
        const current = this.currentPlayer();
        let count = 0;
        for (const p of this.players) {
            for (const card of p.cards) {
                if (card.name === cardName && !p.isDormant(card)) {
                    p.makeDormant(card);
                    count++;
                }
            }
        }
        current.coins += count;
        this.addLog(`🧹 ${cardName}×${count}軒を休業 → +${count}コイン`);
        this.pendingCleaning--;
        this._checkPending();
    }

    resolveMover(myCardRef, targetIndex) {
        const current = this.currentPlayer();
        const target = this.players[targetIndex];
        if (!target || target === current) { this.addLog(`❌ 渡す相手を選び直してください`); return; }
        const myCard = this._resolveCardRef(current, myCardRef);
        if (!myCard) { this.addLog(`❌ 渡せない施設です`); return; }
        const myCardWasDormant = current.isDormant(myCard);
        current.revive(myCard);
        current.cards.splice(current.cards.indexOf(myCard), 1);
        target.cards.push(myCard);
        if (myCardWasDormant) target.makeDormant(myCard);
        current.coins += 4;
        this.addLog(`🚚 ${myCard.name}を${target.name}に渡して+4コイン`);
        this.pendingMover--;
        this._checkPending();
    }
    
    resolveRenovation(landmarkName) {
        const current = this.currentPlayer();
        if (!current.landmarks[landmarkName]) {
            this.addLog(`❌ そのランドマークは建設されていません`);
            return;
        }
        current.landmarks[landmarkName] = false;
        current.coins += 8;
        this.addLog(`🔨 ${landmarkName}を取り壊して+8コイン`);
        this.pendingRenovation--;

        // 残りの改装屋発動回数があっても建設済みランドマークがなければスキップ
        while (this.pendingRenovation > 0) {
            const builtLandmarks = Object.entries(current.landmarks)
                .filter(([name, built]) => built && name !== "役所");
            if (builtLandmarks.length > 0) break;
            this.addLog(`🔨 改装屋：建設済みランドマークがないため不発`);
            this.pendingRenovation--;
        }

        this._checkPending();
    }
    
    _checkPending() {
        if (this.pendingTV <= 0 && this.pendingBusiness <= 0 &&
            this.pendingCleaning <= 0 && this.pendingMover <= 0 &&
            this.pendingRenovation <= 0) {
            this.phase = "build";
        }
    }

    // ITベンチャー：任意で1コイン消費して積立
    resolveIT(doSave) {
        const current = this.currentPlayer();
        if (doSave) {
            if (current.coins < 1) {
                this.addLog(`❌ コインが足りません`);
            } else {
                current.coins -= 1;
                current.itVentureCoins += 1;
                this.addLog(`💻 ITベンチャー積立 → 合計${current.itVentureCoins}コイン`);
            }
        } else {
            this.addLog(`💻 ITベンチャー積立スキップ`);
        }
        this.pendingIT = false;
        this._doNextTurn();
    }

    buildCard(card) {
        if (this.builtThisTurn) { this.addLog(`❌ 建設は1ターンに1度だけです`); return false; }
        const current = this.currentPlayer();
        if (current.coins < card.cost) { this.addLog(`❌ コインが足りません`); return false; }
        if (card.color === "purple" && current.countCard(card.name) > 0) {
            this.addLog(`❌ 大施設は1枚しか持てません`); return false;
        }
        current.coins -= card.cost;
        current.addCard(cloneCard(card));
        if (card.effect === "loan") {
            current.coins += 5;
            this.addLog(`💳 貸金業建設 → +5コイン（5か6が出たら-2コイン）`);
        }
        this.addLog(`🏗️ ${card.name}を建設！`);
        this.builtThisTurn = true;
        return true;
    }

    buildLandmark(name) {
        if (this.builtThisTurn) { this.addLog(`❌ 建設は1ターンに1度だけです`); return false; }
        const current = this.currentPlayer();
        const cost = Player.landmarkCost(name);
        if (!this.enabledLandmarks.has(name)) { this.addLog(`❌ このランドマークは今回使用しません`); return false; }
        if (current.coins < cost) { this.addLog(`❌ コインが足りません`); return false; }
        if (current.landmarks[name]) { this.addLog(`❌ すでに建設済みです`); return false; }
        current.coins -= cost;
        current.landmarks[name] = true;
        this.addLog(`🏆 ${name}を建設！`);
        this.builtThisTurn = true;
        return true;
    }

    nextTurn() {
        const current = this.currentPlayer();
        if (!this.builtThisTurn && current.landmarks["空港"]) {
            current.coins += 10;
            this.addLog(`✈️ 空港効果！建設なしで+10コイン`);
        }
        // ITベンチャー：任意で積立
        const itCard = current.cards.find(c => c.effect === "itstartup" && !current.isDormant(c));
        if (itCard) {
            this.pendingIT = true;
            this.addLog(`💻 ITベンチャー：1コイン積立しますか？（現在${current.itVentureCoins}コイン積立中）`);
            return;
        }
        this._doNextTurn();
    }

    _doNextTurn() {
        if (this.hadAmusementParkAtRoll &&
            this.lastDice1 > 0 && this.lastDice1 === this.lastDice2) {
            this.phase = "roll";
            this.log = [];
            this.builtThisTurn = false;
            this.usedReroll = false;
            this.pendingTV = 0;
            this.pendingBusiness = 0;
            this.pendingCleaning = 0;
            this.pendingMover = 0;
            this.pendingIT = false;
            this.pendingRenovation = 0;
            this.hadAmusementParkAtRoll = false;
            this.addLog(`🎡 遊園地効果！ゾロ目でもう一度ターン`);
            return;
        }
        this.hadAmusementParkAtRoll = false;
        this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
        this.turnCount++;
        this.phase = "roll";
        this.log = [];
        this.builtThisTurn = false;
        this.usedReroll = false;
        this.pendingTV = 0;
        this.pendingBusiness = 0;
        this.pendingCleaning = 0;
        this.pendingMover = 0;
        this.pendingIT = false;
        this.pendingRenovation = 0;

        this.addLog(`👤 ${this.currentPlayer().name}のターン`);
    }

    checkWinner() { return this.players.find(p => p.hasWon([...this.enabledLandmarks])) || null; }
    addLog(msg) { this.log.push(msg); }
}
