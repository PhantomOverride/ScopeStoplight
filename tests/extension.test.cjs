const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const backgroundSource = readFileSync(path.join(root, "background.js"), "utf8");

function event() {
  const listeners = [];
  return {
    addListener(listener) { listeners.push(listener); },
    async emit(...args) {
      await Promise.all(listeners.map(listener => listener(...args)));
    }
  };
}

function loadBackground({ settings = {}, chromium = false, tabs = [] } = {}) {
  const icons = new Map();
  const shown = [];
  const notifications = [];
  const errors = [];
  const api = {
    runtime: {
      getManifest: () => chromium ? { action: {} } : { page_action: {} },
      onInstalled: event(),
      onStartup: event()
    },
    storage: {
      local: {
        async get(defaults) {
          return typeof defaults === "object" ? { ...defaults, ...settings } : { ...settings };
        }
      },
      onChanged: event()
    },
    tabs: {
      async get(tabId) {
        const tab = tabs.find(candidate => candidate.id === tabId);
        if (!tab) throw new Error("Tab closed");
        return { ...tab };
      },
      async query() { return tabs.map(tab => ({ ...tab })); },
      onUpdated: event(),
      onActivated: event(),
      onRemoved: event()
    },
    notifications: {
      async create(id, options) { notifications.push({ id, ...options }); }
    }
  };
  const indicator = {
    async setIcon({ tabId, path: iconPath }) { icons.set(tabId, iconPath); }
  };
  if (chromium) {
    api.action = indicator;
  } else {
    api.pageAction = {
      ...indicator,
      async show(tabId) { shown.push(tabId); },
      async hide() {}
    };
  }
  const context = vm.createContext({ browser: api, console: { error: error => errors.push(error), log() {} } });
  vm.runInContext(backgroundSource, context);
  return { context, api, icons, shown, notifications, errors, settings, tabs };
}

test("fresh storage treats ordinary pages as out of scope", async () => {
  const { context } = loadBackground();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(context.matchesScope("https://example.com/"), false);
});

test("scope uses full-URL regexes, OR matching, and ignores empty lines", () => {
  const { context } = loadBackground();
  const scope = ["", "^https://staging\\.example\\.com/", "^https://dev\\.example\\.com/"];
  assert.equal(context.matchesScope("https://staging.example.com/path", scope), true);
  assert.equal(context.matchesScope("https://dev.example.com/path", scope), true);
  assert.equal(context.matchesScope("https://production.example.com/path", scope), false);
  assert.equal(context.matchesScope("https://other.test/?next=https://dev.example.com/", scope), false);
  assert.equal(context.matchesScope("https://other.test/path", ["path"]), true);
});

test("invalid saved settings and missing URLs fail closed", () => {
  const { context } = loadBackground();
  for (const scope of [["["], [".*", "["], [null], "example", null, [""]]) {
    assert.equal(context.matchesScope("https://example.com/", scope), false);
  }
  assert.equal(context.matchesScope(undefined, [".*"]), false);
  assert.equal(context.matchesScope("", [".*"]), false);
  assert.equal(context.matchesScope("about:preferences"), true);
  assert.equal(context.matchesScope("chrome://settings/"), true);
});

for (const chromium of [false, true]) {
  test(`${chromium ? "Chromium" : "Firefox"} refreshes installed, active, and edited tabs`, async () => {
    const fixture = loadBackground({ chromium, tabs: [{ id: 1, url: "https://example.com/", active: true }] });
    await fixture.api.runtime.onInstalled.emit();
    assert.equal(fixture.icons.get(1), "icons/red.png");
    fixture.settings.scope = ["example"];
    await fixture.api.storage.onChanged.emit({ scope: {} }, "local");
    assert.equal(fixture.icons.get(1), "icons/green.png");
    fixture.tabs[0].url = "https://outside.test/";
    await fixture.api.tabs.onActivated.emit({ tabId: 1 });
    assert.equal(fixture.icons.get(1), "icons/red.png");
    assert.equal(fixture.shown.length > 0, !chromium);
    assert.equal(fixture.notifications.length, 0);
    assert.equal(fixture.errors.length, 0);
  });
}

test("notifications are opt-in and limited to completed active-tab loads", async () => {
  const fixture = loadBackground({ chromium: true, tabs: [{ id: 1, url: "https://outside.test/", active: true }] });
  await fixture.api.tabs.onUpdated.emit(1, { status: "complete" });
  assert.equal(fixture.notifications.length, 0);
  fixture.settings.notify = true;
  await fixture.api.tabs.onUpdated.emit(1, { title: "Changed" });
  await fixture.api.tabs.onUpdated.emit(1, { url: "https://outside.test/" });
  await fixture.api.tabs.onActivated.emit({ tabId: 1 });
  await fixture.api.storage.onChanged.emit({ scope: {} }, "local");
  assert.equal(fixture.notifications.length, 0);
  await fixture.api.tabs.onUpdated.emit(1, { status: "complete" });
  assert.equal(fixture.notifications.length, 1);
  assert.equal(fixture.notifications[0].iconUrl, "icons/red.png");
  fixture.tabs[0].active = false;
  await fixture.api.tabs.onUpdated.emit(1, { status: "complete" });
  assert.equal(fixture.notifications.length, 1);
});

test("a delayed settings read cannot overwrite a newer navigation", async () => {
  const fixture = loadBackground({ chromium: true, tabs: [{ id: 1, url: "https://example.com/", active: true }] });
  let release;
  fixture.api.storage.local.get = () => new Promise(resolve => { release = resolve; });
  const first = fixture.api.tabs.onUpdated.emit(1, { url: "https://example.com/" });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(fixture.icons.size, 0);
  fixture.tabs[0].url = "https://outside.test/";
  const second = fixture.api.tabs.onUpdated.emit(1, { url: fixture.tabs[0].url });
  fixture.api.storage.local.get = async () => ({ scope: ["example"] });
  release({ scope: ["example"] });
  await Promise.all([first, second]);
  assert.equal(fixture.icons.get(1), "icons/red.png");
});

test("worker restart reads persisted settings on its first event", async () => {
  const options = { chromium: true, settings: { scope: ["example"] }, tabs: [{ id: 1, url: "https://example.com/" }] };
  const first = loadBackground(options);
  await first.api.tabs.onUpdated.emit(1, { status: "complete" });
  assert.equal(first.icons.get(1), "icons/green.png");
  const restarted = loadBackground(options);
  await restarted.api.tabs.onUpdated.emit(1, { status: "complete" });
  assert.equal(restarted.icons.get(1), "icons/green.png");
});

test("storage failures turn a previous green indicator red", async () => {
  const fixture = loadBackground({ chromium: true, settings: { scope: ["example"] }, tabs: [{ id: 1, url: "https://example.com/" }] });
  await fixture.api.tabs.onActivated.emit({ tabId: 1 });
  assert.equal(fixture.icons.get(1), "icons/green.png");
  fixture.api.storage.local.get = async () => { throw new Error("Storage unavailable"); };
  await fixture.api.tabs.onActivated.emit({ tabId: 1 });
  assert.equal(fixture.icons.get(1), "icons/red.png");
  assert.equal(fixture.errors.length, 1);
});

function loadPopup(settings = {}, chromeOnly = false) {
  const elements = new Map();
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, { value: "", textContent: "", checked: false, addEventListener() {} });
      return elements.get(id);
    }
  };
  const api = {
    storage: {
      local: {
        async get(defaults) { return { ...defaults, ...settings }; },
        async set(values) { Object.assign(settings, JSON.parse(JSON.stringify(values))); }
      },
      onChanged: event()
    }
  };
  const context = vm.createContext({ [chromeOnly ? "chrome" : "browser"]: api, document, console });
  vm.runInContext(readFileSync(path.join(root, "popup/main.js"), "utf8"), context);
  return { context, api, elements, settings };
}

test("popup initializes fresh storage in both API namespaces", async () => {
  for (const chromeOnly of [false, true]) {
    const { context, elements } = loadPopup({}, chromeOnly);
    await context.getScope();
    await context.getNotify();
    assert.equal(elements.get("scopearea").value, "");
    assert.equal(elements.get("notify").checked, false);
    assert.equal(elements.get("scopeerror").textContent, "");
  }
});

test("popup rejects invalid regex without replacing saved scope", async () => {
  const { context, elements, settings } = loadPopup({ scope: ["saved"] });
  await context.getScope();
  elements.get("scopearea").value = "example\n[";
  await context.setScope();
  assert.deepEqual(settings.scope, ["saved"]);
  assert.match(elements.get("scopeerror").textContent, /line 2/);
  elements.get("scopearea").value = "example\n\nother";
  await context.setScope();
  assert.deepEqual(settings.scope, ["example", "", "other"]);
  assert.equal(elements.get("scopeerror").textContent, "");
});

test("notification changes do not discard an unsaved scope draft", async () => {
  const { context, api, elements } = loadPopup({ scope: ["saved"] });
  await context.getScope();
  elements.get("scopearea").value = "draft";
  await api.storage.onChanged.emit({ notify: {} }, "local");
  assert.equal(elements.get("scopearea").value, "draft");
});

test("example matches only the intended URL prefix and literal hostname", async () => {
  const { context, elements } = loadPopup();
  await context.getScope();
  context.setExample();
  const example = elements.get("scopearea").value;
  const pattern = new RegExp(example);
  assert.equal(pattern.test("https://example.com/path"), true);
  assert.equal(pattern.test("https://exampleXcom/path"), false);
  assert.equal(pattern.test("https://outside.test/?next=https://example.com/"), false);
  assert.ok(readFileSync(path.join(root, "popup/main.html"), "utf8").includes(example));
});

test("browser manifests share permissions, popup, assets, and version", () => {
  const firefox = JSON.parse(readFileSync(path.join(root, "manifest.json"), "utf8"));
  const chromium = JSON.parse(readFileSync(path.join(root, "manifest.chromium.json"), "utf8"));
  assert.equal(firefox.manifest_version, 2);
  assert.equal(chromium.manifest_version, 3);
  assert.equal(chromium.version, firefox.version);
  assert.deepEqual(chromium.permissions, firefox.permissions);
  assert.deepEqual(chromium.icons, firefox.icons);
  assert.equal(chromium.action.default_popup, firefox.page_action.default_popup);
  assert.equal(chromium.background.service_worker, firefox.background.scripts[0]);
  assert.deepEqual(firefox.browser_specific_settings.gecko.data_collection_permissions.required, ["none"]);
});

test("closed tabs and notification failures do not reject event handlers", async () => {
  const fixture = loadBackground({ chromium: true, settings: { notify: true } });
  await fixture.api.tabs.onActivated.emit({ tabId: 99 });
  assert.equal(fixture.errors.length, 1);
  fixture.tabs.push({ id: 1, url: "https://outside.test/", active: true });
  fixture.api.notifications.create = async () => { throw new Error("Notifications unavailable"); };
  await fixture.api.tabs.onUpdated.emit(1, { status: "complete" });
  assert.equal(fixture.icons.get(1), "icons/red.png");
  assert.equal(fixture.errors.length, 2);
});

test("icon writes remain ordered when a navigation arrives during setIcon", async () => {
  const fixture = loadBackground({ chromium: true, settings: { scope: ["example"] }, tabs: [{ id: 1, url: "https://example.com/" }] });
  let release;
  const setIcon = fixture.api.action.setIcon;
  fixture.api.action.setIcon = details => new Promise(resolve => {
    release = async () => { await setIcon(details); resolve(); };
  });
  const first = fixture.api.tabs.onUpdated.emit(1, { url: fixture.tabs[0].url });
  await new Promise(resolve => setImmediate(resolve));
  fixture.tabs[0].url = "https://outside.test/";
  const second = fixture.api.tabs.onUpdated.emit(1, { url: fixture.tabs[0].url });
  fixture.api.action.setIcon = setIcon;
  await release();
  await Promise.all([first, second]);
  assert.equal(fixture.icons.get(1), "icons/red.png");
});