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
        tableCamera: { syncLayout: () => order.push('camera') },
        presentPendingBuildCues: () => order.push('cue'),
        requestAnimationFrame: callback => frames.push(callback),
    };
    require('vm').runInNewContext(source.slice(start, end), context);
    context.finishMarketClose();
    assert.deepStrictEqual(order, ['restore', 'expanded:false', 'focus', 'table', 'camera', 'cue']);
    assert.strictEqual(frames.length, 0, '購入演出を次のframeまで待たない');
    order.length = 0;
    context.pendingBuildCues = [];
    context.finishMarketClose();
    assert.deepStrictEqual(order, ['restore', 'expanded:false', 'refresh']);
    assert.strictEqual(frames.length, 1, '購入しないcloseは通常のrefreshを維持する');
    frames[0]();
    assert.strictEqual(order.at(-1), 'cue');
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
    const anchor = { playerIndex: 1, name: '麦畑', x: 0.25, y: 0.75 };
    assert.strictEqual(context.restoreInspectionAnchor(anchor), false, '消失時はworld中心fallbackを可能にする');
    assert.strictEqual(destination, null);
    cards = [{ dataset: { cardName: '麦畑' }, getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 80 }) }];
    assert.strictEqual(context.restoreInspectionAnchor(anchor), true);
    assert.strictEqual(destination.x, 75);
    assert.strictEqual(destination.y, 375);
    context.restoreInspectionAnchor({ ...anchor, x: -0.2, y: 1.2 });
    assert.strictEqual(destination.x, 0);
    assert.strictEqual(destination.y, 500);
    context.focusPlayer = 0;
    assert.strictEqual(context.restoreInspectionAnchor(anchor), false, '新しい閲覧対象を古いanchorで上書きしない');
    context.focusPlayer = 1;
    context.destroyed = true;
    assert.strictEqual(context.restoreInspectionAnchor(anchor), false);
});
