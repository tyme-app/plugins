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

        const activeClients = this.generateLookup("clients", {"archived": false});
        const archivedClients = this.generateLookup("clients", {"archived": true});
        this.clients = {...activeClients, ...archivedClients};

        const activeProjects = this.generateLookup("projects", {"archived": false});
        const archivedProjects = this.generateLookup("projects", {"archived": true});
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

    processData() {
        const idPrefix = "clockify-";

        for (let clientID in this.clients) {
            const client = this.clients[clientID];
            const id = idPrefix + client["id"];

            let tymeCategory = Category.fromID(id) ?? Category.create(id);
            tymeCategory.name = client["name"];
            tymeCategory.isCompleted = client["archived"];

            // utils.log("client: " + JSON.stringify(client));
        }

        for (let projectID in this.projects) {
            const project = this.projects[projectID];
            const id = idPrefix + project["id"];
            const clientId = idPrefix + project["clientId"];

            let hourlyRate = 0;

            if (project["hourlyRate"]) {
                hourlyRate = project["hourlyRate"]["amount"];
            }

            if (project['billable'] === 1 && hourlyRate === 0) {
                hourlyRate = this.workspaceHourlyRate / 100.0;
            } else {
                hourlyRate = hourlyRate / 100.0;
            }

            let tymeProject = Project.fromID(id) ?? Project.create(id);
            tymeProject.name = project["name"];
            tymeProject.note = project["note"];
            tymeProject.isCompleted = project["archived"];
            tymeProject.color = parseInt(project["color"].replace("#", "0x"));

            const category = Category.fromID(clientId);
            if (category) {
                tymeProject.category = category;
                if (category.isCompleted) {
                    tymeProject.isCompleted = true;
                }
            }

            /*
                        project["billable"];
                        project["estimate"];
                        project["timeEstimate"];
                        project["budgetEstimate"];
             */

            // utils.log("project: " + JSON.stringify(project));
        }

        for (let taskID in this.tasks) {
            const task = this.tasks[taskID];
            const id = idPrefix + task["id"];
            const projectId = idPrefix + task["projectId"];

            let tymeTask = TimedTask.fromID(id) ?? TimedTask.create(id);
            tymeTask.name = task["name"];
            tymeTask.note = task["note"];
            tymeTask.isCompleted = task["status"] === "DONE";
            tymeTask.billable = task["billable"];
            tymeTask.project = Project.fromID(projectId);

            // utils.log("task: " + JSON.stringify(task));

            /*
            task["hourlyRate"]["amount"];
            task["estimate"];
            task["timeEstimate"];
             */
        }

        for (let timeEntryID in this.timeEntries) {
            const timeEntry = this.timeEntries[timeEntryID];
            const id = idPrefix + timeEntry["id"];

            if (!timeEntry["timeInterval"]) {
                continue;
            }

            let taskId = "";

            if (!timeEntry["taskId"]) {
                const projectId = idPrefix + timeEntry["projectId"];
                taskId = idPrefix + timeEntry["projectId"] + "-default";
                let tymeTask = TimedTask.fromID(taskId) ?? TimedTask.create(taskId);
                tymeTask.project = Project.fromID(projectId);
                tymeTask.name = "Default Task";
            } else {
                taskId = idPrefix + timeEntry["taskId"];
            }

            let tymeEntry = TimeEntry.fromID(id) ?? TimeEntry.create(id);
            tymeEntry.note = timeEntry["description"];
            tymeEntry.timeStart = Date.parse(timeEntry["timeInterval"]["start"]);
            tymeEntry.timeEnd = Date.parse(timeEntry["timeInterval"]["end"]);
            tymeEntry.parentTask = TimedTask.fromID(taskId);

            /*
            timeEntry["userId"];
             */

            utils.log("timeEntry: " + JSON.stringify(timeEntry));
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
