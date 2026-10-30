// Toggle console.log debug output for plugin troubleshooting
var debug = false;
const extension = globalThis.browser || globalThis.chrome;

function onError(error) {
	document.getElementById("scopeerror").textContent = "Unable to read or save settings.";
	if(debug){
		console.log("Error: " + error);
	}
}

function debugPrint(message) {
  if(debug){
    console.log(message);
  }
}

async function setScope(){
	const newScope = document.getElementById("scopearea").value.split("\n");
	const errorMessage = document.getElementById("scopeerror");
	errorMessage.textContent = "";
	for (const [index, pattern] of newScope.entries()) {
		try {
			new RegExp(pattern);
		} catch (error) {
			errorMessage.textContent = "Invalid regex on line " + (index + 1) + ": " + error.message;
			return;
		}
	}
	try {
		await extension.storage.local.set({ scope: newScope });
	} catch (error) {
		onError(error);
	}
}

function getScope(){
	return extension.storage.local.get({ scope: [] }).then(
		function(newScope){
			const scope = Array.isArray(newScope.scope) ? newScope.scope : [];
			document.getElementById("scopearea").value = scope.join("\n");
			document.getElementById("scopeerror").textContent = "";
		}
	).catch(onError);
}

function getNotify(){
	return extension.storage.local.get({ notify: false }).then(
		function(newNotify){
			document.getElementById("notify").checked = newNotify.notify === true;
		}
	).catch(onError);
}

function setNotify(e){
	if(e.target.checked){
		debugPrint("Setting notify to TRUE");
		var setting = extension.storage.local.set({
			notify: true
		});
		setting.then(null,onError);
	}
	else{
		debugPrint("Setting notify to FALSE");
		var setting = extension.storage.local.set({
			notify: false
		});
		setting.then(null,onError);
	}
}

function setExample(){
	document.getElementById("scopearea").value = "^https?://example\\.com/.*";
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

extension.storage.onChanged.addListener((changes, area) => {
	if (area !== "local") return;
	if (Object.hasOwn(changes, "scope")) getScope();
	if (Object.hasOwn(changes, "notify")) getNotify();
});

// Update UI to contain the current settings
getScope();
getNotify();
