const extension = globalThis.browser || globalThis.chrome;
const usesPageAction = Boolean(extension.runtime.getManifest().page_action);
const indicator = usesPageAction ? extension.pageAction : extension.action;
const updates = new Map();

function onError(error) {
  console.error("ScopeStoplight:", error);
}

function matchesScope(url, scope = []) {
  if (typeof url !== "string" || url === "") return false;
  if (/^(about|chrome|edge|brave|vivaldi|opera):/.test(url)) return true;
  if (!Array.isArray(scope)) return false;
  try {
    const patterns = scope.filter(pattern => pattern !== "").map(pattern => {
      if (typeof pattern !== "string") throw new TypeError("Invalid scope pattern");
      return new RegExp(pattern);
    });
    return patterns.some(pattern => pattern.test(url));
  } catch (error) {
    return false;
  }
}

async function setIndicator(tabId, inScope) {
  await indicator.setIcon({
    tabId,
    path: inScope ? "icons/green.png" : "icons/red.png"
  });
  if (usesPageAction) await extension.pageAction.show(tabId);
}

function updateTab(tabId, notify = false) {
  const previous = updates.get(tabId);
  const update = {};
  update.promise = (previous ? previous.promise : Promise.resolve()).then(async () => {
    if (updates.get(tabId) !== update) return;
    const [tab, settings] = await Promise.all([
      extension.tabs.get(tabId),
      extension.storage.local.get({ scope: [], notify: false })
    ]);
    if (updates.get(tabId) !== update) return;
    const inScope = matchesScope(tab.url, settings.scope);
    await setIndicator(tabId, inScope);
    if (updates.get(tabId) !== update) return;
    if (notify && tab.active && tab.url && !inScope && settings.notify === true) {
      await extension.notifications.create("Danger Zone", {
        type: "basic",
        iconUrl: "icons/red.png",
        title: "Danger Zone",
        message: "Page is out of scope!"
      });
    }
  }).catch(async error => {
    onError(error);
    if (updates.get(tabId) === update) {
      await setIndicator(tabId, false).catch(onError);
    }
  }).finally(() => {
    if (updates.get(tabId) === update) updates.delete(tabId);
  });
  updates.set(tabId, update);
  return update.promise;
}

async function refreshTabs() {
  try {
    const tabs = await extension.tabs.query({});
    await Promise.all(tabs.map(tab => updateTab(tab.id)));
  } catch (error) {
    onError(error);
  }
}

extension.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url !== undefined || changeInfo.status === "complete") {
    return updateTab(tabId, changeInfo.status === "complete");
  }
});
extension.tabs.onActivated.addListener(({ tabId }) => updateTab(tabId));
extension.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && Object.hasOwn(changes, "scope")) return refreshTabs();
});
extension.runtime.onInstalled.addListener(refreshTabs);
extension.runtime.onStartup.addListener(refreshTabs);

if (usesPageAction) refreshTabs();
