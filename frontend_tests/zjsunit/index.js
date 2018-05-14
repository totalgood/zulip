var path = require('path');
var fs = require('fs');

global.assert = require('assert');
require('node_modules/string.prototype.codepointat/codepointat.js');

global.Dict = require('js/dict');
global._ = require('node_modules/underscore/underscore.js');
var _ = global._;

// Create a helper function to avoid sneaky delays in tests.
function immediate(f) {
    return () => {
        return f();
    };
}

// Find the files we need to run.
var finder = require('./finder.js');
var files = finder.find_files_to_run(); // may write to console
if (_.isEmpty(files)) {
    throw "No tests found";
}

// Set up our namespace helpers.
var namespace = require('./namespace.js');
global.set_global = namespace.set_global;
global.patch_builtin = namespace.patch_builtin;
global.zrequire = namespace.zrequire;
global.stub_out_jquery = namespace.stub_out_jquery;
global.with_overrides = namespace.with_overrides;

// Set up stub helpers.
var stub = require('./stub.js');
global.with_stub = stub.with_stub;

// Set up helpers to render templates.
var render = require('./render.js');
global.make_sure_all_templates_have_been_compiled =
    render.make_sure_all_templates_have_been_compiled;
global.find_included_partials = render.find_included_partials;
global.compile_template = render.compile_template;
global.render_template = render.render_template;
global.walk = render.walk;

// Set up fake jQuery
global.make_zjquery = require('./zjquery.js').make_zjquery;

// Set up fake blueslip
global.make_zblueslip = require('./zblueslip.js').make_zblueslip;

// Set up fake translation
global.stub_i18n = require('./i18n.js');

var noop = function () {};

// Set up fake module.hot
// eslint-disable-next-line no-native-reassign
module = require('module');
module.prototype.hot = {
    accept: noop,
};

// Set up fixtures.
global.read_fixture_data = (fn) => {
    var full_fn = path.join(__dirname, '../../zerver/tests/fixtures/', fn);
    var data = JSON.parse(fs.readFileSync(full_fn, 'utf8', 'r'));
    return data;
};

// Set up bugdown comparison helper
global.bugdown_assert = require('./bugdown_assert.js');

files.forEach(function (file) {
    global.patch_builtin('setTimeout', noop);
    global.patch_builtin('setInterval', noop);
    _.throttle = immediate;
    _.debounce = immediate;

    console.info('running tests for ' + file.name);
    render.init();
    require(file.full_name);
    namespace.restore();
});
