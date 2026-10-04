// Native source checks through the documented ManuScript subset, not Sibelius.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {methods} = require('../build.cjs');
const {createRuntime} = require('./manuscript.cjs');
const load = require('../../tests/load.cjs');
const te = load('TonalEnergy');
const helperNames = new Set(['TrimText', 'NumberValue', 'RoundTempo', 'ValidMeter', 'Fail']);
const helpers = methods(fs.readFileSync(path.join(__dirname, '../src/TEExporter.ms'), 'utf8'))
    .filter(m => helperNames.has(m.name));
const metronomeSource = fs.readFileSync(path.join(__dirname, '../src/Metronome.ms'), 'utf8');
const parsed = [...helpers, ...methods(metronomeSource)];
const quoted = s => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
const file = path.join(__dirname, `.metronome-runtime-${process.pid}.plg`);
fs.writeFileSync(file, '\ufeff' + ['{', ...parsed.map(m =>
    `\t${m.name} ${quoted('(' + m.params.join(', ') + ') {' + m.body + '}')}`),
    '\tClickStyle "Accent downbeat"', '\tErrorText ""', '}'].join('\r\n'), 'utf16le');
test.after(() => fs.unlinkSync(file));
function harness(style = 'Accent downbeat') {
    const h = createRuntime(file, {trace: []});
    h.globals.ClickStyle = style;
    return h;
}
const region = extra => ({name: '', bars: 1, top: 4, base: 4, tempo: 120, ramp: null,
    sourceLength: 1024, partial: false, pickup: false, groupingText: '',
    requiresTimingDecision: false, timingMode: '', totalCounts: 0, countBase: 4, ...extra});
function reference(r, pattern, style = 'Accent downbeat') {
    const normalized = {barCount: r.bars, numerator: r.top, denominator: r.base, tempo: r.tempo};
    if (r.partial) normalized.durationQuarters = r.sourceLength / 256;
    if (r.timingMode === 'Set total counts') normalized.durationOverrideQuarters = r.totalCounts * 4 / r.countBase;
    normalized.isPickup = r.pickup;
    normalized.sourceDurationQuarters = r.sourceLength / 256;
    if (r.base === 8 && r.groupingText.trim())
        normalized.grouping = r.groupingText.replace(/\s/g, '').split(/[+-]/).map(Number);
    const meter = te.playbackMeter(normalized);
    const masks = te.playbackMasks(normalized, style === 'Straight' ? 'straight' : 'downbeat', pattern, meter);
    return {top: meter.numerator, base: meter.denominator, bars: meter.barCount,
        projected: meter.projected, durationTicks: te.durationQuarters(normalized) * 256,
        meter: te.getMeterCode(meter), subdiv: te.getSubdivisionCode(meter),
        beatMask: masks.beats.beatmask, beatMask64: masks.beats.beatmask64,
        accentMask: masks.accents.accentmask, accentMask64: masks.accents.accentmask64};
}
function parity(h, r, pattern) {
    const before = JSON.stringify(r);
    const actual = h.call('PreparePreset', r, pattern);
    assert.ok(actual, h.globals.ErrorText);
    const expected = reference(r, pattern, h.globals.ClickStyle);
    for (const key of Object.keys(expected)) assert.equal(actual[key], expected[key], key);
    assert.equal(actual.beatMask, String(BigInt.asIntN(32, BigInt(actual.beatMask64))));
    assert.equal(actual.accentMask, String(BigInt.asIntN(32, BigInt(actual.accentMask64))));
    assert.equal(JSON.stringify(r), before, 'input region stays unchanged');
    return actual;
}
const audible = (mask, top) => Array.from({length: top}, (_, i) => i + 1)
    .filter(n => (BigInt(mask) >> BigInt(n - 1)) & 1n);

test('all new native methods parse and exact masks cover the entire 64-bit range', () => {
    const h = harness();
    for (let top = 1; top <= 64; ++top) {
        for (const pattern of ['full', 'half', 'downbeat']) parity(h, region({top}), pattern);
    }
    const full = h.call('PreparePreset', region({top: 64}), 'Full Met');
    assert.equal(full.beatMask64, '18446744073709551615');
    assert.equal(full.beatMask, '-1');
    assert.equal(h.call('MetCountMask', 64, [64], false).mask64, '9223372036854775808');
    assert.equal(h.call('MetCountMask', 64, [32], false).mask, '-2147483648');
    assert.equal(h.call('MetCountMask', 64, Array.from({length: 31}, (_, i) => i + 1), false).mask, '2147483647');
});

test('standard and straight click versions match MuseScore across supported denominator grids', () => {
    for (const style of ['Accent downbeat', 'Straight']) {
        const h = harness(style);
        for (const base of [1, 2, 4, 8, 16, 32, 64]) {
            for (const top of [1, 2, 3, 4, 6, 7, 8, 33, 64]) {
                for (const pattern of ['full', 'half', 'downbeat']) parity(h, region({top, base}), pattern);
            }
        }
    }
});

test('/8 grouping controls Full/Half accents and clicks; Downbeat uses only count one', () => {
    const h = harness();
    for (const groupingText of ['3+2+2', '2+2+3', '2+3+2', ' 3 - 2 - 2 ']) {
        for (const pattern of ['full', 'half', 'downbeat'])
            parity(h, region({top: 7, base: 8, groupingText}), pattern);
    }
    const grouped = region({top: 7, base: 8, groupingText: '3+2+2'});
    assert.deepEqual(audible(h.call('PreparePreset', grouped, 'Half-note Met').beatMask64, 7), [1, 4, 6]);
    assert.deepEqual(audible(h.call('PreparePreset', grouped, 'full').accentMask64, 7), [1, 4, 6]);
    assert.deepEqual(audible(h.call('PreparePreset', grouped, 'Downbeat Met').beatMask64, 7), [1]);
    assert.equal(h.call('ValidateGrouping', '', 7), true);
    for (const text of ['3+2', '3+0+4', '3++2+2', '3+2+2+', '3.5+3.5', 'seven']) {
        assert.equal(h.call('ValidateGrouping', text, 7), false, text);
        assert.ok(h.globals.ErrorText);
    }
});

test('/16 behavior stays on odd counts without applying /8 grouping', () => {
    const h = harness();
    const r = region({top: 7, base: 16, groupingText: '3+2+2'});
    const out = parity(h, r, 'half');
    assert.deepEqual(audible(out.beatMask64, 7), [1, 3, 5, 7]);
    assert.deepEqual(audible(out.accentMask64, 7), [1]);
});

test('opening pickup preserves the tail counts while closing irregular bars align at count one', () => {
    const h = harness();
    for (const sourceLength of [16, 32, 64, 128, 256, 384, 512, 768, 1280, 4096]) {
        for (const pickup of [false, true]) {
            for (const pattern of ['full', 'half', 'downbeat'])
                parity(h, region({sourceLength, partial: true, pickup}), pattern);
        }
    }
    const pickup = region({sourceLength: 256, partial: true, pickup: true});
    assert.deepEqual(audible(h.call('PreparePreset', pickup, 'full').beatMask64, 1), [1]);
    assert.deepEqual(audible(h.call('PreparePreset', pickup, 'full').accentMask64, 1), []);
    for (const pattern of ['half', 'downbeat'])
        assert.deepEqual(audible(h.call('PreparePreset', pickup, pattern).beatMask64, 1), []);
    const closing = region({sourceLength: 768, partial: true});
    assert.deepEqual(audible(h.call('PreparePreset', closing, 'half').beatMask64, 3), [1, 3]);
    const fractional = parity(h, region({sourceLength: 384, partial: true}), 'full');
    assert.deepEqual([fractional.top, fractional.base], [3, 8]);
    assert.deepEqual(audible(fractional.beatMask64, 3), [1, 3]);
});

test('grouped /8 pickup and fractional source lengths retain nominal click positions', () => {
    const h = harness();
    for (const sourceLength of [16, 64, 128, 256, 384, 768]) {
        for (const pattern of ['full', 'half', 'downbeat']) {
            parity(h, region({top: 7, base: 8, sourceLength, partial: true, pickup: true, groupingText: '3+2+2'}), pattern);
        }
    }
    const r = region({top: 7, base: 8, sourceLength: 256, partial: true, pickup: true, groupingText: '3+2+2'});
    assert.deepEqual(audible(h.call('PreparePreset', r, 'half').beatMask64, 2), [1]);
});

test('explicit whole-bar totals convert the entered count unit and cycle the nominal pattern', () => {
    const h = harness();
    const base = region({requiresTimingDecision: true, timingMode: 'Set total counts', totalCounts: 6});
    for (const countBase of [1, 2, 4, 8, 16, 32, 64]) {
        const r = {...base, countBase, totalCounts: 6 * countBase / 4};
        for (const pattern of ['full', 'half', 'downbeat']) parity(h, r, pattern);
    }
    const full = h.call('PreparePreset', base, 'full');
    assert.deepEqual(audible(full.accentMask64, full.top), [1, 5]);
    assert.deepEqual(audible(h.call('PreparePreset', base, 'half').beatMask64, 6), [1, 3, 5]);
    assert.deepEqual(audible(h.call('PreparePreset', base, 'downbeat').beatMask64, 6), [1, 5]);
    assert.equal(full.durationTicks / 256, 6);
    for (const pattern of ['full', 'half', 'downbeat'])
        parity(h, {...base, partial: true, pickup: true, sourceLength: 256}, pattern);
});

test('steady choices preserve actual partial lengths and nominal lengths under a frozen meter', () => {
    const h = harness();
    parity(h, region({requiresTimingDecision: true, timingMode: 'Keep steady clicks'}), 'full');
    const partial = parity(h, region({sourceLength: 256, partial: true, timingMode: 'Keep steady clicks', requiresTimingDecision: true}), 'full');
    assert.equal(partial.durationTicks, 256);
    // A regular written 3/4 bar frozen to 4/4 uses the selected 4/4 duration.
    const frozen = parity(h, region({sourceLength: 768}), 'full');
    assert.equal(frozen.durationTicks, 1024);
    const merged = parity(h, region({bars: 3, sourceLength: 2304}), 'full');
    assert.equal(merged.durationTicks, 3072);
});

test('unsafe durations, unresolved holds and invalid inputs fail before serialization', () => {
    const h = harness();
    const invalid = [
        {sourceLength: 0, partial: true}, {sourceLength: 8, partial: true},
        {sourceLength: 256 / 3, partial: true}, {sourceLength: 65 * 256, partial: true},
        {partial: true, bars: 2}, {requiresTimingDecision: true},
        {requiresTimingDecision: true, timingMode: 'Keep steady clicks', bars: 2},
        {timingMode: 'Set total counts', totalCounts: 0},
        {timingMode: 'Set total counts', totalCounts: 6, countBase: 3},
        {timingMode: 'Set total counts', totalCounts: 65},
        {timingMode: 'Set total counts', totalCounts: 256, countBase: 1},
        {timingMode: 'Set total counts', totalCounts: 6, bars: 2},
        {timingMode: 'Wait for cue'}, {top: 65}, {base: 3}, {tempo: 0}, {bars: 1.5},
        {top: 7, base: 8, groupingText: '3+3'}
    ];
    for (const extra of invalid) {
        h.globals.ErrorText = '';
        assert.equal(h.call('PreparePreset', region(extra), 'full'), null, JSON.stringify(extra));
        assert.ok(h.globals.ErrorText, JSON.stringify(extra));
    }
    assert.equal(h.call('PreparePreset', region(), 'invalid'), null);
    const straight = harness('invalid');
    assert.equal(straight.call('PreparePreset', region(), 'full'), null);
});

test('2/4 uses observed IDs and the same inferred-meter boundaries as MuseScore', () => {
    const h = harness();
    const observed = h.call('PreparePreset', region({top: 2}), 'full');
    assert.deepEqual([observed.meter, observed.subdiv, observed.inferred], [201, 104, false]);
    for (const [top, base, inferred] of [[1, 4, false], [3, 4, false], [4, 4, false],
        [6, 4, false], [8, 4, false], [7, 8, false], [5, 4, true], [7, 4, true], [6, 8, true], [2, 2, true]]) {
        assert.equal(h.call('PreparePreset', region({top, base}), 'full').inferred, inferred);
    }
});

test('legacy sparse regions remain compatible and fraction-producing arithmetic is explicitly floating', () => {
    const h = harness();
    const out = h.call('PreparePreset', {name: 'Top', bars: 2, top: 4, base: 4, tempo: 172.00002, ramp: null}, 'full');
    assert.ok(out, h.globals.ErrorText);
    assert.equal(out.tempo, 172);
    assert.equal(h.call('PreparePreset', region({tempo: 120.25}), 'full').tempo, 120.25);
    assert.equal(out.durationTicks, 2048);
    assert.match(metronomeSource, /1024\.0/);
    assert.match(metronomeSource, /base \+ 0\.0/);
});
