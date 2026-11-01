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

runTest('建設通知の1200msは最初の描画更新から数え取消後に再開しない', () => {
    const source = require('fs').readFileSync(require('path').join(__dirname, '../js/cardBoardField.js'), 'utf8');
    const clearStart = source.indexOf('    function clearBuildNotice()');
    const showStart = source.indexOf('    function showBuildNotice(card)', clearStart);
    const scheduleStart = source.indexOf('        const context = { session, turn: facts.game.turnCount, actor: facts.game.currentPlayerIndex };', showStart);
    const scheduleEnd = source.indexOf('        return true;', scheduleStart);
    assert.ok(clearStart >= 0 && showStart > clearStart && scheduleStart > showStart && scheduleEnd > scheduleStart);
    const frames = new Map(), timers = new Map();
    let sequence = 0, removed = 0;
    const context = {
        buildNoticeFrame: null, buildNoticeTimer: null, buildNoticeContext: null,
        notice: { isConnected: true }, session: 'game', mounted: true,
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

runTest('購入後の市場closeは復帰geometryを同期してから同taskで建設を示す', () => {
    const source = require('fs').readFileSync(require('path').join(__dirname, '../js/cardBoardField.js'), 'utf8');
    const start = source.indexOf('    function finishMarketClose()');
    const end = source.indexOf('    function isMarketExpanded()', start);
    assert.ok(start >= 0 && end > start);
    const order = [], frames = [];
    const context = {
        restoreMarketNode: () => order.push('restore'),
        setMarketExpanded: expanded => order.push(`expanded:${expanded}`),
        marketLauncher: { isConnected: true, getClientRects: () => [1], focus: () => order.push('focus') },
        marketLauncherSelector: null, restoreMarketFocus: true,
        enabled: () => true, node: () => ({ style: { display: '' }, querySelector: () => null }),
        pendingBuildCues: [{}],
        tableLayout: { syncLayout: () => order.push('table'), refresh: () => order.push('refresh') },
        tableCamera: { syncLayout: () => order.push('camera'), preserveReadingPosition: active => order.push(`preserve:${active}`) },
        presentPendingBuildCues: () => order.push('cue'),
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
    order.length = 0;
    context.tableLayout = null;
    context.tableCamera = null;
    context.finishMarketClose();
    assert.deepStrictEqual(order, ['restore', 'expanded:false', 'cue']);
});

runTest('閲覧カードの位置復元は対象消失を呼出元へ返し比例位置を可視範囲へ保つ', () => {
    const source = require('fs').readFileSync(require('path').join(__dirname, '../js/cardTableCamera.js'), 'utf8');
    const start = source.indexOf('        function restoreInspectionAnchor(anchor)');
    const end = source.indexOf('        function retainInspectionOnResize(anchor)', start);
    assert.ok(start >= 0 && end > start);
    let cards = [], destination = null;
    const context = {
        destroyed: false, focusPlayer: 1, viewport: { clientWidth: 300, clientHeight: 500 },
        seat: () => ({ querySelectorAll: () => cards }),
        paint() {}, updateFocus() {}, cacheInspectionAnchor() {},
        clientToWorld: (x, y) => ({ x, y }), alignPoint: (point, target) => { destination = target; },
    };
    require('vm').runInNewContext(source.slice(start, end), context);
    const anchor = { playerIndex: 1, name: '麦畑', x: 0.25, y: 0.75, preservePosition: true };
    assert.strictEqual(context.restoreInspectionAnchor(anchor), false, '消失時はworld中心fallbackを可能にする');
    assert.strictEqual(destination, null);
    cards = [{ dataset: { cardName: '麦畑' }, getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 80 }) }];
    assert.strictEqual(context.restoreInspectionAnchor(anchor), true);
    assert.strictEqual(destination.x, 75);
    assert.strictEqual(destination.y, 375);
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
        const context = { panel, left, top, width, height: 22, index: 0,
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
