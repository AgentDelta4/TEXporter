// Only reusable preferences are persisted; score-specific ranges and edits are not.
function normalize(value) {
    value = value || {};
    function choice(key, choices, fallback) { return choices.indexOf(value[key]) >= 0 ? value[key] : fallback; }
    function flag(key, fallback) { return typeof value[key] === 'boolean' ? value[key] : fallback; }
    return {splitBy:choice('splitBy',['settings','rehearsal','double'],'settings'),
        repeatMode:choice('repeatMode',['follow','ignore'],'follow'),
        accentMode:choice('accentMode',['straight','downbeat'],'downbeat'),
        combine:flag('combine',true), readTempo:flag('readTempo',true), readMeter:flag('readMeter',true),
        readRamps:flag('readRamps',true), debug:flag('debug',false),
        countInEnabled:flag('countInEnabled',true), fullMet:flag('fullMet',true),
        halfMet:flag('halfMet',false), downbeatMet:flag('downbeatMet',false)};
}
function decode(text) {
    try { return normalize(JSON.parse(String(text || '{}'))); }
    catch (error) { return normalize({}); }
}
function encode(value) { return JSON.stringify(normalize(value)); }
