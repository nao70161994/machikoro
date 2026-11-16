'use strict';
const assert = require('assert');
const { runTest } = require('./helpers/test-utils');
const CardBoardField = require('../js/cardBoardField');
function box(top, left, children = {}) {
    return { scrollTop: top, scrollLeft: left, querySelector: selector => children[selector] || null };
}
runTest('テーマ離脱時の市場・席別カード・roster位置を新DOMへ一度だけ戻す', () => {
    const memory = CardBoardField.createScrollMemory();
    memory.capture('market', box(0, 0, { '.compact-market-facilities': box(120, 0) }));
    memory.capture('player:0', box(0, 0, { '.cardboard-cards': box(0, 96) }));
    memory.capture('player:1', box(0, 0, { '.cardboard-cards': box(48, 0) }));
    memory.capture('roster', box(0, 0, { '.cardboard-roster': box(0, 215) }));
    for (const [key, selector, top, left] of [
        ['market', '.compact-market-facilities', 120, 0],
        ['player:0', '.cardboard-cards', 0, 96],
        ['player:1', '.cardboard-cards', 48, 0],
        ['roster', '.cardboard-roster', 0, 215],
    ]) {
        const child = box(0, 0), element = box(0, 0, { [selector]: child });
        memory.restore(key, element);
        assert.strictEqual(child.scrollTop, top);
        assert.strictEqual(child.scrollLeft, left);
        child.scrollTop = 7; child.scrollLeft = 8;
        memory.restore(key, element);
        assert.strictEqual(child.scrollTop, 7, '復帰後の利用者scrollを古い記録で上書きしない');
        assert.strictEqual(child.scrollLeft, 8);
    }
});
runTest('新sessionでは前対局のscroll記録を破棄する', () => {
    const memory = CardBoardField.createScrollMemory();
    memory.capture('market', box(80, 90));
    memory.clear();
    const target = box(0, 0);
    memory.restore('market', target);
    assert.strictEqual(target.scrollTop, 0);
    assert.strictEqual(target.scrollLeft, 0);
    memory.capture('missing', null);
    memory.restore('missing', null);
});

runTest('市場をnative dialogへ移した後も卓と市場の補助disclosureを排他に閉じる', () => {
    const previous = global.document;
    const filter = { open: true }, goals = { open: true }, guide = { open: true };
    const roots = {
        cardboardBoard: { querySelectorAll: () => [guide] },
        cardboardMarketDialog: { querySelectorAll: () => [filter, goals] },
    };
    global.document = { getElementById: id => roots[id] || null };
    try {
        CardBoardField.closeDisclosures(goals);
        assert.strictEqual(goals.open, true);
        assert.strictEqual(filter.open, false);
        assert.strictEqual(guide.open, false);
        CardBoardField.closeDisclosures();
        assert.strictEqual(goals.open, false);
    } finally {
        if (previous === undefined) delete global.document;
        else global.document = previous;
    }
});

runTest('収支の内訳を開いても祖先の出目パネルは閉じない', () => {
    const previous = global.document;
    const inner = { open: true };
    const outer = { open: true, contains: target => target === inner };
    const other = { open: true };
    global.document = { getElementById: id => id === 'cardboardBoard'
        ? { querySelectorAll: () => [outer, inner, other] } : null };
    try {
        CardBoardField.closeDisclosures(inner);
        assert.strictEqual(outer.open, true);
        assert.strictEqual(inner.open, true);
        assert.strictEqual(other.open, false);
        CardBoardField.closeDisclosures();
        assert.strictEqual(outer.open, false);
        assert.strictEqual(inner.open, false);
    } finally {
        if (previous === undefined) delete global.document;
        else global.document = previous;
    }
});

runTest('遅延したOSのreduce通知は現在値が戻っていても演出を取り消す', () => {
    const source = require('fs').readFileSync(require('path').join(__dirname, '../js/cardBoardField.js'), 'utf8');
    const start = source.indexOf('        let wasReducedMotion = reducedMotionEnabled();');
    const end = source.indexOf('        new MutationObserver(clearHiddenFeedback)', start);
    assert.ok(start >= 0 && end > start, '実際に登録する設定監視処理を検証する');
    let current = false, cleared = 0, mediaChanged;
    const observers = [];
    const context = {
        reducedMotionEnabled: () => current,
        clearFeedback: () => { cleared++; },
        window: { matchMedia: () => ({ addEventListener: (type, listener) => { mediaChanged = listener; } }) },
        document: { body: {} },
        MutationObserver: class {
            constructor(callback) { observers.push(callback); }
            observe() {}
        },
    };
    require('vm').runInNewContext(source.slice(start, end), context);
    mediaChanged({ matches: true });
    assert.strictEqual(cleared, 1, '現在値falseでも配信済みのreduce遷移を尊重する');
    mediaChanged({ matches: false });
    assert.strictEqual(cleared, 1, '設定を戻しても過去の演出を作らない');
    current = true;
    observers[0]([]);
    assert.strictEqual(cleared, 2, 'アプリ設定でも取り消す');
    mediaChanged({ matches: false });
    assert.strictEqual(cleared, 2, 'OSを戻してもアプリ側のreduceは有効');
    current = false;
    observers[0]([]);
    mediaChanged({ matches: true });
    assert.strictEqual(cleared, 3, '次回のreduce遷移も取り消す');
});

runTest('建設通知の1200msは初回描画機会の後から数え取消後に再開しない', () => {
    const source = require('fs').readFileSync(require('path').join(__dirname, '../js/cardBoardField.js'), 'utf8');
    const clearStart = source.indexOf('    function clearBuildNotice()');
    const showStart = source.indexOf('    function showBuildNotice(card)', clearStart);
    const scheduleStart = source.indexOf('        const context = { session, turn: facts.game.turnCount, actor: facts.game.currentPlayerIndex, card };', showStart);
    const scheduleEnd = source.indexOf('        return true;', scheduleStart);
    assert.ok(clearStart >= 0 && showStart > clearStart && scheduleStart > showStart && scheduleEnd > scheduleStart);
    const frames = new Map(), timers = new Map();
    let sequence = 0, removed = 0;
    const context = {
        buildNoticeFrame: null, buildNoticeTimer: null, buildNoticeContext: null,
        notice: { isConnected: true }, card: { isConnected: true }, session: 'game', mounted: true,
        facts: { game: { turnCount: 3, currentPlayerIndex: 0, phase: 'build' } },
        GAME_PHASES: { BUILD: 'build' }, document: { hidden: false }, enabled: () => true,
        node: () => ({ remove: () => { removed++; } }),
        requestAnimationFrame: callback => { frames.set(++sequence, callback); return sequence; },
        cancelAnimationFrame: handle => frames.delete(handle),
        setTimeout: (callback, delay) => { timers.set(++sequence, { callback, delay }); return sequence; },
        clearTimeout: handle => timers.delete(handle),
    };
    require('vm').runInNewContext(source.slice(clearStart, showStart) +
        `\nfunction scheduleNotice() { ${source.slice(scheduleStart, scheduleEnd)} }`, context);
    const paint = () => {
        const [handle, callback] = frames.entries().next().value;
        frames.delete(handle);
        callback();
    };
    context.scheduleNotice();
    assert.strictEqual(timers.size, 0, '描画前に寿命を消費しない');
    paint();
    assert.strictEqual(timers.size, 0, '初回RAF後の遅いpaintで表示寿命を使い切らない');
    paint();
    assert.strictEqual(timers.size, 1);
    assert.strictEqual([...timers.values()][0].delay, 1200, '表示寿命を延長しない');
    [...timers.values()][0].callback();
    assert.strictEqual(removed, 1);
    assert.strictEqual(timers.size, 0);
    context.scheduleNotice();
    const cancelledCallback = [...frames.values()][0];
    context.clearBuildNotice();
    assert.strictEqual(frames.size, 0);
    cancelledCallback();
    assert.strictEqual(timers.size, 0, '取消済み描画callbackは通知を復活させない');
    context.scheduleNotice();
    const currentFrame = context.buildNoticeFrame;
    cancelledCallback();
    assert.strictEqual(context.buildNoticeFrame, currentFrame, '古いcallbackは次の通知のRAFを消さない');
    context.facts.game.phase = 'roll';
    paint();
    assert.strictEqual(timers.size, 0, '手番の状況が変わったら過去の通知を始めない');
});

runTest('市場closeは保存視点の有効性に応じて同taskで復帰と建設を示す', () => {
    const source = require('fs').readFileSync(require('path').join(__dirname, '../js/cardBoardField.js'), 'utf8');
    const start = source.indexOf('    function finishMarketClose()');
    const end = source.indexOf('    function isMarketExpanded()', start);
    assert.ok(start >= 0 && end > start);
    const order = [], frames = [], presented = [];
    const game = { turnCount: 2, currentPlayerIndex: 0 };
    const context = {
        restoreMarketNode: () => order.push('restore'),
        setMarketExpanded: expanded => order.push(`expanded:${expanded}`),
        marketLauncher: { isConnected: true, getClientRects: () => [1], focus: () => order.push('focus') },
        marketLauncherSelector: null, restoreMarketFocus: true, marketReturnView: null,
        facts: { game }, session: 1,
        enabled: () => true, node: () => ({ style: { display: '' }, querySelector: () => null }),
        pendingBuildCues: [{}],
        pendingBuildTarget: () => true,
        tableLayout: { syncLayout: () => order.push('table'), refresh: () => order.push('refresh') },
        tableCamera: { syncLayout: () => order.push('camera'), preserveReadingPosition: active => order.push(`preserve:${active}`) },
        presentPendingBuildCues: view => { order.push('cue'); presented.push(view); },
        requestAnimationFrame: callback => frames.push(callback),
    };
    require('vm').runInNewContext(source.slice(start, end), context);
    context.finishMarketClose();
    assert.deepStrictEqual(order, ['restore', 'expanded:false', 'focus', 'table', 'camera', 'cue', 'preserve:false']);
    assert.strictEqual(frames.length, 0, '購入演出を次のframeまで待たない');
    order.length = 0;
    context.pendingBuildCues = [];
    context.finishMarketClose();
    assert.deepStrictEqual(order, ['restore', 'expanded:false', 'table', 'camera', 'cue', 'preserve:false']);
    assert.strictEqual(frames.length, 0, '購入しないcloseも位置を同期復元してから保持方針を解除する');
    const view = { scale: 0.8, angle: 180 };
    const captured = { view, session: 1, game, turn: 2, actor: 0 };
    context.pendingBuildCues = [{}];
    context.marketReturnView = captured;
    order.length = 0;
    context.finishMarketClose();
    assert.deepStrictEqual(order, ['restore', 'expanded:false', 'table', 'cue', 'preserve:false']);
    assert.strictEqual(presented.at(-1), view, '有効な購入前視点を正面閲覧の復帰先へ渡す');
    assert.strictEqual(context.marketReturnView, null, '閉じた市場の保存視点を再利用しない');
    assert.strictEqual(frames.length, 0, '有効な購入も同taskで最終視点へ移る');
    for (const invalid of [{ session: 2 }, { game: {} }, { turn: 3 }, { actor: 1 }, { view: null }]) {
        context.marketReturnView = { ...captured, ...invalid };
        order.length = 0;
        context.finishMarketClose();
        assert.deepStrictEqual(order, ['restore', 'expanded:false', 'table', 'camera', 'cue', 'preserve:false']);
        assert.strictEqual(presented.at(-1), null, '文脈の違う保存視点は従来経路へ戻す');
        assert.strictEqual(context.marketReturnView, null);
    }
    context.marketReturnView = captured;
    context.pendingBuildTarget = () => null;
    order.length = 0;
    context.finishMarketClose();
    assert.deepStrictEqual(order, ['restore', 'expanded:false', 'table', 'camera', 'cue', 'preserve:false']);
    assert.strictEqual(presented.at(-1), null, '有効な購入先がなければ保存視点を適用しない');
    order.length = 0;
    context.tableLayout = null;
    context.tableCamera = null;
    context.finishMarketClose();
    assert.deepStrictEqual(order, ['restore', 'expanded:false', 'cue']);
});

runTest('閲覧位置の復元は最近傍pixelを使いWebKitの切捨て偏りを避ける', () => {
    const source = require('fs').readFileSync(require('path').join(__dirname, '../js/cardTableCamera.js'), 'utf8');
    const start = source.indexOf('        function alignPoint(point, anchor,');
    const end = source.indexOf('        function paint(', start);
    assert.ok(start >= 0 && end > start);
    let destination;
    const context = { worldToCanvas: point => point, scroll: (left, top) => { destination = { left, top }; } };
    require('vm').runInNewContext(source.slice(start, end), context);
    for (const fraction of [0.01, 0.49, 0.51, 0.99]) {
        const point = { x: 584 + fraction, y: 1777 + fraction };
        context.alignPoint(point, { x: 0, y: 0 }, true);
        assert.ok(Math.abs(destination.left - point.x) <= 0.5);
        assert.ok(Math.abs(destination.top - point.y) <= 0.5);
        assert.strictEqual(destination.left, Math.floor(destination.left));
        assert.strictEqual(destination.top, Math.floor(destination.top));
        context.alignPoint(point, { x: 0, y: 0 });
        assert.strictEqual(destination.left, point.x, '通常のpan/zoom用座標は変更しない');
        assert.strictEqual(destination.top, point.y);
    }
});

runTest('閲覧カードの位置復元は対象消失を呼出元へ返し比例位置を可視範囲へ保つ', () => {
    const source = require('fs').readFileSync(require('path').join(__dirname, '../js/cardTableCamera.js'), 'utf8');
    const start = source.indexOf('        function restoreInspectionAnchor(anchor)');
    const end = source.indexOf('        function retainInspectionOnResize(anchor)', start);
    assert.ok(start >= 0 && end > start);
    let cards = [], destination = null, snapped = false;
    const context = {
        destroyed: false, focusPlayer: 1, viewport: { clientWidth: 300, clientHeight: 500 },
        seat: () => ({ querySelectorAll: () => cards }),
        paint() {}, updateFocus() {}, cacheInspectionAnchor() {},
        clientToWorld: (x, y) => ({ x, y }), alignPoint: (point, target, snap) => { destination = target; snapped = snap; },
    };
    require('vm').runInNewContext(source.slice(start, end), context);
    const anchor = { playerIndex: 1, name: '麦畑', x: 0.25, y: 0.75, preservePosition: true };
    assert.strictEqual(context.restoreInspectionAnchor(anchor), false, '消失時はworld中心fallbackを可能にする');
    assert.strictEqual(destination, null);
    cards = [{ dataset: { cardName: '麦畑' }, getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 80 }) }];
    assert.strictEqual(context.restoreInspectionAnchor(anchor), true);
    assert.strictEqual(destination.x, 75);
    assert.strictEqual(destination.y, 375);
    assert.strictEqual(snapped, true);
    context.restoreInspectionAnchor({ ...anchor, x: -0.2, y: 1.2 });
    assert.strictEqual(destination.x, 0);
    assert.strictEqual(destination.y, 500);
    context.restoreInspectionAnchor({ ...anchor, preservePosition: false });
    assert.strictEqual(destination.x, 150, '通常のresize/reflowは閲覧カードを中央へ戻す');
    assert.strictEqual(destination.y, 250);
    context.focusPlayer = 0;
    assert.strictEqual(context.restoreInspectionAnchor(anchor), false, '新しい閲覧対象を古いanchorで上書きしない');
    context.focusPlayer = 1;
    context.destroyed = true;
    assert.strictEqual(context.restoreInspectionAnchor(anchor), false);
});

runTest('建設flightの時計は二度目の描画更新で始まり古いcallbackは新しい待機を壊さない', () => {
    const source = require('fs').readFileSync(require('path').join(__dirname, '../js/cardBoardField.js'), 'utf8');
    const start = source.indexOf('    function stageBuildFlight(');
    const end = source.indexOf('    function startBuildFlight(', start);
    assert.ok(start >= 0 && end > start);
    const frames = new Map();
    let sequence = 0, played = 0, cleared = 0, valid = true;
    const ghost = {}, animation = { currentTime: 0, play: () => { played++; } };
    const context = {
        buildFlight: ghost, buildFlightGeneration: 1, buildFlightFrame: null,
        requestAnimationFrame: callback => { frames.set(++sequence, callback); return sequence; },
        clearBuildFlight: () => { cleared++; context.buildFlightGeneration++; context.buildFlightFrame = null; },
    };
    require('vm').runInNewContext(source.slice(start, end), context);
    const flush = () => {
        const [handle, callback] = frames.entries().next().value;
        frames.delete(handle);
        callback();
    };
    context.stageBuildFlight(ghost, animation, 1, () => valid);
    flush();
    assert.strictEqual(played, 0, '最初の更新中は静止したカードを保つ');
    assert.strictEqual(frames.size, 1);
    animation.currentTime = 100;
    flush();
    assert.strictEqual(played, 1);
    assert.strictEqual(animation.currentTime, 0, '再生段階から時計を開始する');
    context.stageBuildFlight(ghost, animation, 1, () => valid);
    flush();
    valid = false;
    flush();
    assert.strictEqual(played, 1, '二段階目でも現在の手番・表示条件を再検査する');
    assert.strictEqual(cleared, 1);
    valid = true;
    context.stageBuildFlight(ghost, animation, 2, () => valid);
    const stale = [...frames.values()][0];
    frames.clear();
    context.buildFlightGeneration++;
    context.stageBuildFlight(ghost, animation, 3, () => valid);
    const currentFrame = context.buildFlightFrame;
    stale();
    assert.strictEqual(context.buildFlightFrame, currentFrame);
    assert.strictEqual(frames.size, 1);
    flush();
    assert.strictEqual(played, 1);
    flush();
    assert.strictEqual(played, 2);
});

runTest('市場の位置保持解除はlive anchorだけに適用し保存済み復帰viewを変えない', () => {
    const source = require('fs').readFileSync(require('path').join(__dirname, '../js/cardTableCamera.js'), 'utf8');
    const start = source.indexOf('        function preserveReadingPosition(active)');
    const end = source.indexOf('        function cancelResizeAnchor()', start);
    assert.ok(start >= 0 && end > start);
    let cached = 0;
    const context = { preserveInspectionPosition: false,
        inspectionAnchor: { playerIndex: 1, name: 'パン屋', x: 0.25, y: 0.75, preservePosition: false },
        cacheInspectionAnchor: () => { cached++; },
    };
    require('vm').runInNewContext(source.slice(start, end), context);
    context.preserveReadingPosition(true);
    assert.strictEqual(cached, 1);
    assert.strictEqual(context.inspectionAnchor.preservePosition, true);
    const saved = { ...context.inspectionAnchor };
    context.preserveReadingPosition(false);
    assert.strictEqual(cached, 1, '解除時に移動後の座標を再採取しない');
    assert.strictEqual(context.inspectionAnchor.preservePosition, false);
    assert.strictEqual(saved.preservePosition, true);
    context.inspectionAnchor = null;
    context.preserveReadingPosition(true);
    context.preserveReadingPosition(false);
    assert.strictEqual(context.inspectionAnchor, null);
});

runTest('横へ回り込んだ所属札の接続線は自カードだけを結び障害物を避ける', () => {
    const source = require('fs').readFileSync(require('path').join(__dirname, '../js/cardBoardField.js'), 'utf8');
    const start = source.indexOf('            const ownRects = cardGroups.find');
    const end = source.indexOf('            layer.appendChild(label);', start);
    assert.ok(start >= 0 && end > start);
    function renderLink(left, top, width, extraObstacles = []) {
        const panel = {};
        const target = { left: 10, right: 50, top: 10, bottom: 50 };
        const appended = [];
        const element = () => ({ classList: { add() {} }, dataset: {}, attributes: {}, children: [],
            setAttribute(key, value) { this.attributes[key] = value; },
            style: { setProperty() {} }, appendChild(child) { this.children.push(child); } });
        const context = { panel, left, top, width, height: 22, index: 0, bracketCandidates: [],
            cardGroups: [{ panel, rects: [target] }], obstacles: [{ ...target }, ...extraObstacles], placed: [],
            innerLeft: 0, innerTop: 0, viewport: { clientWidth: 300, clientHeight: 200 },
            document: { createElementNS: element },
            window: { getComputedStyle: () => ({ getPropertyValue: () => '#1766bd' }) },
            layer: { appendChild: svg => appended.push(svg) },
        };
        require('vm').runInNewContext(source.slice(start, end), context);
        return appended;
    }
    const links = renderLink(60, 10, 96);
    assert.strictEqual(links.length, 1);
    assert.strictEqual(links[0].attributes['aria-hidden'], 'true');
    assert.strictEqual(links[0].attributes.focusable, 'false');
    assert.strictEqual(links[0].attributes.width, '14');
    assert.strictEqual(links[0].attributes.height, '4');
    assert.deepStrictEqual(links[0].children[0].attributes, { x1: '12', y1: '2', x2: '2', y2: '2' });
    assert.strictEqual(renderLink(60, 10, 96, [{ left: 54, right: 56, top: 20, bottom: 40 }]).length, 0);
    assert.strictEqual(renderLink(10, -22, 40).length, 0, '通常の上部見出しへ線を増やさない');
    assert.strictEqual(renderLink(150, 10, 96).length, 0, '長い線を盤面に引かない');
});

runTest('所有施設群の括弧は空いた外縁だけを使い市場と名前を覆わない', () => {
    const source = require('fs').readFileSync(require('path').join(__dirname, '../js/cardBoardField.js'), 'utf8');
    const start = source.indexOf('    function ownerGroupBracket(');
    const end = source.indexOf('    function updateOwnerLabels()', start);
    assert.ok(start >= 0 && end > start);
    const context = {};
    require('vm').runInNewContext(source.slice(start, end), context);
    const cards = [{ left: 10, top: 20, right: 50, bottom: 60 }, { left: 10, top: 70, right: 50, bottom: 110 }];
    const label = { left: 65, top: 40, right: 120, bottom: 62 };
    const bounds = { left: 0, top: 0, right: 200, bottom: 200 };
    const build = (obstacles = cards, labels = [label], clip = bounds, badge = label) =>
        context.ownerGroupBracket(cards, badge, obstacles, labels, clip);
    assert.ok(build(cards, [], bounds, { left: 54, top: 40, right: 110, bottom: 62 }), '既存4px間隔でもカードと名前の間へ線を収める');
    const lines = build();
    assert.strictEqual(lines.length, 4);
    assert.strictEqual(lines[1][2] - 1 - cards[0].right, 0.25, '折返しは実際の半線幅と配置丸めを含めてもカードを覆わない');
    assert.deepStrictEqual(Array.from(lines[0]), [52.25, 20, 52.25, 110], '全施設群の始端と終端を示す');
    assert.deepStrictEqual(Array.from(lines[3]), [65, 51, 52.25, 51], '名前札を範囲へ接続する');
    assert.strictEqual(build([...cards, { left: 52, top: 80, right: 70, bottom: 100 }]), null, '市場が外縁をふさぐ場合は元のリンクを保つ');
    assert.strictEqual(build(cards, [label, { left: 52, top: 80, right: 70, bottom: 100 }]), null, '後から配置した名前も覆わない');
    assert.strictEqual(build(cards, [label], { ...bounds, top: 19 }), null, '線の太さを含めてviewport内に収める');
    assert.strictEqual(build(cards, [], bounds, { left: 65, top: 120, right: 120, bottom: 142 }), null, '名前とつながらない範囲は描かない');
    const leftCards = cards.map(rect => ({ ...rect, left: rect.left + 70, right: rect.right + 70 }));
    const leftLabel = { left: 0, top: 40, right: 65, bottom: 62 };
    const leftLines = context.ownerGroupBracket(leftCards, leftLabel, leftCards, [leftLabel], bounds);
    assert.deepStrictEqual(Array.from(leftLines[0]), [77.75, 20, 77.75, 110]);
    assert.deepStrictEqual(Array.from(leftLines[3]), [65, 51, 77.75, 51], '左側の名前も外縁へ接続する');
});

runTest('建設通知は320pxの購入施設と名前を避け市場の空間を使う', () => {
    const source = require('fs').readFileSync(require('path').join(__dirname, '../js/cardBoardField.js'), 'utf8');
    const start = source.indexOf('    function buildNoticePosition(');
    const end = source.indexOf('    function showBuildNotice(card)', start);
    assert.ok(start >= 0 && end > start);
    const context = {};
    require('vm').runInNewContext(source.slice(start, end), context);
    const bounds = { left: 4, top: 120, right: 316, bottom: 500 };
    const own = { left: 50, top: 434, right: 270, bottom: 496 };
    const other = { left: 80, top: 133, right: 230, bottom: 190 };
    const names = [{ left: 144, top: 195, right: 238, bottom: 215 }, { left: 125, top: 407, right: 210, bottom: 430 }];
    const controls = { left: 50, top: 232, right: 270, bottom: 260 };
    const market = { left: 50, top: 267, right: 270, bottom: 386, width: 220, height: 119 };
    const position = context.buildNoticePosition(288, 76, bounds, [own, other], [own, ...names, controls], market);
    assert.deepStrictEqual({ ...position }, { left: 16, top: 288.5 });
    // A 12-character owner can wrap in the notice without requiring a smaller
    // illustration or a clipped caption. Reserve the actual expanded height.
    const wrapped = context.buildNoticePosition(288, 110, bounds, [own, other], [own, ...names, controls], market);
    assert.ok(wrapped.left >= bounds.left + 8 && wrapped.left + 288 <= bounds.right - 8);
    assert.ok(wrapped.top >= bounds.top + 8 && wrapped.top + 110 <= bounds.bottom - 8);
    for (const rect of [own, other, ...names, controls]) {
        assert.ok(wrapped.left + 288 <= rect.left || wrapped.left >= rect.right ||
            wrapped.top + 110 <= rect.top || wrapped.top >= rect.bottom);
    }

    const pc = context.buildNoticePosition(290, 76, { left: 4, top: 68, right: 1436, bottom: 876 }, [own], [own], market);
    assert.deepStrictEqual({ ...pc }, { left: 1138, top: 792 }, '空いているPC右下は従来位置を維持する');
});

runTest('明示した結果確認だけが逐次字幕と既定送金を呼びsession離脱後は再生しない', () => {
    const source = require('fs').readFileSync(require('path').join(__dirname, '../js/cardBoardField.js'), 'utf8');
    const start = source.indexOf('    function validateResultReplay()');
    const end = source.indexOf('    function updateCurrentResult(', start);
    assert.ok(start >= 0 && end > start);
    const classes = new Set();
    const calls = [];
    const game = { turnCount: 3, currentPlayerIndex: 0, players: [], log: [], phase: 'build' };
    const events = { activations: [] };
    const context = { replayResult: { events, game, session: 'one', turn: 3, actor: 0 },
        activeReplayGuard: null, facts: { game }, session: 'one', mounted: true, enabled: () => true, document: { hidden: false },
        node: () => ({ classList: { add: name => classes.add(name), remove: name => classes.delete(name) }, offsetWidth: 1 }),
        reducedMotionEnabled: () => false,
        activationTags: { clear() {}, play: options => calls.push(['tags', options]) },
        transfers: { clear() {}, play: options => calls.push(['transfers', options]) } };
    require('vm').runInNewContext(source.slice(start, end), context);
    context.playResultReplay();
    assert.deepStrictEqual(calls.map(call => call[0]), ['tags', 'transfers']);
    assert.strictEqual(calls[1][1].simultaneous, undefined, '明示確認は並列autoへ混ぜない');
    assert.strictEqual(calls[0][1].delayMs, 0);
    assert.strictEqual(calls[0][1].isCurrent(), true);
    assert.ok(classes.has('cardboard-preview-playing'));
    context.session = 'two';
    assert.strictEqual(calls[0][1].isCurrent(), false);
    context.playResultReplay();
    assert.strictEqual(calls.length, 2);
});

runTest('明示再生の共通guardは不変再描画を保持しphase・reroll・ログ変更で字幕と送金を同時取消する', () => {
    const source = require('fs').readFileSync(require('path').join(__dirname, '../js/cardBoardField.js'), 'utf8');
    const start = source.indexOf('    function validateResultReplay()');
    const end = source.indexOf('    function updateCurrentResult(', start);
    for (const change of [game => { game.phase = 'roll'; }, game => { game.usedReroll = true; },
        game => { game.log = [...game.log]; }, game => { game.log[game.log.length - 1] = {}; },
        game => { game.log.push({}); }, game => { game.turnCount++; }]) {
        const game = { turnCount: 3, currentPlayerIndex: 0, players: [], phase: 'build', log: [{}, {}] };
        let tagClears = 0, transferClears = 0, removed = 0;
        const context = { replayResult: { events: {}, game, session: 'one', turn: 3, actor: 0 },
            activeReplayGuard: null, facts: { game }, session: 'one', mounted: true, enabled: () => true,
            document: { hidden: false }, reducedMotionEnabled: () => false,
            node: () => ({ classList: { add() {}, remove() { removed++; } }, offsetWidth: 1 }),
            activationTags: { clear() { tagClears++; }, play(options) { context.tagCurrent = options.isCurrent; } },
            transfers: { clear() { transferClears++; }, play() {} } };
        require('vm').runInNewContext(source.slice(start, end), context);
        context.playResultReplay();
        const baseline = [tagClears, transferClears, removed];
        // Rendering may replace the projection object without changing the game.
        context.replayResult = { ...context.replayResult, events: {} };
        context.validateResultReplay();
        assert.strictEqual(context.tagCurrent(), true);
        assert.deepStrictEqual([tagClears, transferClears, removed], baseline);
        change(game);
        assert.strictEqual(context.tagCurrent(), false);
        context.validateResultReplay();
        assert.strictEqual(context.activeReplayGuard, null);
        assert.deepStrictEqual([tagClears, transferClears, removed], baseline.map(value => value + 1));
        context.validateResultReplay();
        assert.deepStrictEqual([tagClears, transferClears, removed], baseline.map(value => value + 1), '取消は一度だけ');
    }
});

runTest('所有者札は同じ配置の再通知でDOMを再生成せず名前・移動・再マウント時に再計算する', () => {
    const fs = require('fs');
    const vm = require('vm');
    const source = fs.readFileSync(require.resolve('../js/cardBoardField'), 'utf8');
    const start = source.indexOf('    function updateOwnerLabels()');
    const end = source.indexOf('    function ensureTable()', start);
    let writes = 0;
    const stop = new Error('placement starts');
    const bounds = { left: 0, top: 0, right: 800, bottom: 300, width: 800, height: 300 };
    const card = { getBoundingClientRect: () => ({ left: 100, top: 80, right: 200, bottom: 180, width: 100, height: 100 }) };
    const panel = { getBoundingClientRect: () => bounds, querySelector: () => card,
        querySelectorAll: () => [card], getAttribute: () => '0', classList: { remove() { throw new Error('unexpected class write'); } } };
    let panels = [panel];
    const viewport = { getBoundingClientRect: () => bounds, querySelectorAll: () => [card],
        clientLeft: 0, clientTop: 0, clientWidth: 800, clientHeight: 300, scrollLeft: 0, scrollTop: 0 };
    const style = new Proxy({}, { set() { throw new Error('unexpected style write'); } });
    const layer = { childNodes: [{}], style, replaceChildren() { writes++; throw stop; } };
    // Allow the first layout's dimension writes; stop before the actual planner.
    const dimensions = {};
    layer.style = dimensions;
    const nodes = { cardboardTableViewport: viewport, cardboardOwnerLabels: layer,
        cardboardSeats: { querySelectorAll: () => panels } };
    const context = { node: id => nodes[id], enabled: () => true, mounted: true, ownerLabelsInspecting: false,
        ownerLabelsGeometry: null, ownerLabelsPanels: [], ownerLabelsLayer: null,
        window: { innerWidth: 844, innerHeight: 390, getComputedStyle: () => ({ fontFamily: 'sans-serif', getPropertyValue: () => '#abc' }) },
        facts: { game: { players: [{ name: '街1' }] } } };
    vm.createContext(context);
    vm.runInContext(source.slice(start, end), context);
    const plan = () => context.updateOwnerLabels();
    assert.throws(plan, error => error === stop);
    assert.strictEqual(writes, 1);
    layer.style = style;
    plan();
    assert.strictEqual(writes, 1, '同一geometryでは削除もstyle再代入も行わない');
    layer.style = dimensions;
    for (const change of [() => { viewport.scrollLeft++; }, () => { bounds.left++; },
        () => { context.facts.game.players[0].name = '名前変更'; },
        () => { panels = [{ ...panel }]; }, () => { layer.childNodes = []; }]) {
        change();
        const before = writes;
        assert.throws(plan, error => error === stop);
        assert.strictEqual(writes, before + 1);
        layer.childNodes = [{}];
        plan();
        assert.strictEqual(writes, before + 1);
    }
});

runTest('所属札は他の札が塞ぐ前に隣接する収支領域を確保し無理な配置は要求しない', () => {
    const field = require('../js/cardBoardField');
    const bounds = { left: 4, top: 116, right: 316, bottom: 457 };
    const leftOwner = { left: 18, top: 182, right: 62, bottom: 204 };
    const leftCard = { left: 18, top: 208, right: 58, bottom: 364 };
    const topCards = { left: 82, top: 145, right: 238, bottom: 185 };
    const input = JSON.stringify({ bounds, leftOwner, leftCard, topCards });
    const space = field.ownerReceiptSpace(leftOwner, bounds, [leftOwner, leftCard, topCards]);
    assert.deepStrictEqual(space, { left: 18, top: 152, right: 62, bottom: 178 });
    const topLeftName = { left: 34, top: 145, right: 78, bottom: 167 };
    const topRightName = { left: 242, top: 145, right: 286, bottom: 167 };
    const overlaps = rect => rect.left < space.right + 2 && rect.right > space.left - 2 &&
        rect.top < space.bottom + 2 && rect.bottom > space.top - 2;
    assert.ok(overlaps(topLeftName));
    assert.ok(!overlaps(topRightName));
    assert.strictEqual(field.ownerReceiptSpace(leftOwner, bounds, [bounds]), null);
    assert.strictEqual(JSON.stringify({ bounds, leftOwner, leftCard, topCards }), input);
});

runTest('134pxカードの実320入力は隣席の唯一の収支空間を塞がない名札候補で全員配置する', () => {
    const transfers = require('../js/cardBoardTransfers');
    // Native 320px/4-player die-3 failure: unchanged labels leave owner 3
    // no legal nearest-owner region, even with all obstacle-edge crossings.
    const bounds = {"left":4,"right":316,"top":116,"bottom":457};
    const owners = [{"owner":0,"width":36,"net":-1,"anchor":{"left":240.765625,"top":387.109375,"right":284.765625,"bottom":409.109375}},{"owner":3,"width":36,"net":2,"anchor":{"left":260.609375,"top":183.71875,"right":304.609375,"bottom":205.71875}},{"owner":2,"width":36,"net":2,"anchor":{"left":240.765625,"top":144.40625,"right":284.765625,"bottom":166.40625}},{"owner":1,"width":36,"net":2,"anchor":{"left":17.90625,"top":183.71875,"right":61.90625,"bottom":205.71875}}];
    const obstacles = [
        {"left":272,"top":52,"right":316,"bottom":96},
        {"left":4,"top":4,"right":316,"bottom":48},
        {"left":92.18364715576172,"top":207.24949645996094,"right":227.81636810302734,"bottom":365.7505187988281},
        {"left":83.22606658935547,"top":387.1109924316406,"right":132.7576446533203,"bottom":428.59368896484375},
        {"left":135.23422241210938,"top":387.1109924316406,"right":184.76577758789062,"bottom":428.59368896484375},
        {"left":187.2423553466797,"top":387.1109924316406,"right":236.77392578125,"bottom":428.59368896484375},
        {"left":17.906312942504883,"top":209.72607421875,"right":59.38900184631348,"bottom":259.25762939453125},
        {"left":17.906312942504883,"top":261.7342224121094,"right":59.38900184631348,"bottom":311.2657775878906},
        {"left":17.906312942504883,"top":313.74237060546875,"right":59.38900184631348,"bottom":363.27392578125},
        {"left":187.2423553466797,"top":144.40631103515625,"right":236.77392578125,"bottom":185.88900756835938},
        {"left":135.23422241210938,"top":144.40631103515625,"right":184.76577758789062,"bottom":185.88900756835938},
        {"left":83.22606658935547,"top":144.40631103515625,"right":132.7576446533203,"bottom":185.88900756835938},
        {"left":260.6109924316406,"top":313.74237060546875,"right":302.09368896484375,"bottom":363.27392578125},
        {"left":260.6109924316406,"top":261.7342224121094,"right":302.09368896484375,"bottom":311.2657775878906},
        {"left":260.6109924316406,"top":209.72607421875,"right":302.09368896484375,"bottom":259.25762939453125},
        {"left":240.765625,"top":387.109375,"right":284.765625,"bottom":409.109375},
        {"left":17.90625,"top":183.71875,"right":61.90625,"bottom":205.71875},
        {"left":240.765625,"top":144.40625,"right":284.765625,"bottom":166.40625},
        {"left":260.609375,"top":183.71875,"right":304.609375,"bottom":205.71875},
        {"left":4,"top":52,"right":268,"bottom":96},
        {"left":8,"top":98,"right":312,"bottom":114}
    ];
    const before = JSON.stringify({ bounds, owners, obstacles });
    assert.strictEqual(transfers.placeNetBadges(owners, bounds, obstacles), null);
    const original = owners.find(owner => owner.owner === 2).anchor;
    const future = owners.find(owner => owner.owner === 3).anchor;
    const same = (a, b) => a.left === b.left && a.top === b.top && a.right === b.right && a.bottom === b.bottom;
    const nameObstacles = obstacles.filter(rect => !same(rect, original) && !same(rect, future));
    const prior = owners.filter(owner => owner.owner === 0 || owner.owner === 1).map(owner => owner.anchor);
    const allCards = obstacles.slice(3, 15);
    const ownCards = allCards.slice(6, 9);
    const competing = allCards.filter(card => !ownCards.includes(card));
    const inner = { left: bounds.left + 4, top: bounds.top + 4, right: bounds.right - 4, bottom: bounds.bottom - 4 };
    // The new side candidate shifts by one receipt-height, then clamps to the
    // same viewport padding. It keeps the full name width/height unchanged.
    const moved = { ...original, top: Math.max(inner.top, original.top - 26) };
    moved.bottom = moved.top + original.bottom - original.top;
    assert.strictEqual(CardBoardField.ownerReceiptScore(original, inner, [...nameObstacles, original], competing, prior), 13.31982421875);
    assert.strictEqual(CardBoardField.ownerReceiptScore(moved, inner, [...nameObstacles, moved], competing, prior), 26);
    const overlap = (a, b, gap) => a.left < b.right + gap && a.right > b.left - gap && a.top < b.bottom + gap && a.bottom > b.top - gap;
    assert.ok(moved.left >= inner.left && moved.right <= inner.right && moved.top >= inner.top && moved.bottom <= inner.bottom);
    assert.ok(nameObstacles.every(rect => !overlap(moved, rect, 3)), '名前の従来3px障害物余白を保つ');
    const distance = (a, b) => Math.hypot(Math.max(b.left - a.right, a.left - b.right, 0), Math.max(b.top - a.bottom, a.top - b.bottom, 0));
    const ownDistance = Math.min(...ownCards.map(card => distance(moved, card)));
    assert.ok(ownDistance <= Math.min(...competing.map(card => distance(moved, card))) + 0.5);
    assert.ok(ownDistance >= 3 && ownDistance <= 64, '既存所属リンクの実距離範囲も保つ');
    const nextOwners = owners.map(owner => owner.owner === 2 ? { ...owner, anchor: moved } : owner);
    const nextObstacles = obstacles.map(rect => same(rect, original) ? moved : rect);
    const plan = transfers.placeNetBadges(nextOwners, bounds, nextObstacles);
    assert.strictEqual(plan.length, 4);
    assert.deepStrictEqual(plan.map(item => [item.owner, item.net]), owners.map(item => [item.owner, item.net]));
    for (const [index, placed] of plan.entries()) {
        assert.strictEqual(placed.width, 36);
        assert.strictEqual(placed.height, 26);
        assert.ok(placed.left >= bounds.left && placed.right <= bounds.right && placed.top >= bounds.top && placed.bottom <= bounds.bottom);
        assert.ok([...nextObstacles, ...plan.slice(index + 1)].every(rect => !overlap(placed, rect, 2)));
        const centerDistance = anchor => Math.hypot((placed.left + placed.right - anchor.left - anchor.right) / 2,
            (placed.top + placed.bottom - anchor.top - anchor.bottom) / 2);
        assert.ok(nextOwners.every(owner => centerDistance(placed.anchor) <= centerDistance(owner.anchor)));
    }
    assert.strictEqual(CardBoardField.ownerReceiptScore(moved, inner, [bounds], competing, prior), -1);
    assert.strictEqual(JSON.stringify({ bounds, owners, obstacles }), before);
});
