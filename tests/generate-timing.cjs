const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const load = require('./load.cjs');
const preflight = load('Preflight'), playback = load('RepeatOrder'), model = load('Model');
const te = load('TonalEnergy'), preview = load('Preview'), defaults = load('Template').defaults;
const destination = path.join(__dirname, '../samples');
let tick = 0;
const measures = [1,4,4,3].map((durationQuarters,index)=>{
    const measure = {index:index+1,number:index,startTick:tick,endTick:tick+durationQuarters*480,
        numerator:4,denominator:4,tempo:120,durationQuarters,isPickup:index===0,holds:[],freeTime:index===2};
    tick = measure.endTick;
    if (index===1) measure.holds = [{kind:'fermata',tick:measure.startTick,timeStretch:2,playedStretch:2,played:true}];
    return measure;
});
const decisions = {'2':{mode:'steady'},'3':{mode:'counts',counts:'6'}};
const selected = preflight.applyDecisions(measures,decisions);
const visits = playback.expand(selected,{repeatMode:'ignore'}).measures;
const regions = model.regions(visits,{combine:true,splitBy:'settings'});
const quarters = regions.reduce((sum,region)=>sum+te.durationQuarters(region),0);
const seconds = regions.reduce((sum,region)=>sum+preview.duration(region),0);
assert.equal(quarters,14);assert.equal(seconds,7);assert.equal(regions.length,4);
assert.deepEqual(Array.from(regions,r=>r.durationQuarters||r.numerator*4/r.denominator),[1,4,6,3]);
const outputs = te.serializeExports('Timing',regions,
    {fullMet:true,halfMet:true,downbeatMet:true,accentMode:'downbeat',countInEnabled:true},defaults);
const mapAttrs = xml => Array.from(xml.matchAll(/<MetroMeterMapInfo\b([^>]*)>/g),m=>Object.fromEntries(
    Array.from(m[1].matchAll(/([\w]+)="([^"]*)"/g),a=>[a[1],a[2]])));
const positions = (mask,count) => Array.from({length:count},(_,i)=>i+1).filter(n=>(BigInt(mask)>>BigInt(n-1))&1n);
let referenceCountIn;
for (const output of outputs) {
    const maps = mapAttrs(output.text);
    assert.deepEqual(maps.map(m=>[Number(m.topcount),Number(m.notebase),Number(m.barcount)]),[[1,4,1],[4,4,1],[6,4,1],[3,4,1]]);
    assert.deepEqual(positions(maps[0].beatmask64,1),output.pattern==='full'?[1]:[]);
    assert.deepEqual(positions(maps[0].accentmask64,1),[]);
    assert.deepEqual(positions(maps[2].beatmask64,6),output.pattern==='full'?[1,2,3,4,5,6]:output.pattern==='half'?[1,3,5]:[1,5]);
    assert.deepEqual(positions(maps[2].accentmask64,6),[1,5]);
    const countIn = output.text.match(/<MetroCountIn\b[\s\S]*?<\/MetroCountIn>/)[0];
    if (referenceCountIn === undefined) referenceCountIn = countIn;
    else assert.equal(countIn,referenceCountIn);
    fs.writeFileSync(path.join(destination,output.filename),output.text);
}
fs.writeFileSync(path.join(destination,'Timing-model.json'),JSON.stringify({title:'Timing',measures,
    selectedMeasures:selected,regions,expectedQuarterCounts:quarters,expectedSecondsExcludingCountIn:seconds},null,2)+'\n');
fs.writeFileSync(path.join(destination,'Timing-decisions.json'),JSON.stringify(decisions,null,2)+'\n');
const musicxml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <work><work-title>Timing</work-title></work>
  <part-list><score-part id="P1"><part-name>Timing acceptance test</part-name></score-part></part-list>
  <part id="P1">
    <measure number="0" implicit="yes">
      <attributes><divisions>480</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>120</per-minute></metronome></direction-type><sound tempo="120"/></direction>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>480</duration><type>quarter</type></note>
    </measure>
    <measure number="1">
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>1920</duration><type>whole</type><notations><fermata type="upright">normal</fermata></notations></note>
    </measure>
    <measure number="2">
      <direction placement="above"><direction-type><words>Senza misura</words></direction-type></direction>
      <note><rest/><duration>1920</duration><type>whole</type></note>
    </measure>
    <measure number="3" implicit="yes">
      <note><rest/><duration>1440</duration><type>half</type><dot/></note>
      <barline location="right"><bar-style>light-heavy</bar-style></barline>
    </measure>
  </part>
</score-partwise>
`;
fs.writeFileSync(path.join(destination,'Timing.musicxml'),musicxml);
console.log('Generated Timing score, decision/model references and three groups: 4 presets, 14 quarter counts, 7 seconds excluding native count-in.');
