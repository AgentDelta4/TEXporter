const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const load = require('./load.cjs');
const te = load('TonalEnergy'), options = load('ExportOptions');
const model = load('Model'), repeats = load('RepeatOrder');
const defaults = load('Template').defaults;
const region = {startMeasure:1,endMeasure:2,barCount:2,numerator:4,denominator:4,tempo:120.25,presetName:'A'};
function attr(tag, name) { return tag.match(new RegExp('\\b'+name+'="([^"]*)"'))[1]; }
function presets(xml) {
    return Array.from(xml.matchAll(/<MetroPreset\b[^>]*>[\s\S]*?<\/MetroPreset>/g), m=>m[0]);
}
function meterMap(xml) { return xml.match(/<MetroMeterMapInfo\b[^>]*>/)[0]; }
const all = {fullMet:true,halfMet:true,downbeatMet:true,countInEnabled:true};

test('4/4 beat masks exactly match the sanitized TonalEnergy click-pattern reference',()=>{
    const fixture=fs.readFileSync('tests/references/click-patterns.tetmetgroup','utf8');
    const reference=presets(fixture);
    for (const [pattern,name] of [['full','Quarter Note'],['half','Half Note'],['downbeat','Whole Note']]) {
        const expected=reference.find(p=>attr(p,'name')===name);
        const actual=presets(te.serialize('Masks',[region],{clickPattern:pattern},defaults).text)[0];
        assert.equal(attr(actual,'beatmask'),attr(expected,'beatmask'));
        assert.equal(attr(meterMap(actual),'beatmask'),attr(meterMap(expected),'beatmask'));
        assert.equal(attr(meterMap(actual),'beatmask64'),attr(meterMap(expected),'beatmask64'));
        assert.equal(attr(actual,'accentmask'),attr(expected,'accentmask'));
    }
});

test('clicks reset at each bar and masks remain exact for every numerator from 1 to 64',()=>{
    for (let numerator=1;numerator<=64;++numerator) {
        for (const pattern of ['full','half','downbeat']) {
            const masks=te.getBeatMasks({numerator},pattern);
            const mask=BigInt(masks.beatmask64);
            const expected=Array.from({length:numerator},(_,i)=>i+1)
                .filter(n=>pattern==='full'||pattern==='half'&&n%2===1||n===1);
            const actual=Array.from({length:numerator},(_,i)=>i+1)
                .filter(n=>(mask>>(BigInt(n)-1n))&1n);
            assert.deepEqual(actual,expected,`${numerator} counts, ${pattern}`);
            assert.equal(BigInt.asIntN(32,mask).toString(),masks.beatmask);
            for(let bit=numerator;bit<64;++bit) assert.ok((mask>>BigInt(bit))&1n);
        }
    }
    assert.equal(te.getBeatMasks({numerator:64},'half').beatmask64,'6148914691236517205');
    assert.equal(te.getBeatMasks({numerator:64},'downbeat').beatmask64,'1');
    assert.throws(()=>te.getBeatMasks({numerator:4},'bad'),/met version/);
});

test('all selected versions get distinct names/files and preserve edited score data and count-in',()=>{
    const parts=[region,{...region,numerator:7,denominator:8,barCount:3,presetName:'B (repeat)',
        ramp:{startTempo:120.25,endTempo:160.5,startBeat:0,lengthBeats:10}}];
    const before=JSON.stringify({parts,defaults,all});
    const outputs=te.serializeExports('Score & test',parts,all,defaults);
    assert.deepEqual(Array.from(outputs,x=>x.label),['Full Met','Half-note Met','Downbeat Met']);
    assert.equal(new Set(outputs.map(x=>x.filename)).size,3);
    for(const output of outputs) {
        assert.equal(output.title,'Score & test ['+output.label+']');
        assert.equal(output.filename,'Score & test ['+output.label+'].tetmetgroup');
        const p=presets(output.text);
        assert.equal(p.length,2);
        assert.equal(attr(p[0],'name'),'A'); assert.equal(attr(p[1],'name'),'B (repeat)');
        assert.equal(attr(p[0],'tempo'),'120.25'); assert.equal(attr(p[1],'tempo'),'160.5');
        assert.equal(attr(p[1],'starting_tempo'),'120.25'); assert.equal(attr(p[1],'transition_len'),'10');
        assert.equal(attr(p[1],'barcount'),'3'); assert.equal(attr(meterMap(p[1]),'notebase'),'8');
        assert.equal(attr(output.text,'do_countin'),'1'); assert.equal(attr(output.text,'countin_type'),'4');
        assert.equal(output.text.match(/<MetroCountIn\b[\s\S]*?<\/MetroCountIn>/)[0],
            outputs[0].text.match(/<MetroCountIn\b[\s\S]*?<\/MetroCountIn>/)[0]);
    }
    assert.equal(JSON.stringify({parts,defaults,all}),before);
    // Remove only version title/beat masks: musical presets must otherwise match.
    const normalize=xml=>xml.replace(/name="Score &amp; test \[[^\]]+\]"/,'name="Score"')
        .replace(/\bbeatmask(?:64)?="[^"]*"/g,'MASK');
    assert.equal(normalize(outputs[0].text),normalize(outputs[1].text));
    assert.equal(normalize(outputs[0].text),normalize(outputs[2].text));
});

test('version selection defaults to full, permits any subset and rejects no selection',()=>{
    assert.deepEqual(Array.from(te.selectedVersions({}),x=>x.pattern),['full']);
    assert.deepEqual(Array.from(te.selectedVersions({fullMet:false,downbeatMet:true}),x=>x.pattern),['downbeat']);
    assert.deepEqual(Array.from(te.selectedVersions({fullMet:false,halfMet:true,downbeatMet:true}),x=>x.pattern),['half','downbeat']);
    assert.throws(()=>te.serializeExports('Score',[region],{fullMet:false},defaults),/at least one/);
    assert.throws(()=>te.serializeExports(' ',[region],all,defaults),/profile name/);
});

test('long, reserved and invalid score filenames retain distinct version suffixes',()=>{
    for(const title of ['X'.repeat(500),'CON','A:/?test.  ','']) {
        const names=['Full Met','Half-note Met','Downbeat Met'].map(label=>te.versionFilename(title,label));
        assert.equal(new Set(names).size,3);
        for(const [i,name] of names.entries()) {
            assert.ok(name.endsWith(' ['+['Full Met','Half-note Met','Downbeat Met'][i]+'].tetmetgroup'));
            assert.equal(te.validatePath('C:/Scores/'+name),'C:/Scores/'+name);
        }
    }
});

test('saved version checkboxes retain false values and old preferences keep Full Met',()=>{
    const value=options.decode(options.encode({fullMet:false,halfMet:true,downbeatMet:true}));
    assert.equal(value.fullMet,false); assert.equal(value.halfMet,true); assert.equal(value.downbeatMet,true);
    assert.equal(options.decode('{"accentMode":"downbeat"}').fullMet,true);
    assert.equal(options.decode('bad').halfMet,false);
    assert.equal(options.decode('{"halfMet":"true"}').halfMet,false);
});

test('mixed meters and repeat sections retain structure with odd-count masks per preset',()=>{
    const written=Array.from({length:4},(_,i)=>({index:i+1,number:i+1,tempo:120,
        numerator:i<2?3:7,denominator:i<2?4:8,repeatStart:i===0,repeatEnd:i===1,repeatCount:2,
        hasRehearsalMark:i===0||i===2,rehearsalName:i===0?'A':'B'}));
    const parts=model.regions(repeats.expand(written,{repeatMode:'follow'}).measures,{splitBy:'rehearsal'});
    const output=te.serializeExports('Repeats',parts,{fullMet:false,halfMet:true,countInEnabled:false},defaults)[0];
    const p=presets(output.text);
    assert.deepEqual(p.map(x=>attr(x,'name')),['A','A (repeat)','B']);
    assert.deepEqual(p.map(x=>attr(x,'barcount')),['2','2','2']);
    assert.deepEqual(p.map(x=>Number(BigInt(attr(meterMap(x),'beatmask64'))&127n)),[125,125,127]);
    assert.equal(attr(output.text,'do_countin'),'0');
});

test('Straight accent option works independently of silent-count patterns',()=>{
    for(const output of te.serializeExports('Straight',[region],{...all,accentMode:'straight'},defaults)) {
        assert.equal(attr(output.text,'accent_allowed'),'0');
        assert.equal(attr(presets(output.text)[0],'accentmask'),'0');
        assert.equal(attr(output.text.match(/<MetroCountIn\b[^>]*>/)[0],'accentmask'),'5393');
    }
});
