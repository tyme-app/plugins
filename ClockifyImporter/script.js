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

        this.users = this.generateLookup("users", {"status": "ACTIVE"});

        const activeClients = this.generateLookup("clients", {"archived": "false"});
        const archivedClients = this.generateLookup("clients", {"archived": "true"});
        this.clients = {...activeClients, ...archivedClients};

        const activeProjects = this.generateLookup("projects", {"archived": "false"});
        const archivedProjects = this.generateLookup("projects", {"archived": "true"});
        this.projects = {...activeProjects, ...archivedProjects};

        this.tasks = {};

        for (let projectID in this.projects) {
            let activeTasks = this.generateLookup(
                "projects/" + projectID + "/tasks",
                {
                    "is-active": true,
                    "project-required": true,
                    "task-required": false
                }
            );

            let archivedTasks = this.generateLookup(
                "projects/" + projectID + "/tasks",
                {
                    "is-active": false,
                    "project-required": true,
                    "task-required": false
                }
            );

            this.tasks = {...this.tasks, ...activeTasks, ...archivedTasks};
        }

        let startDate = new Date();
        startDate.setFullYear(startDate.getFullYear() - 2);
        let endDate = new Date();

        for (let userID in this.users) {
            const timeEntries = this.generateLookup(
                "user/" + userID + "/time-entries/",
                {
                    "start": startDate.toISOString(),
                    "end": endDate.toISOString()
                }
            );
            this.timeEntries = {...this.timeEntries, ...timeEntries};
        }

        this.processData();
    }

    extractEstimate(estimateString) {
        let matches = estimateString.match(/PT([\d]+)H/);

        if (matches && matches.length > 0) {
            return parseInt(matches[1]) * 60 * 60;
        }

        return 0;
    }

    processData() {
        const idPrefix = "clockify-";

        for (let clientID in this.clients) {
            const client = this.clients[clientID];
            const id = idPrefix + client["id"];

            let tymeCategory = Category.fromID(id) ?? Category.create(id);
            tymeCategory.name = client["name"];
            tymeCategory.isCompleted = client["archived"];
        }

        for (let projectID in this.projects) {
            const project = this.projects[projectID];
            const id = idPrefix + project["id"];
            const clientID = idPrefix + project["clientId"];

            let hourlyRate = 0;

            if (project["hourlyRate"]) {
                hourlyRate = project["hourlyRate"]["amount"];
            }

            if (project['billable'] && hourlyRate === 0) {
                hourlyRate = this.workspaceHourlyRate / 100.0;
            } else {
                hourlyRate = hourlyRate / 100.0;
            }

            let tymeProject = Project.fromID(id) ?? Project.create(id);
            tymeProject.name = project["name"];
            tymeProject.note = project["note"];
            tymeProject.isCompleted = project["archived"];
            tymeProject.color = parseInt(project["color"].replace("#", "0x"));
            tymeProject.defaultHourlyRate = hourlyRate;

            const tymeCategory = Category.fromID(clientID);
            if (tymeCategory) {
                tymeProject.category = tymeCategory;
                if (tymeCategory.isCompleted) {
                    tymeProject.isCompleted = true;
                }
            }

            let plannedDuration = 0;

            if (project["timeEstimate"] && project["timeEstimate"]["active"] && project["timeEstimate"]["type"] === "MANUAL") {
                plannedDuration = this.extractEstimate(project["timeEstimate"]["estimate"]);
            }

            tymeProject.plannedDuration = plannedDuration;
        }

        for (let taskID in this.tasks) {
            const task = this.tasks[taskID];
            const id = idPrefix + task["id"];
            const projectID = idPrefix + task["projectId"];

            let tymeTask = TimedTask.fromID(id) ?? TimedTask.create(id);
            tymeTask.name = task["name"];
            tymeTask.note = task["note"];
            tymeTask.isCompleted = task["status"] === "DONE";
            tymeTask.billable = task["billable"];
            const project = Project.fromID(projectID);
            tymeTask.project = project;

            if (project.isCompleted) {
                tymeTask.isCompleted = true;
            }

            if (task["estimate"]) {
                tymeTask.plannedDuration = this.extractEstimate(task["estimate"]);
            }

            if (task["hourlyRate"]) {
                tymeTask.hourlyRate = task["hourlyRate"]["amount"]
            }
        }

        for (let timeEntryID in this.timeEntries) {
            const timeEntry = this.timeEntries[timeEntryID];
            const id = idPrefix + timeEntry["id"];

            if (!timeEntry["timeInterval"]) {
                continue;
            }

            let taskID = "";

            if (!timeEntry["taskId"]) {
                const projectID = idPrefix + timeEntry["projectId"];
                taskID = idPrefix + timeEntry["projectId"] + "-default";
                let tymeTask = TimedTask.fromID(taskID) ?? TimedTask.create(taskID);
                tymeTask.project = Project.fromID(projectID);
                tymeTask.name = "Default Task";
            } else {
                taskID = idPrefix + timeEntry["taskId"];
            }

            let tymeEntry = TimeEntry.fromID(id) ?? TimeEntry.create(id);
            tymeEntry.note = timeEntry["description"];
            tymeEntry.timeStart = Date.parse(timeEntry["timeInterval"]["start"]);
            tymeEntry.timeEnd = Date.parse(timeEntry["timeInterval"]["end"]);
            tymeEntry.parentTask = TimedTask.fromID(taskID);

            const userID = timeEntry["userId"];
            const user = this.users[userID];
            const tymeUserID = tyme.userIDForEmail(user["email"]);

            if (tymeUserID) {
                tymeEntry.userID = tymeUserID;
            }
        }
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

    generateLookup(path, additionalParams = {}) {
        let lookUpData = {};
        let page = 1;
        let finished = false;

        do {
            const params = {
                "page": page,
                ...additionalParams
            };
            const response = this.apiClient.getJSON("workspaces/" + this.activeWorkspaceID + "/" + path, params);

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

        return lookUpData;
    }
}

const importer = new ClockifyImporter(formValue.clockifyKey);
