const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const load = require('./load.cjs');
const model = load('Model'), te = load('TonalEnergy'), reader = load('ScoreReader');
const defaults = load('Template').defaults;
const playback = load('RepeatOrder');
const exportPath = load('ExportPath');
const region = {startMeasure:1,endMeasure:8,barCount:8,numerator:4,denominator:4,tempo:120};
function output(r = region, mode = 'downbeat', title = 'Test') {
    return te.serialize(title, [r], {accentMode:mode}, defaults).text;
}
test('16 measures merge into the requested 8+4+4 regions', () => {
    const measures = Array.from({length:16}, (_, i) => ({index:i+1,number:i+1,
        numerator:i < 8 ? 4 : 3,denominator:4,tempo:i < 12 ? 120 : 160}));
    const regions = model.regions(measures, {});
    assert.deepEqual(Array.from(regions, r => [r.startMeasure,r.endMeasure,r.barCount,r.tempo]),
        [[1,8,8,120],[9,12,4,120],[13,16,4,160]]);
    assert.equal(model.regions(measures, {combine:false}).length, 16);
});
test('nonconsecutive indices and denominator changes break regions', () => {
    const m = {index:1,number:1,numerator:4,denominator:4,tempo:120};
    assert.equal(model.regions([m,{...m,index:3,number:3}],{}).length,2);
    assert.equal(model.regions([m,{...m,index:2,number:2,denominator:8}],{}).length,2);
});

test('tempo rounding removes score precision noise before grouping without mutating measures', () => {
    const measures=[172.00002,172,171.99999,120.25001,120.254,120.256].map((tempo,i)=>({
        index:i+1,number:i+1,numerator:4,denominator:4,tempo}));
    const before=JSON.stringify(measures);
    const parts=model.regions(measures,{});
    assert.deepEqual(Array.from(parts,r=>[r.barCount,r.tempo]),[[3,172],[2,120.25],[1,120.26]]);
    assert.equal(JSON.stringify(measures),before);
    const preview=model.describe('Rounded',measures,parts,[]);
    assert.match(preview,/quarter = 172/);
    assert.match(preview,/quarter = 120\.25/);
    assert.doesNotMatch(preview,/172\.00002|120\.25001/);
});

test('both exported tempo fields round to two decimals and omit trailing zeros', () => {
    for (const [tempo,expected] of [[172.00002,'172'],[120.00001,'120'],[120.25,'120.25'],
        [120.254,'120.25'],[120.256,'120.26'],[119.99999,'120']]) {
        const text=output({...region,tempo});
        assert.deepEqual(Array.from(text.matchAll(/\btempo="([^"]*)"/g),m=>m[1]),[expected,expected]);
    }
});
test('observed meter codes, subdivisions and accent masks', () => {
    for (const [top,base,code,sub] of [[1,4,200,104],[3,4,202,104],[4,4,203,104],
        [6,4,205,104],[8,4,207,104],[7,8,398,400]]) {
        assert.equal(te.getMeterCode({numerator:top,denominator:base}), code);
        assert.equal(te.getSubdivisionCode({denominator:base}), sub);
    }
    assert.equal(te.getAccentMask(region,'downbeat'),'1');
    assert.equal(te.getAccentMask(region,'straight'),'0');
    assert.match(output(region,'straight'), /accent_allowed="0"/);
    assert.match(output(region,'straight'), /accentmask64="0"/);
});
test('generic meters generate warnings rather than claiming fixture proof', () => {
    for (const [numerator,denominator] of [[5,4],[9,8],[3,2],[7,16],[12,8]]) {
        const result = te.serialize('Test',[{...region,numerator,denominator}],{},defaults);
        assert.match(result.text, new RegExp(`topcount="${numerator}" notebase="${denominator}"`));
        assert.ok(result.warnings.some(w => w.includes('inferred')));
    }
});
test('all duplicates are synchronized; durations and explicit tempos set', () => {
    const text = output({...region,tempo:144.25,barCount:7});
    assert.match(text,/usetempo="1"/);
    assert.equal((text.match(/tempo="144.25"/g)||[]).length,2);
    assert.equal((text.match(/barcount="7"/g)||[]).length,2);
    assert.match(text,/bardur="7"/);
    assert.match(text,/DroneSequencePreset name="countin"/);
    assert.match(text,/MetroPolyMeterMapInfo/);
    assert.match(text,/MetroCountIn/);
});
test('quarter BPM remains quarter BPM in eighth meters', () => {
    const text = output({...region,numerator:7,denominator:8});
    assert.match(text,/tempo="120"/);
    assert.match(text,/notebase="8" beatscale="0"/);
    assert.match(text,/eighth_equals_eighth="0"/);
});
test('serializer is deterministic and does not modify defaults', () => {
    const before=JSON.stringify(defaults);
    assert.equal(output(),output());
    assert.equal(JSON.stringify(defaults),before);
});
test('XML escaping, Unicode and illegal characters', () => {
    assert.match(output(region,'downbeat','A & B < "title" 🎵'),/A &amp; B &lt; &quot;title&quot; 🎵/);
    assert.throws(() => output(region,'downbeat','Bad\u0001'));
    assert.throws(() => output(region,'downbeat','Bad\uD800'));
});
test('numeric validation rejects invalid regions', () => {
    for (const patch of [{tempo:0},{tempo:Infinity},{tempo:1001},{barCount:0},{barCount:1.5},
        {numerator:0},{numerator:65},{numerator:3.5},{denominator:3}])
        assert.throws(() => output({...region,...patch}));
    assert.throws(() => te.serialize('Test',[],{},defaults));
    assert.throws(() => output(region,'wrong'));
    assert.throws(() => output(region,'straight','  '));
});
test('portable output filenames and strict extension validation', () => {
    assert.equal(te.filename('CON'),'_CON.tetmetgroup');
    assert.equal(te.filename('A/B: C?'),'A_B_ C_.tetmetgroup');
    assert.equal(te.filename(''),'Untitled score.tetmetgroup');
    assert.equal(te.validatePath('C:/Scores/Test.tetmetgroup'),'C:/Scores/Test.tetmetgroup');
    for (const name of ['Test.xml','CON.tetmetgroup','bad?.tetmetgroup','.tetmetgroup',''])
        assert.throws(() => te.validatePath(name));
});
test('FileIO readback accepts its source-confirmed extra newline only', () => {
    const text = output();
    assert.equal(te.matchesReadback(text,text),true);
    assert.equal(te.matchesReadback(text+'\n',text),true);
    assert.equal(te.matchesReadback(text+'\n\n',text),false);
    assert.equal(te.matchesReadback(text.slice(0,-5),text),false);
});

test('export picker starts in configured Scores folders including redirected and network locations', () => {
    const filename=te.filename('A/B: C?');
    for (const [folder,expected] of [
        ['C:\\Users\\Player\\OneDrive\\Music Scores\\','C:/Users/Player/OneDrive/Music Scores'],
        ['D:/Scores/','D:/Scores'],['/Users/player/Music/Scores','/Users/player/Music/Scores'],
        ['file:///C:/Users/Player/Music%20Scores','C:/Users/Player/Music Scores'],
        ['file://server/Shared%20Scores','//server/Shared Scores']]) {
        assert.equal(exportPath.scoresFilePath(folder,filename),expected+'/'+filename);
    }
});

test('Scores paths preserve escaped Unicode and literal percent characters', () => {
    assert.equal(exportPath.localPath('file:///C:/Scores/%E2%99%AB%20%23100%25'),'C:/Scores/♫ #100%');
    assert.equal(exportPath.localPath('C:/Scores/100%'),'C:/Scores/100%');
});

test('unavailable or relative Scores locations fail clearly instead of using an arbitrary folder', () => {
    assert.throws(()=>exportPath.scoresFilePath('','Test.tetmetgroup'),/Choose it in Edit/);
    assert.throws(()=>exportPath.scoresFilePath(null,'Test.tetmetgroup'),/Choose it in Edit/);
    assert.throws(()=>exportPath.scoresFilePath('Scores','Test.tetmetgroup'),/absolute path/);
    assert.throws(()=>exportPath.scoresFilePath('C:/Scores','../Test.tetmetgroup'),/filename/);
});
const E={TEMPO_TEXT:1,TIMESIG:2,GRADUAL_TEMPO_CHANGE:3,REHEARSAL_MARK:4,BAR_LINE:5,VOLTA:6,JUMP:7,LAYOUT_BREAK:8};
const S={All:65535,TimeSig:2};
const B={DOUBLE:2,END:32,END_REPEAT:8};
function mockScore() {
    const measures = []; let at = 0;
    for(let i=0;i<5;i++) {
        const top = i<2 ? 4 : 3;
        const segments = [{tick:at,segmentType:2,annotations:[],elementAt:() => null},
            {tick:at,segmentType:1,elementAt:() => null,annotations:i===0?[{type:1,tempo:2,text:'quarter = 120'}]:[]}];
        if(i===2) segments.push({tick:at+480,segmentType:1,elementAt:() => null,annotations:[{type:1,tempo:2.4,text:'144'}]});
        segments.forEach((s,j)=>s.nextInMeasure=segments[j+1]||null);
        measures.push({no:i,tick:{numerator:at,denominator:1920},ticks:{numerator:top,denominator:4},
            timesigNominal:{numerator:top,denominator:4},firstSegment:segments[0],start:at});
        at+=top*480;
    }
    measures.forEach((m,i)=>m.nextMeasure=measures[i+1]||null);
    return {title:'Adapter test',ntracks:8,firstMeasure:measures[0],spanners:[],metaTag:()=>'',
        newCursor:()=>({rewindToFraction(f){this.segment={};this.tempo=f.numerator>=5280?2.4:2;}})};
}
test('score API adapter counts written measures and retains intra-bar events', () => {
    const result=reader.read(mockScore(),E,S,480,{});
    assert.equal(result.measures.length,5);
    assert.deepEqual(Array.from(result.measures,m=>m.tempo),[120,120,120,144,144]);
    assert.equal(result.events.length,2);
    assert.equal(result.events[1].offsetTicks,480);
    assert.equal(result.measures[0].tempoChanged,true);
    assert.ok(result.warnings.some(w=>w.includes('inside the bar')));
    assert.deepEqual(Array.from(model.regions(result.measures,{}),r=>r.barCount),[2,1,2]);
});
function sameSettings() {
    return Array.from({length:8},(_,i)=>({index:i+1,number:i+1,numerator:4,denominator:4,tempo:120}));
}
function ranges(parts) { return Array.from(parts,r=>[r.startMeasure,r.endMeasure,r.barCount]); }
test('rehearsal names belong only to marked boundaries, including coincident changes', () => {
    const measures=sameSettings();
    measures[1].hasRehearsalMark=true; measures[1].rehearsalName='A';
    measures[2].tempo=144; measures[3].tempo=144;
    measures[4].hasRehearsalMark=true; measures[4].rehearsalName='B'; measures[4].tempo=160;
    measures[5].numerator=3;
    measures[6].hasRehearsalMark=true; measures[6].rehearsalName='C'; measures[6].numerator=3;
    const parts=model.regions(measures,{splitBy:'rehearsal'});
    assert.deepEqual(Array.from(parts,r=>r.presetName),['Top','A','','B','','C','']);
    assert.deepEqual(Array.from(parts,r=>r.boundaryKind),['','rehearsal','','rehearsal','','rehearsal','']);
});
test('double names use actual start measure numbers only at barline boundaries', () => {
    const measures=sameSettings();
    measures[1].doubleBarlineAfter=true;
    measures[2].number=20; measures[2].tempo=144; // barline and tempo change together
    measures[3].number=21; measures[3].tempo=160; // tempo only
    measures[3].doubleBarlineAfter=true;
    measures[4].number=22; measures[4].numerator=3; // barline and meter change together
    const parts=model.regions(measures,{splitBy:'double'});
    assert.deepEqual(Array.from(parts,r=>r.presetName),['Top','20','','22','']);
    measures[0].doubleBarlineBefore=true;
    assert.equal(model.regions(measures,{splitBy:'double'})[0].presetName,'1');
});
test('unmarked first preset is Top and later settings-only presets stay unnamed', () => {
    const measures=sameSettings();
    measures[2].hasRehearsalMark=true; measures[2].rehearsalName='B';
    assert.deepEqual(Array.from(model.regions(measures,{splitBy:'settings',combine:false}),r=>r.presetName),
        ['Top','','','','','','','']);
    assert.equal(model.regions(measures,{splitBy:'double'})[0].presetName,'Top');
    assert.equal(model.regions(measures,{splitBy:'rehearsal'})[0].presetName,'Top');
});

test('Top follows written position and preserves existing first-bar section names', () => {
    for (const number of [0,10,undefined]) {
        const measures=sameSettings().slice(0,2);
        measures[0].number=number;
        measures[1].number=1; measures[1].tempo=144;
        for (const splitBy of ['rehearsal','double']) {
            assert.deepEqual(Array.from(model.regions(measures,{splitBy}),r=>r.presetName),['Top','']);
        }
        measures[0].doubleBarlineBefore=true;
        assert.equal(model.regions(measures,{splitBy:'double'})[0].presetName,
            number===undefined ? 'Top' : String(number));
        measures[0].hasRehearsalMark=true; measures[0].rehearsalName='Opening';
        assert.equal(model.regions(measures,{splitBy:'rehearsal'})[0].presetName,'Opening');
        measures[0].rehearsalName='';
        assert.equal(model.regions(measures,{splitBy:'rehearsal'})[0].presetName,'Top');
    }
});

test('returning to the score beginning uses Top (repeat) in both section modes', () => {
    const measures=sameSettings().slice(0,3);
    measures[0].number=0;
    measures[0].repeatStart=true; measures[1].repeatEnd=true;
    for (const splitBy of ['rehearsal','double']) {
        const parts=model.regions(order(measures),{splitBy});
        assert.deepEqual(Array.from(parts,r=>r.presetName),['Top','Top (repeat)','']);
        assert.match(te.serialize('Test',parts,{},defaults).text,/name="Top \(repeat\)"/);
    }
});
test('TE writes exact section names, empty names and escaped rehearsal text', () => {
    const parts=[{...region,presetName:'A & "B"'},{...region,presetName:''},{...region,presetName:'42'}];
    const text=te.serialize('Test',parts,{},defaults).text;
    const names=Array.from(text.matchAll(/<MetroPreset [^>]* name="([^"]*)"/g),m=>m[1]);
    assert.deepEqual(names,['A &amp; &quot;B&quot;','','42']);
    assert.match(output(),/<MetroPreset [^>]* name=""/);
});
test('reader converts formatted rehearsal text into a plain preset label', () => {
    const score=mockScore();
    score.firstMeasure.firstSegment.annotations.push({type:E.REHEARSAL_MARK,text:'<b>A &amp; &#x1F3B5;</b>'});
    const result=reader.read(score,E,S,480,{splitBy:'rehearsal'},B);
    assert.equal(result.measures[0].rehearsalName,'A & 🎵');
    assert.equal(model.regions(result.measures,{splitBy:'rehearsal'})[0].presetName,'A & 🎵');
    assert.equal(reader.rehearsalLabel('&lt;A&gt; &quot;B&quot;'),' <A> "B"'.trim());
});
test('rehearsal marks force preset starts despite identical settings', () => {
    const measures=sameSettings();
    for(const i of [0,2,6]) measures[i].hasRehearsalMark=true;
    assert.deepEqual(ranges(model.regions(measures,{splitBy:'rehearsal'})),[[1,2,2],[3,6,4],[7,8,2]]);
    assert.deepEqual(ranges(model.regions(measures,{splitBy:'settings'})),[[1,8,8]]);
    assert.deepEqual(ranges(model.regions(measures,{splitBy:'double'})),[[1,8,8]]);
});
test('double barlines split after a bar; final double adds no empty preset', () => {
    const measures=sameSettings();
    measures[3].doubleBarlineAfter=true; measures[7].doubleBarlineAfter=true;
    assert.deepEqual(ranges(model.regions(measures,{splitBy:'double'})),[[1,4,4],[5,8,4]]);
    assert.deepEqual(ranges(model.regions(measures,{splitBy:'rehearsal'})),[[1,8,8]]);
    measures[5].doubleBarlineBefore=true;
    assert.deepEqual(ranges(model.regions(measures,{splitBy:'double'})),[[1,4,4],[5,5,1],[6,8,3]]);
});
test('section modes retain tempo/meter splits and preserve total bars', () => {
    for (const splitBy of ['rehearsal','double']) {
        const measures=sameSettings();
        measures[4].hasRehearsalMark=true; measures[3].doubleBarlineAfter=true;
        measures[2].tempo=144; measures[3].tempo=144;
        measures[6].numerator=3; measures[7].numerator=3;
        const parts=model.regions(measures,{splitBy});
        assert.deepEqual(ranges(parts),[[1,2,2],[3,4,2],[5,6,2],[7,8,2]]);
        assert.equal(parts.reduce((sum,r)=>sum+r.barCount,0),8);
        assert.equal(model.regions(measures,{splitBy,combine:false}).length,8);
    }
    assert.throws(()=>model.regions(sameSettings(),{splitBy:'unknown'}),/splitting/);
});
test('reader captures rehearsal marks, including duplicates and mid-bar positions', () => {
    const score=mockScore();
    const third=score.firstMeasure.nextMeasure.nextMeasure;
    const mid=third.firstSegment.nextInMeasure.nextInMeasure;
    mid.annotations.push({type:E.REHEARSAL_MARK,text:'B'},{type:E.REHEARSAL_MARK,text:'B'});
    const result=reader.read(score,E,S,480,{splitBy:'rehearsal',readTempo:false,readMeter:false},B);
    assert.equal(result.measures[2].hasRehearsalMark,true);
    assert.equal(result.events.filter(e=>e.kind==='rehearsal').length,2);
    assert.ok(result.warnings.some(w=>w.includes('rehearsal mark inside')));
    assert.deepEqual(ranges(model.regions(result.measures,{splitBy:'rehearsal'})),[[1,2,2],[3,5,3]]);
});
test('reader finds double barlines on other staves, ignoring finals and repeats', () => {
    const score=mockScore();
    let measure=score.firstMeasure;
    const types=[B.END,B.DOUBLE,B.END_REPEAT,B.END,B.DOUBLE];
    for(let i=0;measure;i++,measure=measure.nextMeasure) {
        let last=measure.firstSegment;
        while(last.nextInMeasure) last=last.nextInMeasure;
        const type=types[i];
        last.nextInMeasure={tick:measure.start+measure.ticks.numerator*480,segmentType:8,annotations:[],
            elementAt:track=>track===4?{type:E.BAR_LINE,barlineType:type}:null,nextInMeasure:null};
    }
    const result=reader.read(score,E,S,480,{splitBy:'double',readTempo:false,readMeter:false},B);
    assert.deepEqual(Array.from(result.measures,m=>m.doubleBarlineAfter),[false,true,false,false,true]);
    assert.equal(result.events.filter(e=>e.kind==='doubleBarline').length,2);
    assert.deepEqual(ranges(model.regions(result.measures,{splitBy:'double'})),[[1,2,2],[3,5,3]]);
});
test('missing section markers warn and double mode requires a supported enum', () => {
    for(const splitBy of ['double','rehearsal']) {
        const result=reader.read(mockScore(),E,S,480,{splitBy},B);
        assert.ok(result.warnings.some(w=>w.includes('No ') && w.includes('found')));
    }
    assert.throws(()=>reader.read(mockScore(),E,S,480,{splitBy:'double'}),/unavailable/);
});
test('disabled changes freeze first effective tempo and meter', () => {
    const result=reader.read(mockScore(),E,S,480,{readTempo:false,readMeter:false});
    assert.ok(result.measures.every(m=>m.tempo===120 && m.numerator===4));
    assert.equal(model.regions(result.measures,{}).length,1);
});
test('irregular bars, gradual tempo, local meter warnings', () => {
    const score=mockScore();
    score.firstMeasure.ticks={numerator:1,denominator:4};
    score.spanners=[{type:3}];
    score.firstMeasure.firstSegment.elementAt=()=>({type:2,timesig:{numerator:7,denominator:8}});
    const result=reader.read(score,E,S,480,{});
    assert.ok(result.warnings.some(w=>w.includes('irregular')));
    assert.ok(result.warnings.some(w=>w.includes('Gradual')));
    assert.ok(result.warnings.some(w=>w.includes('local')));
});
test('no score and empty score fail clearly', () => {
    assert.throws(()=>reader.read(null,E,S,480,{}),/Open a score/);
    assert.throws(()=>model.regions([],{}),/no measures/);
});
test('missing template fields fail rather than produce incomplete XML', () => {
    const bad=JSON.parse(JSON.stringify(defaults));
    bad.preset.children=bad.preset.children.filter(c=>c.tag!=='MetroTempoMapInfo');
    assert.throws(()=>te.serialize('Test',[region],{},bad),/MetroTempoMapInfo/);
});
test('fixture fields and tree topology match the preserved default', () => {
    const source=fs.readFileSync(path.join(__dirname,'references/defaults.tetmetgroup'),'utf8');
    const preset=source.match(/<MetroPreset .*?<\/MetroPreset>/s)[0];
    // .NET validation additionally compares every attribute and descendant across all fixtures.
    const tags=Array.from(preset.matchAll(/<([A-Za-z]+)(?:\s|\/|>)/g),m=>m[1]);
    const generated=output().match(/<MetroPreset .*?<\/MetroPreset>/s)[0];
    assert.deepEqual(Array.from(generated.matchAll(/<([A-Za-z]+)(?:\s|\/|>)/g),m=>m[1]),tags);
});
function order(measures, options={repeatMode:'follow'}, navigation=[]) {
    return playback.expand(measures,options,navigation).measures;
}
test('repeat play counts expand in order and leave the source unchanged', () => {
    const measures=sameSettings().slice(0,6);
    measures[2].repeatStart=true; measures[3].repeatEnd=true; measures[3].repeatCount=3;
    const before=JSON.stringify(measures);
    const visits=order(measures);
    assert.deepEqual(Array.from(visits,m=>m.number),[1,2,3,4,3,4,3,4,5,6]);
    assert.deepEqual(Array.from(visits,m=>m.index),[1,2,3,4,5,6,7,8,9,10]);
    assert.deepEqual(Array.from(visits,m=>m.visitNumber),[1,1,1,1,2,2,3,3,1,1]);
    assert.equal(JSON.stringify(measures),before);
});
test('ignore repeats exports written order and never adds a repeat label', () => {
    const measures=sameSettings().slice(0,3);
    measures[0].repeatStart=true; measures[1].repeatEnd=true; measures[1].repeatCount=4;
    const visits=order(measures,{repeatMode:'ignore'},[{kind:'ending'}]);
    assert.deepEqual(Array.from(visits,m=>m.number),[1,2,3]);
    assert.ok(visits.every(m=>!m.isRepeat && !m.playbackBoundary));
    assert.deepEqual(Array.from(model.regions(visits,{}),r=>r.presetName),['Top']);
});
test('end repeat without start returns to the start of the score or section', () => {
    const measures=sameSettings().slice(0,4);
    measures[1].repeatEnd=true;
    measures[1].sectionBreakAfter=true;
    measures[3].repeatEnd=true; measures[3].repeatCount=2;
    assert.deepEqual(Array.from(order(measures),m=>m.number),[1,2,1,2,3,4,3,4]);
});
test('one-bar and adjacent repeat blocks honor each block count', () => {
    const measures=sameSettings().slice(0,4);
    measures[0].repeatStart=true; measures[0].repeatEnd=true; measures[0].repeatCount=3;
    measures[1].repeatStart=true; measures[2].repeatEnd=true; measures[2].repeatCount=2;
    assert.deepEqual(Array.from(order(measures),m=>m.number),[1,1,1,2,3,2,3,4]);
    measures[0].repeatCount=1;
    assert.deepEqual(Array.from(order(measures),m=>m.number),[1,2,3,2,3,4]);
});
test('repeat names preserve section names and distinguish unnamed repeated regions', () => {
    const measures=sameSettings().slice(0,4);
    measures[0].repeatStart=true; measures[2].repeatEnd=true; measures[2].repeatCount=2;
    measures[0].hasRehearsalMark=true; measures[0].rehearsalName='A';
    measures[1].tempo=144; measures[2].tempo=144;
    const parts=model.regions(order(measures),{splitBy:'rehearsal'});
    assert.deepEqual(Array.from(parts,r=>r.presetName),['A','','A (repeat)','(repeat)','']);
    assert.equal(parts.reduce((n,r)=>n+r.barCount,0),7);
    assert.deepEqual(ranges(parts),[[1,1,1],[2,3,2],[1,1,1],[2,3,2],[4,4,1]]);
    const text=te.serialize('Repeats',parts,{},defaults).text;
    assert.match(text,/name="A \(repeat\)"/);
    assert.match(text,/name="\(repeat\)"/);
});
test('double-barline names survive a repeat jump into the marked source section', () => {
    const measures=sameSettings().slice(0,5);
    measures[0].doubleBarlineAfter=true;
    measures[1].repeatStart=true; measures[3].repeatEnd=true; measures[3].repeatCount=2;
    const parts=model.regions(order(measures),{splitBy:'double'});
    assert.deepEqual(Array.from(parts,r=>r.presetName),['Top','2','2 (repeat)','']);
    assert.deepEqual(ranges(parts),[[1,1,1],[2,4,3],[2,4,3],[5,5,1]]);
});
test('later passes and the following tail cannot merge into one preset', () => {
    const measures=sameSettings().slice(0,3);
    measures[0].repeatStart=true; measures[1].repeatEnd=true; measures[1].repeatCount=3;
    const parts=model.regions(order(measures),{});
    assert.deepEqual(Array.from(parts,r=>r.presetName),['Top','Top (repeat)','Top (repeat)','']);
    assert.deepEqual(Array.from(parts,r=>r.barCount),[2,2,2,1]);
    assert.match(model.describe('Test',order(measures),parts,[],3),/Written measures: 3\nMeasures played: 7/);
});
test('unsupported navigation and malformed repeat structures fail clearly', () => {
    assert.throws(()=>order(sameSettings(),{repeatMode:'follow'},[{kind:'ending'}]),/Numbered endings/);
    assert.throws(()=>order(sameSettings(),{repeatMode:'follow'},[{kind:'jump'}]),/playback jumps/);
    assert.throws(()=>order(sameSettings(),{repeatMode:'bad'}),/handling option/);
    const nested=sameSettings(); nested[0].repeatStart=true; nested[1].repeatStart=true;
    assert.throws(()=>order(nested),/Nested/);
    const unmatched=sameSettings(); unmatched[1].repeatStart=true;
    assert.throws(()=>order(unmatched),/matching end/);
    const multi=sameSettings(); multi[1].repeatEnd=true; multi[3].repeatEnd=true;
    assert.throws(()=>order(multi),/Multiple end/);
    unmatched[2].sectionBreakAfter=true;
    assert.throws(()=>order(unmatched),/section break/);
});
test('invalid play counts and excessive expansion are bounded', () => {
    for(const count of [0,-1,1.5,Infinity,1001,'2']) {
        const measures=sameSettings(); measures[1].repeatEnd=true; measures[1].repeatCount=count;
        assert.throws(()=>order(measures),/play count/);
    }
    const large=Array.from({length:101},(_,i)=>({...sameSettings()[0],index:i+1,number:i+1}));
    large[100].repeatEnd=true; large[100].repeatCount=1000;
    assert.throws(()=>order(large),/100,000/);
});
test('score reader captures supported repeat metadata and detects endings/jumps', () => {
    const score=mockScore();
    score.firstMeasure.repeatStart=true;
    score.firstMeasure.nextMeasure.repeatEnd=true; score.firstMeasure.nextMeasure.repeatCount=3;
    score.firstMeasure.nextMeasure.elements=[{type:E.LAYOUT_BREAK,layoutBreakType:2}];
    score.firstMeasure.nextMeasure.nextMeasure.repeatJump=true;
    score.spanners=[{type:E.VOLTA}];
    const result=reader.read(score,E,S,480,{},B,{SECTION:2});
    assert.equal(result.measures[0].repeatStart,true);
    assert.equal(result.measures[1].repeatEnd,true);
    assert.equal(result.measures[1].repeatCount,3);
    assert.equal(result.measures[1].sectionBreakAfter,true);
    assert.deepEqual(Array.from(result.navigation,n=>n.kind),['jump','ending']);
    assert.throws(()=>playback.expand(result.measures,{repeatMode:'follow'},result.navigation),/Ignore repeats/);
});
