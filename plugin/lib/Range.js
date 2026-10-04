function bounds(measures, mode, first, last, selection) {
    if (!measures.length) throw new Error('The score contains no measures.');
    if (mode === 'all') return {first:1,last:measures.length};
    if (mode === 'selection') {
        if (!selection) throw new Error('Select a continuous measure range in MuseScore, or choose Measure range.');
        return {first:selection.first,last:selection.last};
    }
    if (mode !== 'range') throw new Error('Invalid export range option.');
    if (!isFinite(first) || !isFinite(last) || first !== Math.floor(first) || last !== Math.floor(last) ||
        first < 1 || last > measures.length || first > last)
        throw new Error('Choose a valid first and last bar position within the score.');
    return {first:first,last:last};
}
function selectWritten(measures, range, options) {
    var selected = [], initial = measures[range.first - 1];
    for (var i = range.first - 1; i < range.last; ++i) {
        var copy = JSON.parse(JSON.stringify(measures[i]));
        if (options.readRamps && options.readTempo !== false && copy.rampError)
            throw new Error('m.' + copy.number + ': ' + copy.rampError);
        // Preserve the double barline immediately before the exported range.
        if (i > 0 && measures[i-1].doubleBarlineAfter) copy.doubleBarlineBefore = true;
        if (options.readTempo === false) {
            copy.tempo = initial.tempo;
            delete copy.ramp;
        }
        if (options.readRamps === false) delete copy.ramp;
        if (options.readMeter === false) {
            // Freezing meter intentionally gives ordinary bars the chosen meter's
            // full duration. Preserve source pickups/irregular lengths and explicit
            // hold decisions rather than treating every later meter as a pickup.
            var sourceFull = copy.numerator * 4 / copy.denominator;
            var sourceIrregular = copy.durationQuarters !== undefined && Math.abs(copy.durationQuarters - sourceFull) > 0.000000001;
            copy.numerator = initial.numerator; copy.denominator = initial.denominator;
            if (!sourceIrregular && copy.durationOverrideQuarters === undefined)
                copy.durationQuarters = initial.numerator * 4 / initial.denominator;
            if (initial.grouping) copy.grouping = initial.grouping.slice(); else delete copy.grouping;
        }
        selected.push(copy);
    }
    return selected;
}
function selectVisits(visits, range, written) {
    var selected = [], previous = null;
    for (var i = 0; i < visits.length; ++i) {
        var source = visits[i];
        if (source.sourceIndex < range.first || source.sourceIndex > range.last) continue;
        var copy = JSON.parse(JSON.stringify(source));
        var settings = written[source.sourceIndex - range.first];
        copy.tempo = settings.tempo; copy.numerator = settings.numerator; copy.denominator = settings.denominator;
        if (settings.grouping) copy.grouping = settings.grouping.slice(); else delete copy.grouping;
        if (settings.ramp) copy.ramp = settings.ramp; else delete copy.ramp;
        if (settings.durationQuarters !== undefined) copy.durationQuarters = settings.durationQuarters; else delete copy.durationQuarters;
        if (settings.durationOverrideQuarters !== undefined) copy.durationOverrideQuarters = settings.durationOverrideQuarters; else delete copy.durationOverrideQuarters;
        copy.isPickup = !!settings.isPickup;
        if (settings.requiresTimingDecision) copy.requiresTimingDecision = true; else delete copy.requiresTimingDecision;
        copy.index = selected.length + 1;
        copy.playbackBoundary = copy.playbackBoundary || !!(previous && previous.sourceIndex + 1 !== copy.sourceIndex);
        selected.push(copy); previous = copy;
    }
    return selected;
}
