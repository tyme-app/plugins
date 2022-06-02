/*
	Sends an offer from GrandTotal to Tyme.

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

	Expected result is a JSON representation:

	{
	    categories: [
	        name
	        projects: [
	            name
	            tasks: [
	                name
	                plannedDuration
	                hourlyRate
	                subtasks: [
	                    name
	                    plannedDuration
	                    hourlyRate
	                ]
	            ]
	        ]
	   ]
	}

	Make *sure* the uid you provide is not just a plain integer. Use your domain as prefix.

	Dates must be returned as strings in ISO 8601 format (e.g., 2004-02-12T15:19:21+00:00)

	Returning a string will present it as warning.

	To see how to add global variables (Settings) look at the Info.plist of this sample.

	Keep in mind that for security reasons passwords are stored in the keychain and
	you will have to enter them again after modifying your code.
*/

send();

function send() {
    var tyme3Path = NSHomeDirectory + "/Library/Containers/com.tyme-app.Tyme3-macOS/Data/Library/Application Support/GrandTotal/offers/";
    var offer = query().record().valueForKey("interchangeRecord");
    var fileName = Math.random().toString(36).slice(-5) + ".plist";
    var URL = tyme3Path + fileName;

    var categoryName = offer.clientName;
    var projectName = offer.project === "" ? offer.subject : offer.project;
    var tasks = [];
    var parentTask = null;

    offer.allItems.forEach((item, index) => {
        var task = {
            "name": item.name,
            "plannedDuration": ((item.quantity * item.rate) / item.rate) * 60.0 * 60.0,
            "hourlyRate": item.rate,
            "subtasks": []
        };

        if (item.entityName.toLowerCase() == "title") {
            parentTask = task;
            tasks.push(parentTask);
        } else {
            if (parentTask !== null) {
                parentTask.subtasks.push(task);
            } else {
                tasks.push(task);
            }
        }
    });

    var plistData = {};
    plistData.categories = [{
        "name": categoryName,
        projects: [{
            "name": projectName,
            "tasks": tasks
        }]
    }];

    writeToURL(plistData, URL);
    launchURL("tyme://grandtotal/offer/" + fileName);
}