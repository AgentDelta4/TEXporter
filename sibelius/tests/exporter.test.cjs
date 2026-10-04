'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {parsePlg,Parser}=require('./manuscript.cjs');
const {harness,analyze,referenceXml,artifact,edit}=require('./helpers.cjs');

test('shipped UTF-16 PLG parses and all method bodies use the tested ManuScript subset',()=>{
    const nodes=parsePlg(artifact.bytes??artifact.file);assert.equal(nodes.filter(n=>n.data==='Dialog').length,4);
    assert.ok(Object.keys(harness().methods).length>=33);
    // Avid evaluates arithmetic left-to-right, not JavaScript precedence.
    const m=new Parser('() { value = 2 + 3 * 4; return value; }').method();
    assert.equal(m.body[0].value.op,'*');assert.equal(m.body[0].value.left.op,'+');
});
test('opening defaults to Top and exports exact shared TE structure',()=>{
    const h=harness([{tempo:120},{tempo:120}]);const r=analyze(h);
    assert.deepEqual(r.map(r=>[r.name,r.bars]),[['Top',2]]);
    assert.equal(h.call('Serialize'),referenceXml(h));
});
test('tempo rounds to two decimals before grouping and XML has no float tails',()=>{
    const h=harness([{tempo:172.00002},{tempo:172},{tempo:120.25}]);const r=analyze(h);
    assert.equal(r.length,2);assert.equal(r[0].bars,2);assert.equal(r[0].tempo,172);
    assert.equal(h.call('TempoText',120.25),'120.25');assert.equal(h.call('TempoText',120.2),'120.2');
    assert.equal(h.call('Serialize'),referenceXml(h));
});
test('rehearsal, tempo-only, and meter-only names retain requested rules',()=>{
    const h=harness([{mark:'A'},{tempo:140},{tempo:140,top:3},{tempo:140,top:3,mark:'B & C'}]);
    assert.deepEqual(analyze(h).map(r=>r.name),['A','','','B & C']);
    assert.equal(h.call('Serialize'),referenceXml(h));
});
test('double barline names use printed first bar numbers, including coincident changes',()=>{
    const h=harness([{double:true,number:'0'},{number:'12a',tempo:140},{tempo:160}],undefined,{SplitMode:'Double barlines'});
    assert.deepEqual(analyze(h).map(r=>r.name),['Top','12a','']);
});
test('double barline at start is recognized; final barlines do not masquerade as doubles',()=>{
    const h=harness([{},{doubleBefore:true,number:'7'}],undefined,{SplitMode:'Double barlines'});
    assert.deepEqual(analyze(h).map(r=>r.name),['Top','7']);
});
test('native playback order handles endings and jumps with repeat labels and boundaries',()=>{
    const h=harness([{mark:'A',repeatStart:true},{},{repeatEnd:true},{mark:'B'},{mark:'C'}],[1,2,3,1,2,4,5,1,2]);
    const r=analyze(h);assert.deepEqual(r.map(r=>[r.name,r.bars]),[['A',3],['A (repeat)',2],['B',1],['C',1],['A (repeat)',2]]);
    assert.equal(h.call('Serialize'),referenceXml(h));
});
test('unnamed repeated presets get the repeat suffix',()=>{
    const h=harness([{},{repeatStart:true,tempo:140},{repeatEnd:true,tempo:160}],[1,2,3,2,3]);
    assert.deepEqual(analyze(h).map(r=>r.name),['Top','','','(repeat)','(repeat)']);
});
test('Ignore repeats uses written bars exactly once and no repeat boundaries',()=>{
    const h=harness([{repeatStart:true},{repeatEnd:true},{}],[1,2,1,2,3],{RepeatMode:'Ignore repeats'});
    assert.deepEqual(analyze(h).map(r=>[r.name,r.bars]),[['Top',3]]);
});
test('manual range filters full playback order and freezes from its first selected bar',()=>{
    const h=harness([{tempo:100},{tempo:120,top:3,mark:'A'},{tempo:140,top:4},{tempo:160,mark:'B'}],[1,2,3,2,3,4],
        {RangeMode:'Measure range',FirstBar:'2',LastBar:'3',TempoChanges:false,MeterChanges:false});
    const r=analyze(h);assert.deepEqual(r.map(r=>[r.name,r.bars,r.tempo,r.top]),[['A',2,120,3],['A (repeat)',2,120,3]]);
});
test('passage selection uses half-open endpoint and includes partial starting bar',()=>{
    const h=harness([{},{mark:'A'},{},{mark:'B'}],undefined,{RangeMode:'Sibelius selection'});
    const r=analyze(h);assert.equal(r.length,1);assert.equal(r[0].sourceStart,2);assert.equal(r[0].sourceEnd,3);
});
test('invalid range and non-passage selections fail clearly',()=>{
    const h=harness([{},{}],undefined,{RangeMode:'Measure range',FirstBar:'2',LastBar:'1'});
    assert.equal(h.call('Analyze'),false);assert.match(h.globals.ErrorText,/first and last/);
    h.globals.RangeMode='Sibelius selection';h.globals.Active={...h.globals.Active,Selection:{IsPassage:false}};
    assert.equal(h.call('Analyze'),false);assert.match(h.globals.ErrorText,/continuous passage/);
});
test('native count-in is group metadata, exact accent pattern, no extra presets',()=>{
    const h=harness([{mark:'A'},{mark:'B'}]);const r=analyze(h);const on=h.call('Serialize');
    assert.equal(r.length,2);assert.match(on,/do_countin="1"/);assert.match(on,/countin_type="4"/);
    assert.match(on,/beatmask="21845"/);assert.match(on,/accentmask="5393"/);assert.match(on,/eighthcount="16"/);
    h.globals.CountInEnabled=false;const off=h.call('Serialize');assert.equal(on.replace('do_countin="1"','do_countin="0"'),off);
});
test('native gradual line and section clipping match shared serializer transitions',()=>{
    const h=harness([{tempo:120,mark:'A',line:{length:4096}},{tempo:130},{tempo:140,mark:'B'},{tempo:150},{tempo:160}]);
    const r=analyze(h);assert.equal(r.length,3);assert.deepEqual(r.slice(0,2).map(r=>[r.bars,r.ramp.startTempo,r.ramp.endTempo,r.ramp.length]),[[2,120,140,8],[2,140,160,8]]);
    assert.equal(h.call('Serialize'),referenceXml(h));
});
test('all supplied transition placements can be set in editable preview and serialize identically',()=>{
    const h=harness([{}]);analyze(h);
    for(const [start,end,offset,length] of [[120,160,0,16],[160,120,0,6],[120,160,10,6]]) {
        Object.assign(h.globals,{EditName:'Ramp',EditBars:'4',EditTop:'4',EditBase:'4',EditTempo:String(start),EditEndTempo:String(end),EditRamp:true,EditOffset:String(offset),EditLength:String(length)});
        assert.equal(h.call('ApplyEdit',0),true);assert.equal(h.call('Serialize'),referenceXml(h));
    }
});
test('fractional endpoints, overlapping lines, and interior tempo text stop gradual export',()=>{
    for(const spec of [[{line:{length:257},notes:[{position:257,tempo:160,duration:64}]},{}],[{line:{length:2048}},{line:{length:1024}},{}],[{line:{length:2048}},{tempoMark:0},{}]]) {
        const h=harness(spec);assert.equal(h.call('Analyze'),false);assert.match(h.globals.ErrorText,/fractional|overlap|inside/);
        h.globals.GradualChanges=false;assert.equal(h.call('Analyze'),true);
    }
});
test('disabled gradual line and ordinary text do not create transitions',()=>{
    const h=harness([{line:{length:1024,play:false}},{tempo:160}]);assert.ok(analyze(h).every(r=>r.ramp===null));
});
test('missing onset objects use playback time with visible approximation warning',()=>{
    const h=harness([{noObject:true,tempo:120}]);assert.equal(analyze(h)[0].tempo,120);
    assert.ok(h.globals.Warnings.some(w=>/sample/.test(w)));
});
test('preview edits are validated atomically and retained by export',()=>{
    const h=harness([{mark:'A'}]);analyze(h);h.call('RefreshPreview');
    Object.assign(h.globals,{EditName:'Edited',EditBars:'3',EditTop:'3',EditBase:'4',EditTempo:'120.25',EditRamp:false});
    assert.equal(h.call('ApplyEdit',0),true);h.call('RefreshPreview');assert.match(h.globals.SummaryText,/3 bars/);
    h.globals.EditBars='3x';assert.equal(h.call('ApplyEdit',0),false);assert.equal(h.globals.Regions[0].bars,3);
    assert.equal(h.call('ExportFile'),true);assert.match(h.files.get('C:/Configured Scores/Sibelius test [Full Met].tetmetgroup'),/name="Edited"/);
});
test('ramps must fit preset length in whole quarter units',()=>{
    const h=harness([{}]);analyze(h);
    Object.assign(h.globals,{EditName:'X',EditBars:'1',EditTop:'4',EditBase:'4',EditTempo:'120',EditEndTempo:'160',EditRamp:true,EditOffset:'0',EditLength:'5'});
    assert.equal(h.call('ApplyEdit',0),false);assert.equal(h.globals.Regions[0].ramp,null);
    h.globals.EditLength='4';assert.equal(h.call('ApplyEdit',0),true);
});
test('XML preserves non-ASCII and special names as valid ASCII character references',()=>{
    const h=harness([{mark:'A & "B" <C>'}]);analyze(h);h.globals.GroupName='Été 🎵';
    const xml=h.call('Serialize');assert.match(xml,/name="&#201;t&#233; &#127925;"/);assert.match(xml,/A &amp; &quot;B&quot; &lt;C&gt;/);
    assert.match(xml,/^[\x00-\x7f]*$/);
    for(const name of ['bad\x01','bad\ud800','bad\udc00','bad\uffff']) {
        h.globals.GroupName=name;assert.equal(h.call('Serialize'),'');assert.match(h.globals.ErrorText,/Unicode|prohibited/);
    }
});
test('native save dialog opens configured Scores and wrong extension/cancel writes nothing',()=>{
    const h=harness([{}]);analyze(h);assert.equal(h.call('ExportFile'),true);
    assert.equal(h.Sibelius.saveArgs[2],'C:/Configured Scores');assert.equal(h.Sibelius.saveArgs[3],'tetmetgroup');
    h.files.clear();h.Sibelius.SelectFileToSave=()=>({NameWithExt:'C:/Scores/wrong.txt'});
    assert.equal(h.call('ExportFile'),false);assert.equal(h.files.size,0);
    h.Sibelius.SelectFileToSave=()=>null;assert.equal(h.call('ExportFile'),false);assert.equal(h.files.size,0);assert.equal(h.globals.ErrorText,'');
});
test('write failures and corrupted readback report errors',()=>{
    const h=harness([{}]);analyze(h);h.Sibelius.CreateTextFile=()=>false;
    assert.equal(h.call('ExportFile'),false);assert.match(h.globals.ErrorText,/create/);
    h.Sibelius.CreateTextFile=()=>true;h.Sibelius.AppendTextFile=()=>false;
    assert.equal(h.call('ExportFile'),false);assert.match(h.globals.ErrorText,/write/);
    h.Sibelius.AppendTextFile=()=>true;h.Sibelius.ReadTextFile=()=>['corrupt'];
    assert.equal(h.call('ExportFile'),false);assert.match(h.globals.ErrorText,/verification/);
});
test('remembered settings restore without reusing title, range, or edits',()=>{
    const h=harness([{}]);analyze(h);h.globals.CountInEnabled=false;h.globals.SplitMode='Double barlines';h.call('SaveOptions');
    h.globals.CountInEnabled=true;h.globals.SplitMode='Rehearsal markings';h.call('LoadOptions');
    assert.equal(h.globals.CountInEnabled,false);assert.equal(h.globals.SplitMode,'Double barlines');
    h.files.set('C:/Plugins/TEExporter/TEXporter-Sibelius.settings','corrupt');h.call('LoadOptions');assert.equal(h.globals.SplitMode,'Double barlines');
});
test('invalid reanalysis retains edited preview and cancelled options restore all controls',()=>{
    const h=harness([{mark:'A'},{mark:'B'}]);analyze(h);h.call('RefreshPreview');
    h.globals.Regions[0].name='Kept';const old=h.globals.Regions;
    h.globals.FirstBar='5';h.globals.RangeMode='Measure range';
    assert.equal(h.call('Analyze'),false);assert.equal(h.globals.Regions,old);assert.equal(old[0].name,'Kept');
    h.globals.RangeMode='Whole score';
    h.Sibelius.ShowDialog=()=>{h.globals.GroupName='Cancelled';h.globals.SplitMode='Double barlines';h.globals.CountInEnabled=false;return false;};
    h.call('ShowOptions');assert.equal(h.globals.GroupName,'Sibelius test');assert.equal(h.globals.SplitMode,'Rehearsal markings');assert.equal(h.globals.CountInEnabled,true);
});
test('boundary barline object does not override next bar onset tempo',()=>{
    const h=harness([{double:true,tempo:120},{tempo:160}]);
    assert.deepEqual(analyze(h).map(r=>r.tempo),[120,160]);
});
test('turning combining off produces one preset per bar in tempo/meter mode',()=>{
    const h=harness([{},{},{}],undefined,{SplitMode:'Tempo / meter changes',CombineMeasures:false});
    assert.deepEqual(analyze(h).map(r=>[r.name,r.bars]),[['Top',1],['',1],['',1]]);
});
test('multiple and mid-bar rehearsal marks retain label and warn',()=>{
    const h=harness([{mark:'D',markPosition:256},{}]);assert.equal(analyze(h)[0].name,'D');
    assert.ok(h.globals.Warnings.some(w=>/rehearsal mark/.test(w)));
});
test('empty and whitespace title falls back without invalid character indexing',()=>{
    const h=harness();h.globals.Active={...h.Sibelius.ActiveScore,Title:' ',FileName:''};h.Sibelius.ActiveScore=h.globals.Active;
    h.call('Run');assert.equal(h.globals.GroupName,'Untitled score');
    assert.equal(h.call('TrimText',''),'');assert.equal(h.call('TrimText','  A  '),'A');
});
test('native example, section, and repeat outputs are generated from shipped ManuScript',()=>{
    const cases=[
        ['Example',Array.from({length:16},(_,i)=>({top:i<8?4:3,tempo:i<12?120:160})),undefined,{SplitMode:'Tempo / meter changes'}],
        ['Sections-rehearsal',Array.from({length:8},(_,i)=>({mark:({0:'A',2:'B',6:'C'})[i],double:[3,7].includes(i)})),undefined,{}],
        ['Sections-double',Array.from({length:8},(_,i)=>({mark:({0:'A',2:'B',6:'C'})[i],double:[3,7].includes(i)})),undefined,{SplitMode:'Double barlines'}],
        ['Repeats',[{mark:'Intro'},{double:true},{mark:'A',repeatStart:true},{repeatEnd:true},{mark:'B'},{}],[1,2,3,4,3,4,5,6],{}],
        ['Advanced',[{mark:'A',tempo:120,line:{length:4096}},{tempo:130},{tempo:140},{tempo:150},
            {mark:'B',tempo:160},{tempo:160},{mark:'C',tempo:160,line:{length:2048,style:'line.system.tempo.rit'}},{tempo:140},
            {mark:'D',tempo:120},{tempo:120}],undefined,{}]
    ];
    const output=path.join(__dirname,'../samples');fs.mkdirSync(output,{recursive:true});
    for(const [name,spec,order,options] of cases) {
        const h=harness(spec,order,options);h.globals.GroupName=name;analyze(h);const xml=h.call('Serialize');
        assert.equal(xml,referenceXml(h));fs.writeFileSync(path.join(output,name+'.tetmetgroup'),xml);
    }
});
test('empty/invalid/too long playback orders are rejected',()=>{
    for(const order of [[],[0],[1.5],Array(100001).fill(1)]) {
        const h=harness([{}],order);assert.equal(h.call('Analyze'),false);assert.match(h.globals.ErrorText,/playback|order/);
    }
});
test('full native Run flow exports without changing any read-only score objects',()=>{
    const h=harness([{mark:'A'},{tempo:160}]);
    const actions=[true,true];h.Sibelius.ShowDialog=d=>{h.dialogCalls.push(d.label);return actions.shift()??false;};
    assert.equal(h.call('Run'),true);assert.deepEqual(h.dialogCalls,['OptionsDialog','PreviewDialog']);
    assert.match(h.files.get('C:/Configured Scores/Sibelius test [Full Met].tetmetgroup'),/name="Sibelius test \[Full Met\]"/);
    h.Sibelius.ScoreCount=0;assert.equal(h.call('Run'),false);assert.match(h.messages.at(-1),/Open a score/);
});
test('dialogs have unique IDs, valid bindings, and controls fit within their windows',()=>{
    const h=harness();
    for(const d of Object.values(h.dialogs)) {
        const prop=Object.fromEntries(d.children.filter(n=>n.label!=='Controls').map(n=>[n.label,n.data]));
        const ids=new Set();
        for(const c of d.children.find(n=>n.label==='Controls').children) {
            const p=Object.fromEntries(c.children.map(n=>[n.label,n.data]));
            assert.ok(!ids.has(p.ID));ids.add(p.ID);
            assert.ok(Number(p.X)+Number(p.Width)<=Number(prop.Width));assert.ok(Number(p.Y)+Number(p.Height)<=Number(prop.Height));
            if(p.Value)assert.ok(p.Value in h.globals);if(p.ListVar)assert.ok(p.ListVar in h.globals);if(p.Method)assert.ok(p.Method in h.methods);
        }
    }
});
