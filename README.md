# Tyme Plugins

**Currently in Closed Beta**
If you have an idea for a plugin or want to develop our own using a beta version, let us know: [Contact](https://www.tyme-app.com/en/contact/).

![macOS Plugins](/images/plugins_macos.png)

## Overview

Tyme on your Mac and iPhone offers a JavaScript plugin interface, which lets you customize the export of your logged time entries.
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
  "tymeMinVersion": "2022.9", // the minimum compatible version of Tyme for this plugin
  "version": "1.0",
  "type": "export", // for now, export only
  "name": "My Fancy Export Plugin",
  "summary": "A description of what the plugin does.",
  "author": "John Doe",
  "authorUrl": "https://www.tyme-app.com",
  "icon": "doc.text.magnifyingglass",
  "scriptName": "script.js",
  "scriptMain": "createInvoice()", // the method to call when exporting
  "scriptPreview": "generatePreview()", // the method to call when generating a preview (HTML is expected in return)
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
        "type": "[securetext|text|separator|date|teammembers|tasks|checkbox|dropdown]",
        "name": "label or localization key",
        "placeholder": "label or localization key", // only text
        "persist": true,
        "value": "initial value",
        "values": [ // only dropdown
            {"key1": "label or localization key"},
            {"key1": "label or localization key"}
        ],
        "valueFunction": "getClients()" // only dropdown
    },
]
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

Since the JavaScript runtime your script is running in does not have any browser specific calls, we created a utility
class to cover the most prominent calls. The following calls are available from your script:

### Tyme Specific Calls

```javascript
/* 
    start & end: Date, mandatory
    taskIDs: [string], can be null
    limit: int, can be null
    billingState unbilled = 0, billed = 1, paid = 2
    billable: boolean, can be null
    userID: string, can be null
    
    returns: A list of time entries with the following properties:
        [
            {
              "billing" : "UNBILLED",
              "category" : "Category Name",
              "category_id" : "78DDDB63",
              "distance" : 0,
              "distance_unit" : "km",
              "duration" : 1,
              "duration_unit" : "h",
              "end" : "2022-05-02T13:40:00+02:00",
              "id" : "F3C4DF06",
              "note" : "",
              "project" : "Project Name",
              "project_id" : "6C2EE2B1",
              "quantity" : 0,
              "rate" : 0,
              "rate_unit" : "EUR",
              "rounding_method" : "NEAREST",
              "rounding_minutes" : 1,
              "start" : "2022-05-02T13:39:00+02:00",
              "subtask" : "",
              "subtask_id" : "",
              "sum" : 0,
              "sum_unit" : "EUR",
              "task" : "Task Name",
              "task_id" : "F8F95C9D",
              "type" : "timed",
              "user" : ""
            }
        ]
*/
tyme.timeEntries(start, end, taskIDs, limit, billingState, billable, userID)

/*
    Sets the billing state of given time entries by their ID 
    timeEntryIDs: uniqueIDs of the time entries to be modified
    billingState: unbilled = 0, billed = 1, paid = 2
*/
tyme.setBillingState(timeEntryIDs, billingState)

// Shows an alert
tyme.showAlert(title, message)

// The currently used currency code
tyme.currencyCode()

// The currently used currency symbol
tyme.currencySymbol()

// Opens an URL
tyme.openURL(url)

// Opens a dialog and asks the user where to save the content to file.
tyme.openSaveDialog(fileName, content)
 
/*
    Lets the user select a file from disk. 
    title: The title of the dialog
    fileTypes: array. Allowed file extensions, can be empty
    resultFunction: function (fileContents) { … });
*/
tyme.selectFile(title, fileTypes, resultFunction)
```

### General Calls

```javascript

// Removes a file. File access is restricted to the plugin folder
utils.removeFile(fileName)

// Checks if a file exists. File access is restricted to the plugin folder
utils.fileExists(fileName)

// Writes the content to a file. File access is restricted to the plugin folder
utils.writeToFile(fileName, content)

// Loads the content of the file and returns it. File access is restricted to the plugin folder
utils.contentsOfFile(fileName)

// base64 encodes a string
utils.base64Encode(string)

// base64 decodes a string
utils.base64Decode(string)

// Returns the localized string for a given identifier
utils.localize(string)

// Logs a value to a debug log
// (Enable it in Tyme > Preferences > Developer > Debug Log)
utils.log(string)

// Converts a markdown string to HTML
utils.markdownToHTML(markdown)

/*
    Makes a synchronous HTTP request
    Returns an object: { "statusCode": 200, "result": string }

    Standard headers are: 
    Content-Type: application/json; charset=utf-8
    Accept: application/json
    These can be overidden using the headers parameter
*/
utils.request(url, method, headers, parameters)
```