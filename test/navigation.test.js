"use strict";

var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
var test = require("node:test");
var vm = require("node:vm");

function chip(attribute, value, active) {
    var classes = { "filter-chip": true, "is-active": Boolean(active) };
    return {
        getAttribute: function (name) { return name === attribute ? value : null; },
        classList: {
            add: function (name) { classes[name] = true; },
            remove: function (name) { delete classes[name]; },
            contains: function (name) { return Boolean(classes[name]); }
        }
    };
}

function loadNavigation() {
    var context = {
        document: {
            addEventListener: function () {},
            removeEventListener: function () {},
            body: {}
        }
    };
    context.window = context;
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../js/navigation.js"), "utf8"), context, { filename: "navigation.js" });
    return context.SportzXNavigation;
}

function focusable(document, region, x, y) {
    var classes = { focusable: true };
    return {
        parentNode: document.body,
        offsetWidth: 100,
        offsetHeight: 40,
        disabled: false,
        getAttribute: function () { return null; },
        getBoundingClientRect: function () {
            return { left: x, right: x + 100, top: y, bottom: y + 40, width: 100, height: 40 };
        },
        closest: function (selector) { return selector === "#" + region ? { id: region } : null; },
        focus: function () {},
        classList: {
            add: function (name) { classes[name] = true; },
            remove: function (name) { delete classes[name]; },
            contains: function (name) { return Boolean(classes[name]); }
        }
    };
}

test("changes filter selection without replacing the focused chip", function () {
    var navigation = loadNavigation();
    var all = chip("data-filter-cat", "All", true);
    var football = chip("data-filter-cat", "Football", false);
    var chips = [all, football];
    var rail = { querySelectorAll: function () { return chips; } };

    var selected = navigation.selectFilterChip(rail, "data-filter-cat", "Football");

    assert.equal(selected, football);
    assert.equal(all.classList.contains("is-active"), false);
    assert.equal(football.classList.contains("is-active"), true);
    assert.equal(chips[1], football, "the original DOM object is preserved");
});

test("moves down through category, status, and event regions even when geometry favors an event", function () {
    var navigation = loadNavigation();
    var document = {
        body: {},
        addEventListener: function () {},
        removeEventListener: function () {}
    };
    var category = focusable(document, "category-rail", 900, 100);
    var statusAll = focusable(document, "status-rail", 100, 180);
    var statusUpcoming = focusable(document, "status-rail", 400, 180);
    var event = focusable(document, "event-list", 850, 250);
    var elements = [category, statusAll, statusUpcoming, event];
    var scope = { querySelectorAll: function () { return elements; } };
    var manager = new navigation.FocusManager({ scope: scope });

    manager.focus(category);
    manager.move("down");
    assert.equal(manager.current, statusUpcoming, "down from a late category stays in the status rail");

    manager.move("down");
    assert.equal(manager.current, event, "a second down enters the event list");
});

test("moves linearly within fixture rows before returning to the status rail", function () {
    var navigation = loadNavigation();
    var document = { body: {}, addEventListener: function () {}, removeEventListener: function () {} };
    var status = focusable(document, "status-rail", 100, 180);
    var first = focusable(document, "event-list", 850, 250);
    var second = focusable(document, "event-list", 850, 310);
    var third = focusable(document, "event-list", 850, 370);
    var elements = [status, first, second, third];
    var manager = new navigation.FocusManager({ scope: { querySelectorAll: function () { return elements; } } });

    manager.focus(first);
    manager.move("down");
    assert.equal(manager.current, second);
    manager.move("down");
    assert.equal(manager.current, third);
    manager.move("up");
    assert.equal(manager.current, second);
    manager.move("up");
    assert.equal(manager.current, first);
    manager.move("up");
    assert.equal(manager.current, status);
});

test("moves linearly through the playable stream list", function () {
    var navigation = loadNavigation();
    var document = { body: {}, addEventListener: function () {}, removeEventListener: function () {} };
    var first = focusable(document, "stream-list", 100, 100);
    var second = focusable(document, "stream-list", 100, 500);
    var third = focusable(document, "stream-list", 600, 300);
    var elements = [first, second, third];
    var manager = new navigation.FocusManager({ scope: { querySelectorAll: function () { return elements; } } });

    manager.focus(first);
    manager.move("down");
    assert.equal(manager.current, second);
    manager.move("down");
    assert.equal(manager.current, third);
    manager.move("up");
    assert.equal(manager.current, second);
});
