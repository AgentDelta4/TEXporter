// Fixture-derived serializer, independent of the notation application.
function clone(node) { return JSON.parse(JSON.stringify(node)); }
function set(node, name, value) {
    for (var i = 0; i < node.attrs.length; ++i) {
        if (node.attrs[i][0] === name) { node.attrs[i][1] = String(value); return; }
    }
    throw new Error('Template is missing ' + node.tag + '.' + name);
}
function child(node, tag) {
    for (var i = 0; i < node.children.length; ++i) if (node.children[i].tag === tag) return node.children[i];
    throw new Error('Template is missing ' + tag);
}
function escapeXml(value) {
    var text = String(value);
    if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/.test(text))
        throw new Error('Text contains a character prohibited by XML 1.0.');
    for (var i = 0; i < text.length; ++i) {
        var c = text.charCodeAt(i);
        if (c >= 0xD800 && c <= 0xDBFF) {
            var next = text.charCodeAt(++i);
            if (!(next >= 0xDC00 && next <= 0xDFFF)) throw new Error('Unpaired Unicode surrogate.');
        } else if (c >= 0xDC00 && c <= 0xDFFF) throw new Error('Unpaired Unicode surrogate.');
    }
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
        .replace(/\r/g, '&#13;').replace(/\n/g, '&#10;').replace(/\t/g, '&#9;');
}
function xml(node, indent) {
    var line = indent + '<' + node.tag;
    for (var i = 0; i < node.attrs.length; ++i)
        line += ' ' + node.attrs[i][0] + '="' + escapeXml(node.attrs[i][1]) + '"';
    if (!node.children.length) return line + '/>\n';
    line += '>\n';
    for (var j = 0; j < node.children.length; ++j) line += xml(node.children[j], indent + '  ');
    return line + indent + '</' + node.tag + '>\n';
}
function getMeterCode(meter) {
    // Observed quarter-meter IDs: 200=1/4, 201=2/4, 202=3/4, 203=4/4, 205=6/4, 207=8/4.
    // Interpolation within this family and custom 398 outside 7/8 are inferred.
    return meter.denominator === 4 && meter.numerator <= 8 ? 199 + meter.numerator : 398;
}
function getSubdivisionCode(meter) {
    // 104 occurs in every /4 fixture; 400 occurs in the 7/8 fixture.
    return meter.denominator === 4 ? 104 : 400;
}
function getAccentMask(meter, mode) {
    return getAccentMasks(meter, mode, 'full').accentmask;
}
function groupStarts(meter) {
    if (meter.denominator !== 8 || !meter.grouping) return null;
    var starts = [], sum = 0;
    for (var i = 0; i < meter.grouping.length; ++i) {
        var length = meter.grouping[i];
        if (length !== Math.floor(length) || length < 1) throw new Error('Invalid eighth-note grouping.');
        starts.push(sum + 1); sum += length;
    }
    if (sum !== meter.numerator) throw new Error('Eighth-note groups must add up to the meter numerator.');
    return starts;
}
function countMask(numerator, positions, fillUnused) {
    // Keep uint64 decimal text exact without BigInt in the QML runtime.
    var low = 0, decimal = '0';
    for (var bit = 63; bit >= 0; --bit) {
        var enabled = bit >= numerator ? fillUnused : positions.indexOf(bit + 1) >= 0;
        if (enabled && bit < 32) low |= 1 << bit;
        var carry = enabled ? 1 : 0, next = '';
        for (var digit = decimal.length - 1; digit >= 0; --digit) {
            var value = Number(decimal.charAt(digit)) * 2 + carry;
            next = String(value % 10) + next; carry = Math.floor(value / 10);
        }
        decimal = (carry ? String(carry) : '') + next;
    }
    return {mask:String(low), mask64:decimal};
}
function getAccentMasks(meter, mode, pattern) {
    if (mode !== 'straight' && mode !== 'downbeat') throw new Error('Invalid click style.');
    var starts = pattern === 'downbeat' ? null : groupStarts(meter);
    var mask = countMask(meter.numerator, mode === 'straight' ? [] : (starts || [1]), false);
    return {accentmask:mask.mask, accentmask64:mask.mask64};
}
function getBeatMasks(meter, pattern) {
    if (['full', 'half', 'downbeat'].indexOf(pattern) < 0) throw new Error('Invalid met version.');
    if (meter.numerator !== Math.floor(meter.numerator) || meter.numerator < 1 || meter.numerator > 64)
        throw new Error('Invalid meter numerator.');
    // TE's Common Drumline export leaves unused high bits enabled. Silence only
    // the selected bar's counts: 4/4 half=-11, downbeat=-15. Preserve all 64 bits
    // as decimal text; QML numbers cannot exactly represent a uint64 mask.
    var starts = groupStarts(meter), positions = [];
    for (var count = 1; count <= meter.numerator; ++count) {
        if (pattern === 'full' || pattern === 'downbeat' && count === 1 ||
            pattern === 'half' && (meter.denominator === 8 ? !starts || starts.indexOf(count) >= 0 : count % 2 === 1))
            positions.push(count);
    }
    var mask = countMask(meter.numerator, positions, true);
    return {beatmask:mask.mask, beatmask64:mask.mask64};
}
function durationQuarters(region) {
    var beats = region.durationOverrideQuarters !== undefined ? region.durationOverrideQuarters :
        region.durationQuarters === undefined ? region.barCount * region.numerator * 4 / region.denominator : region.durationQuarters;
    if (!isFinite(beats) || beats <= 0) throw new Error('Invalid actual duration at m.' + region.startMeasure + '.');
    return beats;
}
function playbackMeter(region) {
    var beats = durationQuarters(region), nominal = region.barCount * region.numerator * 4 / region.denominator;
    if (Math.abs(beats - nominal) < 0.000000001)
        return {numerator:region.numerator, denominator:region.denominator, barCount:region.barCount, projected:false};
    if (region.barCount !== 1)
        throw new Error('An irregular duration must occupy its own preset at m.' + region.startMeasure + '.');
    // Beat-only/time mode numeric XML fields are unproven by the supplied exports.
    // Represent the actual length with one meter bar instead of rounding it up.
    var base = region.denominator, count = beats * base / 4;
    while (Math.abs(count - Math.round(count)) > 0.000000001 && base < 64) {
        base *= 2; count = beats * base / 4;
    }
    if (Math.abs(count - Math.round(count)) > 0.000000001 || count < 1 || count > 64)
        throw new Error('m.' + region.startMeasure + ': actual duration cannot be represented exactly within 64 counts and a /64 grid.');
    return {numerator:Math.round(count), denominator:base, barCount:1, projected:true};
}
function playbackMasks(region, mode, pattern, meter) {
    meter = meter || playbackMeter(region);
    if (!meter.projected)
        return {accents:getAccentMasks(region, mode, pattern), beats:getBeatMasks(region, pattern)};
    if (mode !== 'straight' && mode !== 'downbeat') throw new Error('Invalid click style.');
    if (['full', 'half', 'downbeat'].indexOf(pattern) < 0) throw new Error('Invalid met version.');
    var starts = groupStarts(region), enabled = [], accented = [];
    var sourceDuration = region.sourceDurationQuarters === undefined ? durationQuarters(region) : region.sourceDurationQuarters;
    var offset = region.isPickup ? Math.max(0, region.numerator - sourceDuration * region.denominator / 4) : 0;
    for (var count = 1; count <= meter.numerator; ++count) {
        var nominal = offset + (count - 1) * region.denominator / meter.denominator;
        // Refining a fractional count does not introduce extra audible clicks.
        if (Math.abs(nominal - Math.round(nominal)) > 0.000000001) continue;
        var position = Math.round(nominal) % region.numerator + 1;
        var plays = pattern === 'full' || pattern === 'downbeat' && position === 1 ||
            pattern === 'half' && (region.denominator === 8 ? !starts || starts.indexOf(position) >= 0 : position % 2 === 1);
        if (plays) enabled.push(count);
        if (plays && mode === 'downbeat' && (pattern === 'downbeat' ? position === 1 :
            starts ? starts.indexOf(position) >= 0 : position === 1)) accented.push(count);
    }
    var beatMask = countMask(meter.numerator, enabled, true), accentMask = countMask(meter.numerator, accented, false);
    return {beats:{beatmask:beatMask.mask, beatmask64:beatMask.mask64},
        accents:{accentmask:accentMask.mask, accentmask64:accentMask.mask64}};
}
function selectedVersions(options) {
    options = options || {};
    var versions = [];
    if (options.fullMet !== false) versions.push({pattern:'full', label:'Full Met'});
    if (options.halfMet === true) versions.push({pattern:'half', label:'Half-note Met'});
    if (options.downbeatMet === true) versions.push({pattern:'downbeat', label:'Downbeat Met'});
    if (!versions.length) throw new Error('Select at least one met version.');
    return versions;
}
function versionFilename(title, label) {
    var suffix = ' [' + label + ']';
    var base = filename(title).replace(/\.tetmetgroup$/i, '');
    // Reserve suffix space so even long score names produce distinct files.
    return filename(base.slice(0, 150 - suffix.length) + suffix);
}
function serializeExports(title, regions, options, defaults) {
    if (!String(title).trim()) throw new Error('Enter a profile name.');
    var versions = selectedVersions(options), exports = [];
    for (var i = 0; i < versions.length; ++i) {
        var version = versions[i], settings = clone(options || {});
        settings.clickPattern = version.pattern;
        var name = title + ' [' + version.label + ']';
        var output = serialize(name, regions, settings, defaults);
        exports.push({pattern:version.pattern, label:version.label, title:name,
            filename:versionFilename(title, version.label), text:output.text, warnings:output.warnings});
    }
    return exports;
}
function filename(title) {
    var name = String(title).replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').replace(/[. ]+$/g, '').trim();
    if (!name) name = 'Untitled score';
    if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)/i.test(name)) name = '_' + name;
    return name.slice(0, 150).replace(/[. ]+$/g, '') + '.tetmetgroup';
}
function validatePath(path) {
    if (!path || /[\u0000-\u001F]/.test(path)) throw new Error('Choose a valid local output path.');
    var base = path.replace(/\\/g, '/').split('/').pop();
    if (!/\.tetmetgroup$/i.test(base)) throw new Error('Output filename must end in .tetmetgroup.');
    if (/[<>:"|?*]/.test(base) || /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)/i.test(base) || base.length > 255 || base === '.tetmetgroup')
        throw new Error('Invalid output filename.');
    return path;
}
function matchesReadback(actual, expected) {
    // 4.7.5 FileIO.read() adds a newline after its final null readLine().
    return actual === expected || actual === expected + '\n';
}
function serialize(title, regions, options, defaults) {
    options = options || {};
    if (!defaults || defaults.group.tag !== 'MetroPresetGroup' || defaults.preset.tag !== 'MetroPreset')
        throw new Error('Invalid TE root/container template.');
    child(defaults.group, 'RandomSamplesets');
    child(defaults.group, 'MetroCountIn');
    child(defaults.preset, 'MetroPolyMeterMapInfo');
    if (!String(title).trim()) throw new Error('Enter a profile name.');
    if (!regions.length) throw new Error('No metronome regions to export.');
    var mode = options.accentMode || 'downbeat', pattern = options.clickPattern || 'full';
    var group = clone(defaults.group), warnings = [];
    set(group, 'name', title);
    set(group, 'accent_allowed', mode === 'downbeat' ? 1 : 0);
    set(group, 'loop_presets', 0);
    set(group, 'eighth_equals_eighth', 0);
    set(group, 'do_countin', options.countInEnabled === true ? 1 : 0);
    // User confirmed countin_type=4 is Range Start in the supplied Part 3 group.
    set(group, 'countin_type', 4);
    var countIn = child(group, 'MetroCountIn');
    // User confirmed unit=2 selects eighth notes; 16 eighths span eight quarter counts.
    set(countIn, 'unit', 2); set(countIn, 'eighthcount', 16);
    // The supplied Part 1 count-in uses alternating eighth positions for quarter clicks.
    // Keep all voice positions silent; native count-in timing is separate from score presets.
    set(countIn, 'beatmask', '21845'); set(countIn, 'beatmask64', '21845');
    set(countIn, 'voicemask', '0'); set(countIn, 'voicemask64', '0');
    // Supplied Part 1 accent mask: eighth positions 1, 5, 9, 11 and 13.
    set(countIn, 'voiceaccentmask', '0'); set(countIn, 'accentmask', '5393');
    set(countIn, 'allow_accent', 1); set(countIn, 'use_subdiv', 0);
    set(group, 'drone_enabled', 0);
    var presets = [];
    for (var i = 0; i < regions.length; ++i) {
        var r = regions[i];
        if (r.barCount !== Math.floor(r.barCount) || r.barCount < 1) throw new Error('Bar count must be positive.');
        if (r.numerator !== Math.floor(r.numerator) || r.numerator < 1 || r.numerator > 64 ||
            [1,2,4,8,16,32,64].indexOf(r.denominator) < 0) throw new Error('Invalid meter.');
        // Retain the template's quarter beat unit (beatscale=0). Other supplied
        // presets choose other units; this exporter keeps quarter BPM throughout.
        if (!isFinite(r.tempo) || r.tempo < 1 || r.tempo > 1000) throw new Error('TE tempo must be 1–1000 quarter BPM.');
        var encodedMeter = playbackMeter(r), tempo = Math.round(r.tempo * 100) / 100,
            meter = getMeterCode(encodedMeter), subdiv = getSubdivisionCode(encodedMeter);
        var ramp = r.ramp, initial = 0, length = 0, start = 0, anchor = 0;
        if (ramp) {
            initial = Math.round(ramp.startTempo * 100) / 100;
            tempo = Math.round(ramp.endTempo * 100) / 100;
            length = ramp.lengthBeats; start = ramp.startBeat;
            var beats = durationQuarters(r);
            if (!isFinite(initial) || !isFinite(tempo) || initial < 1 || initial > 1000 || tempo < 1 || tempo > 1000 ||
                !isFinite(start) || !isFinite(length) || start !== Math.floor(start) || start < 0 ||
                length !== Math.floor(length) || length < 1 || start + length > beats)
                throw new Error('Invalid gradual tempo endpoints or quarter-beat positions in preset ' + (i+1) + '.');
            anchor = start > 0 && start + length === beats ? 1 : 0;
            if (r.denominator !== 4 || start > 0 && start + length < beats)
                warnings.push('Preset ' + (i+1) + ': transition placement/beat units extend beyond the supplied 4/4 ramp examples; verify in TE.');
        }
        var projected = playbackMasks(r, mode, pattern, encodedMeter), accents = projected.accents,
            masks = projected.beats, preset = clone(defaults.preset);
        var name = r.presetName === undefined ? '' : String(r.presetName);
        set(preset, 'name', name);
        set(preset, 'usetempo', 1);
        set(preset, 'tempo', tempo);
        set(preset, 'barcount', encodedMeter.barCount);
        set(preset, 'meter', meter);
        set(preset, 'subdiv', subdiv);
        set(preset, 'accentmask', accents.accentmask);
        set(preset, 'beatmask', masks.beatmask);
        var tempoMap = child(preset, 'MetroTempoMapInfo');
        set(tempoMap, 'tempo', tempo);
        var transitionValues = {starting_tempo:initial,transition:ramp ? 1 : 0,
            transition_anchor:anchor,transition_len:length};
        for (var field in transitionValues) if (Object.prototype.hasOwnProperty.call(transitionValues,field)) {
            set(preset,field,transitionValues[field]); set(tempoMap,field,transitionValues[field]);
        }
        set(tempoMap,'transition_start',start);
        set(tempoMap,'transition_end_bar',0);
        set(tempoMap,'transition_end_beat',ramp ? start + length - 1 : 0);
        var map = child(preset, 'MetroMeterMapInfo');
        set(map, 'meter', meter); set(map, 'subdiv', subdiv);
        set(map, 'topcount', encodedMeter.numerator); set(map, 'notebase', encodedMeter.denominator);
        set(map, 'barcount', encodedMeter.barCount); set(map, 'bardur', encodedMeter.barCount);
        set(map, 'accentmask', accents.accentmask); set(map, 'accentmask64', accents.accentmask64);
        set(map, 'beatmask', masks.beatmask); set(map, 'beatmask64', masks.beatmask64);
        presets.push(preset);
        if ([1,2,3,4,6,8].indexOf(encodedMeter.numerator) < 0 && encodedMeter.denominator === 4 ||
            encodedMeter.denominator !== 4 && !(encodedMeter.numerator === 7 && encodedMeter.denominator === 8))
            warnings.push('Preset ' + (i + 1) + ' (m.' + r.startMeasure + '): meter/subdivision encoding is inferred; verify in TE before use.');
    }
    // Keep the original child order: RandomSamplesets, presets, MetroCountIn.
    group.children.splice.apply(group.children, [1, 0].concat(presets));
    return {text:'<?xml version="1.0" encoding="UTF-8"?>\n' + xml(group, ''), warnings:warnings};
}
