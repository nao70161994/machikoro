'use strict';

// Layout receives measured sizes only; camera and DOM ownership stay in PlazaField.
const PlazaTownLayout = (() => {
    function calculate({ towns, marketWidth, marketHeight, orientation = 'landscape' }) {
        const positions = {};
        const gap = 40, padding = 70;
        if (towns.length === 2) {
            const compactGap = 32, compactPadding = 40;
            const self = towns.find(town => town.seat === 0);
            const opponent = towns.find(town => town.seat === 1);
            if (!self || !opponent) throw new Error('Two-player layout requires seats 0 and 1');
            if (orientation === 'landscape') {
                const contentHeight = Math.max(self.height, opponent.height, marketHeight);
                const marketLeft = compactPadding + opponent.width + compactGap;
                const selfLeft = marketLeft + marketWidth + compactGap;
                positions[1] = { left: compactPadding, top: compactPadding + (contentHeight - opponent.height) / 2 };
                positions[0] = { left: selfLeft, top: compactPadding + (contentHeight - self.height) / 2 };
                return { positions, marketLeft, marketTop: compactPadding + (contentHeight - marketHeight) / 2,
                    width: selfLeft + self.width + compactPadding, height: contentHeight + compactPadding * 2 };
            }
            const contentWidth = Math.max(self.width, opponent.width, marketWidth);
            const left = compactPadding + (contentWidth - marketWidth) / 2;
            const townLeft = town => compactPadding + (contentWidth - town.width) / 2;
            positions[1] = { left: townLeft(opponent), top: compactPadding };
            const marketTop = compactPadding + opponent.height + compactGap;
            positions[0] = { left: townLeft(self), top: marketTop + marketHeight + compactGap };
            return { positions, marketLeft: left, marketTop,
                width: contentWidth + compactPadding * 2,
                height: positions[0].top + self.height + compactPadding };
        }
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
