const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
module.exports = function load(name) {
    const context = vm.createContext({console});
    const filename = path.join(__dirname, '../plugin/lib', name + '.js');
    vm.runInContext(fs.readFileSync(filename, 'utf8'), context, {filename});
    return context;
};
