'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {harness,analyze,referenceXml,artifact,beamNotes,edit,readonly}=require('./helpers.cjs');
const exported=h=>[...h.files].filter(([name])=>name.endsWith('.tetmetgroup'));
const versions=[['full','Full Met'],['half','Half-note Met'],['downbeat','Downbeat Met']];

test('INDEV branding is present on the artifact, menu and all native dialogs',()=>{
    assert.equal(artifact.version,'1.7.2-indev.1');
    assert.match(artifact.file,/TEXporter-Sibelius\.plg$/);
    const h=harness();h.call('Initialize');
    assert.deepEqual(h.Sibelius.menu,['TEXporter for Sibelius - INDEV','Run']);
    assert.match(h.globals.FooterText,/INDEV.*1\.7\.2-indev\.1/);
    for(const dialog of Object.values(h.dialogs))assert.match(dialog.children.find(n=>n.label==='Title').data,/INDEV/);
});

test('options callbacks refresh native preview without an Analyze or Reset button',()=>{
    const h=harness([{tempo:120},{tempo:160}]);analyze(h);
    h.globals.TempoChanges=false;h.call('OptionsChanged');
    assert.equal(h.Sibelius.refreshCount,1);assert.equal(h.globals.Regions.length,1);
    assert.match(h.globals.SummaryText,/1 presets/);
    const controls=h.dialogs.OptionsDialog.children.find(n=>n.label==='Controls').children;
    for(const control of controls.filter(c=>['CheckBox','ComboBox'].includes(c.label))) {
        assert.equal(control.children.find(p=>p.label==='Method').data,'OptionsChanged');
    }
    for(const dialog of Object.values(h.dialogs)) {
        const buttons=dialog.children.find(n=>n.label==='Controls').children.filter(c=>c.label==='Button');
        assert.ok(!buttons.some(b=>b.children.some(p=>p.label==='Title'&&/Analyze|Reset/.test(p.data))));
    }
});

test('all selected met versions export independently and match current MuseScore XML',()=>{
    const h=harness([{mark:'A'},{tempo:160,top:7,base:8,notes:beamNotes([3,2,2])}],undefined,
        {FullMet:true,HalfMet:true,DownbeatMet:true});
    analyze(h);assert.equal(edit(h,0,{EditName:'Edited A',EditTempo:'122.25'}),true);
    assert.equal(h.call('ExportFile'),true,h.globals.ErrorText);
    assert.equal(exported(h).length,3);assert.equal(h.saveCalls.length,3);
    for(const [pattern,label] of versions) {
        const title='Sibelius test ['+label+']';
        assert.equal(h.files.get('C:/Configured Scores/'+title+'.tetmetgroup'),referenceXml(h,pattern,title));
        assert.ok(h.saveCalls.some(call=>call[0].includes('INDEV')&&call[1]===title+'.tetmetgroup'));
    }
    assert.match(h.messages.at(-1),/Exported 3 groups/);
});

test('no met selection, unresolved holds and unknown grouping block before any picker',()=>{
    for(const [spec,options,error] of [
        [[{}],{FullMet:false,HalfMet:false,DownbeatMet:false},/at least one/],
        [[{fermata:true}],{},/every detected hold|Choose/],
        [[{top:7,base:8}],{},/grouping/]
    ]) {
        const h=harness(spec,undefined,options);analyze(h);
        assert.equal(h.call('ExportFile'),false);assert.match(h.globals.ErrorText,error);
        assert.equal(h.saveCalls.length,0);assert.equal(exported(h).length,0);
    }
});

test('a canceled later picker retains the saved version and skips the remainder',()=>{
    const h=harness([{}],undefined,{FullMet:true,HalfMet:true,DownbeatMet:true});analyze(h);
    let calls=0;
    h.Sibelius.SelectFileToSave=(...args)=>++calls===1?{NameWithExt:'C:/Scores/Full.tetmetgroup'}:null;
    assert.equal(h.call('ExportFile'),false);assert.equal(calls,2);
    assert.deepEqual(exported(h).map(([name])=>name),['C:/Scores/Full.tetmetgroup']);
    assert.match(h.messages.at(-1),/Saved 1 of 3/);assert.equal(h.globals.ErrorText,'');
});

test('duplicate destinations are rejected before a later version overwrites the first',()=>{
    const h=harness([{}],undefined,{FullMet:true,HalfMet:true});analyze(h);
    h.Sibelius.SelectFileToSave=()=>({NameWithExt:'C:/Scores/Same.tetmetgroup'});
    assert.equal(h.call('ExportFile'),false);assert.match(h.globals.ErrorText,/different file/);
    assert.equal(exported(h).length,1);
    assert.match(exported(h)[0][1],/name="Sibelius test \[Full Met\]"/);
});

test('first pickup and later irregular bars export their physical lengths and click phases',()=>{
    const h=harness([{length:256},{length:640},{tempo:160}],undefined,{FullMet:true,HalfMet:true,DownbeatMet:true});
    const rows=analyze(h);assert.deepEqual(rows.map(r=>[r.partial,r.pickup]),[[true,true],[true,false],[false,false]]);
    assert.equal(rows[0].sourceLength,256);assert.equal(rows[1].sourceLength,640);
    h.call('RefreshPreview');assert.match(h.globals.PreviewItems[0],/1 qtr counts/);assert.match(h.globals.PreviewItems[1],/2\.5 qtr counts/);
    for(const [pattern,label] of versions)assert.equal(h.call('SerializeVersion',pattern,label),referenceXml(h,pattern,label));
    assert.equal(edit(h,0,{EditBars:'2'}),false);assert.match(h.globals.ErrorText,/fixed/);
    assert.equal(edit(h,1,{EditTop:'3'}),false);assert.match(h.globals.ErrorText,/fixed/);
});

test('written fermatas, bar-rest fermatas, caesuras and explicit free-time text deduplicate',()=>{
    const h=harness([{barRestFermata:2,fermata:true,notes:[{articulations:[12,14],duration:256}],
        symbols:[{index:249},{index:250}],staffSymbols:[{index:249}],freeText:'SENZA  MISURA',
        staffTexts:[{text:'Free-time'}]}]);
    const rows=analyze(h);assert.deepEqual(rows[0].holdReasons,['Fermata','Caesura','Free-time passage']);
    assert.equal(rows[0].requiresTimingDecision,true);assert.equal(h.call('Serialize'),'');
    assert.equal(edit(h,0,{EditTimingMode:'Keep steady clicks'}),true,h.globals.ErrorText);
    assert.equal(h.call('Serialize'),referenceXml(h));
});

test('disabled written fermatas still require a choice; ordinary breaths and layout flags do not',()=>{
    const held=harness([{notes:[{fermata:true,play:false,duration:256}]}]);
    assert.equal(analyze(held)[0].requiresTimingDecision,true);
    const steady=harness([{symbols:[{index:247},{index:248}],sectionEnd:true,breakType:6,length:256,
        texts:[{text:'Cadenza',style:'text.system.page_aligned.title'},{text:'Free time',style:'text.blankpage.boxed'}]},
        {texts:[{text:'Steady; do not wait'}]}]);
    assert.ok(analyze(steady).every(r=>!r.requiresTimingDecision));
    assert.equal(steady.call('Serialize'),referenceXml(steady));
});

test('bounded free-time terms do not match unrelated words',()=>{
    const h=harness();
    for(const text of ['senza misura','free-time','UNMETERED','Cadenza','ad lib.','ad libitum'])assert.equal(h.call('DetailIsFreeTime',text),true,text);
    for(const text of ['cadenzas','free timing','ad libitumx','steady clicks','report bugs here'])assert.equal(h.call('DetailIsFreeTime',text),false,text);
});

test('one written hold choice updates all repeats while visit-specific edits remain separate',()=>{
    const h=harness([{mark:'A',fermata:true},{mark:'B'}],[1,2,1,2]);const rows=analyze(h);
    assert.equal(rows.length,4);
    assert.equal(edit(h,0,{EditName:'First pass',EditTempo:'122.25',EditTimingMode:'Set total counts',EditTotalCounts:'6',EditCountUnit:'Eighth notes'}),true);
    assert.equal(rows[0].timingMode,'Set total counts');assert.equal(rows[2].timingMode,'Set total counts');
    assert.equal(rows[2].totalCounts,6);assert.equal(rows[2].name,'A (repeat)');assert.equal(rows[2].tempo,120);
    assert.equal(edit(h,2,{EditName:'Repeat pass',EditTempo:'130',EditTimingMode:'Set total counts',EditTotalCounts:'8',EditCountUnit:'Eighth notes'}),true);
    assert.equal(rows[0].totalCounts,8);assert.equal(rows[2].totalCounts,8);
    h.globals.CountInEnabled=false;h.call('OptionsChanged');
    assert.deepEqual(h.globals.Regions.filter(r=>r.requiresTimingDecision).map(r=>[r.name,r.tempo,r.totalCounts]),
        [['First pass',122.25,8],['Repeat pass',130,8]]);
    assert.equal(h.call('Serialize'),referenceXml(h));
});

test('hold count validation is atomic and unrepresentable duration never opens a picker',()=>{
    const h=harness([{fermata:true}]);analyze(h);
    for(const counts of ['', '0','6x','0.1','65']) {
        assert.equal(edit(h,0,{EditTimingMode:'Set total counts',EditTotalCounts:counts,EditCountUnit:'Quarter notes'}),false,counts);
        assert.equal(h.globals.Regions[0].timingMode,'');
        assert.equal(h.call('ExportFile'),false);assert.equal(h.saveCalls.length,0);
    }
    assert.equal(edit(h,0,{EditTimingMode:'Set total counts',EditTotalCounts:'6.0',EditCountUnit:'Eighth notes'}),true);
    assert.equal(h.call('Serialize'),referenceXml(h));
});

test('unresolved holds outside the selected range do not block; choices are per run',()=>{
    const h=harness([{},{fermata:true},{freeText:'Cadenza'}],undefined,{RangeMode:'Measure range',FirstBar:'1',LastBar:'1'});
    analyze(h);assert.equal(h.call('ExportFile'),true);assert.equal(h.saveCalls.length,1);
    h.globals.RangeMode='Whole score';analyze(h);assert.equal(h.call('ExportFile'),false);
    assert.equal(edit(h,1,{EditTimingMode:'Keep steady clicks'}),true);
    assert.equal(edit(h,2,{EditTimingMode:'Keep steady clicks'}),true);
    assert.equal(h.call('Serialize'),referenceXml(h));
    const h2=harness([{fermata:true}]);analyze(h2);assert.equal(h2.globals.Regions[0].timingMode,'');
    h.Sibelius.ShowDialog=()=>false;h.call('Run');
    assert.ok(h.globals.Regions.filter(r=>r.requiresTimingDecision).every(r=>r.timingMode===''));
});

test('untouched defaults follow options while genuinely edited names and BPM survive',()=>{
    const h=harness([{mark:'A',line:{length:4096},tempo:120},{tempo:130},{tempo:140},{tempo:150},{mark:'B',tempo:160}]);
    analyze(h);assert.equal(edit(h,1,{EditName:'Kept B',EditTempo:'166.25'}),true);
    h.globals.GradualChanges=false;h.call('OptionsChanged');
    assert.deepEqual(h.globals.Regions.slice(0,4).map(r=>r.tempo),[120,130,140,150]);
    assert.equal(h.globals.Regions[4].name,'Kept B');assert.equal(h.globals.Regions[4].tempo,166.25);
    h.globals.GradualChanges=true;h.call('OptionsChanged');
    assert.equal(h.globals.Regions.length,2);assert.ok(h.globals.Regions[0].ramp);
    assert.equal(h.globals.Regions[1].name,'Kept B');assert.equal(h.globals.Regions[1].tempo,166.25);
    assert.equal(h.call('Serialize'),referenceXml(h));
});

test('complete primary beams establish /8 grouping; conflicting and incomplete evidence requires an edit',()=>{
    for(const [groups,expected] of [[[3,2,2],'3+2+2'],[[2,2,3],'2+2+3']]) {
        const h=harness([{top:7,base:8,notes:beamNotes(groups)}]);
        assert.equal(analyze(h)[0].groupingText,expected);
        for(const [pattern,label] of versions)assert.equal(h.call('SerializeVersion',pattern,label),referenceXml(h,pattern,label));
    }
    for(const m of [{top:7,base:8},
        {top:7,base:8,staffs:[{notes:beamNotes([3,2,2])},{notes:beamNotes([2,2,3])}]},
        {top:7,base:8,notes:beamNotes([3,2,2],{crossStaff:1})},
        {top:7,base:8,notes:beamNotes([3,2,2],{tuplet:{}})},
        {top:7,base:8,notes:beamNotes([3,2,2]).slice(1)},
        {top:7,base:8,notes:beamNotes([7])}]) {
        const h=harness([m]);assert.equal(analyze(h)[0].needsGrouping,true);
        assert.equal(h.call('ExportFile'),false);assert.match(h.globals.ErrorText,/grouping/);assert.equal(h.saveCalls.length,0);
        assert.equal(edit(h,0,{EditGrouping:'3+2+2'}),true);assert.equal(h.call('Serialize'),referenceXml(h));
    }
});

test('unambiguous /8 defaults are limited to 3 and compound divisions; /16 is unchanged',()=>{
    for(const [top,grouping] of [[3,'3'],[6,'3+3'],[9,'3+3+3'],[12,'3+3+3+3']]) {
        const h=harness([{top,base:8}]);assert.equal(analyze(h)[0].groupingText,grouping);
        assert.equal(h.call('Serialize'),referenceXml(h));
    }
    for(const top of [2,4,5,7,8,11]) {
        const h=harness([{top,base:8}]);assert.equal(analyze(h)[0].groupingText,'');assert.equal(h.call('Serialize'),'');
    }
    const h=harness([{top:7,base:16}]);assert.equal(analyze(h)[0].needsGrouping,false);
    assert.equal(h.call('SerializeVersion','half','/16'),referenceXml(h,'half','/16'));
});

test('holding /8 counts preserve physical length and edited grouping through a meter option change',()=>{
    const h=harness([{},{top:7,base:8,notes:beamNotes([3,2,2]),barRestFermata:2}]);analyze(h);
    assert.equal(edit(h,1,{EditGrouping:'2+2+3',EditTimingMode:'Set total counts',EditTotalCounts:'6',EditCountUnit:'Eighth notes'}),true);
    h.globals.MeterChanges=false;h.call('OptionsChanged');
    assert.equal(h.globals.Regions[1].base,4);assert.equal(h.globals.Regions[1].countBase,8);
    assert.equal(h.globals.Regions[1].totalCounts,6);assert.equal(h.call('Serialize'),referenceXml(h));
    h.globals.MeterChanges=true;h.call('OptionsChanged');
    assert.equal(h.globals.Regions[1].base,8);assert.equal(h.globals.Regions[1].groupingText,'2+2+3');
    assert.equal(h.call('Serialize'),referenceXml(h));
});

test('preset editing shows timing controls only for detected holds and fixes partial meter controls',()=>{
    const h=harness([{length:256},{fermata:true},{}]);analyze(h);h.call('RefreshPreview');
    const expected=[['EditDialog',false],['TimingEditDialog',false],['EditDialog',true]];
    for(let i=0;i<3;i++) {
        h.globals.PreviewSelection=h.globals.PreviewItems[i];h.call('EditPreset');
        assert.equal(h.dialogCalls.at(-1),expected[i][0]);
        for(const id of ['bars','top','base'])assert.equal(h.controlStates.filter(c=>c.id===id).at(-1).enabled,expected[i][1]);
    }
});

test('new settings round-trip versions and accept the legacy header without persisting score decisions',()=>{
    const h=harness([{fermata:true}]);analyze(h);assert.equal(edit(h,0,{EditTimingMode:'Keep steady clicks'}),true);
    Object.assign(h.globals,{FullMet:false,HalfMet:true,DownbeatMet:true,CountInEnabled:false});h.call('SaveOptions');
    const settings=h.files.get('C:/Plugins/TEExporter/TEXporter-Sibelius.settings');
    assert.match(settings,/^TEXporter-Sibelius-2/);assert.doesNotMatch(settings,/steady|Fermata|totalCounts/);
    Object.assign(h.globals,{FullMet:true,HalfMet:false,DownbeatMet:false,CountInEnabled:true});h.call('LoadOptions');
    assert.deepEqual([h.globals.FullMet,h.globals.HalfMet,h.globals.DownbeatMet,h.globals.CountInEnabled],[false,true,true,false]);
    h.files.set('C:/Plugins/TEExporter/TEXporter-Sibelius.settings',settings.replace('TEXporter-Sibelius-2','TEExporter-Sibelius-1'));
    h.globals.CountInEnabled=true;h.call('LoadOptions');assert.equal(h.globals.CountInEnabled,false);
});

test('score-detail API doubles are read-only and missing documented properties fail visibly',()=>{
    const h=harness([{top:7,base:8,notes:beamNotes([3,2,2],{fermata:true}),symbols:[{index:249}]}]);
    const score=h.Sibelius.ActiveScore,bar=score.SystemStaff.NthBar(1),staff=[...score][0];
    for(const object of [score,score.SystemStaff,bar,staff,staff.NthBar(1),...bar,...staff.NthBar(1)]) {
        assert.throws(()=>{object.testMutation=true;},/attempted to modify the score/);
        assert.throws(()=>{delete object.Type;},/attempted to delete score data/);
    }
    assert.equal(analyze(h)[0].groupingText,'3+2+2');
    assert.deepEqual(h.globals.Regions[0].holdReasons,['Caesura','Fermata']);
    // Missing fields must not silently pass as null in a platform API object.
    const note=readonly({Type:'NoteRest',VoiceNumber:1,GraceNote:false,ParentTupletIfAny:null,
        CrossStaff:0,Duration:128,Position:0});
    const incomplete=readonly({Length:896,[Symbol.iterator]:function*(){yield note;}});
    assert.throws(()=>h.call('DetailVoiceGrouping',incomplete,1,7),/missing property Beam/);
});

test('whole-quarter ramp offsets remain valid after an eighth-note pickup',()=>{
    const h=harness([{length:128},{tempo:120,line:{length:1024}},{tempo:160}]);
    const rows=analyze(h);assert.equal(rows[0].pickup,true);
    assert.deepEqual([rows[1].ramp.startTempo,rows[1].ramp.endTempo,rows[1].ramp.offset,rows[1].ramp.length],[120,160,0,4]);
    assert.equal(h.call('Serialize'),referenceXml(h));
    const fractional=harness([{length:128},{tempo:120,line:{length:1024,offset:128}},{tempo:160}]);
    assert.equal(fractional.call('Analyze'),false);assert.match(fractional.globals.ErrorText,/fractional-quarter/);
});

test('combining off produces one preset per written bar in every split mode',()=>{
    for(const SplitMode of ['Rehearsal markings','Double barlines','Tempo / meter changes']) {
        const h=harness([{mark:'A'},{},{double:true},{mark:'B'}],undefined,{SplitMode,CombineMeasures:false});
        const rows=analyze(h);assert.deepEqual(rows.map(r=>[r.sourceStart,r.sourceEnd,r.bars]),
            [[1,1,1],[2,2,1],[3,3,1],[4,4,1]],SplitMode);
        assert.equal(h.call('Serialize'),referenceXml(h));
    }
});

test('restoring a manual /8 meter recomputes mandatory grouping after option callbacks',()=>{
    const h=harness([{}]);analyze(h);
    assert.equal(edit(h,0,{EditTop:'7',EditBase:'8'}),true);
    assert.equal(h.globals.Regions[0].needsGrouping,true);
    h.globals.CountInEnabled=false;h.call('OptionsChanged');
    assert.equal(h.globals.Regions[0].top,7);assert.equal(h.globals.Regions[0].base,8);
    assert.equal(h.globals.Regions[0].needsGrouping,true);
    assert.equal(h.call('ExportFile'),false);assert.match(h.globals.ErrorText,/grouping/);
    assert.equal(h.saveCalls.length,0);
    assert.equal(edit(h,0,{EditGrouping:'3+2+2'}),true);
    assert.equal(h.call('Serialize'),referenceXml(h));
});

test('inferred meter warnings survive preview and serialization',()=>{
    const h=harness([{top:5,base:4}]);analyze(h);h.call('RefreshPreview');
    assert.match(h.globals.WarningText,/meter\/subdivision encoding is inferred/);
    assert.equal(h.call('Serialize'),referenceXml(h));
    assert.ok(h.globals.Warnings.some(w=>/verify in TonalEnergy/.test(w)));
});

test('native timing callbacks preserve duration when count units change and disable inactive fields',()=>{
    const h=harness([{fermata:true}]);analyze(h);h.call('RefreshPreview');
    h.globals.PreviewSelection=h.globals.PreviewItems[0];h.call('EditPreset');
    for(const [mode,enabled] of [['Choose handling',false],['Keep steady clicks',false],['Set total counts',true]]) {
        h.globals.EditTimingMode=mode;h.call('TimingModeChanged');
        for(const id of ['counts','unit'])assert.equal(h.controlStates.filter(c=>c.id===id).at(-1).enabled,enabled);
    }
    h.globals.EditCountUnit='Eighth notes';h.globals.PreviousCountBase=8;h.globals.EditTotalCounts='6';
    h.globals.EditCountUnit='Quarter notes';h.call('CountUnitChanged');assert.equal(h.globals.EditTotalCounts,'3');
    h.globals.EditCountUnit='Half notes';h.call('CountUnitChanged');assert.equal(h.globals.EditTotalCounts,'1.5');
    h.globals.EditCountUnit='16th notes';h.call('CountUnitChanged');assert.equal(h.globals.EditTotalCounts,'12');
    h.globals.EditTotalCounts='in progress';h.globals.EditCountUnit='Quarter notes';h.call('CountUnitChanged');
    assert.equal(h.globals.EditTotalCounts,'in progress');
    const controls=h.dialogs.TimingEditDialog.children.find(c=>c.label==='Controls').children;
    for(const [id,method] of [['unit','CountUnitChanged'],['handling','TimingModeChanged']]) {
        const control=controls.find(c=>c.children.some(p=>p.label==='ID'&&p.data===id));
        assert.equal(control.children.find(p=>p.label==='Method').data,method);
    }
});

test('current parity groups are saved for independent XML structure validation',()=>{
    const output=path.join(__dirname,'generated');fs.mkdirSync(output,{recursive:true});
    for(const [name,spec,editRow] of [
        ['Pickup-irregular',[{length:256},{length:640},{}],null],
        ['Grouped-7-8',[{top:7,base:8,notes:beamNotes([3,2,2])}],null],
        ['Held-counts',[{fermata:true}],{EditTimingMode:'Set total counts',EditTotalCounts:'6',EditCountUnit:'Eighth notes'}]
    ]) {
        const h=harness(spec);analyze(h);if(editRow)assert.equal(edit(h,0,editRow),true);
        for(const [pattern,label] of versions) {
            const title=name+' ['+label+']',xml=h.call('SerializeVersion',pattern,title);
            assert.equal(xml,referenceXml(h,pattern,title));
            fs.writeFileSync(path.join(output,title+'.tetmetgroup'),xml);
        }
    }
});
