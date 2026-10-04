'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { harness, analyze } = require('./helpers.cjs');

test('differently cased or separated destinations cannot overwrite an exported version', () => {
    for (const later of ['c:/scores/Full.tetmetgroup', 'C:\\Scores\\FULL.tetmetgroup']) {
        const h = harness([{}], undefined, { FullMet: true, HalfMet: true });
        analyze(h);
        let picks = 0;
        h.Sibelius.SelectFileToSave = () => ({ NameWithExt: picks++ === 0 ? 'C:/Scores/Full.tetmetgroup' : later });
        assert.equal(h.call('ExportFile'), false);
        assert.match(h.globals.ErrorText, /different file/);
        assert.equal(picks, 2);
        assert.equal(h.files.size, 1);
        assert.match(h.files.get('C:/Scores/Full.tetmetgroup'), /name="Sibelius test \[Full Met\]"/);
    }
});
