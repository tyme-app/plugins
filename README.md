# Tyme Plugins

![macOS Plugins](/guides/plugins_macos.png)

## Overview

Tyme on your Mac and iPhone offers a **JavaScript plugin interface**, which lets you customize the export of your logged time entries or lets your import any data.
Using a plugin you can transform logged time entries into any format you need or send it to any webservice.

Plugins that are already available can be downloaded directly in Tyme via: **Tyme > Preferences > Plugins**

If you want to create you own plug in, you can just create a new folder in Tyme's plugin folder and start developing:

```javascript
~/Library/Containers/com.tyme-app.Tyme3-macOS/Data/Library/Application Support/plugins/[YOUR_PLUGIN_FOLDER]/
```

Please [let us know](https://www.tyme-app.com/en/contact/) of your plugin or file a PR, so we can add it to the official list of plugins.

## Structure of a Plugin

A plugin consists of at least these components:

### plugin.json

This file defines the type, version, compatibility and entry point for the plugin:

```javascript
{
  "id": "unique_id_of_your_plugin",
  "tymeMinVersion": "2022.11", // the minimum compatible version of Tyme for this plugin
  "version": "1.0",
  "type": "[export|import]",
  "name": "My Fancy Plugin",
  "summary": "A description of what the plugin does.",
  "author": "John Doe",
  "authorUrl": "https://www.tyme-app.com",
  "icon": "doc.text.magnifyingglass", // not yet used
  "scriptName": "script.js",
  "scriptMain": "createInvoice()", // the method to call when exporting
  "scriptPreview": "generatePreview()", // the method to call when generating a preview (HTML is expected in return), only export plugins
  "formName": "form.json",
  "localizationName": "localization.json"
}
```

### Plugin JavaScript File

This is where your logic resides in. Note that you can not use browser specific calls.
See **Scripting with JavaScript** below for more details.

### Plugin Form

If your plugin needs options the user can choose from. This is the place to define them.

Forms can be used to let the user configure the export data before actually exporting it.
A form is a JSON file with the following structure:

```javascript
[
    {
        "id": "someUniqueID",
        "type": "[button|securetext|text|separator|date|daterange|teammembers|tasks|checkbox|dropdown]",
        "name": "label or localization key",
        "placeholder": "label or localization key", // only text
        "persist": false,
        "value": "initial value",
        "values": [ // only dropdown
            {"key1": "label or localization key"},
            {"key1": "label or localization key"}
        ],
        "actionFunction": "openWebsite()", // only button
        "valueFunction": "getClients()", // only dropdown
        "valueFunctionReloadable": true // shows a button to reload the dropdown
    },
]

// The 'daterange' type was introduced in Tyme 2024.5. Please set the tymeMinVersion to 2024.5 if you plan to use it. 

 ```

Values of all form elements are available in your script in the global variable **formValue**.

```javascript
// access a form value
formValue.someUniqueID;
 ```

Using the property **persist** you can define, if the users entered values should be remembered next time the form is opened.
For example you can use **persist: true** to save an API token. Values from the securetext are saved in the users local keychain, all other values are saved in a plain text document.

The property **valueFunction** is a special property. Tyme will call the method defined by the value function and
expects an array with name-value pairs in return. Use this to dynamically fill a dropdown.

```javascript
getClients()
{
    return [
        {
            "name": "Name",
            "value": "some_value"
        }
    ];
}
 ```


### Localization File

Optional translation file. Current supported languages are German and English.

```javascript
{
  "en": {
    "input.key": "Secret Key",
    "input.key.placeholder": "Please enter your personal key",
    …
  },
  "de": {
    "input.key": "Geheimer Schlüssel",
    "input.key.placeholder": "Bitte gib deinen persönlichen Schlüssel ein",
    …
  }
}
```

## Scripting with JavaScript

Since the JavaScript runtime your script is running in does not have any browser specific calls, we created utility
classes to cover the most prominent calls.

Please refer to the [Scripting Calls](/guides/scripting_helpers.md) page for details.

### Importing Data

When you import data, you obviously need to check for already existing tasks or time entries, create new ones on demand or delete obsolete ones.

Please refer to the [Importing Data](/guides/importing_data.md) page for details.