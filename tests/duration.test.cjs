const {test} = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load.cjs');
const model = load('Model'), range = load('Range'), preview = load('Preview');
const te = load('TonalEnergy'), repeat = load('RepeatOrder'), defaults = load('Template').defaults;
const measure = (index, extra={}) => ({index,number:index,numerator:4,denominator:4,tempo:120,durationQuarters:4,...extra});
const attr = (text,key) => text.match(new RegExp('\\b'+key+'="([^"]*)"'))[1];
const maps = xml => Array.from(xml.matchAll(/<MetroMeterMapInfo\b[^>]*>/g),m=>m[0]);
const audible = (mask,top) => Array.from({length:top},(_,i)=>i+1).filter(n=>(BigInt(mask)>>BigInt(n-1))&1n);
const render = (region,pattern='full') => te.serialize('Exact duration',[region],{clickPattern:pattern,countInEnabled:true},defaults).text;

test('a one-quarter pickup and three-quarter closing bar retain exact total duration',()=>{
    const source=[measure(1,{durationQuarters:1,isPickup:true}),measure(2),measure(3),measure(4,{durationQuarters:3})];
    const before=JSON.stringify(source), regions=model.regions(source,{});
    assert.deepEqual(Array.from(regions,r=>[r.barCount,r.durationQuarters||null]),[[1,1],[2,null],[1,3]]);
    assert.deepEqual(Array.from(regions,r=>Array.from(r.sourceIndices)),[[1],[2,3],[4]]);
    assert.equal(regions.reduce((sum,r)=>sum+preview.duration(r),0),6);
    const xml=te.serialize('Pickup',regions,{},defaults).text;
    assert.deepEqual(maps(xml).map(m=>[attr(m,'topcount'),attr(m,'notebase'),attr(m,'barcount')]),[['1','4','1'],['4','4','2'],['3','4','1']]);
    assert.equal(JSON.stringify(source),before);
});

test('pickup click positions preserve the final nominal counts rather than inventing a downbeat',()=>{
    for(const [durationQuarters,expected] of [[1,{full:[1],half:[],downbeat:[]}],[2,{full:[1,2],half:[1],downbeat:[]}],[3,{full:[1,2,3],half:[2],downbeat:[]}]]) {
        const region=model.regions([measure(1,{durationQuarters,isPickup:true})],{})[0];
        for(const pattern of ['full','half','downbeat']) {
            const m=maps(render(region,pattern))[0];
            assert.deepEqual(audible(attr(m,'beatmask64'),durationQuarters),expected[pattern]);
            assert.deepEqual(audible(attr(m,'accentmask64'),durationQuarters),[]);
            assert.equal(attr(m,'beatmask'),String(BigInt.asIntN(32,BigInt(attr(m,'beatmask64')))));
        }
    }
});

test('short closing bars align at nominal count one in all met versions',()=>{
    const region=model.regions([measure(9,{durationQuarters:3})],{})[0];
    for(const [pattern,expected] of [['full',[1,2,3]],['half',[1,3]],['downbeat',[1]]]) {
        const m=maps(render(region,pattern))[0];
        assert.deepEqual(audible(attr(m,'beatmask64'),3),expected);
        assert.deepEqual(audible(attr(m,'accentmask64'),3),[1]);
    }
});

test('eighth-note grouping projects accents and clicks across a shortened pickup',()=>{
    const region=model.regions([measure(1,{numerator:7,denominator:8,grouping:[3,2,2],durationQuarters:1,isPickup:true})],{})[0];
    for(const [pattern,expected] of [['full',[1,2]],['half',[1]],['downbeat',[]]]) {
        const m=maps(render(region,pattern))[0];
        assert.equal(attr(m,'topcount'),'2');assert.equal(attr(m,'notebase'),'8');
        assert.deepEqual(audible(attr(m,'beatmask64'),2),expected);
        assert.deepEqual(audible(attr(m,'accentmask64'),2),pattern==='downbeat'?[]:[1]);
    }
    const straight=te.serialize('No accents',[region],{accentMode:'straight'},defaults).text;
    assert.equal(attr(maps(straight)[0],'accentmask64'),'0');
});

test('fractional nominal counts refine the encoded meter while keeping original audible grid',()=>{
    const region=model.regions([measure(3,{durationQuarters:1.5})],{})[0];
    const m=maps(render(region))[0];
    assert.equal(attr(m,'topcount'),'3');assert.equal(attr(m,'notebase'),'8');
    assert.deepEqual(audible(attr(m,'beatmask64'),3),[1,3]);
    assert.deepEqual(audible(attr(m,'accentmask64'),3),[1]);
    assert.equal(preview.duration(region),0.75);
    const pickup=model.regions([measure(1,{durationQuarters:0.5,isPickup:true})],{})[0];
    assert.deepEqual(audible(attr(maps(render(pickup))[0],'beatmask64'),1),[]);
});

test('actual durations including sixty-fourth fractions are exact; impossible durations block',()=>{
    for(const durationQuarters of [0.0625,0.125,0.25,0.5,1,1.5,3,5,16]) {
        const region=model.regions([measure(1,{durationQuarters})],{})[0], meter=te.playbackMeter(region);
        assert.equal(meter.numerator*4/meter.denominator*meter.barCount,durationQuarters);
    }
    for(const durationQuarters of [0,-1,Infinity,NaN])
        assert.throws(()=>model.regions([measure(1,{durationQuarters})],{}),/actual duration/);
    for(const durationQuarters of [1/3,0.03125,65]) {
        const region=model.regions([measure(6,{durationQuarters})],{})[0];
        assert.throws(()=>render(region),/m\.6: actual duration cannot be represented exactly/);
    }
});

test('preview keeps actual duration on name, tempo, grouping edits and fixes bars/meter',()=>{
    const original=model.regions([measure(1,{durationQuarters:1,isPickup:true})],{})[0], before=JSON.stringify(original), edit=preview.edit(original);
    assert.equal(edit.isDurationSpecific,true);assert.equal(edit.actualCounts,'1');assert.equal(edit.rampLength,'1');
    const changed=preview.apply(original,{...edit,name:'Pickup',startTempo:'144'});
    assert.equal(changed.durationQuarters,1);assert.equal(changed.isPickup,true);assert.equal(preview.duration(changed),60/144);
    for(const change of [{bars:'2'},{meterTop:'1'},{meterBase:'8'}])
        assert.throws(()=>preview.apply(original,{...edit,...change}),/Bars and meter are fixed/);
    assert.throws(()=>preview.apply(original,{...edit,rampEnabled:true,rampLength:'2',endTempo:'160'}),/within this preset/);
    assert.equal(JSON.stringify(original),before);
    const eighth=model.regions([measure(1,{numerator:7,denominator:8,durationQuarters:1,grouping:[3,2,2]})],{})[0];
    assert.deepEqual(Array.from(preview.apply(eighth,{...preview.edit(eighth),grouping:'2+2+3'}).grouping),[2,2,3]);
});

test('repeat visits and selected ranges retain exact durations and user overrides',()=>{
    const source=[measure(1,{durationQuarters:1,isPickup:true,repeatStart:true}),measure(2,{durationOverrideQuarters:6,repeatEnd:true,repeatCount:2}),measure(3)];
    const before=JSON.stringify(source), bounds={first:1,last:2};
    const selected=range.selectWritten(source,bounds,{});
    const visits=range.selectVisits(repeat.expand(source,{repeatMode:'follow'}).measures,bounds,selected);
    assert.deepEqual(Array.from(visits,m=>[m.durationQuarters,m.durationOverrideQuarters||null,m.isPickup]),[[1,null,true],[4,6,false],[1,null,true],[4,6,false]]);
    const regions=model.regions(visits,{});
    assert.equal(regions.length,4);assert.equal(regions.reduce((s,r)=>s+te.durationQuarters(r),0),14);
    assert.deepEqual(Array.from(regions,r=>Array.from(r.sourceIndices)),[[1],[2],[1],[2]]);
    assert.deepEqual(Array.from(regions,r=>r.presetName),['Top','','Top (repeat)','(repeat)']);
    assert.equal(JSON.stringify(source),before);
});

test('a selected hold duration is isolated even if it equals the nominal bar length',()=>{
    const regions=model.regions([measure(1),measure(2,{durationOverrideQuarters:4}),measure(3)],{});
    assert.equal(regions.length,3);assert.equal(regions[1].isDurationSpecific,true);
    const edit=preview.edit(regions[1]);assert.equal(edit.actualCounts,'4');assert.equal(edit.isDurationSpecific,true);
    assert.throws(()=>preview.apply(regions[1],{...edit,bars:'2'}),/fixed/);
    const xml=render(regions[1]);assert.equal(attr(maps(xml)[0],'topcount'),'4');
});

test('native count-in is unchanged when pickups and closing bars use separate actual meters',()=>{
    const partial=render(model.regions([measure(1,{durationQuarters:1,isPickup:true})],{})[0]);
    const normal=render(model.regions([measure(1)],{})[0]);
    const countIn=xml=>xml.match(/<MetroCountIn\b[\s\S]*?<\/MetroCountIn>/)[0];
    assert.equal(countIn(partial),countIn(normal));
    assert.equal((partial.match(/<MetroPreset\b/g)||[]).length,1);
});

test('2/4 is observed in the click-pattern reference and needs no inferred-meter warning',()=>{
    const result=te.serialize('2/4',[{barCount:1,numerator:2,denominator:4,tempo:120}],{},defaults);
    assert.equal(attr(maps(result.text)[0],'meter'),'201');assert.equal(attr(maps(result.text)[0],'subdiv'),'104');
    assert.ok(!result.warnings.some(w=>w.includes('inferred')));
});

test('steady hold/free-time measures remain separate before and after timing decisions',()=>{
    for(const extra of [{holds:[{kind:'fermata'}]},{freeTime:true},{requiresTimingDecision:true}]) {
        const source=[measure(1),measure(2,extra),measure(3),measure(4)];
        const steady=model.regions(source,{});
        assert.deepEqual(Array.from(steady,r=>[r.startIndex,r.endIndex]),[[1,1],[2,2],[3,4]]);
        assert.equal(steady[1].requiresTimingDecision,true);
        const chosen=model.regions(source.map((m,i)=>i===1?{...m,durationOverrideQuarters:6}:m),{});
        assert.deepEqual(Array.from(chosen,r=>[Array.from(r.sourceIndices),r.visitNumber]),Array.from(steady,r=>[Array.from(r.sourceIndices),r.visitNumber]));
        const repeated=model.regions(repeat.expand(source.map((m,i)=>({...m,repeatStart:i===0,repeatEnd:i===3,repeatCount:2})),{repeatMode:'follow'}).measures,{});
        const holdRows=Array.from(repeated).filter(r=>r.requiresTimingDecision);
        assert.deepEqual(holdRows.map(r=>[Array.from(r.sourceIndices),r.visitNumber]),[[[2],1],[[2],2]]);
    }
});

test('meter freeze uses frozen full bars but preserves genuinely irregular source durations',()=>{
    const source=[measure(1),measure(2,{numerator:3,durationQuarters:3}),
        measure(3,{numerator:3,durationQuarters:2}),measure(4,{numerator:3,durationQuarters:3,durationOverrideQuarters:5})];
    const before=JSON.stringify(source), bounds={first:1,last:4}, selected=range.selectWritten(source,bounds,{readMeter:false});
    assert.deepEqual(Array.from(selected,m=>[m.numerator,m.durationQuarters,m.durationOverrideQuarters||null]),[[4,4,null],[4,4,null],[4,2,null],[4,3,5]]);
    const visits=range.selectVisits(repeat.expand(source,{}).measures,bounds,selected);
    const regions=model.regions(visits,{});
    assert.deepEqual(Array.from(regions,r=>[r.barCount,r.durationQuarters||null]),[[2,null],[1,2],[1,5]]);
    assert.equal(JSON.stringify(source),before);
    const pickup=[measure(1,{durationQuarters:1,isPickup:true}),measure(2,{numerator:3,durationQuarters:3})];
    const frozen=range.selectWritten(pickup,{first:1,last:2},{readMeter:false});
    assert.equal(frozen[0].durationQuarters,1);assert.equal(frozen[0].isPickup,true);assert.equal(frozen[1].durationQuarters,4);
});
