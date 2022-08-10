The following calls are available in your plugin scripts.

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
              "duration_unit" : "m",
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
              "start" : "2022-05-02T13:39:00+02:00", // ISO 8601
              "subtask" : "",
              "subtask_id" : "",
              "sum" : 0,
              "sum_unit" : "EUR",
              "task" : "Task Name",
              "task_id" : "F8F95C9D",
              "type" : "timed",
              "user" : "",
              "user_id" : ""
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

// Tries to fetch the userID of a team user by their email
tyme.userIDForEmail(email)

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

// Saves a value to the local device keychain. Use this method to store secure values
tyme.setSecureValue(key, value)

// Retrieves a value from the local device keychain
tyme.getSecureValue(key)

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
