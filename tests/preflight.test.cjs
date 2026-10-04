const {test}=require('node:test');
const assert=require('node:assert/strict');
const load=require('./load.cjs');

test('an edited non-eighth meter no longer needs source eighth-note grouping',()=>{
    const preflight=load('Preflight');
    const analysis={attention:[{kind:'grouping',measureIndex:2,message:'m.2: grouping unclear'}]};
    assert.equal(preflight.collect(analysis,{first:1,last:3},[{sourceIndices:[2],denominator:4}],[]).length,0);
    assert.equal(preflight.collect(analysis,{first:1,last:3},[{sourceIndices:[2],denominator:8}],[]).length,1);
});
const preflight=load('Preflight');
const plain=value=>JSON.parse(JSON.stringify(value));
function measure(index, extra={}) {
    return {index,number:index,numerator:4,denominator:4,durationQuarters:4,...extra};
}

test('only selected holds and free time require a decision; ordinary pickups do not',()=>{
    const bars=[measure(1,{durationQuarters:1}),measure(2,{holds:[{kind:'fermata',tick:1440}]}),
        measure(3,{freeTime:true}),measure(4,{holds:[{kind:'breath',tick:5760}]})];
    const before=JSON.stringify(bars);
    const rows=plain(preflight.requirements(bars,{first:1,last:3}));
    assert.deepEqual(rows.map(r=>[r.measureIndex,r.description]),[[2,'Fermata'],[3,'Free-time passage']]);
    assert.equal(JSON.stringify(bars),before);
    assert.deepEqual(plain(preflight.requirements(bars,{first:1,last:1})),[]);
});

test('requirements deduplicate repeated visits and staff holds using written positions',()=>{
    const visits=[measure(1,{sourceIndex:5,number:0,holds:[{kind:'fermata'},{kind:'fermata'},{kind:'breath'}]}),
        measure(9,{sourceIndex:5,number:0,holds:[{kind:'caesura'}]}),
        measure(10,{sourceIndex:6,number:0,freeTime:true})];
    const rows=plain(preflight.requirements(visits,{first:5,last:6}));
    assert.equal(rows.length,2);
    assert.deepEqual(rows[0],{measureIndex:5,measureNumber:0,
        kinds:['fermata','breath','caesura'],description:'Fermata, Breath mark, Caesura'});
    assert.equal(rows[1].measureIndex,6);
});

test('section pauses require an explicit timing choice and isolate steady measures',()=>{
    const bars=[measure(2,{holds:[{kind:'sectionPause',tick:1920},{kind:'sectionPause',tick:1920}]})];
    const rows=plain(preflight.requirements(bars,{first:2,last:2}));
    assert.deepEqual(rows,[{measureIndex:2,measureNumber:2,kinds:['sectionPause'],description:'Section pause'}]);
    assert.throws(()=>preflight.applyDecisions(bars,{}),/bar 2.*before exporting/);
    const result=preflight.applyDecisions(bars,{'2':{mode:'steady'}});
    assert.equal(result[0].requiresTimingDecision,true);
    assert.equal(result[0].durationQuarters,4);
    assert.equal(result[0].durationOverrideQuarters,undefined);
});

test('steady explicitly retains written duration and clears any prior override',()=>{
    const bars=[measure(1,{durationQuarters:1}),measure(2,{durationQuarters:3,
        durationOverrideQuarters:6,holds:[{kind:'fermata',tick:0}]})];
    const before=JSON.stringify(bars);
    const applied=preflight.applyDecisions(bars,{'2':{mode:'steady'}});
    assert.equal(applied[0].durationQuarters,1);
    assert.equal(applied[0].requiresTimingDecision,undefined);
    assert.equal(applied[1].durationQuarters,3);
    assert.equal(applied[1].requiresTimingDecision,true);
    assert.equal(applied[1].durationOverrideQuarters,undefined);
    applied[1].holds[0].kind='caesura';
    assert.equal(JSON.stringify(bars),before);
});

test('count lengths are total measure lengths in the nominal denominator unit',()=>{
    const bars=[measure(2,{holds:[{kind:'fermata'}]}),
        measure(3,{numerator:7,denominator:8,durationQuarters:3.5,freeTime:true})];
    const before=JSON.stringify(bars);
    const applied=preflight.applyDecisions(bars,{'2':{mode:'counts',counts:'6'},'3':{mode:'counts',counts:'9'}});
    assert.deepEqual(Array.from(applied,m=>m.durationOverrideQuarters),[6,4.5]);
    assert.deepEqual(Array.from(applied,m=>m.requiresTimingDecision),[true,true]);
    assert.deepEqual(Array.from(applied,m=>m.durationQuarters),[4,3.5]);
    assert.equal(JSON.stringify(bars),before);
    assert.equal(preflight.applyDecisions([bars[0]],{'2':{mode:'counts',counts:'0.25'}})[0].durationOverrideQuarters,0.25);
    assert.equal(preflight.applyDecisions([bars[0]],{'2':{mode:'counts',counts:'64'}})[0].durationOverrideQuarters,64);
    assert.equal(preflight.applyDecisions([measure(1,{denominator:1,freeTime:true})],
        {'1':{mode:'counts',counts:'64'}})[0].durationOverrideQuarters,256);
});

test('every affected written bar must have its own decision despite repeated printed numbers',()=>{
    const bars=[measure(3,{number:1,holds:[{kind:'breath'}]}),measure(4,{number:1,freeTime:true})];
    assert.throws(()=>preflight.applyDecisions(bars,{'3':{mode:'steady'}}),/m\.1 \(bar 4\).*before exporting/);
    assert.throws(()=>preflight.applyDecisions(bars,{'3':{mode:'steady'},'4':{mode:'automatic'}}),/bar 4/);
    const result=preflight.applyDecisions(bars,{'3':{mode:'steady'},'4':{mode:'counts',counts:'8'}});
    assert.equal(result[0].durationOverrideQuarters,undefined);
    assert.equal(result[1].durationOverrideQuarters,8);
});

test('invalid count input, unrepresentable fractions and overlong presets block export',()=>{
    const bars=[measure(1,{freeTime:true})];
    for (const value of ['', ' ', '0', '-2', 'Infinity', 'NaN', '0x10', '1e3', '0.1', '0.03125', '32.25', '64.5', '65', '256', '257'])
        assert.throws(()=>preflight.applyDecisions(bars,{'1':{mode:'counts',counts:value}}),/m\.1 \(bar 1\)/);
    assert.throws(()=>preflight.applyDecisions([measure(1,{denominator:3,freeTime:true})],
        {'1':{mode:'counts',counts:'6'}}),/meter denominator/);
});

test('attention filters by written position, keeps global entries and deduplicates version warnings',()=>{
    const analysis={attention:[
        {kind:'tempo',measureIndex:1,measureNumber:9,message:'Outside selection'},
        {kind:'tempo',measureIndex:3,measureNumber:1,message:'Deferred tempo at m.1'},
        {kind:'tempo',measureIndex:4,measureNumber:1,message:'Deferred tempo at m.1'},
        {kind:'tempo',measureIndex:4,measureNumber:1,message:'Deferred tempo at m.1'},
        {kind:'navigation',message:'Written order is selected'}]};
    const before=JSON.stringify(analysis);
    const result=plain(preflight.collect(analysis,{first:3,last:4},[],
        ['Meter encoding requires verification','Meter encoding requires verification','Written order is selected']));
    assert.deepEqual(result.map(r=>r.message),['Deferred tempo at m.1','Deferred tempo at m.1',
        'Written order is selected','Meter encoding requires verification']);
    assert.deepEqual(result.slice(0,2).map(r=>r.measureIndex),[3,4]);
    assert.equal(JSON.stringify(analysis),before);
});

test('required timing rows replace hold attention without hiding other measure warnings',()=>{
    const analysis={attention:[{kind:'hold',measureIndex:2,message:'Choose before exporting'},
        {kind:'tempo',measureIndex:2,message:'Tempo moves to next bar'}]};
    assert.deepEqual(plain(preflight.collect(analysis,{first:2,last:2},[],[])),
        [{message:'Tempo moves to next bar',kind:'tempo',measureIndex:2}]);
});

test('grouping warnings disappear only after every repeated visit receives a grouping',()=>{
    const analysis={attention:[{kind:'grouping',measureIndex:5,measureNumber:1,message:'Grouping at bar 5 unclear'}]};
    const regions=[{startIndex:1,endIndex:1,sourceIndices:[5],grouping:[3,2,2]},
        {startIndex:9,endIndex:9,sourceIndices:[5],grouping:null}];
    assert.equal(preflight.collect(analysis,{first:5,last:5},regions,[]).length,1);
    regions[1].grouping=[2,2,3];
    assert.equal(preflight.collect(analysis,{first:5,last:5},regions,[]).length,0);
    assert.equal(preflight.collect(analysis,{first:5,last:5},[],[]).length,1);
    // A repeated printed number must never count as written coverage.
    assert.equal(preflight.collect(analysis,{first:5,last:5},
        [{startMeasure:1,endMeasure:1,startIndex:1,endIndex:1,grouping:[3,2,2]}],[]).length,1);
});

test('grouping checks support written intervals and preserve other warnings for that measure',()=>{
    const analysis={attention:[{kind:'grouping',measureIndex:3,message:'Missing grouping'},
        {kind:'tempo',measureIndex:3,message:'Tempo moves to next bar'}]};
    const regions=[{sourceStartIndex:2,sourceEndIndex:4,startIndex:20,endIndex:22,grouping:[3,2,2]}];
    assert.deepEqual(Array.from(preflight.collect(analysis,{first:3,last:3},regions,[]),r=>r.kind),['tempo']);
    assert.equal(preflight.collect({attention:[analysis.attention[0]]},{first:3,last:3},
        [{startIndex:2,endIndex:4,grouping:[3,2,2]}],[]).length,0);
});
