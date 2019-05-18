// Toggle console.log debug output for plugin troubleshooting
var debug = true;

function onError(error) {
	if(debug){
		console.log("Error: " + error);
	}
}

function debugPrint(message) {
  if(debug){
    console.log(message);
  }
}

function setScope(){
	rawNewScope = document.getElementById("scopearea").value;
	var newScope = rawNewScope.split("\n");
	var setting = browser.storage.local.set({
		scope: newScope
	});
	setting.then(null,onError);
}

function getScope(){
	var scope = [];
	var gettingScope = browser.storage.local.get("scope");
	gettingScope.then(
		function(newScope){
			scope = newScope.scope;
			document.getElementById("scopearea").value = scope.join("\n");
		}
		,
		onError
		);
}

function getNotify(){
	var scope = [];
	var gettingNotify = browser.storage.local.get("notify");
	gettingNotify.then(
		function(newNotify){
			notify = newNotify.notify;
			document.getElementById("notify").checked = notify;
		}
		,
		onError
		);
}

function setNotify(e){
	if(e.target.checked){
		debugPrint("Setting notify to TRUE");
		var setting = browser.storage.local.set({
			notify: true
		});
		setting.then(null,onError);
	}
	else{
		debugPrint("Setting notify to FALSE");
		var setting = browser.storage.local.set({
			notify: false
		});
		setting.then(null,onError);
	}
}

function setExample(){
	document.getElementById("scopearea").value = "https?://example.com/.*";
}

document.getElementById("scopebutton").addEventListener("click", (e) => {
	setScope();
});
document.getElementById("scopeloadbutton").addEventListener("click", (e) => {
	getScope();
});
document.getElementById("setexample").addEventListener("click", (e) => {
	setExample();
});
document.getElementById("notify").addEventListener("change", (e) => {
	setNotify(e);
});

browser.storage.onChanged.addListener(getScope);

// Update UI to contain the current settings
getScope();
getNotify();
