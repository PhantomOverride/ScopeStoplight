// Toggle console.log debug output for plugin troubleshooting
var debug = false;

function indicateTabPositive(tabId) {
  browser.pageAction.setIcon(
      {
        tabId: tabId,
        path: "icons/green.png"
      }
    )
}

function indicateTabNegative(tabId) {
  browser.pageAction.setIcon(
      {
        tabId: tabId,
        path: "icons/red.png"
      }
    )
}

// Pop-up a really annoying pop-up every time an out-of-scope tab is used
function notifyTabNegative(){
  var gettingShouldNotify = browser.storage.local.get("notify");
  gettingShouldNotify.then(
    function(value){
      if (value.notify) {
        browser.notifications.create('Danger Zone',
          {
          "type": "basic",
          "title": "Danger Zone",
          "message": "🚨🚨🚨 Page is out of scope! 🚨🚨🚨"
        });
      }
    },
    onError
  );
}

// Scope to hold array of regex to match
var scope = [];

// Initial scope load
getScope()

// Don't care about what was changed. Just reload scope.
browser.storage.onChanged.addListener(getScope);

function getScope(){
  var gettingScope = browser.storage.local.get("scope");
  gettingScope.then(
    function(newScope){
      scope = newScope.scope;
      debugPrint("Background.js setting scope: " + scope);
    }
    ,
    onError
    );
}

function onError(error) {
  if(debug){
    console.log(error);
  }
}

function debugPrint(message) {
  if(debug){
    console.log(message);
  }
}

function matchesScope(url) {
  if(url.substring(0,6) === "about:") return true; // Ignore built-in pages such as about:preferences
  for (var i = scope.length - 1; i >= 0; i--) {
    if(scope[i] === "") continue; // Ignore empty lines in pattern data
    var exp = new RegExp(scope[i]);
    var res = url.match(exp);
    if (res != null) {
      return true;
    }
  }
  return false;
}

function tabListener(tabId, changeInfo, tab) {
  browser.pageAction.hide(tabId);
  var res = browser.tabs.get(tabId);
  res.then(
    function(value){
      if(matchesScope(value.url)) {
        indicateTabPositive(tabId);
      }
      else {
        indicateTabNegative(tabId);
        notifyTabNegative();
      }
    }
    , 
    onError
  );
  browser.pageAction.show(tabId);
}

browser.tabs.onUpdated.addListener(tabListener);
