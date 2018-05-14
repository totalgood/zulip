var narrow = (function () {

var exports = {};

var unnarrow_times;

function report_narrow_time(initial_core_time, initial_free_time, network_time) {
    channel.post({
        url: '/json/report/narrow_times',
        data: {initial_core: initial_core_time.toString(),
               initial_free: initial_free_time.toString(),
               network: network_time.toString()},
    });
}

function maybe_report_narrow_time(msg_list) {
    if (msg_list.network_time === undefined || msg_list.initial_core_time === undefined ||
        msg_list.initial_free_time === undefined) {
        return;
    }
    report_narrow_time(msg_list.initial_core_time - msg_list.start_time,
                       msg_list.initial_free_time - msg_list.start_time,
                       msg_list.network_time - msg_list.start_time);

}

function report_unnarrow_time() {
    if (unnarrow_times === undefined ||
        unnarrow_times.start_time === undefined ||
        unnarrow_times.initial_core_time === undefined ||
        unnarrow_times.initial_free_time === undefined) {
        return;
    }

    var initial_core_time = unnarrow_times.initial_core_time - unnarrow_times.start_time;
    var initial_free_time = unnarrow_times.initial_free_time - unnarrow_times.start_time;

    channel.post({
        url: '/json/report/unnarrow_times',
        data: {initial_core: initial_core_time.toString(),
               initial_free: initial_free_time.toString()},
    });

    unnarrow_times = {};
}

exports.save_pre_narrow_offset_for_reload = function () {
    if (current_msg_list.selected_id() !== -1) {
        if (current_msg_list.selected_row().length === 0) {
            blueslip.debug("narrow.activate missing selected row", {
                selected_id: current_msg_list.selected_id(),
                selected_idx: current_msg_list.selected_idx(),
                selected_idx_exact: current_msg_list._items.indexOf(
                    current_msg_list.get(current_msg_list.selected_id())),
                render_start: current_msg_list.view._render_win_start,
                render_end: current_msg_list.view._render_win_end,
            });
        }
        current_msg_list.pre_narrow_offset = current_msg_list.selected_row().offset().top;
    }
};

exports.narrow_title = "home";
exports.activate = function (raw_operators, opts) {
    var start_time = new Date();
    var was_narrowed_already = narrow_state.active();
    // most users aren't going to send a bunch of a out-of-narrow messages
    // and expect to visit a list of narrows, so let's get these out of the way.
    notifications.clear_compose_notifications();

    if (raw_operators.length === 0) {
        return exports.deactivate();
    }
    var filter = new Filter(raw_operators);
    var operators = filter.operators();

    // Take the most detailed part of the narrow to use as the title.
    // If the operator is something other than "stream", "topic", or
    // "is", we shouldn't update the narrow title
    if (filter.has_operator("stream")) {
        if (filter.has_operator("topic")) {
            exports.narrow_title = filter.operands("topic")[0];
        } else {
            exports.narrow_title = filter.operands("stream")[0];
        }
    } else if (filter.has_operator("is")) {
        exports.narrow_title = filter.operands("is")[0];
    } else if (filter.has_operator("pm-with")) {
        exports.narrow_title = "private";
    } else if (filter.has_operator("group-pm-with")) {
        exports.narrow_title = "private group";
    }

    notifications.redraw_title();

    blueslip.debug("Narrowed", {operators: _.map(operators,
                                                 function (e) { return e.operator; }),
                                trigger: opts ? opts.trigger : undefined,
                                previous_id: current_msg_list.selected_id()});

    opts = _.defaults({}, opts, {
        then_select_id: -1,
        then_select_offset: undefined,
        change_hash: true,
        trigger: 'unknown',
    });

    // These two narrowing operators specify what message should be
    // selected and should be the center of the narrow.
    if (filter.has_operator("near")) {
        opts.then_select_id = parseInt(filter.operands("near")[0], 10);
    }
    if (filter.has_operator("id")) {
        opts.then_select_id = parseInt(filter.operands("id")[0], 10);
    }

    var select_strategy;

    if (opts.then_select_id >= 0) {
        select_strategy = {
            flavor: 'exact',
            msg_id: opts.then_select_id,
        };
    } else {
        select_strategy = {
            flavor: 'first_unread',
        };
    }

    if (!was_narrowed_already) {
        unread.messages_read_in_narrow = false;
    }

    var then_select_offset;

    if (opts.then_select_offset !== undefined) {
        then_select_offset = opts.then_select_offset;
    } else {
        if (select_strategy.flavor === 'exact') {
            var row = current_msg_list.get_row(select_strategy.msg_id);
            if (row.length > 0) {
                then_select_offset = row.offset().top;
            }
        }
    }

    // IMPORTANT!  At this point we are heavily committed to
    // populating the new narrow, so we update our narrow_state.
    // From here on down, any calls to the narrow_state API will
    // reflect the upcoming narrow.
    narrow_state.set_current_filter(filter);

    var muting_enabled = narrow_state.muting_enabled();

    // Save how far from the pointer the top of the message list was.
    exports.save_pre_narrow_offset_for_reload();

    var msg_list_opts = {
        collapse_messages: ! narrow_state.get_current_filter().is_search(),
        muting_enabled: muting_enabled,
    };

    var msg_list = new message_list.MessageList(
        'zfilt',
        narrow_state.get_current_filter(),
        msg_list_opts
    );

    msg_list.start_time = start_time;

    // Show the new set of messages.  It is important to set current_msg_list to
    // the view right as it's being shown, because we rely on current_msg_list
    // being shown for deciding when to condense messages.
    $("body").addClass("narrowed_view");
    $("#zfilt").addClass("focused_table");
    $("#zhome").removeClass("focused_table");

    ui_util.change_tab_to('#home');
    message_list.narrowed = msg_list;
    current_msg_list = message_list.narrowed;

    // Populate the message list if we can apply our filter locally (i.e.
    // with no backend help) and we have the message we want to select.
    if (narrow_state.get_current_filter().can_apply_locally()) {
        // We may get back a new select_strategy, or we may get our
        // original back.
        select_strategy = exports.maybe_add_local_messages({
            select_strategy: select_strategy,
        });
    }

    var select_immediately = (select_strategy.flavor === 'exact');

    (function fetch_messages() {
        var anchor;
        var use_first_unread;

        if (select_strategy.flavor === 'exact') {
            anchor = select_strategy.msg_id;
            use_first_unread = false;
        } else if (select_strategy.flavor === 'first_unread') {
            anchor = -1;
            use_first_unread = true;
        }

        message_fetch.load_messages_for_narrow({
            then_select_id: anchor,
            use_first_unread_anchor: use_first_unread,
            cont: function () {
                if (!select_immediately) {
                    exports.update_selection({
                        select_strategy: {
                            flavor: 'first_unread',
                        },
                        select_offset: then_select_offset,
                    });
                }
                msg_list.network_time = new Date();
                maybe_report_narrow_time(msg_list);
            },
        });
    }());

    if (select_immediately) {
        message_scroll.hide_indicators();
        exports.update_selection({
            select_strategy: select_strategy,
            select_offset: then_select_offset,
        });
    } else {
        message_scroll.show_loading_older();
    }

    // Put the narrow operators in the URL fragment.
    // Disabled when the URL fragment was the source
    // of this narrow.
    if (opts.change_hash) {
        hashchange.save_narrow(operators);
    }

    // Put the narrow operators in the search bar.
    $('#search_query').val(Filter.unparse(operators));
    search.update_button_visibility();

    compose_actions.on_narrow(opts);

    var current_filter = narrow_state.get_current_filter();

    top_left_corner.handle_narrow_activated(current_filter);
    stream_list.handle_narrow_activated(current_filter);

    $(document).trigger($.Event('narrow_activated.zulip', {msg_list: message_list.narrowed,
                                                           filter: current_filter,
                                                           trigger: opts.trigger}));
    msg_list.initial_core_time = new Date();
    setTimeout(function () {
        msg_list.initial_free_time = new Date();
        maybe_report_narrow_time(msg_list);
    }, 0);
};

function load_local_messages() {
    // This little helper loads messages into our narrow message
    // list and returns true unless it's empty.  We use this for
    // cases when our local cache (message_list.all) has at least
    // one message the user will expect to see in the new narrow.
    message_util.add_messages(
        message_list.all.all_messages(),
        message_list.narrowed,
        {delay_render: true});

    return !message_list.narrowed.empty();
}

exports.maybe_add_local_messages = function (opts) {
    // This function does two very closely related things, both of
    // which are somewhat optional:
    //
    //  - return a new select_strategy for where to advance the cursor
    //  - add messages into our message list from our local cache
    var select_strategy = opts.select_strategy;

    if (select_strategy.flavor === 'first_unread') {
        // Try to upgrade to the "exact" strategy by looking for
        // unread message ids that match the upcoming narrow.
        var unread_info = narrow_state.get_first_unread_info();

        if (unread_info.flavor === 'found') {
            // We found an unread message_id, but we won't return
            // yet; we'll instead fall through to the next check
            select_strategy = {
                flavor: 'exact',
                msg_id: unread_info.msg_id,
            };
        } else if (unread_info.flavor === 'not_found') {
            // If we didn't find any unread messages, then we
            // generally want to go the last message in the list,
            // but only if we've fetched the newest messages
            // and the narrow's not empty locally.
            if (message_list.all.fetch_status.has_found_newest()) {
                // Load messages now and upgrade our strategy
                // if we find at least one message.
                if (load_local_messages()) {
                    var last_msg = message_list.narrowed.last();
                    select_strategy = {
                        flavor: 'exact',
                        msg_id: last_msg.id,
                    };

                    return select_strategy;
                }
            }
        }
    }

    // Do not make this an else-if...the block above could have
    // changed select_strategy.
    if (select_strategy.flavor === 'exact') {
        var msg_to_select = message_list.all.get(select_strategy.msg_id);
        if (msg_to_select !== undefined) {
            if (load_local_messages()) {
                return select_strategy;
            }
        }

        // Back out to first_unread strategy since we can't find
        // any messages.
        select_strategy = {
            flavor: 'first_unread',
        };
        return select_strategy;
    }

    // We may still be in our original select_strategy.
    return select_strategy;
};

exports.update_selection = function (opts) {
    if (message_list.narrowed.empty()) {
        return;
    }

    var select_strategy = opts.select_strategy;
    var select_offset = opts.select_offset;

    var msg_id;

    if (select_strategy.flavor === 'exact') {
        msg_id = select_strategy.msg_id;
    } else if (select_strategy.flavor === 'first_unread') {
        msg_id = message_list.narrowed.first_unread_message_id();
    }

    var preserve_pre_narrowing_screen_position =
        (message_list.narrowed.get(msg_id) !== undefined) &&
        (select_offset !== undefined);

    var then_scroll = !preserve_pre_narrowing_screen_position;

    message_list.narrowed.select_id(msg_id, {
        then_scroll: then_scroll,
        use_closest: true,
        force_rerender: true,
    });

    if (preserve_pre_narrowing_screen_position) {
        // Scroll so that the selected message is in the same
        // position in the viewport as it was prior to
        // narrowing
        message_list.narrowed.view.set_message_offset(select_offset);
    }
    unread_ops.process_visible();
};

exports.stream_topic = function () {
    // This function returns the stream/topic that we most
    // specifically care about, according (mostly) to the
    // currently selected message.
    var msg = current_msg_list.selected_message();

    if (msg) {
        return {
            stream: msg.stream || undefined,
            topic: msg.subject || undefined,
        };
    }

    // We may be in an empty narrow.  In that case we use
    // our narrow parameters to return the stream/topic.
    return {
        stream: narrow_state.stream(),
        topic: narrow_state.topic(),
    };
};

exports.activate_stream_for_cycle_hotkey = function (stream_name) {
    // This is the common code for A/D hotkeys.
    var filter_expr = [
        {operator: 'stream', operand: stream_name},
    ];
    exports.activate(filter_expr, {});
};


exports.stream_cycle_backward = function () {
    var curr_stream = narrow_state.stream();

    if (!curr_stream) {
        return;
    }

    var stream_name = topic_generator.get_prev_stream(curr_stream);

    if (!stream_name) {
        return;
    }

    exports.activate_stream_for_cycle_hotkey(stream_name);
};

exports.stream_cycle_forward = function () {
    var curr_stream = narrow_state.stream();

    if (!curr_stream) {
        return;
    }

    var stream_name = topic_generator.get_next_stream(curr_stream);

    if (!stream_name) {
        return;
    }

    exports.activate_stream_for_cycle_hotkey(stream_name);
};

exports.narrow_to_next_topic = function () {
    var curr_info = exports.stream_topic();

    if (!curr_info) {
        return;
    }

    var next_narrow = topic_generator.get_next_topic(
        curr_info.stream,
        curr_info.topic
    );

    if (!next_narrow) {
        return;
    }

    var filter_expr = [
        {operator: 'stream', operand: next_narrow.stream},
        {operator: 'topic', operand: next_narrow.topic},
    ];

    exports.activate(filter_expr, {});
};

exports.narrow_to_next_pm_string = function () {

    var curr_pm = narrow_state.pm_string();

    var next_pm = topic_generator.get_next_unread_pm_string(curr_pm);

    if (!next_pm) {
        return;
    }

    // Hopefully someday we can narrow by user_ids_string instead of
    // mapping back to emails.
    var pm_with = people.user_ids_string_to_emails_string(next_pm);

    var filter_expr = [
        {operator: 'pm-with', operand: pm_with},
    ];

    // force_close parameter is true to not auto open compose_box
    var opts = {
        force_close: true,
    };

    exports.activate(filter_expr, opts);
};


// Activate narrowing with a single operator.
// This is just for syntactic convenience.
exports.by = function (operator, operand, opts) {
    exports.activate([{operator: operator, operand: operand}], opts);
};

exports.by_subject = function (target_id, opts) {
    // don't use current_msg_list as it won't work for muted messages or for out-of-narrow links
    var original = message_store.get(target_id);
    if (original.type !== 'stream') {
        // Only stream messages have topics, but the
        // user wants us to narrow in some way.
        exports.by_recipient(target_id, opts);
        return;
    }
    unread_ops.notify_server_message_read(original);
    var search_terms = [
        {operator: 'stream', operand: original.stream},
        {operator: 'topic', operand: original.subject},
    ];
    opts = _.defaults({}, opts, {then_select_id: target_id});
    exports.activate(search_terms, opts);
};

// Called for the 'narrow by stream' hotkey.
exports.by_recipient = function (target_id, opts) {
    opts = _.defaults({}, opts, {then_select_id: target_id});
    // don't use current_msg_list as it won't work for muted messages or for out-of-narrow links
    var message = message_store.get(target_id);
    unread_ops.notify_server_message_read(message);
    switch (message.type) {
    case 'private':
        exports.by('pm-with', message.reply_to, opts);
        break;

    case 'stream':
        exports.by('stream', message.stream, opts);
        break;
    }
};

exports.by_time_travel = function (target_id, opts) {
    opts = _.defaults({}, opts, {then_select_id: target_id});
    narrow.activate([{operator: "near", operand: target_id}], opts);
};

exports.deactivate = function () {
    if (narrow_state.get_current_filter() === undefined) {
        return;
    }
    unnarrow_times = {start_time: new Date()};
    blueslip.debug("Unnarrowed");

    if (message_scroll.actively_scrolling()) {
        // There is no way to intercept in-flight scroll events, and they will
        // cause you to end up in the wrong place if you are actively scrolling
        // on an unnarrow. Wait a bit and try again once the scrolling is over.
        setTimeout(exports.deactivate, 50);
        return;
    }

    if (!compose_state.has_message_content()) {
        compose_actions.cancel();
    }

    narrow_state.reset_current_filter();

    exports.hide_empty_narrow_message();

    $("body").removeClass('narrowed_view');
    $("#zfilt").removeClass('focused_table');
    $("#zhome").addClass('focused_table');
    current_msg_list = home_msg_list;
    condense.condense_and_collapse($("#zhome div.message_row"));

    $('#search_query').val('');
    message_scroll.hide_indicators();
    hashchange.save_narrow();

    if (current_msg_list.selected_id() !== -1) {
        var preserve_pre_narrowing_screen_position =
            (current_msg_list.selected_row().length > 0) &&
            (current_msg_list.pre_narrow_offset !== undefined);
        var message_id_to_select;
        var select_opts = {
            then_scroll: true,
            use_closest: true,
            empty_ok: true,
        };

        // We fall back to the closest selected id, if the user has removed a
        // stream from the home view since leaving it the old selected id might
        // no longer be there
        // Additionally, we pass empty_ok as the user may have removed **all** streams
        // from their home view
        if (unread.messages_read_in_narrow) {
            // We read some unread messages in a narrow. Instead of going back to
            // where we were before the narrow, go to our first unread message (or
            // the bottom of the feed, if there are no unread messages).
            message_id_to_select = current_msg_list.first_unread_message_id();
        } else {
            // We narrowed, but only backwards in time (ie no unread were read). Try
            // to go back to exactly where we were before narrowing.
            if (preserve_pre_narrowing_screen_position) {
                // We scroll the user back to exactly the offset from the selected
                // message that they were at the time that they narrowed.
                // TODO: Make this correctly handle the case of resizing while narrowed.
                select_opts.target_scroll_offset = current_msg_list.pre_narrow_offset;
            }
            message_id_to_select = current_msg_list.selected_id();
        }
        current_msg_list.select_id(message_id_to_select, select_opts);
    }

    compose_fade.update_message_list();

    top_left_corner.handle_narrow_deactivated();
    stream_list.handle_narrow_deactivated();

    $(document).trigger($.Event('narrow_deactivated.zulip', {msg_list: current_msg_list}));

    exports.narrow_title = "home";
    notifications.redraw_title();

    unnarrow_times.initial_core_time = new Date();
    setTimeout(function () {
        unnarrow_times.initial_free_time = new Date();
        report_unnarrow_time();
    });
};

exports.restore_home_state = function () {
    // If we click on the All Messages link while already at All Messages, unnarrow.
    // If we click on the All Messages link from another nav pane, just go
    // back to the state you were in (possibly still narrowed) before
    // you left the All Messages pane.
    if (!overlays.is_active()) {
        exports.deactivate();
    }
    navigate.maybe_scroll_to_selected();
};

function pick_empty_narrow_banner() {
    var default_banner = $('#empty_narrow_message');

    var current_filter = narrow_state.get_current_filter();

    if (current_filter === undefined) {
        return default_banner;
    }

    var first_term = current_filter.operators()[0];
    var first_operator = first_term.operator;
    var first_operand = first_term.operand;
    var num_operators = current_filter.operators().length;

    if (num_operators !== 1) {
        // For multi-operator narrows, we just use the default banner
        return default_banner;
    } else if (first_operator === "is") {
        if (first_operand === "starred") {
            // You have no starred messages.
            return $("#empty_star_narrow_message");
        } else if (first_operand === "mentioned") {
            return $("#empty_narrow_all_mentioned");
        } else if (first_operand === "private") {
            // You have no private messages.
            return $("#empty_narrow_all_private_message");
        } else if (first_operand === "unread") {
            // You have no unread messages.
            return $("#no_unread_narrow_message");
        }
    } else if ((first_operator === "stream") && !stream_data.is_subscribed(first_operand)) {
        // You are narrowed to a stream which does not exist or is a private stream
        // in which you were never subscribed.
        var stream_sub = stream_data.get_sub(narrow_state.stream());
        if (!stream_sub || stream_sub.invite_only) {
            return $("#nonsubbed_private_nonexistent_stream_narrow_message");
        }
        return $("#nonsubbed_stream_narrow_message");
    } else if (first_operator === "search") {
        // You are narrowed to empty search results.
        return $("#empty_search_narrow_message");
    } else if (first_operator === "pm-with") {
        if (first_operand.indexOf(',') === -1) {
            // You have no private messages with this person
            return $("#empty_narrow_private_message");
        }
        return $("#empty_narrow_multi_private_message");
    } else if (first_operator === "sender") {
        if (people.get_by_email(first_operand)) {
            return $("#silent_user");
        }
        return $("#non_existing_user");
    } else if (first_operator === "group-pm-with") {
        return $("#empty_narrow_group_private_message");
    }
    return default_banner;
}

exports.show_empty_narrow_message = function () {
    $(".empty_feed_notice").hide();
    pick_empty_narrow_banner().show();
};

exports.hide_empty_narrow_message = function () {
    $(".empty_feed_notice").hide();
};

exports.pm_with_uri = function (reply_to) {
    return hashchange.operators_to_hash([
        {operator: 'pm-with', operand: reply_to},
    ]);
};

exports.huddle_with_uri = function (user_ids_string) {
    // This method is convenient is convenient for callers
    // that have already converted emails to a comma-delimited
    // list of user_ids.  We should be careful to keep this
    // consistent with hash_util.decode_operand.
    return "#narrow/pm-with/" + user_ids_string + '-group';
};

exports.by_sender_uri = function (reply_to) {
    return hashchange.operators_to_hash([
        {operator: 'sender', operand: reply_to},
    ]);
};

exports.by_stream_uri = function (stream) {
    return "#narrow/stream/" + hash_util.encode_stream_name(stream);
};

exports.by_stream_subject_uri = function (stream, subject) {
    return "#narrow/stream/" + hash_util.encode_stream_name(stream) +
           "/subject/" + hash_util.encodeHashComponent(subject);
};

exports.by_message_uri = function (message_id) {
    return "#narrow/id/" + hash_util.encodeHashComponent(message_id);
};

exports.by_near_uri = function (message_id) {
    return "#narrow/near/" + hash_util.encodeHashComponent(message_id);
};

exports.by_conversation_and_time_uri = function (message, is_absolute_url) {
    var absolute_url = "";
    if (is_absolute_url) {
        absolute_url = window.location .protocol + "//" +
            window.location.host + "/" + window.location.pathname.split('/')[1];
    }
    if (message.type === "stream") {
        return absolute_url + "#narrow/stream/" +
            hash_util.encode_stream_name(message.stream) +
            "/subject/" + hash_util.encodeHashComponent(message.subject) +
            "/near/" + hash_util.encodeHashComponent(message.id);
    }

    // Include your own email in this URI if it's not there already
    var all_emails = message.reply_to;
    if (all_emails.indexOf(people.my_current_email()) === -1) {
        all_emails += "," + people.my_current_email();
    }
    return absolute_url + "#narrow/pm-with/" +
        hash_util.encodeHashComponent(all_emails) +
        "/near/" + hash_util.encodeHashComponent(message.id);
};

return exports;

}());
if (typeof module !== 'undefined') {
    module.exports = narrow;
}
