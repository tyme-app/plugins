/*
    Keep in mind that you can't use browser specific calls. Use following calls

    --Loading httpContents--
    String loadURL(method,url,headers);

    --Files--
    BOOL fileExists(path);
    BOOL fileIsDirectory(path);
    String contentsOfFile(path);
    String plistToJSON(String);
    Array of Strings contentsOfDirectory(path);

    NSHomeDirectory variable

    --Logging to the Console--
    log(value);

    --Base64--
    String base64Encode(string);

    Expected result is a JSON string representation of an array.

    [
        {"startDate":"2015-05-24T17:49:27+02:00","client":"Client A","project":"My Project","minutes":120,"notes":"HTML Coding","user":"me","cost":200,"uid":"com.toggle.233283908"},
        {"startDate":"2015-05-24T16:58:00+02:00","client":"Client B","project":"Other Project","minutes":10,"notes":"Fixing bugs","user":"me","cost":16.666666666666664,"uid":"com.toggle.233275239"}
    ]

    Make *sure* the uid you provide is not just a plain integer. Use your domain as prefix.

    Dates must be returned as strings in ISO 8601 format (e.g., 2004-02-12T15:19:21+00:00)

    Returning a string will present it as warning.

    To see how to add global variables (Settings) look at the Info.plist of this sample.

    Keep in mind that for security reasons passwords are stored in the keychain and
    you will have to enter them again after modifying your code.

*/

timedEntries();

function timedEntries() {
    var tyme2Path = NSHomeDirectory + "/Library/Containers/de.lgerckens.Tyme2/Data/Library/Application Support/GrandtotalData/";
    var tyme3Path = NSHomeDirectory + "/Library/Containers/com.tyme-app.Tyme3-macOS/Data/Library/Application Support/GrandTotal/data/";
    var tyme3StateURL = NSHomeDirectoryURL + "/Library/Containers/com.tyme-app.Tyme3-macOS/Data/Library/Application%20Support/GrandTotal/state/";

    // write the billed urls

    try {
        var billedUIDs = getBilledUIDs("");
        var billedURL = tyme3StateURL + "billed.plist";
        writeToURL(billedUIDs, billedURL);
    } catch (exception) {
        log(exception);
    }

    try {
        var paidUIDs = getPaidUIDs("");
        var paidURL = tyme3StateURL + "paid.plist";
        writeToURL(paidUIDs, paidURL);
    } catch (exception) {
        log(exception);
    }

    var path = tyme2Path

    if (fileExists(tyme3Path)) {
        path = tyme3Path
    }

    var folderContents = contentsOfDirectory(path);
    var str = "[";

    for (var i = 0; i < folderContents.length; i++) {
        var content = contentsOfFile(folderContents[i]);

        if (content && content.length > 0) {
            content = content.replace(new RegExp('\n', 'g'), '\\n');
            str += content;

            if (i < folderContents.length - 1) {
                str += ",";
            }
        }
    }

    str += "]";
    return str;
}
