// Native ManuScript. Build with node sibelius/build.cjs.
// Score objects are read only. Dictionaries and arrays below belong to this plugin.
Initialize() {
    if (InterpreterOptionExists('TreatSingleCharacterAsString')) { SetInterpreterOption('TreatSingleCharacterAsString', True); }
    AddToPluginsMenu('TEXporter for Sibelius - INDEV', 'Run');
}

Run() {
    if (InterpreterOptionExists('TreatSingleCharacterAsString')) { SetInterpreterOption('TreatSingleCharacterAsString', True); }
    if (Sibelius.ScoreCount = 0) {
        Sibelius.MessageBox('Open a score first.');
        return False;
    }
    Self._property:Active = Sibelius.ActiveScore;
    Self._property:TimingDecisions = CreateSparseArray();
    Self._property:Regions = CreateSparseArray();
    Self._property:Warnings = CreateSparseArray();
    Self._property:UpdatingDialog = False;
    if (Active.SystemStaff.BarCount < 1) {
        Sibelius.MessageBox('The score contains no bars.');
        return False;
    }
    LoadOptions();
    GroupName = TrimText(Active.Title);
    if ((GroupName = '') and (Active.FileName != '')) {
        scoreFile = Sibelius.GetFile(Active.FileName);
        if (scoreFile != null) { GroupName = scoreFile.NameNoPath; }
    }
    if (GroupName = '') { GroupName = 'Untitled score'; }
    RangeMode = 'Whole score';
    FirstBar = '1';
    LastBar = '' & Active.SystemStaff.BarCount;
    if (Analyze()) { RefreshPreview(); }
    else { SummaryText = 'Preview unavailable'; WarningText = ErrorText; }
    while (Sibelius.ShowDialog(OptionsDialog, Self)) {
        if (Analyze()) {
            SaveOptions();
            while (True) {
                RefreshPreview();
                if (not Sibelius.ShowDialog(PreviewDialog, Self)) { return False; }
                if (ExportFile()) { return True; }
                if (ErrorText != '') { Sibelius.MessageBox(ErrorText); }
            }
        }
        Sibelius.MessageBox(ErrorText);
    }
    return False;
}

TrimText(text) {
    first = 0;
    last = Length(text);
    scanning = True;
    while ((first < last) and scanning) {
        if (Asc(CharAt(text, first)) <= 32) { first = first + 1; }
        else { scanning = False; }
    }
    scanning = True;
    while ((last > first) and scanning) {
        if (Asc(CharAt(text, last - 1)) <= 32) { last = last - 1; }
        else { scanning = False; }
    }
    return Substring(text, first, last - first);
}

Fail(message) {
    ErrorText = message;
    return False;
}

Warn(message) {
    if (Self._property:Warnings = null) { Self._property:Warnings = CreateSparseArray(); }
    for each old in Warnings { if (old = message) { return; } }
    Warnings.Push(message);
}

NumberValue(text, low, high, integerOnly) {
    text = TrimText('' & text);
    digits = 0;
    dots = 0;
    i = 0;
    while (i < Length(text)) {
        c = CharAt(text, i);
        code = Asc(c);
        if ((code >= 48) and (code <= 57)) { digits = digits + 1; }
        else {
            if ((c = '.') and (not integerOnly)) { dots = dots + 1; }
            else { return -1; }
        }
        i = i + 1;
    }
    if ((digits = 0) or (dots > 1)) { return -1; }
    value = text + 0;
    if ((value < low) or (value > high)) { return -1; }
    if (integerOnly and (RoundDown(value) != value)) { return -1; }
    return value;
}

RoundTempo(value) { return Round(value * 100) / 100.0; }

TempoText(value) {
    cents = Round(value * 100);
    whole = RoundDown(cents / 100.0);
    fraction = cents % 100;
    text = '' & whole;
    if (fraction > 0) {
        text = text & '.';
        if (fraction < 10) { text = text & '0'; }
        text = text & fraction;
        if ((fraction % 10) = 0) { text = Substring(text, 0, Length(text) - 1); }
    }
    return text;
}

ValidMeter(top, base) {
    if ((top < 1) or (top > 64) or (RoundDown(top) != top)) { return False; }
    return (base = 1) or (base = 2) or (base = 4) or (base = 8) or (base = 16) or (base = 32) or (base = 64);
}

ReadRange() {
    if (RangeMode = 'Whole score') {
        Self._property:RangeFirst = 1;
        Self._property:RangeLast = Active.SystemStaff.BarCount;
    }
    else {
        if (RangeMode = 'Sibelius selection') {
            if (not Active.Selection.IsPassage) { return Fail('Select a continuous passage in Sibelius, or choose a measure range.'); }
            Self._property:RangeFirst = Active.Selection.FirstBarNumber;
            Self._property:RangeLast = Active.Selection.LastBarNumber;
            if ((Active.Selection.LastBarSr = 0) and (RangeLast > RangeFirst)) { RangeLast = RangeLast - 1; }
        }
        else {
            if (RangeMode != 'Measure range') { return Fail('Choose a valid export range.'); }
            Self._property:RangeFirst = NumberValue(FirstBar, 1, Active.SystemStaff.BarCount, True);
            Self._property:RangeLast = NumberValue(LastBar, 1, Active.SystemStaff.BarCount, True);
        }
    }
    if ((RangeFirst < 1) or (RangeLast < RangeFirst) or (RangeLast > Active.SystemStaff.BarCount)) {
        return Fail('Enter a valid first and last bar.');
    }
    return True;
}

CollectObjects(bar, offset) {
    for each object in bar {
        // End-of-bar objects can carry the previous tempo; use the next bar's onset.
        if ((object.Position >= 0) and (object.Position < bar.Length)) {
            if ((object.CurrentTempo >= 1) and (object.CurrentTempo <= 1000)) {
                TempoPoints.Push(CreateDictionary('tick', offset + object.Position, 'tempo', object.CurrentTempo));
            }
        }
    }
}

ReadScore() {
    Self._property:Written = CreateSparseArray();
    Self._property:TempoPoints = CreateSparseArray();
    Self._property:Lines = CreateSparseArray();
    Self._property:TempoMarks = CreateSparseArray();
    offset = 0;
    i = 1;
    while (i <= Active.SystemStaff.BarCount) {
        bar = Active.SystemStaff.NthBar(i);
        meter = Active.SystemStaff.CurrentTimeSignature(i);
        if (not ValidMeter(meter.Numerator, meter.Denominator)) { return Fail('Unsupported meter in bar ' & bar.ExternalBarNumberString & '.'); }
        record = CreateDictionary('index', i, 'number', bar.ExternalBarNumberString,
            'start', offset, 'end', offset + bar.Length, 'length', bar.Length,
            'top', meter.Numerator, 'base', meter.Denominator, 'tempo', 0,
            'mark', '', 'hasMark', False, 'doubleBefore', False, 'doubleAfter', False,
            'repeatStart', False, 'repeatEnd', False, 'ramp', null);
        record._property:partial = bar.Length != ((meter.Numerator * 1024.0) / meter.Denominator);
        record._property:pickup = (i = 1) and (bar.Length < ((meter.Numerator * 1024.0) / meter.Denominator));
        ReadScoreDetails(record, bar, meter);
        CollectObjects(bar, offset);
        for each staff in Active { CollectObjects(staff.NthBar(i), offset); }
        for each RehearsalMark mark in bar {
            if (record.hasMark) { record.mark = record.mark & ' / '; }
            record.mark = record.mark & mark.MarkAsText;
            record.hasMark = True;
            if ((mark.Position != 0) and (i >= RangeFirst) and (i <= RangeLast)) { Warn('Bar ' & record.number & ': rehearsal mark splits at the start of the bar.'); }
        }
        for each SpecialBarline line in bar {
            if (line.BarlineInternalType = SpecialBarlineDouble) {
                if (line.Position = 0) { record.doubleBefore = True; }
                else { record.doubleAfter = True; }
                if ((line.Position != 0) and (line.Position != bar.Length) and (i >= RangeFirst) and (i <= RangeLast)) { Warn('Bar ' & record.number & ': double barline splits after the bar.'); }
            }
            if (line.BarlineInternalType = SpecialBarlineStartRepeat) { record.repeatStart = True; }
            if (line.BarlineInternalType = SpecialBarlineEndRepeat) { record.repeatEnd = True; }
        }
        for each line in bar {
            // Native tempo lines may report Type=RitardLine rather than Type=Line.
            if (line.IsALine) {
                isTempoLine = StartsWith(line.StyleId, 'line.system.tempo.accel') or
                    StartsWith(line.StyleId, 'line.system.tempo.rit') or StartsWith(line.StyleId, 'line.system.tempo.rall');
                if (isTempoLine and line.GetPlayedOnNthPass(1)) {
                    Lines.Push(CreateDictionary('id', Lines.Length + 1, 'start', offset + line.Position,
                        'end', (offset + line.Position) + line.Duration, 'object', line));
                }
            }
        }
        for each SystemTextItem text in bar {
            if (((text.StyleId = 'text.system.tempo') or (text.StyleId = 'text.system.metronome')) and text.GetPlayedOnNthPass(1)) {
                TempoMarks.Push(offset + text.Position);
                if ((text.Position > 0) and (i >= RangeFirst) and (i <= RangeLast)) { Warn('Bar ' & record.number & ': an in-bar tempo marking takes effect in the next preset bar.'); }
            }
        }
        Written.Push(record);
        offset = offset + bar.Length;
        i = i + 1;
    }
    for each record in Written {
        record.tempo = TempoAt(record.start);
        if ((record.tempo < 1) or (record.tempo > 1000)) { return Fail('Could not read a playback tempo from 1 to 1000 in bar ' & record.number & '.'); }
    }
    return True;
}

TempoAt(tick) {
    // CurrentTempo gives exact playback BPM at score objects, including native tempo text.
    for each point in TempoPoints {
        if (point.tick = tick) { return RoundTempo(point.tempo); }
    }
    // When no object exists at a line endpoint, sample a short playback interval.
    for each bar in Written {
        if ((tick >= bar.start) and (tick < bar.end)) {
            position = tick - bar.start;
            a = position;
            b = position + 32;
            if (b > bar.length) { b = position; a = position - 32; }
            if (a < 0) { a = 0; }
            if (b > bar.length) { b = bar.length; }
            ta = Active.GetLocationTime(bar.index, a, 1);
            tb = Active.GetLocationTime(bar.index, b, 1);
            if ((ta >= 0) and (tb > ta) and (b > a)) {
                Warn('Some tempo endpoints use a short playback-time sample; check them in the preview.');
                return RoundTempo((60000.0 * ((b - a) / 256.0)) / (tb - ta));
            }
        }
    }
    last = Written[Written.Length - 1];
    if (tick = last.end) {
        a = last.length - 32;
        if (a < 0) { a = 0; }
        ta = Active.GetLocationTime(last.index, a, 1);
        tb = Active.GetLocationTime(last.index, last.length, 1);
        if ((ta >= 0) and (tb > ta)) {
            Warn('Some tempo endpoints use a short playback-time sample; check them in the preview.');
            return RoundTempo((60000 * ((last.length - a) / 256.0)) / (tb - ta));
        }
    }
    return -1;
}

ApplyRamps() {
    if ((not GradualChanges) or (not TempoChanges)) { return True; }
    for each line in Lines {
        // Only selected intersections need representable transitions.
        selectedStart = Written[RangeFirst - 1].start;
        selectedEnd = Written[RangeLast - 1].end;
        if ((line.end > selectedStart) and (line.start < selectedEnd)) {
            if (line.end <= line.start) { return Fail('A gradual tempo line has an invalid length. Turn off accelerando / ritardando, or move its endpoints.'); }
            for each other in Lines {
                if ((other.id != line.id) and (other.start < line.end) and (other.end > line.start)) { return Fail('Gradual tempo lines overlap. Turn off accelerando / ritardando, or separate the lines.'); }
            }
            for each tick in TempoMarks {
                if ((tick > line.start) and (tick < line.end)) { return Fail('A tempo marking occurs inside a gradual line. Move it to an endpoint, or turn off accelerando / ritardando.'); }
            }
            startTempo = TempoAt(line.start);
            endTempo = TempoAt(line.end);
            if ((startTempo < 1) or (endTempo < 1) or (startTempo > 1000) or (endTempo > 1000)) { return Fail('Could not read gradual tempo endpoints. Turn off accelerando / ritardando and edit the preview.'); }
            if (startTempo != endTempo) {
                Warn('Gradual tempo uses a linear transition between Sibelius playback endpoints.');
                for each bar in Written {
                    if ((bar.index >= RangeFirst) and (bar.index <= RangeLast) and (bar.end > line.start) and (bar.start < line.end)) {
                        a = bar.start;
                        b = bar.end;
                        if (a < line.start) { a = line.start; }
                        if (b > line.end) { b = line.end; }
                        if ((((a - bar.start) % 256) != 0) or (((b - a) % 256) != 0)) { return Fail('A clipped gradual line has a fractional-quarter position. Turn off accelerando / ritardando.'); }
                        firstTempo = startTempo + (((endTempo - startTempo) * (a - line.start)) / (line.end - line.start));
                        lastTempo = startTempo + (((endTempo - startTempo) * (b - line.start)) / (line.end - line.start));
                        bar.tempo = RoundTempo(firstTempo);
                        bar.ramp = CreateDictionary('id', line.id, 'startTempo', RoundTempo(firstTempo),
                            'endTempo', RoundTempo(lastTempo), 'offset', (a - bar.start) / 256.0, 'length', (b - a) / 256.0);
                    }
                }
            }
        }
    }
    return True;
}

PlaybackVisits() {
    Self._property:Visits = CreateSparseArray();
    order = CreateSparseArray();
    if (RepeatMode = 'Follow score repeats') { order = Active.BarPlaybackOrder; }
    else {
        if (RepeatMode != 'Ignore repeats') { return Fail('Choose a valid repeat option.'); }
        i = 1;
        while (i <= Written.Length) { order.Push(i); i = i + 1; }
    }
    if ((order = null) or (order.Length = 0) or (order.Length > 100000)) { return Fail('Sibelius returned an empty or excessive playback order. Try Ignore repeats.'); }
    counts = CreateSparseArray();
    i = 0;
    while (i < Written.Length) { counts.Push(0); i = i + 1; }
    previous = 0;
    previousPass = 0;
    previousSelected = False;
    for each number in order {
        if ((number < 1) or (number > Written.Length) or (RoundDown(number) != number)) { return Fail('Sibelius returned an invalid playback bar. Try Ignore repeats.'); }
        source = Written[number - 1];
        counts[number - 1] = counts[number - 1] + 1;
        pass = counts[number - 1];
        if ((number >= RangeFirst) and (number <= RangeLast)) {
            boundary = (not previousSelected) or (number != (previous + 1)) or (pass != previousPass);
            if (RepeatMode = 'Follow score repeats') {
                boundary = boundary or source.repeatStart;
                if (previousSelected and (previous > 0)) { boundary = boundary or Written[previous - 1].repeatEnd; }
            }
            Visits.Push(CreateDictionary('source', source, 'pass', pass, 'repeat', pass > 1, 'boundary', boundary));
            previousSelected = True;
        }
        else { previousSelected = False; }
        previous = number;
        previousPass = pass;
    }
    if (Visits.Length = 0) { return Fail('The selected bars do not occur in Sibelius playback order. Try Ignore repeats.'); }
    return True;
}

BuildRegions() {
    Self._property:Regions = CreateSparseArray();
    freezeTempo = Written[RangeFirst - 1].tempo;
    freezeTop = Written[RangeFirst - 1].top;
    freezeBase = Written[RangeFirst - 1].base;
    foundMarker = False;
    for each visit in Visits {
        m = visit.source;
        tempo = m.tempo;
        top = m.top;
        base = m.base;
        ramp = m.ramp;
        if (not TempoChanges) { tempo = freezeTempo; ramp = null; }
        if (not MeterChanges) { top = freezeTop; base = freezeBase; }
        if ((ramp != null) and (not MeterChanges) and ((top != m.top) or (base != m.base))) { return Fail('Keep meter changes on when a gradual line crosses a different meter, or turn off gradual export.'); }
        boundary = False;
        name = '';
        if ((SplitMode = 'Rehearsal markings') and m.hasMark) { boundary = True; name = m.mark; }
        if (SplitMode = 'Double barlines') {
            doubleBefore = m.doubleBefore;
            if (m.index > 1) { doubleBefore = doubleBefore or Written[m.index - 2].doubleAfter; }
            if (doubleBefore) { boundary = True; name = m.number; }
        }
        if (boundary) { foundMarker = True; }
        last = null;
        if (Regions.Length > 0) { last = Regions[Regions.Length - 1]; }
        grouping = m.groupingText;
        needsGrouping = m.needsGrouping;
        if ((top != m.top) or (base != m.base)) {
            grouping = '';
            needsGrouping = base = 8;
        }
        fullBeats = (top * 4.0) / base;
        canMerge = (last != null) and CombineMeasures and (not boundary) and (not visit.boundary) and (not m.partial) and (not m.needsDecision);
        if (canMerge) {
            canMerge = (not last.partial) and (not last.requiresTimingDecision) and (last.sourceEnd + 1 = m.index) and (last.pass = visit.pass) and (last.top = top) and (last.base = base) and (last.groupingText = grouping) and (not needsGrouping);
        }
        mergeRamp = False;
        if (canMerge) {
            if ((last.ramp != null) and (ramp != null)) {
                mergeRamp = (last.ramp.id = ramp.id) and (last.ramp.offset = 0) and (last.ramp.length = (last.bars * fullBeats)) and (ramp.offset = 0) and (ramp.length = fullBeats) and (last.ramp.endTempo = ramp.startTempo);
                canMerge = mergeRamp;
            }
            else { canMerge = (last.ramp = null) and (ramp = null) and (last.tempo = tempo); }
        }
        if (canMerge) {
            last.bars = last.bars + 1;
            last.sourceLength = last.sourceLength + m.length;
            last.sourceEnd = m.index;
            last.endNumber = m.number;
            if (mergeRamp) { last.ramp.length = last.ramp.length + ramp.length; last.ramp.endTempo = ramp.endTempo; }
        }
        else {
            if ((name = '') and (m.index = 1)) { name = 'Top'; }
            if (visit.repeat) {
                if (name != '') { name = name & ' (repeat)'; }
                else { name = '(repeat)'; }
            }
            copiedRamp = null;
            if (ramp != null) { copiedRamp = CreateDictionary('id', ramp.id, 'startTempo', ramp.startTempo, 'endTempo', ramp.endTempo, 'offset', ramp.offset, 'length', ramp.length); }
            r = CreateDictionary('name', name, 'bars', 1, 'top', top, 'base', base, 'tempo', tempo,
                'sourceStart', m.index, 'sourceEnd', m.index, 'startNumber', m.number, 'endNumber', m.number,
                'isRepeat', visit.repeat, 'pass', visit.pass, 'ramp', copiedRamp,
                'sourceLength', m.length, 'partial', m.partial, 'pickup', m.pickup,
                'groupingText', grouping, 'manualGrouping', grouping, 'needsGrouping', needsGrouping,
                'requiresTimingDecision', m.needsDecision, 'holdReasons', m.holdReasons,
                'timingMode', '', 'totalCounts', 0, 'countBase', 4,
                'editName', False, 'editBars', False, 'editTop', False, 'editBase', False,
                'editTempo', False, 'editRamp', False, 'editGrouping', False);
            if (Self._property:TimingDecisions != null) {
                decision = TimingDecisions[m.index];
                if (decision != null) { r.timingMode = decision.mode; r.totalCounts = decision.counts; r.countBase = decision.base; }
            }
            Regions.Push(r);
        }
    }
    if ((SplitMode != 'Tempo / meter changes') and (not foundMarker)) { Warn('No selected section markers; presets follow tempo and meter changes.'); }
    return True;
}

Analyze() {
    savedRegions = Self._property:Regions;
    savedWarnings = Self._property:Warnings;
    if (AnalyzeWork()) { RestoreEdits(savedRegions); return True; }
    Self._property:Regions = savedRegions;
    Self._property:Warnings = savedWarnings;
    return False;
}

AnalyzeWork() {
    ErrorText = '';
    Self._property:Warnings = CreateSparseArray();
    if (TrimText(GroupName) = '') { return Fail('Enter a group name.'); }
    if ((SplitMode != 'Tempo / meter changes') and (SplitMode != 'Rehearsal markings') and (SplitMode != 'Double barlines')) { return Fail('Choose a valid section option.'); }
    if ((ClickStyle != 'Accent downbeat') and (ClickStyle != 'Straight')) { return Fail('Choose a valid click style.'); }
    if (not ReadRange()) { return False; }
    if (not ReadScore()) { return False; }
    if (not ApplyRamps()) { return False; }
    if (not PlaybackVisits()) { return False; }
    if (not BuildRegions()) { return False; }
    if (DebugLog) {
        for each bar in Written { Trace('Bar ' & bar.number & ': ' & bar.top & '/' & bar.base & ', quarter = ' & TempoText(bar.tempo)); }
        for each line in Lines { Trace('Gradual line ' & line.id & ': ticks ' & line.start & '-' & line.end); }
        for each visit in Visits { Trace('Playback bar ' & visit.source.index & ', pass ' & visit.pass); }
        for each r in Regions { Trace('Preset ' & r.name & ': ' & r.bars & ' bars, ' & r.top & '/' & r.base & ', quarter = ' & TempoText(r.tempo)); }
    }
    return True;
}

RefreshPreview() {
    oldSelection = PreviewSelection;
    Serialize();
    formatError = ErrorText;
    PreviewItems = CreateArray();
    bars = 0;
    seconds = 0;
    i = 0;
    for each r in Regions {
        bars = bars + r.bars;
        beats = ((r.bars * r.top) * 4.0) / r.base;
        if (r.partial) { beats = r.sourceLength / 256.0; }
        if (r.timingMode = 'Set total counts') { beats = (r.totalCounts * 4.0) / r.countBase; }
        if (r.ramp = null) { seconds = seconds + ((60.0 * beats) / r.tempo); }
        else {
            seconds = seconds + ((60.0 * r.ramp.offset) / r.ramp.startTempo);
            steps = 100;
            j = 0;
            while (j < steps) {
                bpm = r.ramp.startTempo + (((r.ramp.endTempo - r.ramp.startTempo) * (j + 0.5)) / steps);
                seconds = seconds + ((60.0 * (r.ramp.length / 100.0)) / bpm);
                j = j + 1;
            }
            seconds = seconds + ((60.0 * ((beats - r.ramp.offset) - r.ramp.length)) / r.ramp.endTempo);
        }
        label = (i + 1) & '. ' & r.name & ' | ' & r.bars & ' bars | ' & r.top & '/' & r.base & ' | ' & TempoText(r.tempo);
        if (r.ramp != null) { label = label & ' -> ' & TempoText(r.ramp.endTempo); }
        if ((r.base = 8) and (r.groupingText != '')) { label = label & ' | ' & r.groupingText; }
        if (r.partial) { label = label & ' | ' & TempoText(beats) & ' qtr counts'; }
        if (r.requiresTimingDecision) {
            if (r.timingMode = '') { label = label & ' | ACTION: ' & r.holdReasons.Join(', '); }
            else { label = label & ' | ' & r.timingMode; }
        }
        if (r.needsGrouping and (r.groupingText = '')) { label = label & ' | ACTION: grouping'; }
        label = label & ' | m.' & r.startNumber & '-' & r.endNumber;
        PreviewItems[i] = label;
        i = i + 1;
    }
    PreviewSelection = PreviewItems[0];
    for each label in PreviewItems { if (label = oldSelection) { PreviewSelection = label; } }
    SummaryText = bars & ' bars | ' & Regions.Length & ' presets | ~ ' & Round(seconds) & ' s';
    WarningText = Warnings.Join(Chr(10));
    if (formatError != '') { WarningText = formatError & Chr(10) & WarningText; }
}

EditPreset() {
    selected = -1;
    i = 0;
    while (i < Regions.Length) { if (PreviewItems[i] = PreviewSelection) { selected = i; } i = i + 1; }
    if (selected < 0) { Sibelius.MessageBox('Select a preset to edit.'); return; }
    r = Regions[selected];
    EditName = r.name;
    EditBars = '' & r.bars;
    EditTop = '' & r.top;
    EditBase = '' & r.base;
    EditTempo = TempoText(r.tempo);
    EditEndTempo = EditTempo;
    EditRamp = r.ramp != null;
    EditOffset = '0';
    EditLength = '' & RoundDown(((r.bars * r.top) * 4.0) / r.base);
    EditGrouping = r.groupingText;
    EditTimingMode = r.timingMode;
    if (EditTimingMode = '') { EditTimingMode = 'Choose handling'; }
    EditTotalCounts = '' & r.totalCounts;
    EditCountUnit = 'Quarter notes';
    if (r.countBase = 2) { EditCountUnit = 'Half notes'; }
    if (r.countBase = 8) { EditCountUnit = 'Eighth notes'; }
    if (r.countBase = 16) { EditCountUnit = '16th notes'; }
    Self._property:PreviousCountBase = r.countBase;
    if (EditRamp) { EditTempo = TempoText(r.ramp.startTempo); EditEndTempo = TempoText(r.ramp.endTempo); EditOffset = '' & r.ramp.offset; EditLength = '' & r.ramp.length; }
    dialog = EditDialog;
    if (r.requiresTimingDecision) { dialog = TimingEditDialog; }
    if (r.requiresTimingDecision) { TimingModeChanged(); }
    fixed = r.partial or r.requiresTimingDecision;
    Sibelius.EnableControlById(Self, dialog, 'bars', not fixed);
    Sibelius.EnableControlById(Self, dialog, 'top', not fixed);
    Sibelius.EnableControlById(Self, dialog, 'base', not fixed);
    Sibelius.EnableControlById(Self, dialog, 'grouping', r.base = 8);
    EditNotice = '';
    if (r.partial) { EditNotice = 'Actual length: ' & TempoText(r.sourceLength / 256.0) & ' quarter counts.'; }
    if (r.requiresTimingDecision) { EditNotice = r.holdReasons.Join(', '); }
    while (Sibelius.ShowDialog(dialog, Self)) {
        if (ApplyEdit(selected)) { RefreshPreview(); PreviewSelection = PreviewItems[selected]; return; }
        Sibelius.MessageBox(ErrorText);
    }
}

ApplyEdit(selected) {
    bars = NumberValue(EditBars, 1, 100000, True);
    top = NumberValue(EditTop, 1, 64, True);
    base = NumberValue(EditBase, 1, 64, True);
    tempo = NumberValue(EditTempo, 1, 1000, False);
    if ((bars < 1) or (not ValidMeter(top, base)) or (tempo < 1)) { return Fail('Enter valid bars, meter, and a tempo from 1 to 1000.'); }
    r = Regions[selected];
    if ((r.partial or r.requiresTimingDecision) and ((bars != r.bars) or (top != r.top) or (base != r.base))) { return Fail('Bars and meter are fixed for pickups, irregular bars and holds.'); }
    grouping = TrimText(EditGrouping);
    if (base != 8) { grouping = ''; }
    if ((base = 8) and (grouping != '')) { if (not ValidateGrouping(grouping, top)) { return False; } }
    mode = r.timingMode;
    counts = r.totalCounts;
    countBase = r.countBase;
    if (r.requiresTimingDecision) {
        mode = EditTimingMode;
        if ((mode != 'Keep steady clicks') and (mode != 'Set total counts')) { return Fail('Choose handling for this bar.'); }
        if (mode = 'Set total counts') {
            counts = NumberValue(EditTotalCounts, 0.000001, 1000000, False);
            countBase = CountUnitBase(EditCountUnit);
            if ((counts <= 0) or (countBase < 1)) { return Fail('Enter positive total counts and a duration unit.'); }
        }
    }
    candidate = CreateDictionary('name', EditName, 'bars', bars, 'top', top, 'base', base,
        'tempo', RoundTempo(tempo), 'ramp', null, 'sourceLength', r.sourceLength, 'partial', r.partial, 'pickup', r.pickup,
        'groupingText', grouping, 'needsGrouping', (base = 8) and (grouping = ''),
        'requiresTimingDecision', r.requiresTimingDecision, 'timingMode', mode, 'totalCounts', counts, 'countBase', countBase,
        'startNumber', r.startNumber);
    prepared = PreparePreset(candidate, 'full');
    if (prepared = null) { return False; }
    ramp = null;
    if (EditRamp) {
        endTempo = NumberValue(EditEndTempo, 1, 1000, False);
        offset = NumberValue(EditOffset, 0, 100000000, True);
        length = NumberValue(EditLength, 1, 100000000, True);
        if ((endTempo < 1) or (offset < 0) or (length < 1) or ((offset + length) > (prepared.durationTicks / 256.0))) { return Fail('Enter whole-quarter transition positions within the actual preset length.'); }
        ramp = CreateDictionary('id', -1, 'startTempo', RoundTempo(tempo), 'endTempo', RoundTempo(endTempo), 'offset', offset, 'length', length);
    }
    r.editName = r.editName or (r.name != EditName);
    r.editBars = r.editBars or (r.bars != bars);
    r.editTop = r.editTop or (r.top != top);
    r.editBase = r.editBase or (r.base != base);
    r.editTempo = r.editTempo or (r.tempo != RoundTempo(tempo));
    if ((r.ramp = null) and (ramp != null)) { r.editRamp = True; }
    if ((r.ramp != null) and (ramp = null)) { r.editRamp = True; }
    if ((r.ramp != null) and (ramp != null)) {
        r.editRamp = r.editRamp or (r.ramp.startTempo != ramp.startTempo) or (r.ramp.endTempo != ramp.endTempo) or (r.ramp.offset != ramp.offset) or (r.ramp.length != ramp.length);
    }
    r.editGrouping = r.editGrouping or (r.groupingText != grouping);
    r.name = EditName; r.bars = bars; r.top = top; r.base = base; r.tempo = RoundTempo(tempo); r.ramp = ramp;
    r.groupingText = grouping; r.needsGrouping = (base = 8) and (grouping = '');
    if (base = 8) { r.manualGrouping = grouping; }
    if (r.requiresTimingDecision) {
        if (Self._property:TimingDecisions = null) { Self._property:TimingDecisions = CreateSparseArray(); }
        TimingDecisions[r.sourceStart] = CreateDictionary('mode', mode, 'counts', counts, 'base', countBase);
        for each row in Regions { if (row.requiresTimingDecision and (row.sourceStart = r.sourceStart)) { row.timingMode = mode; row.totalCounts = counts; row.countBase = countBase; } }
    }
    ErrorText = '';
    return True;
}

OptionsChanged() {
    if (Self._property:UpdatingDialog = True) { return; }
    Self._property:UpdatingDialog = True;
    if (Analyze()) { RefreshPreview(); }
    else { WarningText = ErrorText; SummaryText = 'Preview unavailable'; }
    Sibelius.RefreshDialog();
    Self._property:UpdatingDialog = False;
}

ShowOptions() {
    saved = SnapshotOptions();
    savedRegions = Regions;
    while (Sibelius.ShowDialog(OptionsDialog, Self)) {
        if (Analyze()) { SaveOptions(); RefreshPreview(); return; }
        Sibelius.MessageBox(ErrorText);
    }
    RestoreOptions(saved);
    Self._property:Regions = savedRegions;
    Analyze();
    RefreshPreview();
}

SnapshotOptions() {
    return CreateDictionary('group', GroupName, 'range', RangeMode, 'first', FirstBar, 'last', LastBar,
        'split', SplitMode, 'repeat', RepeatMode, 'click', ClickStyle, 'combine', CombineMeasures,
        'tempo', TempoChanges, 'meter', MeterChanges, 'gradual', GradualChanges, 'countin', CountInEnabled, 'debug', DebugLog,
        'full', FullMet, 'half', HalfMet, 'downbeat', DownbeatMet);
}

RestoreOptions(saved) {
    GroupName = saved.group;
    RangeMode = saved.range;
    FirstBar = saved.first;
    LastBar = saved.last;
    SplitMode = saved.split;
    RepeatMode = saved.repeat;
    ClickStyle = saved.click;
    CombineMeasures = saved.combine;
    TempoChanges = saved.tempo;
    MeterChanges = saved.meter;
    GradualChanges = saved.gradual;
    CountInEnabled = saved.countin;
    DebugLog = saved.debug;
    FullMet = saved.full; HalfMet = saved.half; DownbeatMet = saved.downbeat;
}

XmlText(text) {
    result = '';
    i = 0;
    while (i < Length(text)) {
        c = CharAt(text, i);
        n = Asc(c);
        if ((n < 32) and (n != 9) and (n != 10) and (n != 13)) { Fail('A name contains a character prohibited by XML.'); return ''; }
        if ((n = 65534) or (n = 65535)) { Fail('A name contains a character prohibited by XML.'); return ''; }
        if (n = 38) { result = result & '&amp;'; }
        else {
            if (n = 60) { result = result & '&lt;'; }
            else {
                if (n = 62) { result = result & '&gt;'; }
                else {
                    if (n = 34) { result = result & '&quot;'; }
                    else {
                        if (n = 39) { result = result & '&apos;'; }
                        else {
                            if ((n >= 55296) and (n <= 56319)) {
                                i = i + 1;
                                if (i >= Length(text)) { Fail('A name contains invalid Unicode.'); return ''; }
                                low = Asc(CharAt(text, i));
                                if ((low < 56320) or (low > 57343)) { Fail('A name contains invalid Unicode.'); return ''; }
                                n = (65536 + ((n - 55296) * 1024)) + (low - 56320);
                            }
                            else { if ((n >= 56320) and (n <= 57343)) { Fail('A name contains invalid Unicode.'); return ''; } }
                            if ((n < 32) or (n > 126)) { result = result & '&#' & n & ';'; }
                            else { result = result & c; }
                        }
                    }
                }
            }
        }
        i = i + 1;
    }
    return result;
}

XmlAttr(name, value) { return ' ' & name & '=' & Chr(34) & XmlText('' & value) & Chr(34); }

Serialize() { return SerializeVersion('full', GroupName); }

SerializeVersion(metVersion, exportName) {
    ErrorText = '';
    if (TrimText(exportName) = '') { Fail('Enter a group name.'); return ''; }
    downbeat = 0;
    if (ClickStyle = 'Accent downbeat') { downbeat = 1; }
    countin = 0;
    if (CountInEnabled) { countin = 1; }
    xml = '<?xml version=' & Chr(34) & '1.0' & Chr(34) & ' encoding=' & Chr(34) & 'UTF-8' & Chr(34) & '?>' & Chr(10);
    xml = xml & GroupStart(exportName, downbeat, countin);
    for each r in Regions {
        if ((r.bars < 1) or (r.bars > 100000) or (RoundDown(r.bars) != r.bars) or (not ValidMeter(r.top, r.base)) or (r.tempo < 1) or (r.tempo > 1000)) { Fail('Invalid preset values. Edit the preset before exporting.'); return ''; }
        if (r.needsGrouping and (r.groupingText = '')) { Fail('Bar ' & r.startNumber & ': edit this preset to enter its eighth-note grouping.'); return ''; }
        p = PreparePreset(r, metVersion);
        if (p = null) { return ''; }
        if (p.inferred) { Warn('Bar ' & r.startNumber & ': meter/subdivision encoding is inferred; verify in TonalEnergy.'); }
        tempo = TempoText(r.tempo);
        starting = '0'; transition = 0; offset = 0; length = 0; anchor = 0; endBeat = 0;
        if (r.ramp != null) {
            ramp = r.ramp;
            if ((ramp.startTempo < 1) or (ramp.startTempo > 1000) or (ramp.endTempo < 1) or (ramp.endTempo > 1000) or (ramp.offset < 0) or (RoundDown(ramp.offset) != ramp.offset) or (ramp.length < 1) or (RoundDown(ramp.length) != ramp.length) or ((ramp.offset + ramp.length) > (p.durationTicks / 256.0))) { Fail('Invalid gradual transition in a preset.'); return ''; }
            starting = TempoText(ramp.startTempo); tempo = TempoText(ramp.endTempo); transition = 1;
            offset = ramp.offset; length = ramp.length; endBeat = (offset + length) - 1;
            if ((offset > 0) and ((offset + length) = (p.durationTicks / 256.0))) { anchor = 1; }
            if ((r.base != 4) or ((offset > 0) and ((offset + length) < (p.durationTicks / 256.0)))) { Warn('Some transition placements extend beyond the supplied 4/4 examples; check them in TonalEnergy.'); }
        }
        xml = xml & PresetXml(r, p, tempo, starting, transition, offset, length, anchor, endBeat);
    }
    xml = xml & GroupEnd();
    if (ErrorText != '') { return ''; }
    return xml;
}

ExportFile() {
    if (not Analyze()) { return False; }
    versions = SelectedVersions();
    if (versions.Length = 0) { return Fail('Select at least one met version.'); }
    queue = CreateSparseArray();
    for each version in versions {
        title = GroupName & ' [' & version.label & ']';
        xml = SerializeVersion(version.pattern, title);
        if (ErrorText != '') { return False; }
        queue.Push(CreateDictionary('label', version.label, 'xml', xml));
    }
    folder = Sibelius.GetScoresFolder();
    saved = CreateSparseArray();
    for each item in queue {
        // Reserve the distinctive suffix after Sibelius's 31-character safe-name limit.
        suggested = Sibelius.MakeSafeFileName(GroupName) & ' [' & item.label & '].tetmetgroup';
        file = Sibelius.SelectFileToSave('TEXporter INDEV - ' & item.label, suggested, folder.Name, 'tetmetgroup', 'TEXT', 'TonalEnergy metronome group');
        if (file = null) { ErrorText = ''; if (saved.Length > 0) { Sibelius.MessageBox('Export canceled. Saved ' & saved.Length & ' of ' & queue.Length & ' groups:' & Chr(10) & saved.Join(Chr(10))); } return False; }
        path = file.NameWithExt;
        if (Substring(path, Length(path) - 12) != '.tetmetgroup') { return Fail('Keep the .tetmetgroup file extension.'); }
        for each previous in saved { if (ExportPathKey(previous) = ExportPathKey(path)) { return Fail('Choose a different file for each met version. Already saved:' & Chr(10) & saved.Join(Chr(10))); } }
        if (not Sibelius.CreateTextFile(path)) { return Fail('Could not create the export file. Already saved ' & saved.Length & ' groups.'); }
        if (not Sibelius.AppendTextFile(path, item.xml, False)) { return Fail('Could not write the export file. Already saved ' & saved.Length & ' groups.'); }
        lines = Sibelius.ReadTextFile(path);
        if (lines = null) { return Fail('Could not verify the exported file. Already saved ' & saved.Length & ' groups.'); }
        actual = JoinStrings(lines, Chr(10));
        if ((actual != item.xml) and ((actual & Chr(10)) != item.xml) and (actual != (item.xml & Chr(10)))) { return Fail('Export verification failed. Already saved ' & saved.Length & ' groups.'); }
        saved.Push(path);
    }
    SaveOptions();
    message = 'Exported ' & saved.Length & ' groups:' & Chr(10) & saved.Join(Chr(10));
    if (Warnings.Length > 0) { message = message & Chr(10) & Chr(10) & Warnings.Join(Chr(10)); }
    Sibelius.MessageBox(message);
    return True;
}

ExportPathKey(path) {
    // Prevent two versions overwriting the same Windows path with different casing/separators.
    key = ''; i = 0;
    while (i < Length(path)) {
        character = CharAt(path, i); code = Asc(character);
        if ((code >= 65) and (code <= 90)) { character = Chr(code + 32); }
        if (character = Chr(92)) { character = '/'; }
        key = key & character;
        i = i + 1;
    }
    return key;
}

LoadOptions() {
    // A small settings file next to the .plg avoids an extra Preferences.plg dependency.
    path = Self.File.Path & Sibelius.PathSeparator & 'TEXporter-Sibelius.settings';
    if (not Sibelius.FileExists(path)) { return; }
    lines = Sibelius.ReadTextFile(path);
    if (lines = null) { return; }
    if (lines.NumChildren < 10) { return; }
    if ((lines[0] != 'TEExporter-Sibelius-1') and (lines[0] != 'TEXporter-Sibelius-2')) { return; }
    i = 4;
    while (i < 10) {
        if ((lines[i] != '0') and (lines[i] != '1')) { return; }
        i = i + 1;
    }
    if ((lines[1] = 'Tempo / meter changes') or (lines[1] = 'Rehearsal markings') or (lines[1] = 'Double barlines')) { SplitMode = lines[1]; }
    if ((lines[2] = 'Follow score repeats') or (lines[2] = 'Ignore repeats')) { RepeatMode = lines[2]; }
    if ((lines[3] = 'Accent downbeat') or (lines[3] = 'Straight')) { ClickStyle = lines[3]; }
    CombineMeasures = lines[4] = '1';
    TempoChanges = lines[5] = '1';
    MeterChanges = lines[6] = '1';
    GradualChanges = lines[7] = '1';
    CountInEnabled = lines[8] = '1';
    DebugLog = lines[9] = '1';
    if (lines.NumChildren >= 13) {
        if (((lines[10] = '0') or (lines[10] = '1')) and ((lines[11] = '0') or (lines[11] = '1')) and ((lines[12] = '0') or (lines[12] = '1'))) { FullMet = lines[10] = '1'; HalfMet = lines[11] = '1'; DownbeatMet = lines[12] = '1'; }
    }
}

FlagText(value) { if (value) { return '1'; } return '0'; }

StartsWith(text, prefix) { return Substring(text, 0, Length(prefix)) = prefix; }

SaveOptions() {
    path = Self.File.Path & Sibelius.PathSeparator & 'TEXporter-Sibelius.settings';
    nl = Chr(10);
    text = 'TEXporter-Sibelius-2' & nl & SplitMode & nl & RepeatMode & nl & ClickStyle & nl &
        FlagText(CombineMeasures) & nl & FlagText(TempoChanges) & nl & FlagText(MeterChanges) & nl &
        FlagText(GradualChanges) & nl & FlagText(CountInEnabled) & nl & FlagText(DebugLog) & nl &
        FlagText(FullMet) & nl & FlagText(HalfMet) & nl & FlagText(DownbeatMet) & nl;
    if (Sibelius.CreateTextFile(path)) {
        if (not Sibelius.AppendTextFile(path, text, False)) { Warn('Options could not be saved beside the plugin.'); }
    }
    else { Warn('Options could not be saved beside the plugin.'); }
}

SelectedVersions() {
    versions = CreateSparseArray();
    if (FullMet) { versions.Push(CreateDictionary('pattern', 'full', 'label', 'Full Met')); }
    if (HalfMet) { versions.Push(CreateDictionary('pattern', 'half', 'label', 'Half-note Met')); }
    if (DownbeatMet) { versions.Push(CreateDictionary('pattern', 'downbeat', 'label', 'Downbeat Met')); }
    return versions;
}

CountUnitBase(unit) {
    if (unit = 'Half notes') { return 2; }
    if (unit = 'Quarter notes') { return 4; }
    if (unit = 'Eighth notes') { return 8; }
    if (unit = '16th notes') { return 16; }
    return -1;
}

TimingModeChanged() {
    enabled = EditTimingMode = 'Set total counts';
    Sibelius.EnableControlById(Self, TimingEditDialog, 'counts', enabled);
    Sibelius.EnableControlById(Self, TimingEditDialog, 'unit', enabled);
}

CountUnitChanged() {
    countBase = CountUnitBase(EditCountUnit);
    previous = Self._property:PreviousCountBase;
    counts = NumberValue(EditTotalCounts, 0.000001, 1000000, False);
    if ((countBase > 0) and (previous > 0) and (counts > 0)) { EditTotalCounts = '' & ((counts * countBase) / (previous + 0.0)); }
    Self._property:PreviousCountBase = countBase;
    Sibelius.RefreshDialog();
}

RestoreEdits(oldRows) {
    if (oldRows = null) { return; }
    for each r in Regions {
        for each old in oldRows {
            if ((r.sourceStart = old.sourceStart) and (r.sourceEnd = old.sourceEnd) and (r.pass = old.pass)) {
                if (old.editName) { r.name = old.name; r.editName = True; }
                if (old.editBars and (not r.partial) and (not r.requiresTimingDecision)) { r.bars = old.bars; r.editBars = True; }
                if (old.editTop and (not r.partial) and (not r.requiresTimingDecision)) { r.top = old.top; r.editTop = True; }
                if (old.editBase and (not r.partial) and (not r.requiresTimingDecision)) { r.base = old.base; r.editBase = True; }
                if (old.editTempo) { r.tempo = old.tempo; r.editTempo = True; }
                if (old.editRamp) { r.ramp = old.ramp; r.editRamp = True; }
                if (old.editGrouping) {
                    r.manualGrouping = old.manualGrouping;
                    r.editGrouping = True;
                    if (r.base = 8) { r.groupingText = r.manualGrouping; }
                }
                if (r.base != 8) { r.groupingText = ''; }
                r.needsGrouping = (r.base = 8) and (r.groupingText = '');
            }
        }
    }
}
