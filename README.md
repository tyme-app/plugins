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

### 1. plugin.json

This file defines the type, version, compatibility and entry point for the plugin:

```javascript
{
  "id": "unique_id_of_your_plugin",
  "tymeMinVersion": "2025.12", // the minimum compatible version of Tyme for this plugin
  "version": "1.0",
  "type": "[export|import]",
  "author": "John Doe",
  "authorUrl": "https://www.tyme-app.com",
  "icon": "some_icon92x92.png",
  "scriptName": "script.js",
  "scriptMain": "createInvoice()", // the method to call when exporting
  "scriptPreview": "generatePreview()", // the method to call when generating a preview (HTML is expected in return), only export plugins
  "scriptDependencies": ["library.js"], // optional, useful to split your code into separate files (introduced in Tyme 2025.12)
  "formName": "form.json",
  "localizationName": "localization.json"
}

// 2025.12: 'scriptDependencies' property added

// Please set the tymeMinVersion to 2025.12 if you plan to use the above features.

```

### 2. Plugin JavaScript File

This is where your logic resides in. Note that you can not use browser specific calls.
See **Scripting with JavaScript** below for more details.

### 3. Plugin Form

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
        "actionFunction": "openWebsite()", // all elements, except of separator
        "valueFunction": "getClients()", // only dropdown
        "valueFunctionReloadable": true // shows a button to reload the dropdown
    },
]

// 2024.5: 'daterange' type added
// 2024.5: 'actionFunction' for all elements added (Previously only button). 

// Please set the tymeMinVersion to 2024.5 if you plan to use the above features.


 ```

Values of all form elements are available in your script in the global variable **formValue**.

```javascript
// access a form value
formValue.someUniqueID;
 ```

You can also update properties of a form element:

```javascript
class FormElement {
    isHidden // bool
    enabled // bool
    reload() // Calls the valueFunction of a dropdown to reload it. Tyme 2024.14 needed
}
 ```

All form elements can be accessed via the **formElement** property:

```javascript
// update a form element
formElement.someUniqueID.isHidden = !formValue.includeNonBillable;
formElement.someUniqueID.enabled = !formValue.markAsBilled;
formElement.someUniqueID.reload();
 ```

Each form element can have an **actionFunction** that is called whenever its value changes.

```javascript
// call an action, if the value of a form element changes
billableCheckboxClicked() {
    formElement.markAsBilled.enabled = !formValue.onlyBillable;
}
 ```

Using the property **persist** you can define if the users entered values should be remembered next time the form is opened.
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


### 4. Localization File

Translation file. Current supported languages are German and English.

```javascript
{
  "en": {
    "plugin.name": "Awesome Plugin", // required
    "plugin.summary": "This is what the plugin does…", // required
    "input.key": "Secret Key",
    "input.key.placeholder": "Please enter your personal key",
    …
  },
  "de": {
    "plugin.name": "Geniales Plugin",  // required
    "plugin.summary": "Dieses Plugin macht Folgendes…", // required
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