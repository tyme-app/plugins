class TogglApiClient {

    constructor(apiKey) {
        this.apiKey = apiKey;
        this.baseURL = 'https://api.track.toggl.com/api/v9';
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

            // Überprüfen, ob hex_color existiert und gültig ist, bevor replace angewendet wird
            if (project["hex_color"] && typeof project["hex_color"] === 'string') {
                tymeProject.color = parseInt(project["hex_color"].replace("#", "0x"));
            } else {
                // Setze eine Standardfarbe, falls hex_color nicht vorhanden ist
                tymeProject.color = 0xFFFFFF; // Weiß als Standardfarbe
            }

            tymeProject.defaultHourlyRate = project["rate"] ?? defaultHourlyRate;
            tymeProject.roundingMethod = rounding;
            tymeProject.roundingMinutes = roundingMinutes;

            if (!project["auto_estimates"]) {
                tymeProject.plannedDuration = project["estimated_hours"] * 60 * 60;
            }
            tymeProject.category = Category.fromID(clientID);
        }

        for (let taskID in this.tasks) {
            const task = this.tasks[taskID];
            const id = idPrefix + taskID;
            const projectID = idPrefix + task.project_id;
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
                continue;
            }

            let tymeTask = TimedTask.fromID(taskID);
            if (!tymeTask) {
                continue;
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
            const usersResponse = this.apiClient.getJSON("/workspaces/" + id + "/users");

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
        const workspaceResponse = this.apiClient.getJSON("/workspaces");
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
            const clientsResponse = this.apiClient.getJSON("/workspaces/" + id + "/clients");

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
            const path = "/workspaces/" + id + "/projects";

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
            const path = "/workspaces/" + id + "/tasks";

            const activeTasksResponse = this.apiClient.getJSON(path, {"active": "true"});
            if (activeTasksResponse && Array.isArray(activeTasksResponse.data)) {
                activeTasksResponse.data.forEach(function (entry) {
                    const id = entry["id"];
                    this.tasks[id] = entry;
                }.bind(this));
            } else {
                tyme.showAlert('Could not import active Tasks.', `You may have no inactive tasks in workspace ${workspace["name"]}. \n\n${JSON.stringify(activeTasksResponse)}`);
            }

            const inactiveTasksResponse = this.apiClient.getJSON(path, {"active": "false"});
            if (inactiveTasksResponse && Array.isArray(inactiveTasksResponse.data)) {
                inactiveTasksResponse.forEach(function (entry) {
                    const id = entry["id"];
                    this.tasks[id] = entry;
                }.bind(this));
            } else {
                if (inactiveTasksResponse.total_count === 0) {
                    continue;
                }
                tyme.showAlert('Could not import inactive Tasks.', `You may have no inactive tasks in workspace ${workspace["name"]}. \n\n${JSON.stringify(inactiveTasksResponse)}`);
            }
        }
    }

    getTimeEntries() {
        this.timeEntries = [];

        for (const workspace of this.workspaces) {
            const id = workspace["id"];

            let finished = false;
            let page = 1;

            // Setze das Enddatum auf heute
            let endDate = new Date();

            // Startdatum ist das aktuelle Enddatum minus 2 Monate
            let startDate = new Date();
            startDate.setMonth(endDate.getMonth() - 2);

            do {
                const params = {
                    "workspace_id": id,
                    "since": Math.floor(startDate.getTime() / 1000),  // Unix-Zeitstempel in Sekunden
                    "until": Math.floor(endDate.getTime() / 1000),    // Unix-Zeitstempel in Sekunden
                    "user_agent": "tyme_toggl_import",
                    "page": page
                };

                const timeEntriesResponse = this.apiClient.getJSON("/me/time_entries", params);

                // Überprüfen, ob die Antwort gültig ist und die "data" Eigenschaft enthält
                if (timeEntriesResponse && Array.isArray(timeEntriesResponse)) {
                    if (timeEntriesResponse.length === 0) {
                        finished = true;
                    } else {
                        this.timeEntries.push(...timeEntriesResponse);
                        page++;
                    }
                } else {
                    // Handle unexpected response structure or errors
                    finished = true;
                    tyme.showAlert("Unexpected API response:", JSON.stringify(timeEntriesResponse));
                }

                // Beende die Schleife nach einer erfolgreichen Anfrage
                finished = true;

            } while (!finished);
        }
    }
}

const importer = new TogglImporter(formValue.togglKey);