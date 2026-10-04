// INDEV: documented ManuScript APIs; not yet verified inside live Sibelius.
// All score objects below are read only. Only plugin-owned records/arrays change.
// API evidence: ManuScript Language Guide (2026.2), pp. 48, 53, 77-79,
// 116-119, 194, 196 and 198. TimeSignature has no documented beam-group accessor.

ReadScoreDetails(record, bar, meter) {
    record._property:groupingText = '';
    record._property:needsGrouping = False;
    record._property:holdReasons = CreateSparseArray();
    record._property:needsDecision = False;
    ReadDetailHolds(record, bar);
    candidate = '';
    conflict = False;
    for each staff in Active {
        staffBar = staff.NthBar(record.index);
        ReadDetailHolds(record, staffBar);
        if (meter.Denominator = 8) {
            voice = 1;
            while (voice <= 4) {
                grouping = DetailVoiceGrouping(staffBar, voice, meter.Numerator);
                if (grouping != '') {
                    if (candidate = '') { candidate = grouping; }
                    else { if (candidate != grouping) { conflict = True; } }
                }
                voice = voice + 1;
            }
        }
    }
    if (meter.Denominator = 8) {
        if (not conflict) {
            if (candidate != '') { record.groupingText = candidate; }
            else { record.groupingText = DetailDefaultGrouping(meter.Numerator); }
        }
        record.needsGrouping = record.groupingText = '';
    }
    record.needsDecision = record.holdReasons.Length > 0;
    return True;
}

DetailDefaultGrouping(top) {
    if (top = 3) { return '3'; }
    if ((top < 6) or ((top % 3) != 0)) { return ''; }
    result = '';
    count = 0;
    while (count < top) {
        if (result != '') { result = result & '+'; }
        result = result & '3';
        count = count + 3;
    }
    return result;
}

DetailVoiceGrouping(bar, voice, top) {
    // An irregular/pickup voice cannot establish a complete nominal grouping.
    if (bar.Length != (top * 128)) { return ''; }
    notes = CreateSparseArray();
    for each NoteRest nr in bar {
        if ((nr.VoiceNumber = voice) and (not nr.GraceNote)) {
            // Tuplet Duration is written duration. Cross-staff beaming also
            // cannot safely establish a single staff/voice's primary groups.
            if ((nr.ParentTupletIfAny != null) or (nr.CrossStaff != 0)) { return ''; }
            if ((nr.Duration <= 0) or (nr.Duration > 128)) { return ''; }
            if ((nr.Position < 0) or ((nr.Position + nr.Duration) > bar.Length)) { return ''; }
            if ((nr.Beam != StartBeam) and (nr.Beam != ContinueBeam)) { return ''; }
            notes.Push(nr);
        }
    }
    if (notes.Length < 2) { return ''; }
    // Read in rhythmic order without depending on the bar iterator's ordering.
    position = 0;
    groupStart = 0;
    groups = CreateSparseArray();
    visited = 0;
    while (position < bar.Length) {
        next = null;
        for each nr in notes {
            if (nr.Position = position) {
                if (next != null) { return ''; }
                next = nr;
            }
        }
        if (next = null) { return ''; }
        if (position = 0) {
            if (next.Beam != StartBeam) { return ''; }
        }
        else {
            if (next.Beam = StartBeam) {
                if ((position % 128) != 0) { return ''; }
                groups.Push(RoundDown((position - groupStart) / 128.0));
                groupStart = position;
            }
        }
        position = position + next.Duration;
        visited = visited + 1;
    }
    // Reject overlaps, missing notes and a single uninterrupted beam in an
    // ambiguous meter. Lack of an internal boundary is not grouping evidence.
    if ((position != bar.Length) or (visited != notes.Length) or (groups.Length = 0)) { return ''; }
    groups.Push(RoundDown((bar.Length - groupStart) / 128.0));
    text = '';
    total = 0;
    for each group in groups {
        if ((group < 1) or (RoundDown(group) != group)) { return ''; }
        if (text != '') { text = text & '+'; }
        text = text & group;
        total = total + group;
    }
    if (total != top) { return ''; }
    return text;
}

ReadDetailHolds(record, bar) {
    for each NoteRest nr in bar {
        if (nr.GetArticulation(PauseArtic) or nr.GetArticulation(SquarePauseArtic) or nr.GetArticulation(TriPauseArtic)) {
            AddDetailHold(record, 'Fermata');
        }
    }
    for each BarRest rest in bar {
        if (rest.PauseType != PauseTypeNone) { AddDetailHold(record, 'Fermata'); }
    }
    // System symbols/text use different documented Type names from staff items.
    for each item in bar {
        if ((item.Type = 'SymbolItem') or (item.Type = 'SystemSymbolItem')) {
            if ((item.Index = CaesuraSymbol) or (item.Index = ThickCaesuraSymbol)) {
                AddDetailHold(record, 'Caesura');
            }
            // CommaSymbol and TickSymbol have no documented duration property.
            // Ordinary written breath marks therefore do not imply a pause.
        }
        if ((item.Type = 'Text') or (item.Type = 'SystemTextItem')) {
            // Page-aligned titles, credits and blank-page prose do not describe
            // a bar's timing. Other text must contain a specific musical term.
            if ((not StartsWith(item.StyleId, 'text.system.page_')) and (not StartsWith(item.StyleId, 'text.blankpage.'))) {
                if (DetailIsFreeTime(item.Text)) { AddDetailHold(record, 'Free-time passage'); }
            }
        }
    }
    // Bar.SectionEnd and Bar.BreakType describe layout/sections, not holds.
    // Bar.Length differences alone include pickups and never imply free time.
}

AddDetailHold(record, reason) {
    for each old in record.holdReasons { if (old = reason) { return; } }
    record.holdReasons.Push(reason);
}

DetailLowerText(text) {
    lower = '';
    previousSpace = True;
    index = 0;
    while (index < Length(text)) {
        code = Asc(CharAt(text, index));
        if ((code >= 65) and (code <= 90)) { code = code + 32; }
        if ((code <= 32) or (code = 45)) {
            if (not previousSpace) { lower = lower & ' '; }
            previousSpace = True;
        }
        else {
            lower = lower & Chr(code);
            previousSpace = False;
        }
        index = index + 1;
    }
    return lower;
}

DetailWordCharacter(character) {
    if (character = '') { return False; }
    code = Asc(character);
    return ((code >= 97) and (code <= 122)) or ((code >= 48) and (code <= 57)) or (code = 95);
}

DetailHasPhrase(text, phrase) {
    index = 0;
    while ((index + Length(phrase)) <= Length(text)) {
        if (Substring(text, index, Length(phrase)) = phrase) {
            before = '';
            if (index > 0) { before = CharAt(text, index - 1); }
            after = CharAt(text, index + Length(phrase));
            if ((not DetailWordCharacter(before)) and (not DetailWordCharacter(after))) { return True; }
        }
        index = index + 1;
    }
    return False;
}

DetailIsFreeTime(text) {
    text = DetailLowerText(text);
    return DetailHasPhrase(text, 'senza misura') or DetailHasPhrase(text, 'free time') or
        DetailHasPhrase(text, 'unmetered') or DetailHasPhrase(text, 'cadenza') or
        DetailHasPhrase(text, 'ad lib') or DetailHasPhrase(text, 'ad libitum');
}
