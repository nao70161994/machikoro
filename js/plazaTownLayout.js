'use strict';

// Layout receives measured sizes only; camera and DOM ownership stay in PlazaField.
const PlazaTownLayout = (() => {
    function calculate({ towns, marketWidth, marketHeight }) {
        const positions = {};
        const gap = 40, padding = 70;
        if (towns.length <= 4) {
            const cardinal = [[580, 970], [70, 470], [580, 0], [1150, 470]];
            for (const town of towns) {
                const [left, top] = cardinal[town.seat];
                positions[town.seat] = { left, top };
            }
            const north = towns.find(town => town.seat === 2);
            const marketTop = Math.max(420, north ? north.height + 32 : 420);
            if (positions[0]) positions[0].top = Math.max(970, marketTop + marketHeight + 32);
            return { positions, marketLeft: 580, marketTop,
                width: Math.max(1680, 580 + marketWidth + gap,
                    ...towns.map(town => positions[town.seat].left + town.width + gap)),
                height: Math.max(1380, marketTop + marketHeight + gap,
                    ...towns.map(town => positions[town.seat].top + town.height + gap)) };
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
