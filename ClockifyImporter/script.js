class ClockifyApiClient {

    constructor(apiKey) {
        this.apiKey = apiKey;
        this.baseURL = 'https://api.clockify.me/api/v1/';
    }

    getJSON(path, params = null) {
        const response = utils.request(this.baseURL + path, 'GET', {'X-Api-Key': this.apiKey}, params);
        const statusCode = response['statusCode'];
        const result = response['result'];

        if (statusCode === 200) {
            return JSON.parse(result);
        } else {
            tyme.showAlert('Clockify API Error', JSON.stringify(response));
            return null;
        }
    }
}

class ClockifyImporter {
    constructor(apiKey) {
        this.apiClient = new ClockifyApiClient(apiKey);
    }

    start() {
        if (!this.getUser()) {
            return;
        }
        if (!this.getWorkspaces()) {
            return;
        }

        this.users = this.generateLookup("users");
        this.clients = this.generateLookup("clients");
        this.tags = this.generateLookup("tags");
        this.projects = this.generateLookup("projects");
        this.tasks = {};

        for (let projectID in this.projects) {
            let tasks = this.generateLookup("projects/" + projectID + "/tasks");
            this.tasks = {...this.tasks, ...tasks};
        }

        for (let userID in this.users) {
            const timeEntries = this.generateLookup("user/" + userID + "/time-entries/");
            this.timeEntries = {...this.timeEntries, ...timeEntries};
        }

        utils.log(JSON.stringify(this.tasks));
    }

    getUser() {
        const userResponse = this.apiClient.getJSON("user");
        if (!userResponse) {
            return false;
        }

        this.userID = userResponse["id"];
        this.activeWorkspaceID = userResponse["activeWorkspace"];

        return true;
    }

    getWorkspaces() {
        const workspacesResponse = this.apiClient.getJSON("workspaces");
        if (!workspacesResponse) {
            return false;
        }

        this.workspaceHourlyRate = 0;

        const activeWorkspace =
            workspacesResponse
                .filter(function (workspace) {
                    return workspace.id === this.activeWorkspaceID;
                }.bind(this))[0];

        if (activeWorkspace.hourlyRate) {
            this.workspaceHourlyRate = activeWorkspace.hourlyRate.amount;
        }

        return true
    }

    generateLookup(type) {
        let lookUpData = {};
        let page = 1;
        let finished = false;

        do {
            const params = {"page": page};
            const response = this.apiClient.getJSON("workspaces/" + this.activeWorkspaceID + "/" + type, params);

            if (!response || response.length === 0) {
                finished = true;
            }

            response.forEach(function (entry) {
                const id = entry["id"];
                lookUpData[id] = entry;
            }.bind(this));

            page++;
        }
        while (!finished);

        utils.log("\n\n" + type + " #############");
        utils.log(JSON.stringify(lookUpData));

        return lookUpData;
    }
}

const importer = new ClockifyImporter(formValue.clockifyKey);
