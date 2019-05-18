// Toggle console.log debug output for plugin troubleshooting
var debug = true;

function onError(error) {
	if(debug){
		console.log("Error: " + error);
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

browser.storage.onChanged.addListener(getScope);

getScope();