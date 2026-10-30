# ScopeStoplight

A browser extension that shows whether the current URL matches your scope:

- **Green:** the URL matches at least one scope pattern.
- **Red:** no pattern matches, or the saved scope is invalid or unavailable.

Firefox displays the square inside the address bar. Chromium displays it in the
toolbar beside the address bar; pin the extension to keep it visible.

ScopeStoplight checks URLs locally. It does not block navigation, inspect page
contents, or transmit data. Settings stay in your browser.

## Scope Patterns

Click the square, enter one JavaScript regular expression per line, and select
**Save Scope**. Patterns match against the full URL, are case-sensitive, and are
combined with OR. Enter the pattern itself, without `/.../` delimiters or flags.
Empty lines are ignored; an empty scope makes ordinary pages red.

For example, to match a staging environment:

```text
^https://staging\.example\.com/
```

Anchor patterns with `^` and escape literal dots when restricting a hostname.
Invalid input is rejected without replacing the last saved scope. Saving scope
updates open tabs immediately. Browser-internal pages such as `about:preferences`
and `chrome://settings/` are exempt and treated as in scope where the browser
allows the indicator to appear.

Optional notifications alert you when an active tab finishes loading out of
scope. They are off by default and depend on browser and operating-system
notification settings.

## Install for Development

### Firefox

1. Open `about:debugging#/runtime/this-firefox`.
2. Select **Load Temporary Add-on** and choose this repository's `manifest.json`.
3. Visit a normal web page and click the address-bar square to set scope.

Temporary installations last until Firefox exits. Normal distribution requires
a Mozilla-signed add-on.

### Chromium

Requires Chrome/Chromium 148 or newer and Node.js 18 or newer for packaging:

```sh
node scripts/package.cjs chromium
```

Open `chrome://extensions`, enable **Developer mode**, select **Load unpacked**,
and choose `dist/chromium`. Pin ScopeStoplight from the extensions menu.

## Packaging and Checks

Both browsers share the same code, with separate manifests. Packaging requires
Node.js 18 or newer, with no additional dependencies. Each command replaces its
browser's generated directory under `dist/` with the required runtime files.

```sh
node --test tests/extension.test.cjs
node scripts/package.cjs firefox
node scripts/package.cjs chromium
npx web-ext lint --source-dir dist/firefox
npx web-ext build --source-dir dist/firefox --artifacts-dir dist --overwrite-dest
```

Before publishing, confirm the existing Firefox add-on ID in AMO or the signed
package. Preserve it when adding `browser_specific_settings.gecko.id`, and
increment both manifest versions together for each release.
