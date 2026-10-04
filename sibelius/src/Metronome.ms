// Native metronome/duration projection, shared by preview and XML export.
// INDEV: the test interpreter checks this source; Sibelius/TE playback is unverified.
// Sibelius uses 256 ticks per quarter. Float divisors are intentional: integer-only
// ManuScript division truncates, and binary expressions evaluate left-to-right.

MetAbs(value) {
    if (value < 0) { return -value; }
    return value;
}

MetGrouping(text, top) {
    text = TrimText('' & text);
    groups = CreateSparseArray();
    if (text = '') { return groups; }
    token = '';
    sum = 0;
    i = 0;
    while (i <= Length(text)) {
        c = '';
        if (i < Length(text)) { c = CharAt(text, i); }
        if ((i = Length(text)) or (c = '+') or (c = '-')) {
            value = NumberValue(token, 1, 64, True);
            if (value < 1) { Fail('Enter positive eighth-note groups as 3+2+2.'); return null; }
            groups.Push(value);
            sum = sum + value;
            token = '';
        }
        else {
            n = Asc(c);
            if ((n != 32) and (n != 9) and (n != 10) and (n != 13)) { token = token & c; }
        }
        i = i + 1;
    }
    if (sum != top) { Fail('Eighth-note groups must add up to the meter numerator.'); return null; }
    return groups;
}

ValidateGrouping(text, top) {
    return MetGrouping(text, top) != null;
}

MetGroupStarts(groups) {
    starts = CreateSparseArray();
    position = 1;
    for each size in groups {
        starts.Push(position);
        position = position + size;
    }
    return starts;
}

MetContains(values, position) {
    for each value in values { if (value = position) { return True; } }
    return False;
}

MetPlays(position, base, pattern, starts) {
    if (pattern = 'full') { return True; }
    if (pattern = 'downbeat') { return position = 1; }
    if (base = 8) {
        if (starts.Length = 0) { return True; }
        return MetContains(starts, position);
    }
    return (position % 2) = 1;
}

MetAccents(position, pattern, starts) {
    if ((pattern = 'downbeat') or (starts.Length = 0)) { return position = 1; }
    return MetContains(starts, position);
}

MetDecimalDouble(decimal, carry) {
    result = '';
    i = Length(decimal) - 1;
    while (i >= 0) {
        digit = Asc(CharAt(decimal, i)) - 48;
        value = (digit * 2) + carry;
        result = ('' & (value % 10)) & result;
        carry = RoundDown(value / 10.0);
        i = i - 1;
    }
    if (carry > 0) { result = ('' & carry) & result; }
    return result;
}

MetCountMask(top, positions, fillUnused) {
    decimal = '0';
    low = 0;
    bit = 63;
    while (bit >= 0) {
        enabled = False;
        if (bit >= top) { enabled = fillUnused; }
        else { enabled = MetContains(positions, bit + 1); }
        flag = 0;
        if (enabled) { flag = 1; }
        decimal = MetDecimalDouble(decimal, flag);
        // Keep every intermediate legacy-mask value in signed 32-bit range.
        if (bit = 31) { if (enabled) { low = -1; } }
        else { if (bit < 31) { low = (low * 2) + flag; } }
        bit = bit - 1;
    }
    return CreateDictionary('mask', '' & low, 'mask64', decimal);
}

PreparePreset(r, metVersion) {
    if ((r.bars < 1) or (r.bars > 100000) or (RoundDown(r.bars) != r.bars) or
        (not ValidMeter(r.top, r.base)) or (r.tempo < 1) or (r.tempo > 1000) or (r.tempo != r.tempo)) {
        Fail('Invalid preset values. Edit the preset before exporting.'); return null;
    }
    if ((ClickStyle != 'Accent downbeat') and (ClickStyle != 'Straight')) {
        Fail('Choose a valid click style.'); return null;
    }
    pattern = metVersion;
    if (pattern = 'Full Met') { pattern = 'full'; }
    if (pattern = 'Half-note Met') { pattern = 'half'; }
    if (pattern = 'Downbeat Met') { pattern = 'downbeat'; }
    if ((pattern != 'full') and (pattern != 'half') and (pattern != 'downbeat')) {
        Fail('Choose a valid met version.'); return null;
    }
    mode = r._property:timingMode;
    if (mode = null) { mode = ''; }
    required = r._property:requiresTimingDecision;
    partial = r._property:partial;
    if (required and (mode = '')) {
        Fail('Choose Keep steady clicks or Set total counts for every detected hold/free-time bar.'); return null;
    }
    if ((mode != '') and (mode != 'Keep steady clicks') and (mode != 'Set total counts')) {
        Fail('Choose a valid hold/free-time timing option.'); return null;
    }
    if ((partial or required or (mode = 'Set total counts')) and (r.bars != 1)) {
        Fail('A hold/free-time or irregular-duration bar must occupy its own preset.'); return null;
    }
    groups = CreateSparseArray();
    if (r.base = 8) {
        grouping = r._property:groupingText;
        if (grouping = null) { grouping = ''; }
        groups = MetGrouping(grouping, r.top);
        if (groups = null) { return null; }
    }
    starts = MetGroupStarts(groups);
    nominalTicks = ((r.bars * r.top) * 1024.0) / r.base;
    durationTicks = nominalTicks;
    sourceLength = r._property:sourceLength;
    if (partial) {
        if ((sourceLength = null) or (sourceLength <= 0) or (sourceLength != sourceLength)) {
            Fail('An irregular bar needs a positive actual length.'); return null;
        }
        durationTicks = sourceLength;
    }
    if (mode = 'Set total counts') {
        counts = r._property:totalCounts;
        countBase = r._property:countBase;
        if ((counts = null) or (counts <= 0) or (counts != counts) or (countBase = null)) {
            Fail('Enter a positive total count length.'); return null;
        }
        if (not ValidMeter(1, countBase)) { Fail('Choose a valid total-count unit.'); return null; }
        durationTicks = (counts * 1024.0) / countBase;
    }
    if ((durationTicks <= 0) or (durationTicks != durationTicks)) {
        Fail('Invalid actual duration.'); return null;
    }
    top = r.top;
    base = r.base;
    bars = r.bars;
    projected = MetAbs(durationTicks - nominalTicks) > 0.000000256;
    if (projected) {
        if (bars != 1) { Fail('An irregular duration must occupy its own preset.'); return null; }
        count = (durationTicks * base) / 1024.0;
        while ((MetAbs(count - Round(count)) > 0.000000001) and (base < 64)) {
            base = base * 2;
            count = (durationTicks * base) / 1024.0;
        }
        if ((MetAbs(count - Round(count)) > 0.000000001) or (count < 1) or (count > 64)) {
            Fail('Actual duration cannot be represented exactly within 64 counts and a /64 grid.'); return null;
        }
        top = Round(count);
        bars = 1;
    }
    offset = 0;
    if (projected and r._property:pickup) {
        if ((sourceLength = null) or (sourceLength <= 0)) { sourceLength = durationTicks; }
        offset = r.top - ((sourceLength * r.base) / 1024.0);
        if (offset < 0) { offset = 0; }
    }
    enabled = CreateSparseArray();
    accented = CreateSparseArray();
    count = 1;
    while (count <= top) {
        nominal = count - 1;
        if (projected) { nominal = offset + (((count - 1) * r.base) / (base + 0.0)); }
        // Refining the duration grid must not add audible subdivisions.
        if (MetAbs(nominal - Round(nominal)) <= 0.000000001) {
            position = (Round(nominal) % r.top) + 1;
            if (MetPlays(position, r.base, pattern, starts)) {
                enabled.Push(count);
                if ((ClickStyle = 'Accent downbeat') and MetAccents(position, pattern, starts)) { accented.Push(count); }
            }
        }
        count = count + 1;
    }
    beat = MetCountMask(top, enabled, True);
    accent = MetCountMask(top, accented, False);
    meter = 398;
    subdiv = 400;
    inferred = True;
    if (base = 4) {
        subdiv = 104;
        if (top <= 8) { meter = 199 + top; }
        inferred = (top != 1) and (top != 2) and (top != 3) and (top != 4) and (top != 6) and (top != 8);
    }
    else { if ((top = 7) and (base = 8)) { inferred = False; } }
    return CreateDictionary('name', r.name, 'tempo', Round(r.tempo * 100.0) / 100.0, 'ramp', r.ramp,
        'top', top, 'base', base, 'bars', bars, 'nominalTop', r.top, 'nominalBase', r.base,
        'durationTicks', durationTicks, 'projected', projected, 'meter', meter, 'subdiv', subdiv,
        'beatMask', beat.mask, 'beatMask64', beat.mask64, 'accentMask', accent.mask,
        'accentMask64', accent.mask64, 'inferred', inferred);
}
