// Build the native save picker's initial path from MuseScore's Scores preference.
function localPath(value) {
    var path = String(value || '');
    if (/^file:\/\//i.test(path)) {
        var match = /^file:\/\/([^/]*)(\/.*)$/i.exec(path);
        if (!match) throw new Error('Cannot read the Scores folder path.');
        path = decodeURIComponent(match[2]);
        if (match[1] && match[1].toLowerCase() !== 'localhost')
            path = '//' + match[1] + path;
        else if (/^\/[A-Za-z]:\//.test(path)) path = path.slice(1);
    }
    return path.replace(/\\/g, '/');
}
function scoresFilePath(configuredFolder, filename) {
    var folder = localPath(configuredFolder);
    if (!folder) {
        throw new Error('Scores folder is not saved in MuseScore preferences. Choose it in Edit → Preferences → Folders → Scores, click OK, and retry.');
    }
    if (!/^(?:[A-Za-z]:\/|\/)/.test(folder))
        throw new Error('The Scores folder must be an absolute path. Check Preferences → Folders → Scores.');
    if (!filename || /[\/\\]/.test(filename)) throw new Error('Invalid export filename.');
    return folder.replace(/\/+$/, '') + '/' + filename;
}
