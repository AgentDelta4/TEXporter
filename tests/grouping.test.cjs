const {test} = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load.cjs');
const reader = load('ScoreReader'), model = load('Model'), te = load('TonalEnergy');
const preview = load('Preview'), range = load('Range'), repeat = load('RepeatOrder');
const defaults = load('Template').defaults;
const E={TIMESIG:2,CHORD:9,TEMPO_TEXT:1}, S={All:65535,TimeSig:2}, B={AUTO:0,NONE:1,BEGIN:2,MID:5,END:6,INVALID:-1};
function notes(groups) {
    const starts=[]; let offset=0;
    for(const group of groups) { starts.push(offset); offset+=group; }
    return Array.from({length:offset},(_,i)=>({type:E.CHORD,duration:{numerator:1,denominator:8},tuplet:null,
        actualBeamMode:()=>starts.includes(i)?B.BEGIN:B.AUTO}));
}
function score(bars) {
    let tick=0;
    const measures=bars.map((bar,index)=>{
        const top=bar.top||7, base=bar.base||8, start=tick; tick+=top*480*4/base;
        const items=[];
        if (index===0||bar.signature) {
            const signature={type:E.TIMESIG,timesig:{numerator:top,denominator:base},numeratorString:bar.additive||''};
            items.push({tick:start,segmentType:S.TimeSig,annotations:[],elementAt:t=>t%4===0?signature:null});
        }
        const tracks=bar.tracks||[bar.notes||[]];
        const max=Math.max(0,...tracks.map(t=>t.length));
        for(let i=0;i<max;i++) items.push({tick:start+i*240,segmentType:1,annotations:[],elementAt:t=>(tracks[t]||[])[i]||null});
        if (!items.length) items.push({tick:start,segmentType:1,annotations:[],elementAt:()=>null});
        for(let i=0;i<items.length;i++)items[i].nextInMeasure=items[i+1]||null;
        return {no:index,tick:{numerator:start,denominator:1920},ticks:{numerator:top,denominator:base},
            timesigNominal:{numerator:top,denominator:base},firstSegment:items[0],elements:[],repeatStart:!!bar.repeatStart,
            repeatEnd:!!bar.repeatEnd,repeatCount:2};
    });
    for(let i=0;i<measures.length;i++)measures[i].nextMeasure=measures[i+1]||null;
    return {title:'Grouping',ntracks:8,firstMeasure:measures[0],spanners:[],
        newCursor:()=>({segment:{},tempo:2,rewindToFraction:()=>{}}),metaTag:()=>''};
}
function read(bars) {return reader.read(score(bars),E,S,480,{},null,null,B);}
function attr(text,name) {return text.match(new RegExp('\\b'+name+'="([^"]*)"'))[1];}
function audible(mask,top) {
    return Array.from({length:top},(_,i)=>i+1).filter(n=>(BigInt(mask)>>BigInt(n-1))&1n);
}
function map(xml) {return xml.match(/<MetroMeterMapInfo\b[^>]*>/)[0];}

test('3+2+2 and 2+2+3 yield the requested full/half/downbeat clicks and accents',()=>{
    for(const [grouping,expected] of [[[3,2,2],[1,4,6]],[[2,2,3],[1,3,5]],[[2,3,2],[1,3,6]]]) {
        const region={barCount:2,numerator:7,denominator:8,tempo:120,grouping,presetName:'A'};
        const before=JSON.stringify(region);
        for(const pattern of ['full','half','downbeat']) {
            const xml=te.serialize('7/8',[region],{clickPattern:pattern,countInEnabled:true},defaults).text;
            const meter=map(xml);
            assert.deepEqual(audible(attr(meter,'beatmask64'),7),pattern==='full'?[1,2,3,4,5,6,7]:pattern==='half'?expected:[1]);
            assert.deepEqual(audible(attr(meter,'accentmask64'),7),pattern==='downbeat'?[1]:expected);
            assert.equal(attr(meter,'beatscale'),'0'); assert.equal(attr(xml,'tempo'),'120');
            assert.equal(attr(xml.match(/<MetroCountIn\b[^>]*>/)[0],'accentmask'),'5393');
        }
        assert.equal(JSON.stringify(region),before);
    }
});

test('unknown /8 grouping keeps full eighth clicks in Half Met and only 1 in Downbeat Met',()=>{
    for(const numerator of [3,5,6,7,9,12]) {
        const meter={numerator,denominator:8};
        assert.deepEqual(audible(te.getBeatMasks(meter,'half').beatmask64,numerator),Array.from({length:numerator},(_,i)=>i+1));
        assert.deepEqual(audible(te.getBeatMasks(meter,'downbeat').beatmask64,numerator),[1]);
    }
    assert.equal(te.getBeatMasks({numerator:7,denominator:4},'half').beatmask,'-43');
});

test('all /8 masks stay exact through 64 counts, including high-bit group accents',()=>{
    const grouping=Array.from({length:64},()=>1), meter={numerator:64,denominator:8,grouping};
    assert.equal(te.getAccentMasks(meter,'downbeat','half').accentmask,'-1');
    assert.equal(te.getAccentMasks(meter,'downbeat','half').accentmask64,'18446744073709551615');
    const high=te.getAccentMasks({numerator:64,denominator:8,grouping:[32,32]},'downbeat','full');
    assert.equal(high.accentmask,'1'); assert.equal(high.accentmask64,'4294967297');
    assert.deepEqual(audible(high.accentmask64,64),[1,33]);
    assert.throws(()=>te.getBeatMasks({numerator:7,denominator:8,grouping:[2,2,2]},'half'),/add up/);
});

test('additive signatures provide grouping on rest-only bars and persist without a new signature',()=>{
    const data=read([{additive:' 3 + 2 + 2 '},{},{signature:true,additive:'2+2+3'},{}]);
    assert.deepEqual(Array.from(data.measures,m=>Array.from(m.grouping)),[[3,2,2],[3,2,2],[2,2,3],[2,2,3]]);
    assert.ok(data.measures.every(m=>m.groupingSource==='signature'));
    assert.ok(!data.warnings.some(w=>w.includes('grouping is unclear')));
});

test('complete native beam modes detect groups and carry them across rest-only bars',()=>{
    const data=read([{notes:notes([3,2,2])},{},{notes:notes([2,2,3])},{}]);
    assert.deepEqual(Array.from(data.measures,m=>Array.from(m.grouping)),[[3,2,2],[3,2,2],[2,2,3],[2,2,3]]);
    assert.deepEqual(Array.from(data.measures,m=>m.groupingSource),['beams','inherited','beams','inherited']);
    const regions=model.regions(data.measures,{});
    assert.deepEqual(Array.from(regions,r=>[r.barCount,r.presetName,Array.from(r.grouping)]),[[2,'Top',[3,2,2]],[2,'',[2,2,3]]]);
});

test('actual beam membership recognizes a manual beam split even when mode returns AUTO',()=>{
    const items=notes([3,2,2]);
    let start=0;
    for(const length of [3,2,2]) {
        const beam={elements:[{parent:{tick:start*240}}]};
        for(let i=start;i<start+length;i++) { items[i].beam=beam; items[i].actualBeamMode=()=>B.AUTO; }
        start+=length;
    }
    assert.deepEqual(Array.from(read([{notes:items}]).measures[0].grouping),[3,2,2]);
});

test('sparse rhythms, tuplets, un-beamed notes and conflicting voices do not guess grouping',()=>{
    const tuplet=notes([3,2,2]); tuplet[2].tuplet={};
    const none=notes([3,2,2]); none[4].actualBeamMode=()=>B.NONE;
    const data=read([{notes:notes([3,2])},{notes:tuplet},{notes:none},{tracks:[notes([3,2,2]),notes([2,2,3])]}]);
    assert.ok(data.measures.every(m=>m.grouping===null));
    assert.equal(data.warnings.filter(w=>w.includes('grouping is unclear')).length,1);
    assert.ok(data.warnings.some(w=>w.includes('keeps all eighth clicks')));
});

test('a new plain signature clears inherited groups; explicit additive signature wins over beams',()=>{
    const data=read([{notes:notes([3,2,2])},{signature:true},{signature:true,additive:'2+2+3',notes:notes([3,2,2])}]);
    assert.equal(data.measures[1].grouping,null);
    assert.deepEqual(Array.from(data.measures[2].grouping),[2,2,3]);
    assert.equal(reader.signatureGrouping('3+2+3',7),null);
    assert.equal(reader.signatureGrouping('7',7),null);
});

test('range freezes grouping with the meter and repeat visits retain each grouping',()=>{
    const data=read([{additive:'3+2+2',repeatStart:true},{signature:true,additive:'2+2+3',repeatEnd:true}]);
    const before=JSON.stringify(data.measures), bounds={first:1,last:2};
    const written=range.selectWritten(data.measures,bounds,{readMeter:false});
    const visits=range.selectVisits(repeat.expand(data.measures,{repeatMode:'follow'}).measures,bounds,written);
    assert.ok(visits.every(m=>String(m.grouping)==='3,2,2'));
    assert.equal(JSON.stringify(data.measures),before);
    const parts=model.regions(repeat.expand(data.measures,{repeatMode:'follow'}).measures,{});
    assert.deepEqual(Array.from(parts,p=>Array.from(p.grouping)),[[3,2,2],[2,2,3],[3,2,2],[2,2,3]]);
});

test('grouping preview can correct or clear detected groups and validates meter edits',()=>{
    const region={startMeasure:1,endMeasure:2,barCount:2,numerator:7,denominator:8,tempo:120,grouping:[3,2,2]};
    const edit=preview.edit(region); assert.equal(edit.grouping,'3+2+2');
    assert.deepEqual(Array.from(preview.apply(region,{...edit,grouping:'2 - 2 - 3'}).grouping),[2,2,3]);
    assert.equal(preview.apply(region,{...edit,grouping:''}).grouping,undefined);
    assert.throws(()=>preview.apply(region,{...edit,grouping:'2+2+2'}),/add up to 7/);
    assert.throws(()=>preview.apply(region,{...edit,grouping:'3+0+4'}),/positive/);
    assert.throws(()=>preview.apply(region,{...edit,grouping:'3.5+3.5'}),/Enter grouping/);
    assert.equal(preview.apply(region,{...edit,meterBase:'4'}).grouping,undefined);
    assert.deepEqual(region.grouping,[3,2,2]);
});

test('Straight suppresses grouping accents without changing Half Met group clicks',()=>{
    const meter={numerator:7,denominator:8,grouping:[3,2,2]};
    assert.equal(te.getAccentMasks(meter,'straight','half').accentmask64,'0');
    assert.deepEqual(audible(te.getBeatMasks(meter,'half').beatmask64,7),[1,4,6]);
});

test('direct reader meter freeze retains the first grouping across later changes',()=>{
    const data=reader.read(score([{additive:'3+2+2'},{top:6,signature:true,additive:'3+3'}]),E,S,480,{readMeter:false},null,null,B);
    assert.ok(data.measures.every(m=>m.numerator===7&&String(m.grouping)==='3,2,2'));
});
