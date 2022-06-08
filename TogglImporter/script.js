class TogglApiClient {

    constructor(apiKey) {
        this.apiKey = apiKey;
        this.baseURL = 'https://api.track.toggl.com';
    }

    getJSON(path, params = null) {
        const response = utils.request(
            this.baseURL + path,
            'GET',
            {'Authorization': 'Basic ' + utils.base64Encode(this.apiKey + ':api_token')},
            params
        );

        const statusCode = response['statusCode'];
        const result = response['result'];

        if (statusCode === 200) {
            return JSON.parse(result);
        } else {
            tyme.showAlert('Toggl API Error', JSON.stringify(response));
            return null;
        }
    }
}

class TogglImporter {
    constructor(apiKey) {
        this.apiClient = new TogglApiClient(apiKey);
    }

    start() {
        if (!this.getWorkspaces()) {
            return;
        }

        this.getUsers();
        this.getClients();
        this.getProjects();
        this.getTasks();
        this.getTimeEntries();

        this.processData();
    }

    processData() {
        const idPrefix = "toggl-";
        const defaultHourlyRate = this.workspaces[0]["default_hourly_rate"];
        const rounding = this.workspaces[0]["rounding"] + 1;
        const roundingMinutes = this.workspaces[0]["rounding_minutes"];

        for (let clientID in this.clients) {
            const client = this.clients[clientID];
            const id = idPrefix + clientID;

            let tymeCategory = Category.fromID(id) ?? Category.create(id);
            tymeCategory.name = client["name"];
        }

        for (let projectID in this.projects) {
            const project = this.projects[projectID];
            const id = idPrefix + projectID;
            const clientID = idPrefix + project["cid"];

            let tymeProject = Project.fromID(id) ?? Project.create(id);
            tymeProject.name = project["name"];
            tymeProject.isCompleted = !project["active"];
            tymeProject.color = parseInt(project["hex_color"].replace("#", "0x"));
            tymeProject.defaultHourlyRate = project["rate"] ?? defaultHourlyRate;
            if (!project["auto_estimates"]) {
                tymeProject.plannedDuration = project["estimated_hours"] * 60 * 60;
            }
            tymeProject.category = Category.fromID(clientID);
        }

        for (let taskID in this.tasks) {
            const task = this.tasks[taskID];
            const id = idPrefix + taskID;
            const projectID = idPrefix + task["pid"];
            let billable = true;
            const togglProject = this.projects[task["pid"]]

            if (togglProject) {
                billable = togglProject["billable"];
            }

            let tymeTask = TimedTask.fromID(id) ?? TimedTask.create(id);
            tymeTask.name = task["name"];
            tymeTask.isCompleted = !task["active"];
            tymeTask.billable = billable;
            tymeTask.plannedDuration = task["estimated_seconds"];
            tymeTask.roundingMethod = rounding;
            tymeTask.roundingMinutes = roundingMinutes;

            const project = Project.fromID(projectID);
            tymeTask.project = project;

            if (project.isCompleted) {
                tymeTask.isCompleted = true;
            }
        }

        for (const timeEntry of this.timeEntries) {
            const timeEntryID = idPrefix + timeEntry["id"];
            const projectID = idPrefix + (timeEntry["pid"] ?? "-default");
            const taskID = idPrefix + (timeEntry["tid"] ?? (projectID + "-default"));

            // make sure the tasks & project exists

            let tymeProject = Project.fromID(projectID);
            if (!tymeProject) {
                tymeProject = Project.create(projectID);
                tymeProject.name = "Default";
                tymeProject.color = 0xFF9900;
                tymeProject.defaultHourlyRate = defaultHourlyRate;
            }

            let tymeTask = TimedTask.fromID(taskID);
            if (!tymeTask) {
                tymeTask = TimedTask.create(taskID);
                tymeTask.name = "Default";
                tymeTask.project = tymeProject;
            }

            let tymeEntry = TimeEntry.fromID(timeEntryID) ?? TimeEntry.create(timeEntryID);
            tymeEntry.note = timeEntry["description"];
            tymeEntry.timeStart = Date.parse(timeEntry["start"]);
            tymeEntry.timeEnd = Date.parse(timeEntry["end"]);
            tymeEntry.parentTask = TimedTask.fromID(taskID);

            const userID = timeEntry["uid"];
            const user = this.users[userID];
            const tymeUserID = tyme.userIDForEmail(user["email"]);

            if (tymeUserID) {
                tymeEntry.userID = tymeUserID;
            }
        }
    }

    getUsers() {
        this.users = {};

        for (const workspace of this.workspaces) {
            const id = workspace["id"];
            const usersResponse = this.apiClient.getJSON("/api/v8/workspaces/" + id + "/users");

            if (!usersResponse) {
                continue;
            }

            usersResponse.forEach(function (entry) {
                const id = entry["id"];
                this.users[id] = entry;
            }.bind(this));
        }
    }

    getWorkspaces() {
        const workspaceResponse = this.apiClient.getJSON("/api/v8/workspaces");
        if (!workspaceResponse) {
            return false;
        }

        this.workspaces = workspaceResponse;
        return true;
    }

    getClients() {
        this.clients = {};

        for (const workspace of this.workspaces) {
            const id = workspace["id"];
            const clientsResponse = this.apiClient.getJSON("/api/v8/workspaces/" + id + "/clients");

            if (!clientsResponse) {
                continue;
            }

            clientsResponse.forEach(function (entry) {
                const id = entry["id"];
                this.clients[id] = entry;
            }.bind(this));
        }
    }

    getProjects() {
        this.projects = {};

        for (const workspace of this.workspaces) {
            const id = workspace["id"];
            const path = "/api/v8/workspaces/" + id + "/projects";

            const activeProjectsResponse = this.apiClient.getJSON(path, {"active": "true"});
            if (activeProjectsResponse) {
                activeProjectsResponse.forEach(function (entry) {
                    const id = entry["id"];
                    this.projects[id] = entry;
                }.bind(this));
            }

            const inactiveProjectsResponse = this.apiClient.getJSON(path, {"active": "false"});

            if (inactiveProjectsResponse) {
                inactiveProjectsResponse.forEach(function (entry) {
                    const id = entry["id"];
                    this.projects[id] = entry;
                }.bind(this));
            }
        }
    }

    getTasks() {
        this.tasks = {};

        for (const workspace of this.workspaces) {
            const id = workspace["id"];
            const path = "/api/v8/workspaces/" + id + "/tasks";

            const activeTasksResponse = this.apiClient.getJSON(path, {"active": "true"});
            if (activeTasksResponse) {
                activeTasksResponse.forEach(function (entry) {
                    const id = entry["id"];
                    this.tasks[id] = entry;
                }.bind(this));
            }

            const inactiveTasksResponse = this.apiClient.getJSON(path, {"active": "false"});
            if (inactiveTasksResponse) {
                inactiveTasksResponse.forEach(function (entry) {
                    const id = entry["id"];
                    this.tasks[id] = entry;
                }.bind(this));
            }
        }
    }

    getTimeEntries() {
        this.timeEntries = [];

        for (const workspace of this.workspaces) {
            const id = workspace["id"];

            for (let i = 1; i <= 2; i++) {

                let startDate = new Date();
                startDate.setFullYear(startDate.getFullYear() - i);
                let endDate = new Date();
                endDate.setFullYear(endDate.getFullYear() - (i - 1));

                let finished = false;
                let page = 1;

                do {
                    const params = {
                        "workspace_id": id,
                        "since": startDate.toISOString(),
                        "until": endDate.toISOString(),
                        "user_agent": "tyme_toggl_import",
                        "page": page
                    };

                    const timeEntriesResponse = this.apiClient.getJSON(
                        "/reports/api/v2/details",
                        params
                    );

                    if (!timeEntriesResponse) {
                        finished = true;
                    }

                    const timeEntries = timeEntriesResponse["data"];

                    if (timeEntries.length === 0) {
                        finished = true;
                    }

                    this.timeEntries.push(...timeEntries);
                    page++;
                }
                while (!finished);
            }
        }
    }
}

const importer = new TogglImporter(formValue.togglKey);
