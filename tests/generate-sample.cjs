const fs = require('node:fs');
const path = require('node:path');
const load = require('./load.cjs');
const model = load('Model'), te = load('TonalEnergy'), template = load('Template');
const playback = load('RepeatOrder');
const measures = [];
let tick = 0;
for (let i = 1; i <= 16; i++) {
    const numerator = i <= 8 ? 4 : 3;
    measures.push({index:i, number:i, numerator, denominator:4, tempo:i <= 12 ? 120 : 160,
        startTick:tick, endTick:tick + numerator * 480});
    tick += numerator * 480;
}
const regions = model.regions(measures, {combine:true});
fs.writeFileSync(path.join(__dirname, '../samples/Example.tetmetgroup'),
    te.serialize('Example', regions, {accentMode:'downbeat'}, template.defaults).text);
fs.writeFileSync(path.join(__dirname, '../samples/Example-model.json'),
    JSON.stringify({measures, regions}, null, 2) + '\n');
// A minimal, openable score for the manual MuseScore smoke test.
let musicxml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<score-partwise version="4.0"><work><work-title>Example</work-title></work>' +
    '<part-list><score-part id="P1"><part-name>Metronome test</part-name>' +
    '<score-instrument id="I1"><instrument-name>Piano</instrument-name></score-instrument>' +
    '<midi-instrument id="I1"><midi-channel>1</midi-channel><midi-program>1</midi-program></midi-instrument>' +
    '</score-part></part-list><part id="P1">\n';
for (const m of measures) {
    musicxml += `<measure number="${m.number}">`;
    if (m.index === 1 || m.index === 9) musicxml +=
        `<attributes><divisions>480</divisions><time><beats>${m.numerator}</beats><beat-type>4</beat-type></time>` +
        '<clef><sign>G</sign><line>2</line></clef></attributes>';
    if (m.index === 1 || m.index === 13) musicxml +=
        `<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${m.tempo}</per-minute>` +
        `</metronome></direction-type><sound tempo="${m.tempo}"/></direction>`;
    musicxml += `<note><rest measure="yes"/><duration>${m.numerator*480}</duration></note></measure>\n`;
}
musicxml += '</part></score-partwise>\n';
fs.writeFileSync(path.join(__dirname, '../samples/Example.musicxml'), musicxml);
// Extra outputs for the XML validator, covering both click modes and generic meters.
fs.mkdirSync(path.join(__dirname, 'generated'), {recursive:true});
const meters = [[3,4],[4,4],[6,4],[8,4],[7,8],[5,4],[6,8],[3,2],[7,16]];
for (const mode of ['straight','downbeat']) {
    const parts = meters.map(([numerator,denominator],i) => ({startMeasure:i+1,endMeasure:i+1,
        barCount:i+1,numerator,denominator,tempo:120.125}));
    fs.writeFileSync(path.join(__dirname, `generated/${mode}.tetmetgroup`),
        te.serialize('XML test & "Unicode" — 🎵',parts,{accentMode:mode},template.defaults).text);
}
console.log('Generated sample: 16 measures, 3 presets.');
const sectionMeasures = Array.from({length:8}, (_,i) => ({index:i+1,number:i+1,
    numerator:4,denominator:4,tempo:120,startTick:i*1920,endTick:(i+1)*1920,
    hasRehearsalMark:[0,2,6].includes(i),rehearsalName:({0:'A',2:'B',6:'C'})[i] || '',
    doubleBarlineAfter:[3,7].includes(i)}));
for(const splitBy of ['rehearsal','double']) {
    const parts = model.regions(sectionMeasures,{splitBy});
    fs.writeFileSync(path.join(__dirname, `../samples/Sections-${splitBy}.tetmetgroup`),
        te.serialize('Sections — ' + splitBy,parts,{accentMode:'downbeat'},template.defaults).text);
}
let sectionsXml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<score-partwise version="4.0"><work><work-title>Section split test</work-title></work>' +
    '<part-list><score-part id="P1"><part-name>Metronome test</part-name></score-part></part-list><part id="P1">\n';
for(const m of sectionMeasures) {
    sectionsXml += `<measure number="${m.number}">`;
    if(m.index===1) sectionsXml += '<attributes><divisions>480</divisions><time><beats>4</beats><beat-type>4</beat-type></time>' +
        '<clef><sign>G</sign><line>2</line></clef></attributes>' +
        '<direction><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>120</per-minute></metronome>' +
        '</direction-type><sound tempo="120"/></direction>';
    if(m.hasRehearsalMark) sectionsXml += `<direction placement="above"><direction-type><rehearsal>${{1:'A',3:'B',7:'C'}[m.index]}</rehearsal></direction-type></direction>`;
    sectionsXml += '<note><rest measure="yes"/><duration>1920</duration></note>';
    if(m.doubleBarlineAfter) sectionsXml += '<barline location="right"><bar-style>light-light</bar-style></barline>';
    sectionsXml += '</measure>\n';
}
sectionsXml += '</part></score-partwise>\n';
fs.writeFileSync(path.join(__dirname,'../samples/Sections.musicxml'),sectionsXml);
console.log('Generated section samples: rehearsal splits 2+4+2 bars; double-barline splits 4+4 bars.');
const repeatMeasures = Array.from({length:6},(_,i)=>({index:i+1,number:i+1,numerator:4,denominator:4,
    tempo:120,startTick:i*1920,endTick:(i+1)*1920,hasRehearsalMark:[0,2,4].includes(i),
    rehearsalName:({0:'Intro',2:'A',4:'B'})[i] || '',repeatStart:i===2,repeatEnd:i===3,repeatCount:2,
    doubleBarlineAfter:i===1}));
const repeatOrder = playback.expand(repeatMeasures,{repeatMode:'follow'},[]);
const repeatRegions = model.regions(repeatOrder.measures,{splitBy:'rehearsal'});
fs.writeFileSync(path.join(__dirname,'../samples/Repeats.tetmetgroup'),
    te.serialize('Repeat test',repeatRegions,{},template.defaults).text);
fs.writeFileSync(path.join(__dirname,'../samples/Repeats-model.json'),
    JSON.stringify({written:repeatMeasures,played:repeatOrder.measures,regions:repeatRegions},null,2)+'\n');
let repeatXml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<score-partwise version="4.0"><work><work-title>Repeat test</work-title></work>' +
    '<part-list><score-part id="P1"><part-name>Metronome test</part-name></score-part></part-list><part id="P1">\n';
for(const m of repeatMeasures) {
    repeatXml += `<measure number="${m.number}">`;
    if(m.index===1) repeatXml += '<attributes><divisions>480</divisions><time><beats>4</beats><beat-type>4</beat-type></time>' +
        '<clef><sign>G</sign><line>2</line></clef></attributes>' +
        '<direction><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>120</per-minute></metronome>' +
        '</direction-type><sound tempo="120"/></direction>';
    if(m.repeatStart) repeatXml += '<barline location="left"><bar-style>heavy-light</bar-style><repeat direction="forward"/></barline>';
    if(m.hasRehearsalMark) repeatXml += `<direction><direction-type><rehearsal>${m.rehearsalName}</rehearsal></direction-type></direction>`;
    repeatXml += '<note><rest measure="yes"/><duration>1920</duration></note>';
    if(m.repeatEnd) repeatXml += '<barline location="right"><bar-style>light-heavy</bar-style><repeat direction="backward" times="2"/></barline>';
    else if(m.doubleBarlineAfter) repeatXml += '<barline location="right"><bar-style>light-light</bar-style></barline>';
    repeatXml += '</measure>\n';
}
repeatXml += '</part></score-partwise>\n';
fs.writeFileSync(path.join(__dirname,'../samples/Repeats.musicxml'),repeatXml);
console.log('Generated repeat sample: 6 written measures, 8 played; Intro, A, A (repeat), B.');
// Native gradual-tempo sample; the exporter still reads this through MuseScore's API.
const preview=load('Preview');
const advanced=Array.from({length:10},(_,i)=>({index:i+1,number:i+1,startTick:i*1920,endTick:(i+1)*1920,
    numerator:4,denominator:4,tempo:i<4?120+i*10:i<6?160:i<8?160-(i-6)*20:120,
    hasRehearsalMark:[0,4,6,8].includes(i),rehearsalName:({0:'A',4:'B',6:'C',8:'D'})[i]||''}));
for(let i=0;i<4;i++) advanced[i].ramp={id:1,startTempo:120+i*10,endTempo:130+i*10,startBeat:0,lengthBeats:4};
for(let i=6;i<8;i++) advanced[i].ramp={id:2,startTempo:160-(i-6)*20,endTempo:140-(i-6)*20,startBeat:0,lengthBeats:4};
const advancedParts=model.regions(advanced,{splitBy:'rehearsal'});
fs.writeFileSync(path.join(__dirname,'../samples/Advanced.tetmetgroup'),te.serialize('Advanced',advancedParts,{countInEnabled:true},template.defaults).text);
fs.writeFileSync(path.join(__dirname,'../samples/Advanced-model.json'),JSON.stringify({measures:advanced,regions:advancedParts,
    exported:advancedParts,estimatedSeconds:advancedParts.reduce((sum,r)=>sum+preview.duration(r),0)},null,2)+'\n');
let native='<?xml version="1.0" encoding="UTF-8"?>\n<museScore version="4.00"><programVersion>4.7.5</programVersion><Score>'+
    '<Division>480</Division><metaTag name="workTitle">Advanced exporter test</metaTag>'+
    '<Part><Staff id="1"><StaffType group="pitched"><name>stdNormal</name></StaffType></Staff>'+
    '<trackName>Piano</trackName><Instrument id="piano"><longName>Piano</longName><Channel><program value="0"/><synti>Fluid</synti></Channel></Instrument></Part>'+
    '<Staff id="1"><VBox><Text><style>title</style><text>Advanced exporter test</text></Text></VBox>';
function startSpanner(type,factor,length,text) {
    return '<Spanner type="GradualTempoChange"><GradualTempoChange><tempoChangeType>'+type+'</tempoChangeType>'+
        '<tempoChangeFactor>'+factor+'</tempoChangeFactor><tempoEasingMethod>normal</tempoEasingMethod><beginText>'+text+'</beginText>'+
        '</GradualTempoChange><next><location><measures>'+length+'</measures></location></next></Spanner>';
}
function endSpanner(length) { return '<Spanner type="GradualTempoChange"><prev><location><measures>-'+length+'</measures></location></prev></Spanner>'; }
for(const m of advanced) {
    native+='<Measure><voice>';
    if(m.index===1) native+='<TimeSig><sigN>4</sigN><sigD>4</sigD></TimeSig>';
    if([1,5,9].includes(m.index)) native+='<Tempo><tempo>'+m.tempo/60+'</tempo><followText>0</followText><text><sym>metNoteQuarterUp</sym> = '+m.tempo+'</text></Tempo>';
    if(m.hasRehearsalMark) native+='<RehearsalMark><text>'+m.rehearsalName+'</text></RehearsalMark>';
    if(m.index===1) native+=startSpanner('accelerando',4/3,4,'accel.');
    if(m.index===5) native+=endSpanner(4);
    if(m.index===7) native+=startSpanner('ritardando',0.75,2,'rit.');
    if(m.index===9) native+=endSpanner(2);
    native+='<Rest><durationType>measure</durationType><duration>4/4</duration></Rest></voice></Measure>';
}
native+='</Staff></Score></museScore>\n';
fs.writeFileSync(path.join(__dirname,'../samples/Advanced.mscx'),native);
console.log('Generated Advanced sample: native tempo lines, editable model and four score presets.');
