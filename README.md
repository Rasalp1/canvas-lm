Create a folder (e.g. minimal-ext) and copy the files above into it.

Open Chrome and go to chrome://extensions.

Enable Developer mode (top-right).

Click Load unpacked and select the minimal-ext folder.

The extension should appear in the extensions list and an icon will show in the toolbar.

Open any website tab, click the extension icon, then click Get Page Title in the popup. It will show the current page's title and URL.

Troubleshooting:

If you see a permission error, ensure manifest.json includes scripting and host_permissions.

To make the popup prettier or add icons, add an icons/ folder and update manifest.json.