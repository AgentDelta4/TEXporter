'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const {build}=require('../build.cjs');
const {createRuntime}=require('./manuscript.cjs');
const load=require('../../tests/load.cjs');
const artifact=build();

function readonly(object) {
    return new Proxy(object,{set(){throw Error('The plugin attempted to modify the score');},
        deleteProperty(){throw Error('The plugin attempted to delete score data');}});
}

function beamNotes(groups,extra={}) {
    const starts=[];let total=0;
    for(const size of groups){starts.push(total);total+=size;}
    return Array.from({length:total},(_,i)=>({position:i*128,duration:128,beam:starts.includes(i)?2:3,...extra}));
}

function scoreFixture(spec,order) {
    let offset=0;
    const staffCount=Math.max(1,...spec.map(m=>m.staffs?.length??1));
    const bars=spec.map((m,i)=>{
        const length=m.length??(m.top??4)*1024/(m.base??4),start=offset;offset+=length;
        function object(type,extra={}) {
            return readonly({Type:type,IsALine:['Line','RitardLine'].includes(type),Position:0,
                CurrentTempo:m.tempo??120,GetPlayedOnNthPass:()=>true,...extra});
        }
        function note(n={}) {
            return object('NoteRest',{VoiceNumber:n.voice??1,GraceNote:n.grace??false,
                ParentTupletIfAny:n.tuplet??null,CrossStaff:n.crossStaff??0,Duration:n.duration??128,
                Position:n.position??0,Beam:n.beam??1,CurrentTempo:n.tempo??m.tempo??120,
                GetArticulation:a=>(n.articulations??(n.fermata?[13]:[])).includes(a),
                GetPlayedOnNthPass:()=>n.play!==false});
        }
        function symbols(items,system) {
            return (items??[]).map(s=>object(s.type??(system?'SystemSymbolItem':'SymbolItem'),
                {Index:s.index,Position:s.position??0}));
        }
        function texts(items,system) {
            return (items??[]).map(t=>object(t.type??(system?'SystemTextItem':'Text'),
                {StyleId:t.style??(system?'text.system.tempo':'text.staff.technique'),
                    Text:t.text??'',Position:t.position??0}));
        }
        const objects=[];
        if(!m.noObject)objects.push(object('BarRest',{PauseType:m.barRestFermata??0}));
        if(m.mark!==undefined)objects.push(object('RehearsalMark',{MarkAsText:m.mark,Position:m.markPosition??0}));
        if(m.double)objects.push(object('SpecialBarline',{BarlineInternalType:3,Position:length}));
        if(m.doubleBefore)objects.push(object('SpecialBarline',{BarlineInternalType:3}));
        if(m.repeatStart)objects.push(object('SpecialBarline',{BarlineInternalType:0}));
        if(m.repeatEnd)objects.push(object('SpecialBarline',{BarlineInternalType:1,Position:length}));
        if(m.line)objects.push(object(m.line.type??'RitardLine',{StyleId:m.line.style??'line.system.tempo.accel',
            Duration:m.line.length,Position:m.line.offset??0,GetPlayedOnNthPass:()=>m.line.play!==false}));
        if(m.tempoMark!==undefined)objects.push(object('SystemTextItem',{StyleId:'text.system.tempo',
            Text:m.tempoText??'quarter = 120',Position:m.tempoMark}));
        objects.push(...symbols(m.symbols,true),...texts(m.texts,true));
        if(m.freeText!==undefined)objects.push(...texts([{text:m.freeText}],true));
        function makeBar(contents) {
            return readonly({BarNumber:i+1,ExternalBarNumberString:m.number??String(i+1),Length:length,
                SectionEnd:m.sectionEnd??false,BreakType:m.breakType??7,
                [Symbol.iterator]:function*(){yield*contents;}});
        }
        const staffBars=Array.from({length:staffCount},(_,staffIndex)=>{
            const s=m.staffs?.[staffIndex]??(staffIndex===0?m:{});
            const items=[];
            if(s.barRestFermata)items.push(object('BarRest',{PauseType:s.barRestFermata}));
            for(const n of s.notes??[])items.push(note(n));
            if(s.fermata)items.push(note({fermata:true,duration:256}));
            items.push(...symbols(s.staffSymbols??s.symbols,false),...texts(s.staffTexts??[],false));
            return makeBar(items);
        });
        return {bar:makeBar(objects),staffBars,m,start,length};
    });
    const staves=Array.from({length:staffCount},(_,s)=>readonly({NthBar:n=>bars[n-1].staffBars[s]}));
    const system=readonly({BarCount:bars.length,NthBar:n=>bars[n-1].bar,
        CurrentTimeSignature:n=>readonly({Numerator:spec[n-1].top??4,Denominator:spec[n-1].base??4,
            Text:String(spec[n-1].top??4)+'\n'+String(spec[n-1].base??4)})});
    return readonly({SystemStaff:system,Title:'Sibelius test',FileName:'C:/Scores/Sibelius test.sib',
        BarPlaybackOrder:readonly(order??spec.map((_,i)=>i+1)),
        Selection:readonly({IsPassage:true,FirstBarNumber:2,LastBarNumber:4,LastBarSr:0}),
        GetLocationTime:(n,pos)=>{const b=bars[n-1];return (b.start+pos)/256*60000/(b.m.tempo??120);},
        [Symbol.iterator]:function*(){yield*staves;}});
}

function harness(spec=[{tempo:120}],order,options={}) {
    const files=new Map(),messages=[],dialogs=[],saveCalls=[],controlStates=[];
    const Sibelius={ScoreCount:1,ActiveScore:scoreFixture(spec,order),PathSeparator:'/',trace:[],
        GetFile:p=>({NameNoPath:path.basename(p||'').replace(/\.[^.]*$/,'')}),
        GetScoresFolder:()=>({Name:'C:/Configured Scores'}),MakeSafeFileName:s=>s.replace(/[<>:"/\\|?*]/g,'_'),
        FileExists:p=>files.has(p),CreateTextFile:p=>{files.set(p,'');return true;},
        AppendTextFile:(p,s,unicode)=>{assert.equal(unicode,false);assert.match(s,/^[\x00-\x7f]*$/);files.set(p,files.get(p)+s);return true;},
        ReadTextFile:p=>{if(!files.has(p))return null;const a=files.get(p).split('\n');a.NumChildren=a.length;return a;},
        SelectFileToSave:(...a)=>{Sibelius.saveArgs=a;saveCalls.push(a);return {NameWithExt:'C:/Configured Scores/'+a[1]};},
        ShowDialog:d=>{dialogs.push(d.label);return false;},MessageBox:s=>messages.push(s),
        EnableControlById:(self,dialog,id,enabled)=>{controlStates.push({dialog:dialog.label,id,enabled});},
        RefreshDialog:()=>{Sibelius.refreshCount++;},refreshCount:0};
    const runtime=createRuntime(artifact.bytes??artifact.file,Sibelius);
    Object.assign(runtime.globals,{Active:Sibelius.ActiveScore,GroupName:'Sibelius test'},options);
    return {...runtime,Sibelius,files,messages,dialogCalls:dialogs,saveCalls,controlStates};
}

function analyze(h) {
    assert.equal(h.call('Analyze'),true,h.globals.ErrorText);
    return h.globals.Regions;
}

function normalizedNative(r) {
    const region={presetName:r.name,barCount:r.bars,numerator:r.top,denominator:r.base,tempo:r.tempo,
        startMeasure:r.startNumber,grouping:r.groupingText?r.groupingText.split(/[+-]/).map(Number):null,
        sourceDurationQuarters:r.sourceLength/256,isPickup:!!r.pickup,
        ramp:r.ramp?{startTempo:r.ramp.startTempo,endTempo:r.ramp.endTempo,startBeat:r.ramp.offset,lengthBeats:r.ramp.length}:null};
    if(r.partial)region.durationQuarters=r.sourceLength/256;
    if(r.timingMode==='Set total counts')region.durationOverrideQuarters=r.totalCounts*4/r.countBase;
    return region;
}

function referenceXml(h,pattern='full',title=h.globals.GroupName) {
    return load('TonalEnergy').serialize(title,h.globals.Regions.map(normalizedNative),
        {accentMode:h.globals.ClickStyle==='Straight'?'straight':'downbeat',
            countInEnabled:h.globals.CountInEnabled,clickPattern:pattern},load('Template').defaults).text;
}

function edit(h,index,changes={}) {
    const r=h.globals.Regions[index];
    Object.assign(h.globals,{EditName:r.name,EditBars:String(r.bars),EditTop:String(r.top),EditBase:String(r.base),
        EditTempo:String(r.ramp?.startTempo??r.tempo),EditEndTempo:String(r.ramp?.endTempo??r.tempo),
        EditRamp:!!r.ramp,EditOffset:String(r.ramp?.offset??0),EditLength:String(r.ramp?.length??r.top*4/r.base),
        EditGrouping:r.groupingText??'',EditTimingMode:r.timingMode||'Choose handling',
        EditTotalCounts:String(r.totalCounts??0),EditCountUnit:({2:'Half notes',4:'Quarter notes',8:'Eighth notes',16:'16th notes'})[r.countBase??4],...changes});
    return h.call('ApplyEdit',index);
}

module.exports={harness,analyze,referenceXml,artifact,normalizedNative,readonly,scoreFixture,beamNotes,edit};
