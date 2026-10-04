const fs = require('node:fs');
const path = require('node:path');
const load = require('./load.cjs');
const te = load('TonalEnergy'), defaults = load('Template').defaults;
const {regions} = JSON.parse(fs.readFileSync(path.join(__dirname,'../samples/Example-model.json'),'utf8'));
const outputs = te.serializeExports('Example',regions,
    {fullMet:true,halfMet:true,downbeatMet:true,countInEnabled:true},defaults);
for (const output of outputs) {
    fs.writeFileSync(path.join(__dirname,'../samples',output.filename),output.text);
}
console.log('Generated Full Met, Half-note Met and Downbeat Met examples with the native Range Start count-in.');
