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
