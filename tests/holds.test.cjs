const {test}=require('node:test');
const assert=require('node:assert/strict');
const load=require('./load.cjs');
const reader=load('ScoreReader');

// Model the public legacy API, including separate segment annotations and
// track elements. Sampled tempos deliberately include MuseScore's fermata
// slowdown; the exporter must produce the requested steady-click tempo.
const E={TEMPO_TEXT:1,TIMESIG:2,CHORD:3,REST:4,FERMATA:5,BREATH:6,
    LAYOUT_BREAK:7,STAFF_TEXT:8,SYSTEM_TEXT:9,EXPRESSION:10,GRADUAL_TEMPO_CHANGE:11};
const S={All:65535,TimeSig:2,ChordRest:1,Breath:4};
const L={SECTION:2,LINE:0,PAGE:1};
const Y={breathMarkComma:100,caesuraCurved:101,caesura:102,caesuraShort:103,
    caesuraThick:104,chantCaesura:105,caesuraSingleStroke:106};
const division=480;
const fraction=q=>({numerator:q,denominator:4});
const fermata=(stretch=2,play=true)=>({type:E.FERMATA,timeStretch:stretch,play});
const breath=(pause=0,symbol=Y.breathMarkComma)=>({type:E.BREATH,pause,symbol});

function score(bars,spanners=[]) {
    let position=0;
    const tempos=new Map(), measures=bars.map((bar,i)=>{
        const top=bar.top||4, base=bar.base||4;
        const q=bar.quarters===undefined?top*4/base:bar.quarters;
        const start=position; position+=q;
        tempos.set(start*division,bar.sampleBpm===undefined?120:bar.sampleBpm);
        const segmentSpecs=bar.segments||[{offset:0,annotations:bar.annotations||[]}];
        const segments=segmentSpecs.map(spec=>({tick:(start+(spec.offset||0))*division,
            segmentType:spec.segmentType||S.ChordRest,annotations:spec.annotations||[],
            elementAt:track=>(spec.tracks||{})[track]||null}));
        segments.forEach((segment,index)=>segment.nextInMeasure=segments[index+1]||null);
        return {no:bar.number===undefined?i:bar.number-1,tick:fraction(start),ticks:fraction(q),
            timesigNominal:{numerator:top,denominator:base},firstSegment:segments[0],
            elements:bar.elements||[],irregular:!!bar.irregular};
    });
    measures.forEach((measure,index)=>measure.nextMeasure=measures[index+1]||null);
    return {title:'Timing decisions',ntracks:8,firstMeasure:measures[0],spanners,metaTag:()=>'',
        newCursor:()=>({tempo:2,segment:{},rewindToFraction(f){
            const tick=f.numerator/f.denominator*division*4;
            this.tempo=(tempos.get(tick)===undefined?120:tempos.get(tick))/60;
            this.segment={tick};
        }})};
}
function read(bars,options={},spanners=[]) {
    return reader.read(score(bars,spanners),E,S,division,options,null,L,null,Y);
}
function plain(value) {return JSON.parse(JSON.stringify(value));}
function holds(data,index=0) {return plain(data.measures[index].holds);}
function attentionAt(data,index) {
    return data.attention.filter(item=>item.measureIndex===index);
}

test('first-beat staff fermatas require a decision and use the maximum played stretch',()=>{
    const data=read([{sampleBpm:40,annotations:[fermata(2),fermata(3),fermata(8,false)]},{}]);
    assert.equal(data.measures[0].tempo,120,'two staff stretches must not multiply together');
    assert.equal(data.measures[1].tempo,120);
    assert.equal(holds(data).length,1,'copies at the same musical position are one decision');
    assert.equal(holds(data)[0].kind,'fermata');
    assert.equal(holds(data)[0].tick,0);
    assert.ok(attentionAt(data,1).length>0);
    for(const item of attentionAt(data,1)) {
        assert.equal(typeof item.kind,'string');
        assert.equal(item.measureNumber,1);
        assert.equal(typeof item.message,'string');
        assert.ok(item.message.length>0);
    }
});

test('a playback-disabled fermata still requires a written-score decision without slowing clicks',()=>{
    const data=read([{annotations:[fermata(4,false)]}]);
    assert.equal(data.measures[0].tempo,120);
    assert.equal(holds(data).length,1);
    assert.equal(holds(data)[0].kind,'fermata');
    assert.ok(attentionAt(data,1).length>0);
});

test('a mid-bar fermata never changes the sampled bar-start tempo',()=>{
    const data=read([{segments:[{offset:0},{offset:2,annotations:[fermata(3)]}]},{}]);
    assert.equal(data.measures[0].tempo,120);
    assert.equal(data.measures[1].tempo,120);
    assert.equal(holds(data)[0].tick,960);
    assert.ok(attentionAt(data,1).length>0);
});

test('chord and rest attachment lists detect written fermatas on every voice',()=>{
    const data=read([{segments:[
        {offset:0,tracks:{0:{type:E.CHORD,elements:[fermata(1,false)]},
            4:{type:E.CHORD,elements:[fermata(1,false)]}}},
        {offset:2,tracks:{1:{type:E.REST,elements:[fermata(2,false)]}}}
    ]}]);
    assert.deepEqual(holds(data).map(item=>item.tick).sort((a,b)=>a-b),[0,960]);
    assert.ok(holds(data).every(item=>item.kind==='fermata'));
});

test('freezing tempo uses the normalized opening BPM instead of its fermata playback BPM',()=>{
    const data=read([{sampleBpm:60,annotations:[fermata(2)]},{sampleBpm:180}],{readTempo:false});
    assert.deepEqual(Array.from(data.measures,item=>item.tempo),[120,120]);
    assert.equal(holds(data).length,1,'tempo freezing must not suppress the required decision');
});

test('a pickup inheriting the next played tempo is not normalized twice after native anacrusis repair',()=>{
    // MuseScore fixAnacrusisTempo replaces this pickup's tempo-map entry after
    // building fermata events. The inherited sample is already musical BPM.
    const data=read([{quarters:1,sampleBpm:120,annotations:[fermata(2)]},
        {sampleBpm:120,annotations:[{type:E.TEMPO_TEXT,tempo:2,text:'120',play:true}]}]);
    assert.equal(data.measures[0].tempo,120);
    assert.equal(data.measures[1].tempo,120);
    assert.equal(data.measures[0].durationQuarters,1);
    assert.equal(holds(data).length,1);
});

test('caesura staff copies and positive breath pauses need decisions; ordinary breaths do not',()=>{
    const data=read([{segments:[
        {offset:0,segmentType:S.Breath,tracks:{0:breath(0),4:breath(0)}},
        {offset:1,segmentType:S.Breath,tracks:{0:breath(2,Y.caesura),4:breath(3,Y.caesura)}},
        {offset:2,segmentType:S.Breath,tracks:{1:breath(1)}},
        {offset:3,segmentType:S.Breath,tracks:{0:breath(0,Y.caesuraShort)}}
    ]}]);
    const found=holds(data);
    assert.equal(found.length,3);
    assert.deepEqual(found.map(item=>item.tick).sort((a,b)=>a-b),[480,960,1440]);
    assert.equal(found.find(item=>item.tick===480).pause,3,'simultaneous staff pauses use the longest value');
    assert.equal(found.find(item=>item.tick===960).pause,1);
    assert.ok(attentionAt(data,1).length>0);
    assert.equal(data.measures[0].tempo,120,'separate pause events do not divide quarter BPM');
});

test('every supported caesura symbol is recognized even with playback pause disabled',()=>{
    for(const name of ['caesuraCurved','caesura','caesuraShort','caesuraThick','chantCaesura','caesuraSingleStroke']) {
        const data=read([{segments:[{offset:1,segmentType:S.Breath,tracks:{4:breath(0,Y[name])}}]}]);
        assert.equal(holds(data).length,1,name);
        assert.equal(holds(data)[0].tick,480,name);
    }
});

test('positive section pauses belong to the end of their measure, excluding layout-only breaks',()=>{
    const data=read([{elements:[
        {type:E.LAYOUT_BREAK,layoutBreakType:L.SECTION,pause:2},
        {type:E.LAYOUT_BREAK,layoutBreakType:L.SECTION,pause:3},
        {type:E.LAYOUT_BREAK,layoutBreakType:L.LINE,pause:9}
    ]},{elements:[{type:E.LAYOUT_BREAK,layoutBreakType:L.SECTION,pause:0}]}]);
    assert.equal(holds(data).length,1);
    assert.equal(holds(data)[0].tick,1920);
    assert.equal(holds(data)[0].pause,3);
    assert.equal(holds(data,1).length,0);
    assert.ok(attentionAt(data,1).length>0);
});

test('explicit free-time text on supported annotation types requires a decision',()=>{
    for(const type of [E.TEMPO_TEXT,E.STAFF_TEXT,E.SYSTEM_TEXT,E.EXPRESSION]) {
        for(const text of ['senza misura','Free time','UNMETERED','Cadenza','ad lib.','ad libitum']) {
            const data=read([{annotations:[{type,text,tempo:2}]}]);
            assert.equal(data.measures[0].freeTime,true,`${type}: ${text}`);
            assert.ok(attentionAt(data,1).length>0,`${type}: ${text}`);
        }
    }
    const formatted=read([{annotations:[{type:E.SYSTEM_TEXT,text:'<b>senza</b> misura'}]}]);
    assert.equal(formatted.measures[0].freeTime,true);
});

test('pickups, hidden notation and ordinary expressive text do not imply free time',()=>{
    const data=read([
        {quarters:1,irregular:true,annotations:[{type:E.EXPRESSION,text:'molto espressivo'}]},
        {annotations:[{type:E.TEMPO_TEXT,text:'quarter = 120',tempo:2},
            {type:E.SYSTEM_TEXT,text:'Continue in tempo',visible:false}]}
    ]);
    assert.ok(data.measures.every(item=>!item.freeTime));
    assert.equal(data.measures[0].durationQuarters,1);
    assert.equal(data.measures[0].isPickup,true);
    assert.equal(data.measures[1].durationQuarters,4);
    assert.equal(data.measures[1].isPickup,false);
});

test('irregular final measures retain actual length and are not labeled opening pickups',()=>{
    const data=read([{quarters:1},{},{quarters:3,irregular:true}]);
    assert.deepEqual(Array.from(data.measures,item=>item.durationQuarters),[1,4,3]);
    assert.deepEqual(Array.from(data.measures,item=>!!item.isPickup),[true,false,false]);
});

test('a gradual change overlapping a fermata needs actionable correction only when ramps are enabled',()=>{
    const gradual={type:E.GRADUAL_TEMPO_CHANGE,spannerTick:fraction(0),spannerTicks:fraction(8),
        tempoChangeFactor:4/3,tempoEasingMethod:0,play:true};
    const bars=[{annotations:[fermata(2)]},{},{}];
    const data=read(bars,{readRamps:true},[gradual]);
    assert.ok(data.measures.some(item=>item.rampError),'a guessed hold curve cannot export silently');
    const error=data.measures.find(item=>item.rampError).rampError;
    assert.match(error,/fermata|hold|pause/i);
    assert.match(error,/disable|manual|preview|edit/i);
    const sampled=read(bars,{readRamps:false},[gradual]);
    assert.ok(sampled.measures.every(item=>!item.rampError));
    assert.equal(holds(sampled).length,1);
    const after=read([{}, {}, {annotations:[fermata(2)]}],{readRamps:true},[gradual]);
    assert.ok(after.measures.every(item=>!item.rampError),'a hold at the exclusive ramp end is not an overlap');
});

test('mid-bar tempo changes remain deferred to the following measure',()=>{
    const data=read([{segments:[{offset:0},{offset:2,annotations:[{type:E.TEMPO_TEXT,tempo:3,text:'180'}]}]},
        {sampleBpm:180}]);
    assert.deepEqual(Array.from(data.measures,item=>item.tempo),[120,180]);
    assert.ok(data.warnings.some(item=>/tempo.*next.*(?:measure|bar)/i.test(item)));
    assert.equal(data.events.find(item=>item.kind==='tempo').offsetTicks,960);
});

test('reading attention markers leaves the source score unchanged',()=>{
    const source=score([{sampleBpm:60,annotations:[fermata(2),{type:E.SYSTEM_TEXT,text:'Free time'}],
        elements:[{type:E.LAYOUT_BREAK,layoutBreakType:L.SECTION,pause:2}]}]);
    const before=JSON.stringify(source);
    reader.read(source,E,S,division,{},null,L,null,Y);
    assert.equal(JSON.stringify(source),before);
});
