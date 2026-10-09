'use strict';

// Layout receives measured sizes only; camera and DOM ownership stay in PlazaField.
const PlazaTownLayout = (() => {
    function calculate({ towns, marketWidth, marketHeight }) {
        const positions = {};
        const gap = 40, padding = 70;
        if (towns.length <= 4) {
            const compactGap = 32, compactPadding = 40;
            const north = towns.find(town => town.seat === 2);
            const west = towns.find(town => town.seat === 1);
            const marketLeft = compactPadding + (west ? west.width + compactGap : 0);
            const marketTop = Math.max(compactPadding + (north?.height || 0) + compactGap, 320);
            const centerTown = town => marketLeft + (marketWidth - town.width) / 2;
            for (const town of towns) {
                if (town.seat === 0) positions[town.seat] = { left: centerTown(town), top: marketTop + marketHeight + compactGap };
                else if (town.seat === 1) positions[town.seat] = { left: compactPadding, top: marketTop };
                else if (town.seat === 2) positions[town.seat] = { left: centerTown(town), top: compactPadding };
                else positions[town.seat] = { left: marketLeft + marketWidth + compactGap, top: marketTop };
            }
            return { positions, marketLeft, marketTop,
                width: Math.max(marketLeft + marketWidth, ...towns.map(town => positions[town.seat].left + town.width)) + compactPadding,
                height: Math.max(marketTop + marketHeight, ...towns.map(town => positions[town.seat].top + town.height)) + compactPadding };
        }
        const columns = towns.length <= 8 ? 3 : 4;
        const cells = new Map([[0, [1, 2]], [1, [0, 1]], [2, [1, 0]], [3, [2, 1]]]);
        const occupied = new Set(['1,1', ...[...cells.values()].map(cell => cell.join(','))]);
        const available = [];
        for (let row = 0; row < 3; row++) {
            for (let column = 0; column < columns; column++) {
                if (!occupied.has(`${column},${row}`)) available.push([column, row]);
            }
        }
        const ordered = [...towns].sort((a, b) => a.seat - b.seat);
        for (const town of ordered.filter(town => town.seat >= 4)) cells.set(town.seat, available.shift());
        const widths = Array(columns).fill(0), heights = Array(3).fill(0);
        widths[1] = marketWidth; heights[1] = marketHeight;
        for (const town of ordered) {
            const [column, row] = cells.get(town.seat);
            widths[column] = Math.max(widths[column], town.width);
            heights[row] = Math.max(heights[row], town.height);
        }
        const offsets = sizes => sizes.map((_, index) => padding +
            sizes.slice(0, index).reduce((sum, size) => sum + size + gap, 0));
        const lefts = offsets(widths), tops = offsets(heights);
        for (const town of ordered) {
            const [column, row] = cells.get(town.seat);
            positions[town.seat] = { left: lefts[column], top: tops[row] };
        }
        return { positions, marketLeft: lefts[1], marketTop: tops[1],
            width: padding * 2 + widths.reduce((sum, value) => sum + value, 0) + gap * (columns - 1),
            height: padding * 2 + heights.reduce((sum, value) => sum + value, 0) + gap * 2 };
    }
    return Object.freeze({ calculate });
})();
if (typeof module !== 'undefined' && module.exports) module.exports = PlazaTownLayout;
if (typeof window !== 'undefined') window.PlazaTownLayout = PlazaTownLayout;
