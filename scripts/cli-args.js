function integerOrDefault(value, fallback) {
    return Number.isInteger(value) ? value : fallback;
}

function parseIntegerOrDefault(value, fallback) {
    const parsed = parseInt(value, 10);
    return Number.isInteger(parsed) ? parsed : fallback;
}

function parseFloatOrDefault(value, fallback) {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function parseList(value) {
    return String(value || '')
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);
}

function parseIntegerList(value, options = {}) {
    const min = Number.isInteger(options.min) ? options.min : null;
    return parseList(value)
        .map(item => parseIntegerOrDefault(item, NaN))
        .filter(item => Number.isInteger(item) && (min === null || item >= min));
}

function parseLineups(value) {
    return String(value || '')
        .split(';')
        .map(part => part.split(',').map(item => item.trim()).filter(Boolean))
        .filter(lineup => lineup.includes('rl') && lineup.length >= 2);
}

module.exports = {
    integerOrDefault,
    parseFloatOrDefault,
    parseIntegerOrDefault,
    parseIntegerList,
    parseLineups,
    parseList,
};
