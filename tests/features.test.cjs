const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const load=require('./load.cjs');
const range=load('Range'), preview=load('Preview'), options=load('ExportOptions');
const reader=load('ScoreReader'), model=load('Model'), playback=load('RepeatOrder');
const te=load('TonalEnergy'), defaults=load('Template').defaults;
const E={TEMPO_TEXT:1,GRADUAL_TEMPO_CHANGE:2,VOLTA:3,JUMP:4};
function measures() { return Array.from({length:8},(_,i)=>({index:i+1,number:i+1,startTick:i*1920,
    endTick:(i+1)*1920,numerator:4,denominator:4,tempo:120})); }
function score(spanners=[]) {
    const bars=measures().map(m=>({no:m.index-1,tick:{numerator:m.startTick,denominator:1920},
        ticks:{numerator:1,denominator:1},timesigNominal:{numerator:4,denominator:4},
        firstSegment:{tick:m.startTick,segmentType:1,annotations:[],elementAt:()=>null}}));
    bars.forEach((m,i)=>m.nextMeasure=bars[i+1]||null);
    return {title:'Features',ntracks:4,firstMeasure:bars[0],spanners,metaTag:()=>'',
        newCursor:()=>({tempo:2,rewindToFraction(){this.segment={};}})};
}
function ramp(extra={}) { return {type:2,spannerTick:{numerator:0,denominator:1},
    spannerTicks:{numerator:4,denominator:1},tempoChangeFactor:4/3,tempoEasingMethod:0,play:true,...extra}; }
function regions() { return [{startMeasure:1,endMeasure:4,barCount:4,numerator:4,denominator:4,
    tempo:120,presetName:'Top',sectionStart:true},{startMeasure:5,endMeasure:6,barCount:2,
    numerator:3,denominator:4,tempo:160,presetName:'B',sectionStart:true},
    {startMeasure:7,endMeasure:8,barCount:2,numerator:3,denominator:4,tempo:144,presetName:'',sectionStart:false}]; }

test('selection honors an exclusive end segment and expands partial bars',()=>{
    const m=measures();
    const s={selection:{isRange:true,startSegment:{tick:1920},endSegment:{tick:5760}}};
    assert.deepEqual(JSON.parse(JSON.stringify(reader.selectionRange(s,m))),{first:2,last:3,expanded:false});
    s.selection.startSegment.tick=2160; s.selection.endSegment.tick=6000;
    assert.deepEqual(JSON.parse(JSON.stringify(reader.selectionRange(s,m))),{first:2,last:4,expanded:true});
    s.selection.endSegment=null;
    assert.equal(reader.selectionRange(s,m).last,8);
    assert.equal(reader.selectionRange({selection:{isRange:false}},m),null);
});
test('ranges validate bounds, preserve written labels and freeze at the chosen beginning',()=>{
    const m=measures(); m[1].doubleBarlineAfter=true; m[2].tempo=144; m[2].numerator=3;
    const before=JSON.stringify(m);
    const b=range.bounds(m,'range',3,5);
    const selected=range.selectWritten(m,b,{readTempo:false,readMeter:false});
    assert.deepEqual(Array.from(selected,x=>[x.index,x.number,x.tempo,x.numerator]),[[3,3,144,3],[4,4,144,3],[5,5,144,3]]);
    assert.equal(selected[0].doubleBarlineBefore,true);
    assert.equal(JSON.stringify(m),before);
    for(const [first,last] of [[0,2],[3,2],[1,9],[1.5,3]]) assert.throws(()=>range.bounds(m,'range',first,last));
    assert.throws(()=>range.bounds(m,'selection',1,8,null),/continuous/);
});
test('range filtering retains repeat visits and original Top semantics',()=>{
    const m=measures(); m[2].repeatStart=true; m[4].repeatEnd=true; m[4].repeatCount=2;
    const b={first:3,last:4};
    const visits=range.selectVisits(playback.expand(m,{repeatMode:'follow'}).measures,b,range.selectWritten(m,b,{}));
    assert.deepEqual(Array.from(visits,x=>x.number),[3,4,3,4]);
    const parts=model.regions(visits,{});
    assert.deepEqual(Array.from(parts,x=>x.presetName),['','(repeat)']);
    assert.equal(parts.reduce((n,r)=>n+r.barCount,0),4);
});
test('preview edits are validated, rounded and isolated from generated regions',()=>{
    const original=regions()[0], before=JSON.stringify(original), edit=preview.edit(original);
    Object.assign(edit,{name:'New & name',bars:'6',meterTop:'6',meterBase:'8',startTempo:'120.25001'});
    const changed=preview.apply(original,edit);
    assert.equal(changed.presetName,'New & name'); assert.equal(changed.tempo,120.25);
    assert.equal(changed.barCount,6); assert.equal(changed.denominator,8);
    assert.equal(JSON.stringify(original),before);
    assert.match(te.serialize('Edited',[changed],{},defaults).text,/name="New &amp; name"/);
    for(const patch of [{bars:''},{bars:'1.5'},{startTempo:'NaN'},{meterTop:'0'},{meterBase:'3'},{startTempo:'1001'}])
        assert.throws(()=>preview.apply(original,{...edit,...patch}));
});
test('editable ramp endpoints and placement survive serialization; invalid spans block export',()=>{
    const original=regions()[0], edit=preview.edit(original);
    Object.assign(edit,{rampEnabled:true,endTempo:'160.00002',rampStart:'10',rampLength:'6'});
    const changed=preview.apply(original,edit);
    assert.equal(changed.ramp.endTempo,160);
    assert.match(te.serialize('Ramp',[changed],{},defaults).text,/transition_anchor="1"/);
    for(const patch of [{rampLength:'7'},{rampStart:'0.5'},{rampLength:'0'},{endTempo:''},{endTempo:'1001'}])
        assert.throws(()=>preview.apply(original,{...edit,...patch}));
    assert.equal(preview.apply(changed,{...edit,rampEnabled:false}).ramp,undefined);
});
test('duration includes fixed sections and uses a continuous linear ramp estimate',()=>{
    const r=regions()[0];
    assert.equal(preview.duration(r),8);
    const up={...r,ramp:{startTempo:120,endTempo:160,startBeat:0,lengthBeats:16}};
    assert.ok(Math.abs(preview.duration(up)-24*Math.log(4/3))<1e-10);
    const down={...r,ramp:{startTempo:160,endTempo:120,startBeat:0,lengthBeats:16}};
    assert.ok(Math.abs(preview.duration(up)-preview.duration(down))<1e-10);
    assert.equal(preview.duration({...r,ramp:{startTempo:120,endTempo:120,startBeat:2,lengthBeats:6}}),8);
});
test('native Range Start count-in changes group settings without adding or changing presets',()=>{
    const parts=regions(), before=JSON.stringify(parts);
    const enabled=te.serialize('Native',parts,{countInEnabled:true},defaults).text;
    const disabled=te.serialize('Native',parts,{countInEnabled:false},defaults).text;
    const presets=text=>Array.from(text.matchAll(/<MetroPreset\b[\s\S]*?<\/MetroPreset>/g),m=>m[0]);
    assert.equal(presets(enabled).length,3);
    assert.deepEqual(presets(enabled),presets(disabled));
    assert.match(enabled,/do_countin="1" countin_type="4"/);
    assert.match(disabled,/do_countin="0" countin_type="4"/);
    assert.equal((enabled.match(/<MetroCountIn\b/g)||[]).length,1);
    const native=enabled.match(/<MetroCountIn ([^>]*)>/)[1];
    assert.match(native,/\bunit="2"/); assert.match(native,/\beighthcount="16"/);
    const clicks=Number(native.match(/\bbeatmask64="([^"]*)"/)[1]);
    assert.deepEqual(Array.from({length:16},(_,i)=>i).filter(i=>clicks&(1<<i)),[0,2,4,6,8,10,12,14]);
    const accents=Number(native.match(/\baccentmask="([^"]*)"/)[1]);
    assert.deepEqual(Array.from({length:16},(_,i)=>i+1).filter(i=>accents&(1<<(i-1))),[1,5,9,11,13]);
    assert.equal(accents&~clicks,0);
    const reference=fs.readFileSync('tests/references/count-in.tetmetgroup','utf8')
        .match(/<MetroCountIn ([^>]*)>/)[1];
    for (const key of ['beatmask','beatmask64','accentmask'])
        assert.equal(native.match(new RegExp('\\b'+key+'="([^"]*)"'))[1],
            reference.match(new RegExp('\\b'+key+'="([^"]*)"'))[1]);
    assert.match(native,/voicemask64="0"/); assert.match(native,/voicemask="0"/);
    assert.match(native,/use_subdiv="0"/); assert.match(native,/allow_accent="1"/);
    assert.equal(JSON.stringify(parts),before);
});
test('native group count-in retains repeat order and section names without inserted bars',()=>{
    const m=measures().slice(0,3);
    m[0].repeatStart=true; m[0].hasRehearsalMark=true; m[0].rehearsalName='A';
    m[1].tempo=144; m[1].repeatEnd=true; m[1].repeatCount=2;
    m[2].hasRehearsalMark=true; m[2].rehearsalName='B';
    const parts=model.regions(playback.expand(m,{repeatMode:'follow'}).measures,{splitBy:'rehearsal'});
    assert.equal(parts.length,5);
    const xml=te.serialize('Repeats',parts,{countInEnabled:true},defaults).text;
    assert.equal((xml.match(/<MetroPreset\b/g)||[]).length,5);
    assert.deepEqual(Array.from(parts,r=>r.presetName),
        ['A','','A (repeat)','(repeat)','B']);
    assert.equal(parts.reduce((sum,r)=>sum+r.barCount,0),5);
    assert.match(xml,/name="A \(repeat\)"/);
    assert.match(xml,/do_countin="1" countin_type="4"/);
});
test('saved options round-trip false values and reject malformed preferences',()=>{
    const o={splitBy:'double',repeatMode:'ignore',combine:false,readTempo:false,readMeter:false,
        readRamps:false,accentMode:'straight',debug:true,countInEnabled:false,first:99};
    const result=options.decode(options.encode(o));
    assert.equal(result.combine,false); assert.equal(result.readRamps,false); assert.equal(result.countInEnabled,false);
    assert.equal(result.first,undefined);
    assert.equal(options.decode('not JSON').splitBy,'settings');
    assert.equal(options.decode('{"splitBy":"bad","countInBars":99,"readTempo":"false"}').readTempo,true);
    assert.equal(options.decode('null').countInEnabled,true);
    const legacy=options.decode('{"countInBars":0,"countInMode":"preset"}');
    assert.equal(legacy.countInEnabled,true);
    assert.equal(legacy.countInBars,undefined); assert.equal(legacy.countInMode,undefined);
});
test('reader extracts playback-enabled gradual events and merging creates a full ramp',()=>{
    const data=reader.read(score([ramp()]),E,{All:65535,TimeSig:2},480,{readRamps:true});
    const parts=model.regions(data.measures,{});
    assert.equal(parts[0].barCount,4); assert.equal(parts[0].ramp.lengthBeats,16);
    assert.equal(parts[0].ramp.startTempo,120); assert.equal(parts[0].ramp.endTempo,160);
    assert.equal(data.events.filter(e=>e.kind==='ramp').length,1);
    const disabled=reader.read(score([ramp({play:false})]),E,{All:65535},480,{readRamps:true});
    assert.ok(disabled.measures.every(m=>!m.ramp));
    const sampled=reader.read(score([ramp()]),E,{All:65535},480,{readRamps:false});
    assert.ok(sampled.warnings.some(w=>w.includes('sampled')));
});
test('range and section clipping retain the correct ramp endpoints',()=>{
    const data=reader.read(score([ramp()]),E,{All:65535},480,{readRamps:true});
    const b={first:2,last:3}, selected=range.selectWritten(data.measures,b,{readRamps:true});
    const visits=range.selectVisits(playback.expand(data.measures,{}).measures,b,selected);
    let parts=model.regions(visits,{});
    assert.equal(parts[0].ramp.startTempo,130); assert.equal(parts[0].ramp.endTempo,150);
    assert.equal(parts[0].ramp.lengthBeats,8);
    visits[1].hasRehearsalMark=true; visits[1].rehearsalName='B';
    parts=model.regions(visits,{splitBy:'rehearsal'});
    assert.equal(parts.length,2); assert.equal(parts[1].presetName,'B');
    assert.equal(parts[1].ramp.startTempo,140);
});
test('unsupported ramp overlap, fractional placement and inner tempo changes block chosen bars',()=>{
    const half=ramp({spannerTick:{numerator:1,denominator:8}});
    const fractional=reader.read(score([half]),E,{All:65535},480,{readRamps:true});
    assert.throws(()=>range.selectWritten(fractional.measures,{first:1,last:2},{readRamps:true}),/quarter beats/);
    assert.doesNotThrow(()=>range.selectWritten(fractional.measures,{first:6,last:8},{readRamps:true}));
    const overlap=reader.read(score([ramp(),ramp()]),E,{All:65535},480,{readRamps:true});
    assert.throws(()=>range.selectWritten(overlap.measures,{first:1,last:4},{readRamps:true}),/Overlapping/);
    const s=score([ramp()]);
    s.firstMeasure.firstSegment.nextInMeasure={tick:480,segmentType:1,annotations:[{type:1,tempo:3,text:'180'}],elementAt:()=>null};
    const inner=reader.read(s,E,{All:65535},480,{readRamps:true});
    assert.throws(()=>range.selectWritten(inner.measures,{first:1,last:4},{readRamps:true}),/Tempo marking inside/);
    const boundaryScore=score([ramp()]);
    const bar2=boundaryScore.firstMeasure.nextMeasure;
    bar2.firstSegment.annotations=[{type:1,tempo:3,text:'180'}];
    const atBoundary=reader.read(boundaryScore,E,{All:65535},480,{readRamps:true});
    assert.throws(()=>range.selectWritten(atBoundary.measures,{first:2,last:2},{readRamps:true}),/Tempo marking inside/);
});
test('nonlinear score ramps disclose the linear approximation and retain endpoints',()=>{
    const data=reader.read(score([ramp({tempoEasingMethod:2,tempoChangeFactor:0.75})]),E,{All:65535},480,{readRamps:true});
    assert.ok(data.warnings.some(w=>w.includes('linear TE')));
    assert.equal(data.measures[3].ramp.endTempo,90);
});
test('serialized native ramps reproduce the three fixture transition shapes',()=>{
    const source=fs.readFileSync('tests/references/tempo-ramps.tetmetgroup','utf8');
    const reference=Array.from(source.matchAll(/<MetroTempoMapInfo ([^>]*)\/>/g),m=>m[1])
        .filter(attrs=>/\btransition="1"/.test(attrs));
    const parts=regions().slice(0,1);
    for(const [i,values] of [[0,[120,160,0,16]],[1,[160,120,0,6]],[2,[120,160,10,6]]]) {
        const [startTempo,endTempo,startBeat,lengthBeats]=values;
        const text=te.serialize('Ramp',[{...parts[0],ramp:{startTempo,endTempo,startBeat,lengthBeats}}],{},defaults).text;
        const map=text.match(/<MetroTempoMapInfo ([^>]*)\/>/)[1];
        for(const key of ['tempo','starting_tempo','transition','transition_anchor','transition_len','transition_start','transition_end_bar','transition_end_beat']) {
            assert.equal(map.match(new RegExp('\\b'+key+'="([^"]*)"'))[1],
                reference[i].match(new RegExp('\\b'+key+'="([^"]*)"'))[1],key);
        }
    }
});
test('native ramp serialization validates bounds and clears inactive transition data',()=>{
    const r=regions()[0];
    for(const patch of [{startTempo:0},{endTempo:1001},{lengthBeats:0},{startBeat:1.5},{lengthBeats:17}])
        assert.throws(()=>te.serialize('Bad',[{...r,ramp:{startTempo:120,endTempo:160,startBeat:0,lengthBeats:16,...patch}}],{},defaults));
    const text=te.serialize('Fixed',[r],{},defaults).text;
    assert.equal((text.match(/\bstarting_tempo="0"/g)||[]).length,2);
    assert.equal((text.match(/\btransition="0"/g)||[]).length,2);
});
