class EarlyApiClient {
    constructor(apiKey, apiSecret) {
        this.apiKey = apiKey;
        this.apiSecret = apiSecret;
        this.baseURL = 'https://api.early.app/api/v4/';
        this.accessToken = null;
    }

    hasAccessToken() {
        return this.accessToken !== null;
    }

    getAccessToken() {
        if (this.hasAccessToken()) {
            return this.accessToken;
        }

        const response = utils.request(
            this.baseURL + "developer/sign-in",
            "POST",
            {},
            {
                "apiKey": this.apiKey,
                "apiSecret": this.apiSecret
            }
        );

        const statusCode = response['statusCode'];
        let result = response['result'];

        if (statusCode === 200) {
            result = JSON.parse(result);
            this.accessToken = result["token"];
        }

        return this.accessToken;
    }

    getJSON(method, path, params = {}) {
        const accessToken = this.getAccessToken();

        if (!accessToken) {
            return;
        }

        const headers = {"Authorization": "Bearer " + accessToken};
        const response = utils.request(this.baseURL + path, method, headers, params);
        const statusCode = response['statusCode'];
        const result = response['result'];

        if (statusCode === 200) {
            return JSON.parse(result);
        } else {
            tyme.showAlert('Early API Error', JSON.stringify(response));
            return null;
        }
    }
}

class EarlyImporter {
    constructor(apiKey, apiSecret) {
        this.apiClient = new EarlyApiClient(apiKey, apiSecret);
    }

    start() {
        this.timeEntries = [];
        this.getReportData();
        this.getCurrentTracking();
        this.parseData();
    }

    getLeavesData() {
        // to be implemented later, when Tyme supports importing absence data

        for (let i = 1; i <= 2; i++) {
            let startDate = new Date();
            startDate.setFullYear(startDate.getFullYear() - i);
            let endDate = new Date();
            endDate.setFullYear(endDate.getFullYear() - (i - 1));

            const startString = startDate.toISOString().split('T')[0]
            const endString = endDate.toISOString().split('T')[0]

            const response = this.apiClient.getJSON(
                "GET",
                "leaves",
                {
                    "start": startString,
                    "end": endString
                }
            );
        }
    }

    getCurrentTracking() {
        const response = this.apiClient.getJSON(
            "GET",
            "tracking"
        );

        if (response) {
            this.timeEntries.push(response);
        }
    }

    getReportData() {

        for (let i = 1; i <= 2; i++) {
            let startDate = new Date();
            startDate.setFullYear(startDate.getFullYear() - i);
            let endDate = new Date();
            endDate.setFullYear(endDate.getFullYear() - (i - 1));

            const startString = startDate.toISOString().split('T')[0]
            const endString = endDate.toISOString().split('T')[0]
            const response = this.apiClient.getJSON(
                "POST",
                "report",
                {
                    "date": {
                        "start": startString,
                        "end": endString
                    },
                    "fileType": "json"
                }
            );

            if (response) {
                this.timeEntries.push(...response["timeEntries"]);
            }
        }
    }

    parseData() {
        for (const timeEntry of this.timeEntries) {
            const idPrefix = "early-";

            const timeEntryID = idPrefix + timeEntry["id"];
            const activityID = idPrefix + timeEntry["activity"]["id"];
            const activityName = timeEntry["activity"]["name"];
            const activityColor = timeEntry["activity"]["color"];

            let folderID = idPrefix + timeEntry["activity"]["folderId"];
            let folderName = "Default";

            if (timeEntry["folder"]) {
                folderName = timeEntry["folder"]["name"];
            }

            let userEmail = "";

            if (timeEntry["folder"]) {
                userEmail = timeEntry["user"]["email"];
            }

            let start = 0;
            let end = 0;

            if (timeEntry["duration"]) {
                start = Date.parse(timeEntry["duration"]["startedAt"]);
                end = Date.parse(timeEntry["duration"]["stoppedAt"]);
            } else if (timeEntry["startedAt"]) {
                start = Date.parse(timeEntry["startedAt"]);
            }

            const note = timeEntry["note"]["text"] ?? "";

            const categoryID = idPrefix + "default-category";
            let tymeCategory = Category.fromID(categoryID)
            if(!tymeCategory) {
                tymeCategory = Category.create(categoryID);
                tymeCategory.name = "Early Import";
            }

            let tymeProject = Project.fromID(folderID) ?? Project.create(folderID);
            tymeProject.name = folderName;
            tymeProject.color = parseInt(activityColor.replace("#", "0x"));
            tymeProject.category = tymeCategory;

            let tymeTask = TimedTask.fromID(activityID) ?? TimedTask.create(activityID);
            tymeTask.name = activityName;
            tymeTask.project = tymeProject;

            let tymeEntry = TimeEntry.fromID(timeEntryID) ?? TimeEntry.create(timeEntryID);
            tymeEntry.note = note;
            tymeEntry.timeStart = start;
            tymeEntry.timeEnd = end;
            tymeEntry.parentTask = tymeTask;

            const tymeUserID = tyme.userIDForEmail(userEmail);

            if (tymeUserID) {
                tymeEntry.userID = tymeUserID;
            }
        }
    }
}

const importer = new EarlyImporter(
    formValue.apiKey,
    formValue.apiSecret
);

