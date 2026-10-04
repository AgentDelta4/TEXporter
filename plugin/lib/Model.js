// Pure model functions; tempo always means quarter-note BPM.
function validateMeasure(m) {
    if (!isFinite(m.tempo) || m.tempo <= 0) throw new Error('Invalid tempo at measure ' + m.index);
    if (m.numerator !== Math.floor(m.numerator) || m.numerator < 1 || m.numerator > 64)
        throw new Error('Meter numerator must be an integer from 1 to 64.');
    if ([1, 2, 4, 8, 16, 32, 64].indexOf(m.denominator) < 0)
        throw new Error('Unsupported meter denominator: ' + m.denominator);
    for (var field in {durationQuarters:1, durationOverrideQuarters:1}) {
        if (m[field] !== undefined && (!isFinite(m[field]) || m[field] <= 0))
            throw new Error('Invalid actual duration at measure ' + m.number + '.');
    }
    if (m.denominator === 8 && m.grouping) {
        var sum = 0;
        for (var i = 0; i < m.grouping.length; ++i) {
            var group = m.grouping[i];
            if (group !== Math.floor(group) || group < 1) throw new Error('Invalid eighth-note grouping.');
            sum += group;
        }
        if (sum !== m.numerator) throw new Error('Eighth-note groups must add up to the meter numerator.');
    }
}
function regions(measures, options) {
    options = options || {};
    var splitBy = options.splitBy || 'settings';
    if (['settings', 'rehearsal', 'double'].indexOf(splitBy) < 0)
        throw new Error('Invalid preset splitting option.');
    var result = [];
    for (var i = 0; i < measures.length; ++i) {
        var m = measures[i];
        validateMeasure(m);
        var tempo = Math.round(m.tempo * 100) / 100;
        var ramp = m.ramp ? JSON.parse(JSON.stringify(m.ramp)) : null;
        if (ramp) {
            ramp.startTempo = Math.round(ramp.startTempo * 100) / 100;
            ramp.endTempo = Math.round(ramp.endTempo * 100) / 100;
            tempo = ramp.startTempo;
        }
        var last = result.length ? result[result.length - 1] : null;
        var previous = i ? measures[i - 1] : null;
        var boundary = splitBy === 'rehearsal' && m.hasRehearsalMark ||
            splitBy === 'double' && (m.doubleBarlineBefore || previous && previous.doubleBarlineAfter);
        var fullBeats = m.numerator * 4 / m.denominator;
        var actualBeats = m.durationQuarters === undefined ? fullBeats : m.durationQuarters;
        var effectiveBeats = m.durationOverrideQuarters === undefined ? actualBeats : m.durationOverrideQuarters;
        var durationSpecific = Math.abs(actualBeats - fullBeats) > 0.000000001 || m.durationOverrideQuarters !== undefined;
        var requiresTimingDecision = !!(m.requiresTimingDecision || m.freeTime || m.holds && m.holds.length);
        var mergeRamp = last && last.ramp && ramp && last.ramp.id === ramp.id &&
            last.ramp.startBeat === 0 && last.ramp.lengthBeats === last.barCount * fullBeats &&
            ramp.startBeat === 0 && ramp.lengthBeats === fullBeats && last.ramp.endTempo === ramp.startTempo;
        if (options.combine !== false && !boundary && !m.playbackBoundary && !durationSpecific && !requiresTimingDecision &&
            last && !last.isDurationSpecific && !last.requiresTimingDecision && last.endIndex + 1 === m.index &&
            !!last.isRepeat === !!m.isRepeat &&
            last.numerator === m.numerator && last.denominator === m.denominator &&
            (m.denominator !== 8 || String(last.grouping || '') === String(m.grouping || '')) &&
            ((!ramp && !last.ramp && last.tempo === tempo) || mergeRamp)) {
            last.endMeasure = m.number;
            last.endIndex = m.index;
            last.endTick = m.endTick;
            last.barCount++;
            var sourceIndex = m.sourceIndex === undefined ? m.index : m.sourceIndex;
            if (last.sourceIndices.indexOf(sourceIndex) < 0) last.sourceIndices.push(sourceIndex);
            if (mergeRamp) { last.ramp.lengthBeats += ramp.lengthBeats; last.ramp.endTempo = ramp.endTempo; }
        } else {
            var boundaryKind = boundary ? splitBy : '';
            var presetName = boundaryKind === 'rehearsal' ? (m.rehearsalName || '') :
                boundaryKind === 'double' && m.number !== undefined && m.number !== null && m.number !== '' ? String(m.number) : '';
            // Use written position so pickups, numbering offsets and repeat visits retain Top.
            if (!presetName && (m.sourceIndex === undefined ? m.index : m.sourceIndex) === 1)
                presetName = 'Top';
            if (m.isRepeat) presetName = presetName ? presetName + ' (repeat)' : '(repeat)';
            result.push({startMeasure:m.number, endMeasure:m.number, startIndex:m.index,
                endIndex:m.index, startTick:m.startTick, endTick:m.endTick, barCount:1,
                numerator:m.numerator, denominator:m.denominator, tempo:tempo,
                boundaryKind:boundaryKind, presetName:presetName, isRepeat:!!m.isRepeat,
                visitNumber:m.visitNumber || 1, sectionStart:!!(boundary || m.playbackBoundary), ramp:ramp});
            result[result.length-1].sourceIndices = [m.sourceIndex === undefined ? m.index : m.sourceIndex];
            if (requiresTimingDecision) result[result.length-1].requiresTimingDecision = true;
            if (m.denominator === 8) result[result.length-1].grouping = m.grouping ? m.grouping.slice() : null;
            if (durationSpecific) {
                var region = result[result.length - 1];
                region.isDurationSpecific = true;
                region.durationQuarters = effectiveBeats;
                region.sourceDurationQuarters = actualBeats;
                region.isPickup = !!m.isPickup;
                if (m.durationOverrideQuarters !== undefined) region.durationOverrideQuarters = m.durationOverrideQuarters;
            }
        }
    }
    if (!result.length) throw new Error('The score contains no measures.');
    return result;
}
function describe(title, measures, parts, warnings, writtenCount) {
    var lines = ['MuseScore → TonalEnergy', 'Score: ' + title,
        'Written measures: ' + (writtenCount === undefined ? measures.length : writtenCount),
        'Measures played: ' + measures.length, 'Regions: ' + parts.length, ''];
    for (var i = 0; i < parts.length; ++i) {
        var r = parts[i];
        lines.push((i + 1) + '. m.' + r.startMeasure + '–' + r.endMeasure +
            ' | name: ' + (r.presetName ? r.presetName : '(unnamed)') +
            ' | ' + r.barCount + ' bars | ' + r.numerator + '/' + r.denominator +
            ' | quarter = ' + Number(r.tempo.toFixed(2)) + (r.ramp ? ' → ' + r.ramp.endTempo : ''));
    }
    return lines.concat([''], warnings || []).join('\n');
}
