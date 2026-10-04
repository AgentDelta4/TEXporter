// Notation-independent expansion of ordinary, non-nested repeat barlines.
function expand(measures, options, navigation) {
    options = options || {};
    var mode = options.repeatMode || 'ignore';
    if (['ignore', 'follow'].indexOf(mode) < 0) throw new Error('Invalid repeat handling option.');
    if (mode === 'follow' && navigation && navigation.length)
        throw new Error('Follow score repeats supports ordinary repeat barlines only. Numbered endings or playback jumps are present; choose Ignore repeats for this score.');
    var ends = {}, activeStart = null, sectionStart = 0, implicitUsed = false;
    if (mode === 'follow') {
        for (var p = 0; p < measures.length; ++p) {
            var m = measures[p];
            if (m.repeatStart) {
                if (activeStart !== null)
                    throw new Error('Nested or unmatched repeat starts at m.' + m.number + '; choose Ignore repeats.');
                activeStart = p;
            }
            if (m.repeatEnd) {
                if (activeStart === null && implicitUsed)
                    throw new Error('Multiple end repeats without a new start at m.' + m.number + '; choose Ignore repeats.');
                var count = m.repeatCount === undefined ? 2 : m.repeatCount;
                if (!isFinite(count) || count !== Math.floor(count) || count < 1 || count > 1000)
                    throw new Error('Invalid repeat play count at m.' + m.number + ' (expected 1–1000).');
                ends[p] = {start:activeStart === null ? sectionStart : activeStart, count:count};
                activeStart = null;
                implicitUsed = true;
            }
            if (m.sectionBreakAfter) {
                if (activeStart !== null) throw new Error('Repeat start crosses a section break; choose Ignore repeats.');
                sectionStart = p + 1;
                implicitUsed = false;
            }
        }
        if (activeStart !== null) throw new Error('Repeat start has no matching end; choose Ignore repeats.');
    }
    var visits = [], seen = {}, passes = {}, position = 0;
    while (position < measures.length) {
        if (visits.length >= 100000) throw new Error('Repeat expansion exceeds 100,000 measures; reduce play counts or choose Ignore repeats.');
        var source = measures[position], copy = {};
        for (var key in source) if (Object.prototype.hasOwnProperty.call(source, key)) copy[key] = source[key];
        var previous = visits.length ? visits[visits.length - 1] : null;
        seen[position] = (seen[position] || 0) + 1;
        copy.sourceIndex = source.index;
        copy.index = visits.length + 1;
        copy.visitNumber = seen[position];
        copy.isRepeat = copy.visitNumber > 1;
        // A source double-barline boundary still applies when jumping back into its section.
        copy.doubleBarlineBefore = !!(source.doubleBarlineBefore || position > 0 && measures[position - 1].doubleBarlineAfter);
        copy.playbackBoundary = mode === 'follow' && !!(source.repeatStart ||
            previous && (previous.sourceIndex + 1 !== copy.sourceIndex || previous.repeatEnd ||
                previous.isRepeat !== copy.isRepeat || previous.sectionBreakAfter));
        visits.push(copy);
        var end = mode === 'follow' ? ends[position] : null;
        if (end) {
            passes[position] = (passes[position] || 0) + 1;
            position = passes[position] < end.count ? end.start : position + 1;
        } else position++;
    }
    return {measures:visits, writtenCount:measures.length,
        warnings:[]};
}
