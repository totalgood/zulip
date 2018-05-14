/* eslint indent: "off" */

var buddy_list = (function () {
    var self = {};

    self.container_sel = '#user_presences';
    self.item_sel = 'li.user_sidebar_entry';

    self.items_to_html = function (opts) {
        var user_info = opts.items;
        var html = templates.render('user_presence_rows', {users: user_info});
        return html;
    };

    self.item_to_html = function (opts) {
        var html = templates.render('user_presence_row', opts.item);
        return html;
    };

    self.find_li = function (opts) {
        var user_id = opts.key;
        var sel = self.item_sel + "[data-user-id='" + user_id + "']";
        return self.container.find(sel);
    };

    self.get_key_from_li = function (opts) {
        var user_id = opts.li.expectOne().attr('data-user-id');
        return user_id;
    };

    // Try to keep code below this line generic, so that we can
    // extract a widget.

    self.populate = function (opts) {
        var html = self.items_to_html({items: opts.items});
        self.container = $(self.container_sel);
        self.container.html(html);
    };

    self.get_items = function () {
        var obj = self.container.find(self.item_sel);
        return obj.map(function (i, elem) {
            return $(elem);
        });
    };

    self.first_key = function () {
        var list_items = self.container.find(self.item_sel);
        var li = list_items.first();
        if (li.length === 0) {
            return;
        }
        var key = self.get_key_from_li({li: li});
        return key;
    };

    self.prev_key = function (key) {
        var li = self.find_li({key: key});
        var prev_li = li.prev();
        if (prev_li.length === 0) {
            return;
        }
        var prev_key = self.get_key_from_li({li: prev_li});
        return prev_key;
    };

    self.next_key = function (key) {
        var li = self.find_li({key: key});
        var next_li = li.next();
        if (next_li.length === 0) {
            return;
        }
        var next_key = self.get_key_from_li({li: next_li});
        return next_key;
    };

    self.maybe_remove_key = function (opts) {
        var li = self.find_li({key: opts.key});
        li.remove();
    };

    self.insert_or_move = function (opts) {
        var key = opts.key;
        var item = opts.item;
        var compare_function = opts.compare_function;

        self.maybe_remove_key({key: key});
        var html = self.item_to_html({item: item});

        var list_items = self.container.find(self.item_sel);

        function insert() {
            var i = 0;

            for (i = 0; i < list_items.length; i += 1) {
                var li = list_items.eq(i);

                var list_key = self.get_key_from_li({li: li});

                if (compare_function(key, list_key) < 0) {
                    li.before(html);
                    return;
                }
            }

            self.container.append(html);
        }

        insert();
    };

    // This is a bit of a hack to make sure we at least have
    // an empty list to start, before we get the initial payload.
    self.container = $(self.container_sel);

    return self;
}());

if (typeof module !== 'undefined') {
    module.exports = buddy_list;
}

