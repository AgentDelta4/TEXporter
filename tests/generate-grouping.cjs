const fs = require('node:fs');
const path = require('node:path');
const load = require('./load.cjs');
const te = load('TonalEnergy'), model = load('Model'), defaults = load('Template').defaults;
const root = path.join(__dirname,'../samples');
const groups = [[3,2,2],[2,2,3],[2,2,3],[3,2,2],null];
const measures = groups.map((grouping,i)=>({index:i+1,number:i+1,numerator:7,denominator:8,tempo:120,grouping}));
for(const output of te.serializeExports('Eighth grouping',model.regions(measures,{}),
    {fullMet:true,halfMet:true,downbeatMet:true,countInEnabled:true},defaults)) {
    fs.writeFileSync(path.join(root,output.filename),output.text);
}
let xml='<?xml version="1.0" encoding="UTF-8"?>\n<museScore version="4.00"><programVersion>4.7.5</programVersion><Score><Division>480</Division>'+
    '<metaTag name="workTitle">Eighth grouping</metaTag><Part><Staff id="1"><StaffType group="pitched"><name>stdNormal</name></StaffType></Staff>'+
    '<trackName>Grouping example</trackName><Instrument id="piano"><longName>Piano</longName><Channel><program value="0"/><synti>Fluid</synti></Channel></Instrument></Part><Staff id="1">';
for(let i=0;i<groups.length;i++) {
    xml+='<Measure><voice>';
    if(i!==2) {
        const grouping=groups[i]||[3,2,2]; let offset=0;
        xml+='<TimeSig><sigN>7</sigN><sigD>8</sigD>'+(i===3?'<textN>3+2+2</textN>':'')+'<Groups>';
        for(let g=0;g<grouping.length-1;g++) { offset+=grouping[g]; xml+=`<Node pos="${offset*4}" action="273"/>`; }
        xml+='</Groups></TimeSig>';
    }
    if(i===0)xml+='<Tempo><tempo>2</tempo><followText>0</followText><text><sym>metNoteQuarterUp</sym> = 120</text></Tempo><Clef><concertClefType>G</concertClefType><transposingClefType>G</transposingClefType></Clef>';
    if(i<2) {
        for(let n=0;n<7;n++)xml+='<Chord><durationType>eighth</durationType><Note><pitch>60</pitch><tpc>14</tpc></Note></Chord>';
    } else xml+='<Rest><durationType>measure</durationType><duration>7/8</duration></Rest>';
    xml+='</voice></Measure>';
}
xml+='</Staff></Score></museScore>\n';
fs.writeFileSync(path.join(root,'Grouping.mscx'),xml);
console.log('Generated 7/8 grouping score and three TE versions: 3+2+2, 2+2+3, inherited rest bar, additive rest bar, unreadable rest bar.');
