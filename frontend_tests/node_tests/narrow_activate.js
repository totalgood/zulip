set_global('$', global.make_zjquery());

zrequire('narrow_state');
zrequire('stream_data');
zrequire('Filter', 'js/filter');
zrequire('unread');
zrequire('narrow');

set_global('blueslip', {});
set_global('channel', {});
set_global('compose_actions', {});
set_global('current_msg_list', {});
set_global('hashchange', {});
set_global('home_msg_list', {});
set_global('message_fetch', {});
set_global('message_list', {});
set_global('message_scroll', {});
set_global('message_util', {});
set_global('notifications', {});
set_global('page_params', {});
set_global('search', {});
set_global('stream_list', {});
set_global('top_left_corner', {});
set_global('ui_util', {});
set_global('unread_ops', {});


var noop = () => {};
//
// We have strange hacks in narrow.activate to sleep 0
// seconds.
global.patch_builtin('setTimeout', (f, t) => {
    assert.equal(t, 0);
    f();
});

function stub_trigger(f) {
    set_global('document', 'document-stub');
    $('document-stub').trigger = f;
    $.Event = (name) => {
        assert.equal(name, 'narrow_activated.zulip');
    };
}

var denmark = {
    subscribed: false,
    color: 'blue',
    name: 'Denmark',
    stream_id: 1,
    in_home_view: false,
};
stream_data.add_sub('Denmark', denmark);

function test_helper() {
    var events = [];

    function stub(module_name, func_name) {
        global[module_name][func_name] = () => {
            events.push(module_name + '.' + func_name);
        };
    }

    stub('compose_actions', 'on_narrow');
    stub('hashchange', 'save_narrow');
    stub('message_scroll', 'hide_indicators');
    stub('notifications', 'clear_compose_notifications');
    stub('notifications', 'redraw_title');
    stub('search', 'update_button_visibility');
    stub('stream_list', 'handle_narrow_activated');
    stub('top_left_corner', 'handle_narrow_activated');
    stub('ui_util', 'change_tab_to');
    stub('unread_ops', 'process_visible');

    stub_trigger(() => { events.push('trigger event'); });

    blueslip.debug = noop;

    message_util.add_messages = (messages, target_list, opts) => {
        // The real function here doesn't do any more than this
        // that we care about here.
        target_list.add_messages(messages, opts);
    };

    return {
        clear: () => {
            events = [];
        },
        push_event: (event) => {
            events.push(event);
        },
        assert_events: (expected_events) => {
            assert.deepEqual(expected_events, events);
        },
    };
}

function stub_message_list() {
    message_list.MessageList = function (table_name, filter) {
        var list = this;
        this.messages = [];
        this.filter = filter;
        this.view = {
            set_message_offset: function (offset) {
                list.view.offset = offset;
            },
        };

        return this;
    };

    message_list.MessageList.prototype = {
        add_messages: function (messages) {
            var predicate = this.filter.predicate();
            messages = _.filter(messages, predicate);
            this.messages = this.messages.concat(messages);
        },

        get: function (msg_id) {
            var msg = _.find(this.messages, (msg) => {
                return msg.id === msg_id;
            });
            return msg;
        },

        empty: function () {
            return this.messages.length === 0;
        },

        select_id: function (msg_id) {
            this.selected_id = msg_id;
        },
    };
}

(function test_basics() {
    stub_message_list();

    var helper = test_helper();
    var terms = [
        { operator: 'stream', operand: 'Denmark' },
    ];

    var selected_id = 1000;

    var selected_message = {
        id: selected_id,
        type: 'stream',
        stream_id: denmark.stream_id,
    };

    var messages = [selected_message];

    var row = {
        length: 1,
        offset: () => { return {top: 25}; },
    };

    current_msg_list.selected_id = () => { return -1; };
    current_msg_list.get_row = () => { return row; };

    message_list.all = {
        all_messages: () => {
            return messages;
        },
        get: (msg_id) => {
            assert.equal(msg_id, selected_id);
            return selected_message;
        },
    };

    var cont;

    message_fetch.load_messages_for_narrow = (opts) => {
        cont = opts.cont;

        assert.deepEqual(opts, {
            cont: opts.cont,
            then_select_id: 1000,
            use_first_unread_anchor: false,
        });
    };

    narrow.activate(terms, {
        then_select_id: selected_id,
    });

    assert.equal(message_list.narrowed.selected_id, selected_id);
    assert.equal(message_list.narrowed.view.offset, 25);

    helper.assert_events([
        'notifications.clear_compose_notifications',
        'notifications.redraw_title',
        'ui_util.change_tab_to',
        'message_scroll.hide_indicators',
        'unread_ops.process_visible',
        'hashchange.save_narrow',
        'search.update_button_visibility',
        'compose_actions.on_narrow',
        'top_left_corner.handle_narrow_activated',
        'stream_list.handle_narrow_activated',
        'trigger event',
    ]);

    channel.post = (opts) => {
        assert.equal(opts.url, '/json/report/narrow_times');
        helper.push_event('report narrow times');
    };

    helper.clear();
    cont();
    helper.assert_events([
        'report narrow times',
    ]);

}());
