set_global('$', global.make_zjquery());

set_global('page_params', {
    realm_users: [],
    user_id: 999,
});

set_global('ui', {
    set_up_scrollbar: function () {},
});

set_global('feature_flags', {});

set_global('document', {
    hasFocus: function () {
        return true;
    },
});

set_global('blueslip', global.make_zblueslip());
set_global('channel', {});
set_global('compose_actions', {});

set_global('ui', {
    set_up_scrollbar: function () {},
    update_scrollbar: function () {},
});

zrequire('compose_fade');
zrequire('Handlebars', 'handlebars');
zrequire('templates');
zrequire('unread');
zrequire('hash_util');
zrequire('hashchange');
zrequire('narrow');
zrequire('util');
zrequire('presence');
zrequire('people');
zrequire('buddy_data');
zrequire('buddy_list');
zrequire('user_search');
zrequire('list_cursor');
zrequire('activity');

var filter_key_handlers;
set_global('keydown_util', {
    handle: (opts) => {
        filter_key_handlers = opts.handlers;
    },
});

set_global('compose_state', {});

set_global('scroll_util', {
    scroll_element_into_container: () => {},
});

set_global('popovers', {
    hide_all: function () {},
    show_userlist_sidebar: function () {
        $('.column-right').addClass('expanded');
    },
});

set_global('stream_popover', {
    show_streamlist_sidebar: function () {
        $('.column-left').addClass('expanded');
    },
});


set_global('reload', {
    is_in_progress: () => false,
});
set_global('resize', {
    resize_page_components: () => {},
});
set_global('window', 'window-stub');

const me = {
    email: 'me@zulip.com',
    user_id: 999,
    full_name: 'Me Myself',
};

const alice = {
    email: 'alice@zulip.com',
    user_id: 1,
    full_name: 'Alice Smith',
};
const fred = {
    email: 'fred@zulip.com',
    user_id: 2,
    full_name: "Fred Flintstone",
};
const jill = {
    email: 'jill@zulip.com',
    user_id: 3,
    full_name: 'Jill Hill',
};
const mark = {
    email: 'mark@zulip.com',
    user_id: 4,
    full_name: 'Marky Mark',
};
const norbert = {
    email: 'norbert@zulip.com',
    user_id: 5,
    full_name: 'Norbert Oswald',
};

const zoe = {
    email: 'zoe@example.com',
    user_id: 6,
    full_name: 'Zoe Yang',
};

const people = global.people;

people.add_in_realm(alice);
people.add_in_realm(fred);
people.add_in_realm(jill);
people.add_in_realm(mark);
people.add_in_realm(norbert);
people.add_in_realm(zoe);
people.add_in_realm(me);
people.initialize_current_user(me.user_id);

const real_update_huddles = activity.update_huddles;
activity.update_huddles = () => {};

global.compile_template('user_presence_row');
global.compile_template('user_presence_rows');
global.compile_template('group_pms');

const presence_info = {};
presence_info[alice.user_id] = { status: 'inactive' };
presence_info[fred.user_id] = { status: 'active' };
presence_info[jill.user_id] = { status: 'active' };

presence.presence_info = presence_info;

(function test_get_status() {
    assert.equal(presence.get_status(page_params.user_id), "active");
    assert.equal(presence.get_status(alice.user_id), "inactive");
    assert.equal(presence.get_status(fred.user_id), "active");
    assert.equal(presence.get_status(zoe.user_id), "offline");
}());

(function test_reload_defaults() {
    blueslip.set_test_data('warn', 'get_filter_text() is called before initialization');
    assert.equal(activity.get_filter_text(), '');
    assert(blueslip.get_test_logs('warn').length, 1);
    blueslip.clear_test_data();
}());

(function test_sort_users() {
    const user_ids = [alice.user_id, fred.user_id, jill.user_id];

    buddy_data.sort_users(user_ids);

    assert.deepEqual(user_ids, [
        fred.user_id,
        jill.user_id,
        alice.user_id,
    ]);
}());

(function test_process_loaded_messages() {

    const huddle1 = 'jill@zulip.com,norbert@zulip.com';
    const timestamp1 = 1382479029; // older

    const huddle2 = 'alice@zulip.com,fred@zulip.com';
    const timestamp2 = 1382479033; // newer

    const old_timestamp = 1382479000;

    const messages = [
        {
            type: 'private',
            display_recipient: [{id: jill.user_id}, {id: norbert.user_id}],
            timestamp: timestamp1,
        },
        {
            type: 'stream',
        },
        {
            type: 'private',
            display_recipient: [{id: me.user_id}], // PM to myself
        },
        {
            type: 'private',
            display_recipient: [{id: alice.user_id}, {id: fred.user_id}],
            timestamp: timestamp2,
        },
        {
            type: 'private',
            display_recipient: [{id: fred.user_id}, {id: alice.user_id}],
            timestamp: old_timestamp,
        },
    ];

    activity.process_loaded_messages(messages);

    const user_ids_string1 = people.emails_strings_to_user_ids_string(huddle1);
    const user_ids_string2 = people.emails_strings_to_user_ids_string(huddle2);
    assert.deepEqual(activity.get_huddles(), [user_ids_string2, user_ids_string1]);
}());

(function test_full_huddle_name() {
    function full_name(emails_string) {
        const user_ids_string = people.emails_strings_to_user_ids_string(emails_string);
        return activity.full_huddle_name(user_ids_string);
    }

    assert.equal(
        full_name('alice@zulip.com,jill@zulip.com'),
        'Alice Smith, Jill Hill');

    assert.equal(
        full_name('alice@zulip.com,fred@zulip.com,jill@zulip.com'),
        'Alice Smith, Fred Flintstone, Jill Hill');
}());

(function test_short_huddle_name() {
    function short_name(emails_string) {
        const user_ids_string = people.emails_strings_to_user_ids_string(emails_string);
        return activity.short_huddle_name(user_ids_string);
    }

    assert.equal(
        short_name('alice@zulip.com'),
        'Alice Smith');

    assert.equal(
        short_name('alice@zulip.com,jill@zulip.com'),
        'Alice Smith, Jill Hill');

    assert.equal(
        short_name('alice@zulip.com,fred@zulip.com,jill@zulip.com'),
        'Alice Smith, Fred Flintstone, Jill Hill');

    assert.equal(
        short_name('alice@zulip.com,fred@zulip.com,jill@zulip.com,mark@zulip.com'),
        'Alice Smith, Fred Flintstone, Jill Hill, + 1 other');

    assert.equal(
        short_name('alice@zulip.com,fred@zulip.com,jill@zulip.com,mark@zulip.com,norbert@zulip.com'),
        'Alice Smith, Fred Flintstone, Jill Hill, + 2 others');

}());

(function test_huddle_fraction_present() {
    let huddle = 'alice@zulip.com,fred@zulip.com,jill@zulip.com,mark@zulip.com';
    huddle = people.emails_strings_to_user_ids_string(huddle);

    var presence_info = {};
    presence_info[alice.user_id] = { status: 'active' }; // counts as present
    presence_info[fred.user_id] = { status: 'idle' }; // doest not count as present
    // jill not in list
    presence_info[mark.user_id] = { status: 'offline' }; // does not count
    presence.presence_info = presence_info;

    assert.equal(
        activity.huddle_fraction_present(huddle),
        '0.50');

    huddle = 'alice@zulip.com,fred@zulip.com,jill@zulip.com,mark@zulip.com';
    huddle = people.emails_strings_to_user_ids_string(huddle);
    presence_info = {};
    presence_info[alice.user_id] = { status: 'idle' };
    presence_info[fred.user_id] = { status: 'idle' }; // does not count as present
    // jill not in list
    presence_info[mark.user_id] = { status: 'offline' }; // does not count
    presence.presence_info = presence_info;

    assert.equal(
        activity.huddle_fraction_present(huddle),
        false);
}());

presence.presence_info = {};
presence.presence_info[alice.user_id] = { status: activity.IDLE };
presence.presence_info[fred.user_id] = { status: activity.ACTIVE };
presence.presence_info[jill.user_id] = { status: activity.ACTIVE };
presence.presence_info[mark.user_id] = { status: activity.IDLE };
presence.presence_info[norbert.user_id] = { status: activity.ACTIVE };
presence.presence_info[zoe.user_id] = { status: activity.ACTIVE };
presence.presence_info[me.user_id] = { status: activity.ACTIVE };

function reset_setup() {
    set_global('$', global.make_zjquery());
    activity.set_cursor_and_filter();

    buddy_list.container = $('#user_presences');
    const stub = $.create('first elem stub');
    stub.first = () => [];
    buddy_list.container.set_find_results('li.user_sidebar_entry', stub);
}

reset_setup();

(function test_presence_list_full_update() {
    $('.user-list-filter').focus();
    compose_state.recipient = () => fred.email;
    compose_fade.set_focused_recipient("private");

    const users = activity.build_user_sidebar();
    assert.deepEqual(users, [
        {
            name: 'Fred Flintstone',
            href: '#narrow/pm-with/2-fred',
            user_id: fred.user_id,
            num_unread: 0,
            type: 'active',
            type_desc: 'is active',
            faded: false,
        },
        {
            name: 'Jill Hill',
            href: '#narrow/pm-with/3-jill',
            user_id: jill.user_id,
            num_unread: 0,
            type: 'active',
            type_desc: 'is active',
            faded: true,
        },
        {
            name: 'Norbert Oswald',
            href: '#narrow/pm-with/5-norbert',
            user_id: norbert.user_id,
            num_unread: 0,
            type: 'active',
            type_desc: 'is active',
            faded: true,
        },
        {
            name: 'Zoe Yang',
            href: '#narrow/pm-with/6-zoe',
            user_id: zoe.user_id,
            num_unread: 0,
            type: 'active',
            type_desc: 'is active',
            faded: true,
        },
        {
            name: 'Alice Smith',
            href: '#narrow/pm-with/1-alice',
            user_id: alice.user_id,
            num_unread: 0,
            type: 'idle',
            type_desc: 'is not active',
            faded: true,
        },
        {
            name: 'Marky Mark',
            href: '#narrow/pm-with/4-mark',
            user_id: mark.user_id,
            num_unread: 0,
            type: 'idle',
            type_desc: 'is not active',
            faded: true,
        },
    ]);
}());

function simulate_right_column_buddy_list() {
    $('.user-list-filter').closest = function (selector) {
        assert.equal(selector, ".app-main [class^='column-']");
        return $.create('right-sidebar').addClass('column-right');
    };
}

function simulate_left_column_buddy_list() {
    $('.user-list-filter').closest = function (selector) {
        assert.equal(selector, ".app-main [class^='column-']");
        return $.create('left-sidebar').addClass('column-left');
    };
}

function simulate_list_items(items) {
    const list = {
        length: items.length,
        eq: (i) => items[i],
        first: () => items[0] || {length: 0},
    };
    $('#user_presences').set_find_results('li.user_sidebar_entry', list);

    _.each(items, (item, i) => {
        item.next = () => items[i+1] || {length: 0};
        item.prev = () => items[i-1] || {length: 0};
    });
}

function buddy_list_add(user_id, stub) {
    if (stub.attr) {
        stub.attr('data-user-id', user_id);
    }
    const sel = `li.user_sidebar_entry[data-user-id='${user_id}']`;
    $('#user_presences').set_find_results(sel, stub);
}

(function test_PM_update_dom_counts() {
    const value = $.create('alice-value');
    const count = $.create('alice-count');
    const pm_key = alice.user_id.toString();
    const li = $.create('alice stub');
    buddy_list_add(pm_key, li);
    count.set_find_results('.value', value);
    li.set_find_results('.count', count);
    count.set_parent(li);

    const counts = new Dict();
    counts.set(pm_key, 5);
    li.addClass('user_sidebar_entry');

    activity.update_dom_with_unread_counts({pm_count: counts});
    assert(li.hasClass('user-with-count'));
    assert.equal(value.text(), 5);

    counts.set(pm_key, 0);

    activity.update_dom_with_unread_counts({pm_count: counts});
    assert(!li.hasClass('user-with-count'));
    assert.equal(value.text(), '');
}());

(function test_group_update_dom_counts() {
    const value = $.create('alice-fred-value');
    const count = $.create('alice-fred-count');
    const pm_key = alice.user_id.toString() + "," + fred.user_id.toString();
    const li_selector = "li.group-pms-sidebar-entry[data-user-ids='" + pm_key + "']";
    const li = $(li_selector);
    count.set_find_results('.value', value);
    li.set_find_results('.count', count);
    count.set_parent(li);

    const counts = new Dict();
    counts.set(pm_key, 5);
    li.addClass('group-pms-sidebar-entry');

    activity.update_dom_with_unread_counts({pm_count: counts});
    assert(li.hasClass('group-with-count'));
    assert.equal(value.text(), 5);

    counts.set(pm_key, 0);

    activity.update_dom_with_unread_counts({pm_count: counts});
    assert(!li.hasClass('group-with-count'));
    assert.equal(value.text(), '');
}());

reset_setup();

(function test_handlers() {
    // This is kind of weak coverage; we are mostly making sure that
    // keys and clicks got mapped to functions that don't crash.

    const alice_li = $.create('alice stub');
    const fred_li = $.create('fred stub');

    (function test_click_filter() {
        const e = {
            stopPropagation: () => {},
        };

        simulate_list_items([alice_li, fred_li]);
        const handler = $('.user-list-filter').get_on_handler('focus');
        handler(e);

        simulate_list_items([]);
        handler(e);
    }());

    (function test_click_header_filter() {
        const e = {};
        const handler = $('#userlist-header').get_on_handler('click');

        simulate_right_column_buddy_list();

        handler(e);
        // and click again
        handler(e);
    }());

    (function test_filter_keys() {
        simulate_list_items([alice_li, fred_li]);
        buddy_list_add(alice.user_id, alice_li);
        buddy_list_add(fred.user_id, fred_li);

        activity.user_cursor.go_to(alice.user_id);
        filter_key_handlers.down_arrow();
        filter_key_handlers.up_arrow();
        filter_key_handlers.up_arrow();
        filter_key_handlers.down_arrow();
        filter_key_handlers.down_arrow();

        simulate_list_items([]);
        filter_key_handlers.down_arrow();
        filter_key_handlers.up_arrow();
    }());

    (function test_enter_key() {
        var narrowed;

        narrow.by = (method, email) => {
            assert.equal(email, 'alice@zulip.com');
            narrowed = true;
        };

        $('.user-list-filter').val('al');
        buddy_list_add(alice.user_id, alice_li);
        activity.user_cursor.go_to(alice.user_id);

        filter_key_handlers.enter_key();
        assert(narrowed);

        // get line coverage for cleared case
        activity.user_cursor.clear();
        filter_key_handlers.enter_key();
    }());

    (function test_click_handler() {
        // We wire up the click handler in click_handlers.js,
        // so this just tests the called function.
        var narrowed;

        narrow.by = (method, email) => {
            assert.equal(email, 'alice@zulip.com');
            narrowed = true;
        };

        buddy_list_add(alice.user_id, alice_li);
        activity.narrow_for_user({li: alice_li});
        assert(narrowed);
    }());

    (function test_blur_filter() {
        const e = {};
        const handler = $('.user-list-filter').get_on_handler('blur');
        handler(e);
    }());
}());

presence.presence_info = {};
presence.presence_info[alice.user_id] = { status: activity.ACTIVE };
presence.presence_info[fred.user_id] = { status: activity.ACTIVE };
presence.presence_info[jill.user_id] = { status: activity.ACTIVE };
presence.presence_info[mark.user_id] = { status: activity.IDLE };
presence.presence_info[norbert.user_id] = { status: activity.ACTIVE };
presence.presence_info[zoe.user_id] = { status: activity.ACTIVE };

reset_setup();

(function test_filter_user_ids() {
    const user_filter = $('.user-list-filter');
    user_filter.val(''); // no search filter

    function get_user_ids() {
        var filter_text = activity.get_filter_text();
        var user_ids = buddy_data.get_filtered_and_sorted_user_ids(filter_text);
        return user_ids;
    }

    var user_ids = buddy_data.get_filtered_and_sorted_user_ids();
    assert.deepEqual(user_ids, [
        alice.user_id,
        fred.user_id,
        jill.user_id,
        norbert.user_id,
        zoe.user_id,
        mark.user_id,
    ]);

    user_filter.val('abc'); // no match
    user_ids = get_user_ids();
    assert.deepEqual(user_ids, []);

    user_filter.val('fred'); // match fred
    user_ids = get_user_ids();
    assert.deepEqual(user_ids, [fred.user_id]);

    user_filter.val('fred,alice'); // match fred and alice
    user_ids = get_user_ids();
    assert.deepEqual(user_ids, [alice.user_id, fred.user_id]);

    user_filter.val('fr,al'); // match fred and alice partials
    user_ids = get_user_ids();
    assert.deepEqual(user_ids, [alice.user_id, fred.user_id]);

    presence.presence_info[alice.user_id] = { status: activity.IDLE };
    user_filter.val('fr,al'); // match fred and alice partials and idle user
    user_ids = get_user_ids();
    assert.deepEqual(user_ids, [fred.user_id, alice.user_id]);

    $.stub_selector('.user-list-filter', []);
    presence.presence_info[alice.user_id] = { status: activity.ACTIVE };
    user_ids = get_user_ids();
    assert.deepEqual(user_ids, [alice.user_id, fred.user_id]);
}());

(function test_insert_one_user_into_empty_list() {
    const alice_li = $.create('alice list item');

    let appended_html;
    $('#user_presences').append = function (html) {
        appended_html = html;
        buddy_list_add(alice.user_id, alice_li);
    };

    var removed;
    const remove_stub = {
        remove: () => {
            removed = true;
        },
    };
    buddy_list_add(alice.user_id, remove_stub);

    simulate_list_items([]);
    activity.insert_user_into_list(alice.user_id);
    assert(appended_html.indexOf('data-user-id="1"') > 0);
    assert(appended_html.indexOf('user_active') > 0);
    assert(removed);
}());

reset_setup();

(function test_insert_fred_after_alice() {
    const alice_li = $.create('alice list item');
    const fred_li = $.create('fred list item');

    alice_li.attr('data-user-id', alice.user_id);

    let appended_html;
    $('#user_presences').append = function (html) {
        appended_html = html;
        buddy_list_add(fred.user_id, fred_li);
    };

    var removed;
    const remove_stub = {
        remove: () => {
            removed = true;
        },
    };
    buddy_list_add(fred.user_id, remove_stub);

    simulate_list_items([alice_li]);

    activity.insert_user_into_list(fred.user_id);

    assert(appended_html.indexOf('data-user-id="2"') > 0);
    assert(appended_html.indexOf('user_active') > 0);
    assert(removed);
}());

reset_setup();

(function test_insert_fred_before_jill() {
    const fred_li = $.create('fred-li');
    const jill_li = $.create('jill-li');

    jill_li.attr('data-user-id', jill.user_id);

    var before_html;
    jill_li.before = function (html) {
        before_html = html;
        buddy_list_add(fred.user_id, fred_li);
    };

    var removed;
    const remove_stub = {
        remove: () => {
            removed = true;
        },
    };
    buddy_list_add(fred.user_id, remove_stub);

    simulate_list_items([jill_li]);

    activity.insert_user_into_list(fred.user_id);

    assert(before_html.indexOf('data-user-id="2"') > 0);
    assert(before_html.indexOf('user_active') > 0);
    assert(removed);
}());

// Reset jquery here.
reset_setup();

(function test_insert_unfiltered_user_with_filter() {
    // This test only tests that we do not explode when
    // try to insert Fred into a list where he does not
    // match the search filter.
    const user_filter = $('.user-list-filter');
    user_filter.val('do-not-match-filter');
    activity.insert_user_into_list(fred.user_id);
}());

(function test_realm_presence_disabled() {
    page_params.realm_presence_disabled = true;
    unread.suppress_unread_counts = false;

    activity.insert_user_into_list();
    activity.build_user_sidebar();

    real_update_huddles();
}());

// Mock the jquery is func
$('.user-list-filter').is = function (sel) {
    if (sel === ':focus') {
        return $('.user-list-filter').is_focused();
    }
};

$('.user-list-filter').parent = function () {
    return $('#user-list .input-append');
};

(function test_clear_search() {
    $('.user-list-filter').val('somevalue');
    activity.user_filter.clear_search();
    assert.equal($('.user-list-filter').val(), '');
    activity.user_filter.clear_search();
    assert($('#user-list .input-append').hasClass('notdisplayed'));
}());

(function test_escape_search() {
    $('.user-list-filter').val('somevalue');
    activity.escape_search();
    assert.equal($('.user-list-filter').val(), '');
    activity.escape_search();
    assert($('#user-list .input-append').hasClass('notdisplayed'));
}());

reset_setup();

(function () {
    const alice_li = $.create('alice stub');
    simulate_list_items([alice_li]);
}());

(function test_initiate_search() {
    $('.user-list-filter').blur();
    simulate_right_column_buddy_list();
    activity.initiate_search();
    assert.equal($('.column-right').hasClass('expanded'), true);
    assert.equal($('.user-list-filter').is_focused(), true);

    simulate_left_column_buddy_list();
    activity.initiate_search();
    assert.equal($('.column-left').hasClass('expanded'), true);
    assert.equal($('.user-list-filter').is_focused(), true);
}());

(function test_toggle_filter_display() {
    activity.user_filter.toggle_filter_displayed();
    assert($('#user-list .input-append').hasClass('notdisplayed'));
    $('.user-list-filter').closest = function (selector) {
        assert.equal(selector, ".app-main [class^='column-']");
        return $.create('sidebar').addClass('column-right');
    };
    activity.user_filter.toggle_filter_displayed();
    assert.equal($('#user-list .input-append').hasClass('notdisplayed'), false);
}());

(function test_searching() {
    $('.user-list-filter').focus();
    assert.equal(activity.searching(), true);
    $('.user-list-filter').blur();
    assert.equal(activity.searching(), false);
}());

(function test_update_huddles_and_redraw() {
    const value = $.create('alice-fred-value');
    const count = $.create('alice-fred-count');
    const pm_key = alice.user_id.toString() + "," + fred.user_id.toString();
    const li_selector = "li.group-pms-sidebar-entry[data-user-ids='" + pm_key + "']";
    const li = $(li_selector);
    count.set_find_results('.value', value);
    li.set_find_results('.count', count);
    count.set_parent(li);

    const real_get_huddles = activity.get_huddles;
    activity.get_huddles = () => ['1,2'];
    activity.update_huddles = real_update_huddles;
    activity.redraw();
    assert.equal($('#group-pm-list').hasClass('show'), false);
    page_params.realm_presence_disabled = false;
    activity.redraw();
    assert.equal($('#group-pm-list').hasClass('show'), true);
    activity.get_huddles = () => [];
    activity.redraw();
    assert.equal($('#group-pm-list').hasClass('show'), false);
    activity.get_huddles = real_get_huddles;
    activity.update_huddles = function () {};
}());

reset_setup();

(function test_set_user_status() {
    const server_time = 500;
    const info = {
        website: {
            status: "active",
            timestamp: server_time,
        },
    };

    buddy_data.matches_filter = () => true;

    const alice_li = $.create('alice stub');
    buddy_list_add(alice.user_id, alice_li);

    var inserted;
    buddy_list.insert_or_move = () => {
        inserted = true;
    };

    presence.presence_info[alice.user_id] = undefined;
    activity.set_user_status(me.email, info, server_time);
    assert(!inserted);

    assert.equal(presence.presence_info[alice.user_id], undefined);
    activity.set_user_status(alice.email, info, server_time);
    assert(inserted);

    const expected = { status: 'active', mobile: false, last_active: 500 };
    assert.deepEqual(presence.presence_info[alice.user_id], expected);

    activity.set_user_status(alice.email, info, server_time);
    blueslip.set_test_data('warn', 'unknown email: foo@bar.com');
    blueslip.set_test_data('error', 'Unknown email for get_user_id: foo@bar.com');
    activity.set_user_status('foo@bar.com', info, server_time);
    assert(blueslip.get_test_logs('warn').length, 1);
    assert(blueslip.get_test_logs('error').length, 1);
    blueslip.clear_test_data();
}());

(function test_initialize() {
    $.stub_selector('html', {
        on: function (name, func) {
            func();
        },
    });
    $(window).focus = func => func();
    $(window).idle = () => {};

    channel.post = function (payload) {
        payload.success({});
    };
    global.server_events = {
        check_for_unsuspend: function () {},
    };
    activity.has_focus = false;
    activity.initialize();
    assert(!activity.new_user_input);
    assert(!$('#zephyr-mirror-error').hasClass('show'));
    assert.equal(page_params.presences, undefined);
    assert(activity.has_focus);
    $(window).idle = function (params) {
        params.onIdle();
    };
    channel.post = function (payload) {
        payload.success({
            zephyr_mirror_active: false,
        });
    };
    global.setInterval = (func) => func();

    activity.initialize();
    assert($('#zephyr-mirror-error').hasClass('show'));
    assert(!activity.new_user_input);
    assert(!activity.has_focus);

    // Now execute the reload-in-progress code path
    reload.is_in_progress = function () {
        return true;
    };
    activity.initialize();
}());
