// Builds one native .plg. Node is a development tool, not an installation dependency.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const load = require('../tests/load.cjs');
const template = load('Template').defaults;
const version = require('./package.json').version;

function literal(s) {
    // Keep method strings free of double quotes and literal control characters.
    const parts = String(s).split(/([\x00-\x1f'"\\])/).filter(Boolean);
    return parts.map(p => p.length === 1 && /[\x00-\x1f'"\\]/.test(p)
        ? `Chr(${p.charCodeAt(0)})` : `'${p}'`).join(' & ') || "''";
}
function treeLines(node, indent, dynamics = {}) {
    const lines = [`    text = text & ${literal(indent + '<' + node.tag)};`];
    for (const [key, val] of node.attrs) {
        lines.push(`    text = text & XmlAttr('${key}', ${dynamics[key] || literal(val)});`);
    }
    lines.push(`    text = text & ${literal(node.children.length ? '>\n' : '/>\n')};`);
    node.children.forEach(child => lines.push(...treeLines(child, indent + '  ',
        dynamics.children?.[child.tag] || {})));
    if (node.children.length) lines.push(`    text = text & ${literal(indent + '</' + node.tag + '>\n')};`);
    return lines;
}
function serializers() {
    const group = template.group;
    const groupValues = {name:'title', accent_allowed:'downbeat', do_countin:'countin', countin_type:'4',
        loop_presets:'0', eighth_equals_eighth:'0', drone_enabled:'0'};
    const start = ["GroupStart(title, downbeat, countin) {", "    text = '<MetroPresetGroup';"];
    group.attrs.forEach(([key,val]) => start.push(`    text = text & XmlAttr('${key}', ${groupValues[key] || literal(val)});`));
    start.push(`    text = text & ${literal('>\n')};`, ...treeLines(group.children[0], '  '), '    return text;', '}');
    const end = ["GroupEnd() {", "    text = '';", ...treeLines(group.children[1], '  ', {
        unit:'2', eighthcount:'16', beatmask:"'21845'", beatmask64:"'21845'", accentmask:"'5393'",
        voicemask:"'0'", voicemask64:"'0'", voiceaccentmask:"'0'", allow_accent:'1', use_subdiv:'0'
    }), `    return text & ${literal('</MetroPresetGroup>\n')};`, '}'];
    const trans = {tempo:'tempo', starting_tempo:'starting', transition:'transition', transition_anchor:'anchor', transition_len:'length'};
    const preset = ["PresetXml(r, p, tempo, starting, transition, offset, length, anchor, endBeat) {", "    text = '';",
        ...treeLines(template.preset, '  ', {name:'r.name', usetempo:'1', ...trans, barcount:'p.bars', meter:'p.meter', subdiv:'p.subdiv', accentmask:'p.accentMask', beatmask:'p.beatMask',
            children: {MetroTempoMapInfo:{...trans, transition_start:'offset', transition_end_bar:'0', transition_end_beat:'endBeat'},
                MetroMeterMapInfo:{meter:'p.meter',subdiv:'p.subdiv',topcount:'p.top',notebase:'p.base',barcount:'p.bars',bardur:'p.bars',accentmask:'p.accentMask',accentmask64:'p.accentMask64',beatmask:'p.beatMask',beatmask64:'p.beatMask64'}}}),
        '    return text;', '}'];
    return [...start,'',...end,'',...preset].join('\n');
}

// Read method boundaries without interpreting strings or comments as braces.
function methods(source) {
    const result = [];
    let pos = 0;
    while (pos < source.length) {
        const head = /([A-Za-z_][A-Za-z_0-9]*)\s*\(([^)]*)\)\s*\{/g;
        head.lastIndex = pos;
        const m = head.exec(source);
        if (!m) break;
        let i = head.lastIndex, depth = 1, quote = '', comment = false;
        for (; i < source.length && depth; i++) {
            const c = source[i], next = source[i+1];
            if (comment) { if (c === '\n') comment = false; continue; }
            if (quote) { if (c === '\\') i++; else if (c === quote) quote = ''; continue; }
            if (c === '/' && next === '/') { comment = true; i++; continue; }
            if (c === "'" || c === '"') { quote = c; continue; }
            if (c === '{') depth++;
            if (c === '}') depth--;
        }
        if (depth) throw Error(`Unclosed method ${m[1]}`);
        result.push({name:m[1], params:m[2].split(',').map(s=>s.trim()).filter(Boolean), body:source.slice(head.lastIndex, i-1)});
        pos = i;
    }
    return result;
}
const data = {
    GroupName:'', RangeMode:'Whole score', FirstBar:'1', LastBar:'1', SplitMode:'Rehearsal markings',
    RepeatMode:'Follow score repeats', ClickStyle:'Accent downbeat', CombineMeasures:'True',
    TempoChanges:'True', MeterChanges:'True', GradualChanges:'True', CountInEnabled:'True', DebugLog:'False',
    ErrorText:'', SummaryText:'', WarningText:'', PreviewSelection:'',
    EditName:'', EditBars:'1', EditTop:'4', EditBase:'4', EditTempo:'120', EditEndTempo:'120',
    EditRamp:'False', EditOffset:'0', EditLength:'4', FullMet:'True', HalfMet:'False', DownbeatMet:'False',
    EditGrouping:'', EditTimingMode:'Choose handling', EditTotalCounts:'0', EditCountUnit:'Quarter notes', EditNotice:'',
    FooterText:'INDEV Sibelius · ' + version + ' · Based on MuseScore 1.7.2\nDeveloped by Skyeler Robinson · Code written by AI',
    ContactText:'Instagram: skyelerrobinson__percussion · Email: sr.percussion@icloud.com',
    RepositoryText:'GitHub: https://github.com/AgentDelta4/TEXporter',
    IssueText:'Bugs: https://github.com/AgentDelta4/TEXporter/issues'
};
const lists = {
    RangeItems:['Whole score','Sibelius selection','Measure range'],
    SplitItems:['Tempo / meter changes','Rehearsal markings','Double barlines'],
    RepeatItems:['Follow score repeats','Ignore repeats'], ClickItems:['Accent downbeat','Straight'], PreviewItems:[],
    TimingItems:['Choose handling','Keep steady clicks','Set total counts'],
    CountUnitItems:['Quarter notes','Eighth notes','Half notes','16th notes']
};
function control(type,id,title,x,y,w,h,extra={}) {
    return {type, props:{Title:title,X:x,Y:y,Width:w,Height:h,ID:id,Value:'',Method:'',SetFocus:0,
        ...(type==='Text'?{RightAlign:0}:{}), ...(type==='Button'?{DefaultButton:0}:{}), ...extra}};
}
const text=(id,title,x,y,w,h=12,value='')=>control('Text',id,title,x,y,w,h,{Value:value});
const edit=(id,value,x,y,w,extra={})=>control('Edit',id,'',x,y,w,14,{Value:value,...extra});
const combo=(id,value,list,x,y,w)=>control('ComboBox',id,'',x,y,w,14,{Value:value,ListVar:list});
const check=(id,title,value,x,y,w)=>control('CheckBox',id,title,x,y,w,14,{Value:value});
const button=(id,title,x,y,w,extra={})=>control('Button',id,title,x,y,w,16,extra);
const changed={Method:'OptionsChanged'};
const optionCombo=(id,value,list,x,y,w)=>control('ComboBox',id,'',x,y,w,14,{Value:value,ListVar:list,...changed});
const optionCheck=(id,title,value,x,y,w)=>control('CheckBox',id,title,x,y,w,14,{Value:value,...changed});
function footer(y,width) {
    return [text('footer','',10,y,width-20,28,'FooterText'),
        text('contact','',10,y+30,width-20,12,'ContactText'),
        text('repository','',10,y+44,width-20,12,'RepositoryText'),
        text('issues','',10,y+58,width-20,12,'IssueText')];
}
function editor(timing) {
    const width=440;
    const common=[
        text('name_label','Name',10,12,84),edit('name','EditName',98,10,332,{SetFocus:1}),
        text('bars_label','Bars',10,38,84),edit('bars','EditBars',98,36,108),
        text('meter_label','Meter',228,38,47),edit('top','EditTop',279,36,62),text('slash','/',346,38,12),edit('base','EditBase',362,36,68),
        text('tempo_label','Starting BPM',10,64,84),edit('tempo','EditTempo',98,62,108),
        text('grouping_label','Eighth grouping',228,64,82),edit('grouping','EditGrouping',314,62,116),
        check('ramp','Gradual transition','EditRamp',10,88,200),
        text('end_label','Ending BPM',228,90,82),edit('end','EditEndTempo',314,88,116),
        text('offset_label','Start offset (qtr)',10,116,84),edit('offset','EditOffset',98,114,108),
        text('length_label','Length (qtr)',228,116,82),edit('length','EditLength',314,114,116),
        text('notice','',10,140,420,22,'EditNotice')];
    if(timing)common.push(
        text('handling_label','Hold / free time',10,172,84),control('ComboBox','handling','',98,170,332,14,{Value:'EditTimingMode',ListVar:'TimingItems',Method:'TimingModeChanged'}),
        text('counts_label','Total counts',10,198,84),edit('counts','EditTotalCounts',98,196,108),
        text('unit_label','Unit',228,198,40),control('ComboBox','unit','',279,196,151,14,{Value:'EditCountUnit',ListVar:'CountUnitItems',Method:'CountUnitChanged'}));
    const y=timing?224:170;
    return {name:timing?'TimingEditDialog':'EditDialog',title:'TEXporter for Sibelius - INDEV: edit preset',width,height:y+101,controls:[
        ...common,...footer(y,width),button('cancel','Cancel',286,y+80,62,{EndDialog:0}),button('apply','Apply',356,y+80,74,{EndDialog:1,DefaultButton:1})]};
}
const dialogs=[
    {name:'OptionsDialog',title:'TEXporter for Sibelius - INDEV: options',width:440,height:367,controls:[
        text('name_label','Group name',10,12,78),edit('group_name','GroupName',94,10,336,{SetFocus:1}),
        text('range_label','Range',10,38,78),optionCombo('range','RangeMode','RangeItems',94,36,336),
        text('from_label','First bar',94,62,42),edit('first_bar','FirstBar',140,60,70),
        text('to_label','Last bar',242,62,42),edit('last_bar','LastBar',288,60,142),
        text('split_label','Split presets by',10,88,78),optionCombo('split','SplitMode','SplitItems',94,86,336),
        text('repeats_label','Repeat handling',10,114,78),optionCombo('repeats','RepeatMode','RepeatItems',94,112,336),
        text('click_label','Click style',10,140,78),optionCombo('click','ClickStyle','ClickItems',94,138,336),
        optionCheck('full','Full Met','FullMet',10,163,125),optionCheck('half','Half-note Met','HalfMet',146,163,135),optionCheck('downbeat','Downbeat Met','DownbeatMet',292,163,138),
        optionCheck('combine','Combine matching measures','CombineMeasures',10,185,213),optionCheck('tempo','Tempo changes','TempoChanges',232,185,198),
        optionCheck('meter','Meter changes','MeterChanges',10,207,213),optionCheck('gradual','Accelerando / ritardando','GradualChanges',232,207,198),
        optionCheck('countin','Count-in (Range Start)','CountInEnabled',10,229,213),optionCheck('debug','Debug log','DebugLog',232,229,198),
        text('summary','',10,251,420,12,'SummaryText'),
        ...footer(272,440),
        button('cancel','Cancel',286,346,62,{EndDialog:0}),button('continue','Continue',356,346,74,{EndDialog:1,DefaultButton:1})
    ]},
    {name:'PreviewDialog',title:'TEXporter for Sibelius - INDEV: preset preview',width:640,height:400,controls:[
        text('summary','',10,10,620,14,'SummaryText'),
        control('ListBox','presets','',10,30,620,202,{Value:'PreviewSelection',ListVar:'PreviewItems',AllowMultipleSelections:0,SetFocus:1}),
        text('warnings','',10,239,620,50,'WarningText'),
        ...footer(294,640),
        button('edit','Edit preset...',10,378,84,{Method:'EditPreset'}),button('options','Options...',102,378,72,{Method:'ShowOptions'}),
        button('cancel','Cancel',478,378,62,{EndDialog:0}),button('export','Export...',548,378,82,{EndDialog:1,DefaultButton:1})
    ]}, editor(false), editor(true)
];
function quoted(s) { return '"' + String(s).replace(/\\/g,'\\\\').replace(/"/g,'\\"') + '"'; }
function build() {
    const generated = serializers();
    const native = ['TEExporter.ms','ScoreDetails.ms','Metronome.ms'].map(name=>fs.readFileSync(path.join(__dirname,'src',name),'utf8')).join('\n') + '\n' + generated;
    const parsed = methods(native);
    const names = new Set();
    for (const method of parsed) { if (names.has(method.name)) throw Error("Duplicate native method: " + method.name); names.add(method.name); }
    const lines = ['{'];
    for (const m of parsed) lines.push(`\t${m.name} ${quoted('(' + m.params.join(', ') + ') {' + m.body + '}')}`);
    for (const [name,value] of Object.entries(data)) lines.push(`\t${name} ${quoted(value)}`);
    for (const [name,items] of Object.entries(lists)) {
        lines.push(`\t${name}`, '\t{', ...items.map(i=>'\t\t'+quoted(i)), '\t}');
    }
    for (const d of dialogs) {
        lines.push(`\t${d.name} "Dialog"`, '\t{', '\t\tControls', '\t\t{');
        for (const c of d.controls) {
            lines.push(`\t\t\t${c.type}`, '\t\t\t{');
            for (const [key,val] of Object.entries(c.props)) lines.push(`\t\t\t\t${key}${val===''?'':' '+quoted(val)}`);
            lines.push('\t\t\t}');
        }
        lines.push('\t\t}', `\t\tTitle ${quoted(d.title)}`, '\t\tX "0"','\t\tY "0"',`\t\tWidth "${d.width}"`,`\t\tHeight "${d.height}"`,'\t}');
    }
    lines.push('}');
    const file = path.join(__dirname,'TEXporter-Sibelius.plg');
    const bytes = Buffer.from('\ufeff' + lines.join('\r\n'), 'utf16le');
    const temporary = file + '.' + process.pid + '-' + process.hrtime.bigint() + '.tmp';
    fs.writeFileSync(temporary, bytes);
    fs.renameSync(temporary, file);
    return {file, bytes, native, parsed, data, lists, dialogs, version};
}
module.exports = {build, methods, data, lists, dialogs, version};
if (require.main === module) console.log(build().file);
