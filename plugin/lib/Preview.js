function rounded(value) { return Math.round(value * 100) / 100; }
function number(value, label) {
    if (String(value).trim() === '' || !isFinite(Number(value))) throw new Error(label + ' must be a number.');
    return Number(value);
}
function quarters(region) {
    return region.durationOverrideQuarters !== undefined ? region.durationOverrideQuarters :
        region.durationQuarters === undefined ? region.barCount * region.numerator * 4 / region.denominator : region.durationQuarters;
}
function durationSpecific(region) {
    return !!region.isDurationSpecific || !!region.requiresTimingDecision || region.durationQuarters !== undefined || region.durationOverrideQuarters !== undefined;
}
function apply(region, edit) {
    var r = JSON.parse(JSON.stringify(region));
    r.presetName = String(edit.name);
    r.barCount = number(edit.bars,'Bars');
    r.numerator = number(edit.meterTop,'Meter numerator'); r.denominator = number(edit.meterBase,'Meter denominator');
    r.tempo = rounded(number(edit.startTempo,'Starting BPM'));
    if (r.barCount !== Math.floor(r.barCount) || r.barCount < 1 || r.barCount > 100000)
        throw new Error('Bars must be an integer from 1 to 100,000.');
    if (r.numerator !== Math.floor(r.numerator) || r.numerator < 1 || r.numerator > 64 ||
        [1,2,4,8,16,32,64].indexOf(r.denominator) < 0) throw new Error('Enter a supported meter.');
    if (durationSpecific(region) && (r.barCount !== region.barCount || r.numerator !== region.numerator || r.denominator !== region.denominator))
        throw new Error('Bars and meter are fixed for a pickup, irregular bar or chosen hold duration.');
    delete r.grouping;
    if (r.denominator === 8) {
        var groupingText = String(edit.grouping === undefined ? (region.grouping || []).join('+') : edit.grouping).replace(/\s/g,'');
        if (groupingText) {
            if (!/^\d+(?:[+-]\d+)*$/.test(groupingText)) throw new Error('Enter grouping as 3+2+2.');
            r.grouping = groupingText.split(/[+-]/).map(Number);
            var sum = 0;
            for (var group = 0; group < r.grouping.length; ++group) {
                if (r.grouping[group] < 1) throw new Error('Grouping values must be positive.');
                sum += r.grouping[group];
            }
            if (sum !== r.numerator) throw new Error('Grouping must add up to ' + r.numerator + '.');
        }
    }
    if (r.tempo < 1 || r.tempo > 1000) throw new Error('BPM must be 1–1000.');
    delete r.ramp;
    if (edit.rampEnabled) {
        var target = rounded(number(edit.endTempo,'Ending BPM'));
        var start = number(edit.rampStart,'Ramp start'), length = number(edit.rampLength,'Ramp length');
        if (target < 1 || target > 1000) throw new Error('Ending BPM must be 1–1000.');
        if (start !== Math.floor(start) || start < 0 || length !== Math.floor(length) || length < 1 ||
            start + length > quarters(r))
            throw new Error('Ramp positions must be whole quarter beats within this preset.');
        r.ramp = {startTempo:r.tempo,endTempo:target,startBeat:start,lengthBeats:length};
    }
    return r;
}
function edit(region) {
    var ramp = region.ramp;
    return {name:region.presetName || '', bars:String(region.barCount), meterTop:String(region.numerator),
        isDurationSpecific:durationSpecific(region), actualCounts:String(Math.round(quarters(region) * region.denominator / 4 * 1000000) / 1000000),
        grouping:region.denominator === 8 && region.grouping ? region.grouping.join('+') : '',
        meterBase:String(region.denominator), startTempo:String(ramp ? ramp.startTempo : region.tempo),
        endTempo:String(ramp ? ramp.endTempo : region.tempo), rampEnabled:!!ramp,
        rampStart:String(ramp ? ramp.startBeat : 0),
        rampLength:String(ramp ? ramp.lengthBeats : Math.floor(quarters(region))),
        source:'m.' + region.startMeasure + '–' + region.endMeasure};
}
function duration(region) {
    var beats = quarters(region), ramp = region.ramp;
    if (!ramp) return beats * 60 / region.tempo;
    var difference = ramp.endTempo - ramp.startTempo;
    var during = Math.abs(difference) < 0.000001 ? ramp.lengthBeats * 60 / ramp.startTempo :
        60 * ramp.lengthBeats * Math.log(ramp.endTempo / ramp.startTempo) / difference;
    return ramp.startBeat * 60 / ramp.startTempo + during +
        (beats - ramp.startBeat - ramp.lengthBeats) * 60 / ramp.endTempo;
}
