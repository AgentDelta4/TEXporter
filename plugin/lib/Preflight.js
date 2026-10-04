// Pure, notation-independent export checks. Written positions remain stable
// even when printed measure numbers repeat or playback visits are expanded.
function writtenIndex(measure) {
    return measure.sourceIndex === undefined ? measure.index : measure.sourceIndex;
}
function inBounds(index, bounds) {
    return !bounds || index === undefined || index === null ||
        index >= bounds.first && index <= bounds.last;
}
function measureLabel(index, number) {
    return 'm.' + (number === undefined || number === null || number === '' ? index : number) +
        ' (bar ' + index + ')';
}
function holdKinds(measure) {
    var kinds = [], holds = measure.holds || [];
    for (var i = 0; i < holds.length; ++i) {
        var kind = holds[i].kind;
        if (['fermata', 'caesura', 'breath', 'sectionPause'].indexOf(kind) >= 0 && kinds.indexOf(kind) < 0)
            kinds.push(kind);
    }
    if (measure.freeTime) kinds.push('freeTime');
    return kinds;
}
function describeKinds(kinds) {
    var labels = {fermata:'Fermata', caesura:'Caesura', breath:'Breath mark', sectionPause:'Section pause', freeTime:'Free-time passage'};
    var description = [];
    for (var i = 0; i < kinds.length; ++i) description.push(labels[kinds[i]]);
    return description.join(', ');
}
function requirements(measures, bounds) {
    var rows = [], positions = {};
    for (var i = 0; i < measures.length; ++i) {
        var measure = measures[i], index = writtenIndex(measure), kinds = holdKinds(measure);
        if (!inBounds(index, bounds) || !kinds.length) continue;
        var key = String(index), row = positions[key];
        if (!row) {
            row = {measureIndex:index, measureNumber:measure.number, kinds:[], description:''};
            positions[key] = row; rows.push(row);
        }
        for (var k = 0; k < kinds.length; ++k)
            if (row.kinds.indexOf(kinds[k]) < 0) row.kinds.push(kinds[k]);
        row.description = describeKinds(row.kinds);
    }
    return rows;
}
function countDuration(measure, raw) {
    var label = measureLabel(writtenIndex(measure), measure.number);
    var text = raw === undefined || raw === null ? '' : String(raw).trim();
    var count = Number(text);
    if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(text) || !isFinite(count) || count <= 0)
        throw new Error(label + ': enter a positive total count length for the measure.');
    var denominator = measure.denominator;
    if ([1, 2, 4, 8, 16, 32, 64].indexOf(denominator) < 0)
        throw new Error(label + ': the meter denominator cannot be used for a count length.');
    var quarters = count * 4 / denominator, numerator = count, base = denominator;
    // Keep the nominal click unit, refining it only when the entered count
    // is fractional. Coarsening it would change the audible click pattern.
    while (base < 64 && numerator !== Math.floor(numerator)) { numerator *= 2; base *= 2; }
    if (!isFinite(numerator) || numerator !== Math.floor(numerator) || numerator < 1)
        throw new Error(label + ': the count length must fit a whole-note to 64th-note grid.');
    if (numerator > 64)
        throw new Error(label + ': the count length exceeds TonalEnergy\'s 64-count preset limit.');
    return quarters;
}
function applyDecisions(selectedWritten, decisions) {
    decisions = decisions || {};
    var copies = [], required = requirements(selectedWritten), byIndex = {};
    for (var r = 0; r < required.length; ++r) byIndex[String(required[r].measureIndex)] = true;
    for (var i = 0; i < selectedWritten.length; ++i) {
        var source = selectedWritten[i], index = writtenIndex(source);
        var copy = JSON.parse(JSON.stringify(source));
        if (byIndex[String(index)]) {
            copy.requiresTimingDecision = true;
            var choice = decisions[String(index)];
            if (!choice || ['steady', 'counts'].indexOf(choice.mode) < 0)
                throw new Error(measureLabel(index, source.number) + ': choose steady clicks or enter a count length before exporting.');
            if (choice.mode === 'counts') copy.durationOverrideQuarters = countDuration(source, choice.counts);
            else delete copy.durationOverrideQuarters;
        }
        copies.push(copy);
    }
    return copies;
}
function coversMeasure(region, index) {
    if (region.sourceIndices && region.sourceIndices.length)
        return region.sourceIndices.indexOf(index) >= 0;
    var first = region.sourceStartIndex, last = region.sourceEndIndex;
    if (first === undefined) { first = region.startIndex; last = region.endIndex; }
    return first !== undefined && last !== undefined && index >= first && index <= last;
}
function groupingResolved(entry, regions) {
    if (entry.measureIndex === undefined || entry.measureIndex === null) return false;
    var matches = 0;
    for (var i = 0; i < regions.length; ++i) {
        var region = regions[i];
        if (!coversMeasure(region, entry.measureIndex)) continue;
        matches++;
        if ((region.denominator === undefined || region.denominator === 8) && (!region.grouping || !region.grouping.length)) return false;
    }
    return matches > 0;
}
function collect(analysis, bounds, regions, serializerWarnings) {
    analysis = analysis || {}; regions = regions || [];
    var attention = analysis.attention || [], result = [], seen = {}, seenMessages = {};
    for (var i = 0; i < attention.length; ++i) {
        var entry = attention[i];
        if (!entry || !entry.message || !inBounds(entry.measureIndex, bounds)) continue;
        // Timing choices have their own required-input rows. Keeping their
        // original warning here would leave a stale prompt after a choice.
        if (entry.kind === 'hold') continue;
        if (entry.kind === 'grouping' && groupingResolved(entry, regions)) continue;
        var key = String(entry.kind || 'attention') + ':' + String(entry.measureIndex) + ':' + entry.message;
        if (seen[key]) continue;
        seen[key] = true; seenMessages[entry.message] = true;
        var copy = {message:String(entry.message), kind:entry.kind || 'attention'};
        if (entry.measureIndex !== undefined) copy.measureIndex = entry.measureIndex;
        if (entry.measureNumber !== undefined) copy.measureNumber = entry.measureNumber;
        result.push(copy);
    }
    var warnings = serializerWarnings || [];
    for (var w = 0; w < warnings.length; ++w) {
        var warning = warnings[w];
        var message = typeof warning === 'string' ? warning : warning && warning.message;
        if (!message || seenMessages[message]) continue;
        seenMessages[message] = true;
        var item = {message:String(message), kind:typeof warning === 'string' ? 'serializer' : warning.kind || 'serializer'};
        if (typeof warning !== 'string' && warning.measureIndex !== undefined)
            item.measureIndex = warning.measureIndex;
        result.push(item);
    }
    return result;
}
