// MuseScore 4.7.5 API adapter. Does not read an MSCZ archive or alter the score.
function ticks(f, division) { return f.numerator / f.denominator * division * 4; }
function signatureGrouping(text, numerator) {
    text = String(text || '').replace(/\s/g, '');
    if (!/^\d+(?:\+\d+)+$/.test(text)) return null;
    var groups = text.split('+').map(Number), sum = 0;
    for (var i = 0; i < groups.length; ++i) {
        if (groups[i] < 1) return null;
        sum += groups[i];
    }
    return sum === numerator ? groups : null;
}
function beamGrouping(items, numerator, start, division, beamTypes) {
    // Require an uninterrupted grid of straight eighth-note chords. Sparse
    // rhythms, rests, tuplets and un-beamed notes do not establish meter groups.
    if (!beamTypes || items.length !== numerator) return null;
    var starts = [0];
    for (var i = 0; i < items.length; ++i) {
        var item = items[i], chord = item.chord;
        if (Math.abs(item.tick - start - i * division / 2) > 0.001 || chord.tuplet ||
            !chord.duration || Math.abs(ticks(chord.duration, division) - division / 2) > 0.001 ||
            typeof chord.actualBeamMode !== 'function') return null;
        var mode = chord.actualBeamMode(false);
        if (mode === beamTypes.NONE || mode === beamTypes.INVALID) return null;
        var beam = chord.beam, beamStartsHere = false;
        if (beam) {
            if (beam.isCrossStaff || beam.isFullCrossStaff) return null;
            var elements = beam.elements;
            if (elements && elements.length && elements[0].parent) {
                var firstTick = elements[0].parent.tick;
                if (firstTick < start) return null;
                beamStartsHere = firstTick === item.tick;
            }
        }
        if (i && (beamStartsHere || mode === beamTypes.BEGIN)) starts.push(i);
    }
    var groups = [];
    for (var g = 0; g < starts.length; ++g)
        groups.push((g + 1 < starts.length ? starts[g+1] : numerator) - starts[g]);
    return groups;
}
function rehearsalLabel(text) {
    // MuseScore's text property contains XML formatting; TE names are plain text.
    return String(text || '').replace(/<[^>]*>/g, '').replace(/&(#x[0-9a-f]+|#[0-9]+|amp|lt|gt|quot|apos|nbsp);/gi,
        function(match, entity) {
            var named = {amp:'&', lt:'<', gt:'>', quot:'"', apos:"'", nbsp:'\u00a0'};
            if (entity.charAt(0) !== '#') return named[entity.toLowerCase()];
            var code = entity.charAt(1).toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
            if (code < 0 || code > 0x10ffff) return match;
            if (code <= 0xffff) return String.fromCharCode(code);
            code -= 0x10000;
            return String.fromCharCode(0xd800 + (code >> 10), 0xdc00 + (code & 1023));
    }).trim();
}
function freeTimeText(element, types) {
    var names = ['TEMPO_TEXT','STAFF_TEXT','SYSTEM_TEXT','EXPRESSION'], supported = false;
    for (var i = 0; i < names.length; ++i)
        if (types[names[i]] !== undefined && element.type === types[names[i]]) supported = true;
    return supported && /\b(?:senza\s+misura|free[ -]+time|unmetered|cadenza|ad\s+lib(?:itum|\.)?)\b/i.test(rehearsalLabel(element.text));
}
function addHold(holds, item) {
    for (var i = 0; i < holds.length; ++i) {
        if (holds[i].kind === item.kind && holds[i].tick === item.tick) {
            holds[i].pause = Math.max(holds[i].pause || 0, item.pause || 0);
            holds[i].timeStretch = Math.max(holds[i].timeStretch || 1, item.timeStretch || 1);
            holds[i].playedStretch = Math.max(holds[i].playedStretch || 0, item.playedStretch || 0);
            holds[i].played = holds[i].played || item.played;
            return;
        }
    }
    holds.push(item);
}
function scanHold(element, tick, holds, types, symbols) {
    if (!element) return;
    if (types.FERMATA !== undefined && element.type === types.FERMATA) {
        var stretch = Number(element.timeStretch);
        stretch = isFinite(stretch) && stretch > 0 ? stretch : 1;
        addHold(holds, {kind:'fermata',tick:tick,timeStretch:stretch,
            playedStretch:element.play !== false ? stretch : 0,
            played:element.play !== false});
    } else if (types.BREATH !== undefined && element.type === types.BREATH) {
        var caesura = false, names = ['caesuraCurved','caesura','caesuraShort','caesuraThick','chantCaesura','caesuraSingleStroke'];
        for (var i = 0; symbols && i < names.length; ++i)
            if (symbols[names[i]] !== undefined && element.symbol === symbols[names[i]]) caesura = true;
        var pause = Number(element.pause);
        if (caesura || isFinite(pause) && pause > 0)
            addHold(holds, {kind:caesura ? 'caesura' : 'breath',tick:tick,pause:isFinite(pause) ? pause : 0,
                played:element.play !== false});
    }
}
function playedTempoInMeasure(measure, types, segments) {
    for (var s = measure && measure.firstSegment; s; s = s.nextInMeasure) {
        if (segments.ChordRest !== undefined && s.segmentType !== segments.ChordRest) continue;
        var annotations = s.annotations || [];
        for (var a = 0; a < annotations.length; ++a)
            if (annotations[a].type === types.TEMPO_TEXT && annotations[a].play !== false)
                return Number(annotations[a].tempo) * 60;
    }
    return null;
}
function nativePickupBoundary(measure, index, types, breaks) {
    if (index === 1 || measure.irregular) return true;
    var previous = measure.prev;
    if (!previous) return false;
    var frames = ['VBOX','HBOX','TBOX','FBOX'];
    for (var f = 0; f < frames.length; ++f)
        if (types[frames[f]] !== undefined && previous.type === types[frames[f]]) return true;
    var items = previous.elements;
    for (var i = 0; breaks && items && i < items.length; ++i)
        if (types.LAYOUT_BREAK !== undefined && items[i].type === types.LAYOUT_BREAK &&
            (items[i].layoutBreakType === breaks.LINE || items[i].layoutBreakType === breaks.PAGE || items[i].layoutBreakType === breaks.SECTION)) return true;
    return false;
}
function selectionRange(score, measures) {
    var selection = score.selection;
    if (!selection || !selection.isRange || !selection.startSegment || !measures.length) return null;
    var start = selection.startSegment.tick;
    var end = selection.endSegment ? selection.endSegment.tick : measures[measures.length-1].endTick;
    var first = null, last = null;
    for (var i = 0; i < measures.length; ++i) {
        if (measures[i].endTick > start && measures[i].startTick < end) {
            if (first === null) first = i + 1;
            last = i + 1;
        }
    }
    return first === null ? null : {first:first,last:last,
        expanded:start !== measures[first-1].startTick || end !== measures[last-1].endTick};
}
function applyRamp(measures, event, division, events) {
    for (var i = 0; i < measures.length; ++i) {
        var m = measures[i], from = Math.max(m.startTick,event.startTick), to = Math.min(m.endTick,event.endTick);
        if (to <= from) continue;
        var startBeat = (from - m.startTick) / division, length = (to - from) / division;
        if (m.ramp) m.rampError = 'Overlapping gradual tempo changes; disable gradual export or remove the overlap.';
        if (Math.abs(startBeat - Math.round(startBeat)) > 0.000001 ||
            Math.abs(length - Math.round(length)) > 0.000001)
            m.rampError = 'Gradual tempo endpoints must align with quarter beats; disable gradual export to sample bar-start tempos.';
        for (var e = 0; e < events.length; ++e) {
            if (events[e].kind === 'tempo' && events[e].tick >= from && events[e].tick < to &&
                events[e].tick > event.startTick && events[e].tick < event.endTick)
                m.rampError = 'Tempo marking inside a gradual change; move it to a ramp boundary or disable gradual export.';
        }
        function bpm(tick) {
            return event.startTempo + (event.endTempo - event.startTempo) *
                (tick - event.startTick) / (event.endTick - event.startTick);
        }
        m.ramp = {id:event.id,startTempo:bpm(from),endTempo:bpm(to),
            startBeat:Math.round(startBeat),lengthBeats:Math.round(length)};
    }
}
function read(score, elementTypes, segmentTypes, division, options, barLineTypes, layoutBreakTypes, beamTypes, symbolTypes) {
    if (!score) throw new Error('Open a score before running this plugin.');
    options = options || {};
    if (options.splitBy === 'double' && (!barLineTypes || barLineTypes.DOUBLE === undefined))
        throw new Error('MuseScore double-barline type is unavailable.');
    var measures = [], events = [], warnings = [], navigation = [], attention = [];
    function warn(index, number, kind, message) {
        warnings.push(message);
        attention.push({kind:kind,measureIndex:index,measureNumber:number,message:message});
    }
    var cursor = score.newCursor();
    cursor.filter = segmentTypes.All;
    cursor.track = 0;
    var firstTempo = null, firstMeter = null;
    var activeSignatureGrouping = null, inheritedGrouping = null, previousMeter = '';
    var staffMeters = {}, unclearGrouping = [];
    for (var measure = score.firstMeasure; measure; measure = measure.nextMeasure) {
        var index = measures.length + 1;
        var start = ticks(measure.tick, division), end = start + ticks(measure.ticks, division);
        var sig = measure.timesigNominal;
        if (!sig || sig.numerator <= 0 || sig.denominator <= 0)
            throw new Error('Cannot read the written time signature at measure ' + index);
        var meterKey = sig.numerator + '/' + sig.denominator;
        if (meterKey !== previousMeter) { activeSignatureGrouping = null; inheritedGrouping = null; }
        previousMeter = meterKey;
        var groupingTracks = {}, explicitSignature = false, signatureCandidates = [];
        // Fraction-based seeking avoids the tick rounding in rewindToTick.
        cursor.rewindToFraction(measure.tick);
        if (!cursor.segment) throw new Error('Cannot position tempo cursor at measure ' + index);
        var tempo = cursor.tempo * 60;
        if (!isFinite(tempo) || tempo <= 0) throw new Error('Cannot read tempo at measure ' + index);
        if (!firstMeter) firstMeter = {numerator:sig.numerator, denominator:sig.denominator};
        var tempoChanged = false, hasRehearsalMark = false, rehearsalName = '';
        var doubleBarlineBefore = false, doubleBarlineAfter = false;
        var sectionBreakAfter = false, holds = [], freeTime = false;
        var measureElements = measure.elements;
        if (measure.repeatJump) navigation.push({kind:'jump', measureIndex:index});
        for (var e = 0; measureElements && e < measureElements.length; ++e) {
            var item = measureElements[e];
            scanHold(item, start, holds, elementTypes, symbolTypes);
            if (freeTimeText(item, elementTypes)) freeTime = true;
            if (elementTypes.JUMP !== undefined && item.type === elementTypes.JUMP && !measure.repeatJump)
                navigation.push({kind:'jump', measureIndex:index});
            if (layoutBreakTypes && elementTypes.LAYOUT_BREAK !== undefined && item.type === elementTypes.LAYOUT_BREAK &&
                item.layoutBreakType === layoutBreakTypes.SECTION) {
                sectionBreakAfter = true;
                if (Number(item.pause) > 0) addHold(holds, {kind:'sectionPause',tick:end,pause:Number(item.pause),played:true});
            }
        }
        for (var segment = measure.firstSegment; segment; segment = segment.nextInMeasure) {
            var annotations = segment.annotations;
            for (var a = 0; a < annotations.length; ++a) {
                var annotation = annotations[a];
                scanHold(annotation, segment.tick, holds, elementTypes, symbolTypes);
                if (freeTimeText(annotation, elementTypes)) freeTime = true;
                if (elementTypes.REHEARSAL_MARK !== undefined && annotation.type === elementTypes.REHEARSAL_MARK) {
                    hasRehearsalMark = true;
                    var label = rehearsalLabel(annotation.text);
                    if (!rehearsalName) rehearsalName = label;
                    else if (label && label !== rehearsalName && options.splitBy === 'rehearsal')
                        warn(index, measure.no + 1, 'section', 'm.' + (measure.no + 1) + ': multiple different rehearsal marks; preset uses the first label: ' + rehearsalName);
                    events.push({kind:'rehearsal', measureIndex:index, tick:segment.tick,
                        offsetTicks:segment.tick - start, text:annotation.text});
                    if (segment.tick !== start && options.splitBy === 'rehearsal')
                        warn(index, measure.no + 1, 'section', 'm.' + (measure.no + 1) + ': rehearsal mark inside the bar starts a preset at this bar\'s beginning.');
                }
                if (annotation.type === elementTypes.TEMPO_TEXT) {
                    var event = {kind:'tempo', measureIndex:index, tick:segment.tick,
                        offsetTicks:segment.tick - start, quarterBpm:annotation.tempo * 60,
                        text:annotation.text};
                    events.push(event);
                    if (segment.tick === start) tempoChanged = true;
                    else if (options.readTempo !== false)
                        warn(index, measure.no + 1, 'tempo', 'm.' + (measure.no + 1) + ': tempo marking inside the bar is deferred to the next measure.');
                }
            }
            for (var holdTrack = 0; holdTrack < score.ntracks; ++holdTrack) {
                var attached = segment.elementAt(holdTrack);
                scanHold(attached, segment.tick, holds, elementTypes, symbolTypes);
                if (attached) {
                    if (freeTimeText(attached, elementTypes)) freeTime = true;
                    if ((elementTypes.CHORD !== undefined && attached.type === elementTypes.CHORD) ||
                        (elementTypes.REST !== undefined && attached.type === elementTypes.REST)) {
                        var children = attached.elements;
                        for (var h = 0; children && h < children.length; ++h) {
                            scanHold(children[h], segment.tick, holds, elementTypes, symbolTypes);
                            if (freeTimeText(children[h], elementTypes)) freeTime = true;
                        }
                    }
                }
            }
            // A barline can appear on any staff. Repeated staff copies create one boundary.
            if (barLineTypes && elementTypes.BAR_LINE !== undefined) {
                var foundDouble = false;
                for (var barTrack = 0; barTrack < score.ntracks; barTrack += 4) {
                    var barline = segment.elementAt(barTrack);
                    if (barline && barline.type === elementTypes.BAR_LINE && barline.barlineType === barLineTypes.DOUBLE)
                        foundDouble = true;
                }
                if (foundDouble) {
                    events.push({kind:'doubleBarline', measureIndex:index, tick:segment.tick,
                        offsetTicks:segment.tick - start});
                    if (segment.tick === start) doubleBarlineBefore = true;
                    else {
                        doubleBarlineAfter = true;
                        if (segment.tick !== end && options.splitBy === 'double')
                            warn(index, measure.no + 1, 'section', 'm.' + (measure.no + 1) + ': double barline inside the bar splits after this measure.');
                    }
                }
            }
            if (segment.segmentType === segmentTypes.TimeSig) {
                // Capture explicit signatures on every staff, including local signatures.
                for (var track = 0; track < score.ntracks; track += 4) {
                    var el = segment.elementAt(track);
                    if (el && el.type === elementTypes.TIMESIG) {
                        if (segment.tick === start) {
                            staffMeters[track / 4] = el.timesig.numerator + '/' + el.timesig.denominator;
                            if (staffMeters[track / 4] === meterKey) {
                                explicitSignature = true;
                                if (sig.denominator === 8) {
                                    var additive = signatureGrouping(el.numeratorString, sig.numerator);
                                    if (additive) signatureCandidates.push(additive);
                                }
                            }
                        }
                        events.push({kind:'meter', measureIndex:index, tick:segment.tick,
                            offsetTicks:segment.tick - start, track:track,
                            numerator:el.timesig.numerator, denominator:el.timesig.denominator});
                        if (el.timesig.numerator !== sig.numerator || el.timesig.denominator !== sig.denominator)
                            warn(index, measure.no + 1, 'meter', 'm.' + (measure.no + 1) + ': local staff meter differs; using global written meter.');
                    }
                }
            }
            if (sig.denominator === 8 && elementTypes.CHORD !== undefined) {
                for (var noteTrack = 0; noteTrack < score.ntracks; ++noteTrack) {
                    if (staffMeters[Math.floor(noteTrack / 4)] && staffMeters[Math.floor(noteTrack / 4)] !== meterKey) continue;
                    var chord = segment.elementAt(noteTrack);
                    if (chord && chord.type === elementTypes.CHORD) {
                        if (!groupingTracks[noteTrack]) groupingTracks[noteTrack] = [];
                        groupingTracks[noteTrack].push({tick:segment.tick,chord:chord});
                    }
                }
            }
        }
        var grouping = null, groupingSource = '', conflicting = false;
        if (sig.denominator === 8) {
            if (explicitSignature) {
                activeSignatureGrouping = null; inheritedGrouping = null;
                for (var candidate = 0; candidate < signatureCandidates.length; ++candidate) {
                    if (activeSignatureGrouping && String(activeSignatureGrouping) !== String(signatureCandidates[candidate])) conflicting = true;
                    activeSignatureGrouping = signatureCandidates[candidate];
                }
                if (conflicting) activeSignatureGrouping = null;
            }
            if (activeSignatureGrouping) {
                grouping = activeSignatureGrouping.slice(); groupingSource = 'signature';
            } else if (!conflicting) {
                for (var voice in groupingTracks) if (Object.prototype.hasOwnProperty.call(groupingTracks,voice)) {
                    var candidateGroups = beamGrouping(groupingTracks[voice],sig.numerator,start,division,beamTypes);
                    if (!candidateGroups) continue;
                    if (grouping && String(grouping) !== String(candidateGroups)) conflicting = true;
                    grouping = candidateGroups; groupingSource = 'beams';
                }
                if (!grouping && inheritedGrouping) { grouping = inheritedGrouping.slice(); groupingSource = 'inherited'; }
            }
            if (conflicting) { grouping = null; groupingSource = ''; }
            inheritedGrouping = grouping ? grouping.slice() : null;
            if (!grouping) unclearGrouping.push(measure.no + 1);
        }
        var startStretch = 0;
        for (var held = 0; held < holds.length; ++held)
            if (holds[held].kind === 'fermata' && holds[held].played && holds[held].tick === start)
                startStretch = Math.max(startStretch, holds[held].playedStretch);
        // Cursor tempo includes native fermata stretch. Export steady musical BPM;
        // the user determines a held measure's duration before any file is saved.
        var actualQuarters = (end - start) / division;
        var nativeAnacrusis = actualQuarters < sig.numerator * 4 / sig.denominator &&
            nativePickupBoundary(measure,index,elementTypes,layoutBreakTypes);
        var nextTempo = nativeAnacrusis && playedTempoInMeasure(measure, elementTypes, segmentTypes) === null ?
            playedTempoInMeasure(measure.nextMeasure, elementTypes, segmentTypes) : null;
        // MuseScore replaces an unmarked pickup's BPM from a played tempo in
        // the next bar after constructing its fermata map. Do not stretch it twice.
        if (startStretch && nextTempo !== null && isFinite(nextTempo) && nextTempo > 0) tempo = nextTempo;
        else tempo *= startStretch || 1;
        if (firstTempo === null) firstTempo = tempo;
        if (!isFinite(actualQuarters) || actualQuarters <= 0)
            throw new Error('Cannot read actual duration at measure ' + index);
        var irregular = Math.abs(ticks(sig, division) - (end - start)) > 0.001;
        if (irregular)
            warn(index, measure.no + 1, 'duration', 'm.' + (measure.no + 1) + ': pickup/irregular duration retained (' +
                Number((actualQuarters * sig.denominator / 4).toFixed(6)) + ' counts of ' + sig.denominator + ').');
        if (holds.length || freeTime)
            attention.push({kind:'hold',measureIndex:index,measureNumber:measure.no + 1,
                message:'m.' + (measure.no + 1) + ': choose hold/free-time handling before exporting.'});
        measures.push({index:index, number:measure.no + 1, startTick:start, endTick:end,
            durationQuarters:options.readMeter === false && !irregular ? firstMeter.numerator * 4 / firstMeter.denominator : actualQuarters,
            isPickup:index === 1 && actualQuarters < sig.numerator * 4 / sig.denominator,
            holds:holds,freeTime:freeTime,
            numerator:options.readMeter === false ? firstMeter.numerator : sig.numerator,
            denominator:options.readMeter === false ? firstMeter.denominator : sig.denominator,
            tempo:options.readTempo === false ? firstTempo : tempo, tempoChanged:tempoChanged,
            hasRehearsalMark:hasRehearsalMark, rehearsalName:rehearsalName, doubleBarlineBefore:doubleBarlineBefore,
            doubleBarlineAfter:doubleBarlineAfter,
            repeatStart:!!measure.repeatStart, repeatEnd:!!measure.repeatEnd,
            repeatCount:measure.repeatCount === undefined ? 2 : Number(measure.repeatCount),
            sectionBreakAfter:sectionBreakAfter});
        if (index === 1) { firstMeter.grouping = grouping; firstMeter.groupingSource = groupingSource; }
        if (measures[measures.length-1].denominator === 8) {
            var outputGrouping = options.readMeter === false ? firstMeter.grouping : grouping;
            measures[measures.length-1].grouping = outputGrouping ? outputGrouping.slice() : null;
            measures[measures.length-1].groupingSource = options.readMeter === false ? firstMeter.groupingSource : groupingSource;
        }
    }
    var spanners = score.spanners;
    for (var s = 0; spanners && s < spanners.length; ++s) {
        if (elementTypes.VOLTA !== undefined && spanners[s].type === elementTypes.VOLTA)
            navigation.push({kind:'ending'});
        var spanner = spanners[s];
        if (spanner.type === elementTypes.GRADUAL_TEMPO_CHANGE && options.readTempo !== false && spanner.play !== false) {
            if (!options.readRamps) {
                var sampledMessage = 'Gradual tempo change: effective tempo is sampled at bar starts; enable gradual export for TE transitions.';
                var sampledFrom = spanner.spannerTick ? ticks(spanner.spannerTick,division) : NaN;
                var sampledTo = spanner.spannerTicks ? sampledFrom + ticks(spanner.spannerTicks,division) : NaN;
                var sampledFound = false;
                for (var sampled = 0; sampled < measures.length; ++sampled)
                    if (measures[sampled].startTick < sampledTo && measures[sampled].endTick > sampledFrom) {
                        warn(measures[sampled].index, measures[sampled].number, 'ramp', 'm.' + measures[sampled].number + ': ' + sampledMessage);
                        sampledFound = true;
                    }
                if (!sampledFound) warn(null,null,'ramp',sampledMessage);
                continue;
            }
            if (!spanner.spannerTick || !spanner.spannerTicks || !isFinite(spanner.tempoChangeFactor) || spanner.tempoChangeFactor <= 0)
                throw new Error('Cannot read gradual tempo positions or playback factor. Disable gradual export for this score.');
            var rampStart = ticks(spanner.spannerTick,division), rampEnd = rampStart + ticks(spanner.spannerTicks,division);
            if (rampEnd <= rampStart) throw new Error('Gradual tempo change has no duration.');
            cursor.rewindToFraction(spanner.spannerTick);
            var initial = cursor.tempo * 60;
            var rampEvent = {kind:'ramp',id:s+1,startTick:rampStart,endTick:rampEnd,
                startTempo:initial,endTempo:initial * spanner.tempoChangeFactor,easing:spanner.tempoEasingMethod};
            applyRamp(measures,rampEvent,division,events);
            var rampHasHold = false;
            for (var rm = 0; rm < measures.length; ++rm) {
                var rampMeasure = measures[rm];
                for (var rh = 0; rh < rampMeasure.holds.length; ++rh) {
                    var rampHold = rampMeasure.holds[rh];
                    if (rampHold.kind === 'fermata' && rampHold.playedStretch && rampHold.playedStretch !== 1 &&
                        rampHold.tick >= rampStart && rampHold.tick < rampEnd && rampMeasure.ramp)
                        rampHasHold = true;
                }
            }
            if (rampHasHold) for (var blockedRamp = 0; blockedRamp < measures.length; ++blockedRamp)
                if (measures[blockedRamp].ramp && measures[blockedRamp].ramp.id === rampEvent.id)
                    measures[blockedRamp].rampError = 'Fermata overlaps a gradual tempo change. Disable Accelerando / ritardando and set the preview tempos explicitly.';
            events.push(rampEvent);
            if (spanner.tempoEasingMethod !== undefined && spanner.tempoEasingMethod !== 0)
                warn(null, null, 'ramp', 'Gradual tempo curve approximated by linear TE transitions; playback endpoints are retained.');
        }
    }
    if (options.splitBy === 'rehearsal' && !measures.some(function(m) { return m.hasRehearsalMark; }))
        warn(null, null, 'section', 'No rehearsal marks found; presets split only at tempo/meter changes.');
    if (options.splitBy === 'double' && !measures.some(function(m) { return m.doubleBarlineBefore || m.doubleBarlineAfter; }))
        warn(null, null, 'section', 'No double barlines found; presets split only at tempo/meter changes.');
    if (unclearGrouping.length)
        warnings.push('m.' + unclearGrouping.slice(0,8).join(', ') + (unclearGrouping.length > 8 ? '…' : '') +
            ': /8 grouping is unclear; Half-note Met keeps all eighth clicks. Set Grouping in the preview if needed.');
    for (var unclear = 0; unclear < measures.length; ++unclear)
        if (measures[unclear].denominator === 8 && !measures[unclear].grouping)
            attention.push({kind:'grouping',measureIndex:measures[unclear].index,measureNumber:measures[unclear].number,
                message:'m.' + measures[unclear].number + ': /8 grouping is unclear; set Grouping in the preview or keep full eighth clicks.'});
    return {title:score.title || score.metaTag('workTitle') || score.scoreName || 'Untitled score',
        measures:measures, events:events, navigation:navigation, warnings:warnings,attention:attention,
        selection:selectionRange(score,measures)};
}
