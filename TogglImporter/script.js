class TogglApiClient {

    constructor(apiKey) {
        this.apiKey = apiKey;
        this.baseURL = 'https://api.track.toggl.com';
    }

    request(path, params = null, method = "GET") {
        const response = utils.request(
            this.baseURL + path,
            method,
            {'Authorization': 'Basic ' + utils.base64Encode(this.apiKey + ':api_token')},
            params
        );

        const statusCode = response['statusCode'];
        const result = response['result'];
        const headers = response['headers'];

        if (statusCode === 200) {
            return [JSON.parse(result), headers];
        } else {
            return [null, headers];
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

            if (project["color"] && typeof project["color"] === 'string') {
                tymeProject.color = parseInt(project["color"].replace("#", "0x"));
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
            const projectID = idPrefix + task["project_id"];
            let billable = true;
            const togglProject = this.projects[task["project_id"]]

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
            const projectID = idPrefix + (timeEntry["project_id"] ?? "-default");
            const taskID = idPrefix + (timeEntry["task_id"] ?? (projectID + "-default"));

            /*
            {
                "user_id": 11238397,
                "username": "sandbox_tester2@tyme-app.com",
                "project_id": 205181464,
                "task_id": null,
                "billable": false,
                "description": "something else",
                "tag_ids": [],
                "billable_amount_in_cents": null,
                "hourly_rate_in_cents": null,
                "currency": "USD",
                "time_entries": [
                    {
                        "id": 3587874298,
                        "seconds": 3600,
                        "start": "2024-09-02T07:00:00+02:00",
                        "stop": "2024-09-02T08:00:00+02:00",
                        "at": "2024-09-02T08:25:48+00:00",
                        "at_tz": "2024-09-02T10:25:48+02:00"
                    }
                ],
                "row_number": 1
            }

            */


            // make sure the tasks & project exists. if there is none in toggl. create a default one

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

            for (const subTimeEntry of timeEntry["time_entries"]) {
                const timeEntryID = idPrefix + subTimeEntry["id"];

                let tymeEntry = TimeEntry.fromID(timeEntryID) ?? TimeEntry.create(timeEntryID);
                tymeEntry.note = timeEntry["description"];
                tymeEntry.timeStart = Date.parse(subTimeEntry["start"]);
                tymeEntry.timeEnd = Date.parse(subTimeEntry["stop"]);
                tymeEntry.parentTask = TimedTask.fromID(taskID);

                const userID = timeEntry["user_id"];
                const user = this.users[userID];
                const tymeUserID = tyme.userIDForEmail(user["email"]);

                if (tymeUserID) {
                    tymeEntry.userID = tymeUserID;
                }
            }
        }
    }

    getUsers() {
        this.users = {};

        for (const workspace of this.workspaces) {
            const id = workspace["id"];
            const [usersResponse, headers] = this.apiClient.request("/api/v9/workspaces/" + id + "/users");

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
        const [workspaceResponse, headers] = this.apiClient.request("/api/v9/workspaces");
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
            const [clientsResponse, headers] = this.apiClient.request("/api/v9/workspaces/" + id + "/clients");

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
            const path = "/api/v9/workspaces/" + id + "/projects";

            const [activeProjectsResponse, headers1] = this.apiClient.request(path, {"active": "true"});
            if (activeProjectsResponse) {
                activeProjectsResponse.forEach(function (entry) {
                    const id = entry["id"];
                    this.projects[id] = entry;
                }.bind(this));
            }

            const [inactiveProjectsResponse, headers2] = this.apiClient.request(path, {"active": "false"});

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
            const path = "/api/v9/workspaces/" + id + "/tasks";

            const [activeTasksResponse, headers1] = this.apiClient.request(path, {"active": "true"});
            if (activeTasksResponse && Array.isArray(activeTasksResponse.data)) {
                activeTasksResponse.data.forEach(function (entry) {
                    const id = entry["id"];
                    this.tasks[id] = entry;
                }.bind(this));
            }

            const [inactiveTasksResponse, headers2] = this.apiClient.request(path, {"active": "false"});
            if (inactiveTasksResponse && Array.isArray(inactiveTasksResponse.data)) {
                inactiveTasksResponse.data.forEach(function (entry) {
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
                let firstRow = null;

                do {
                    const params = {
                        "start_date": startDate.toISOString().split('T')[0],
                        "end_date": endDate.toISOString().split('T')[0],
                        "user_agent": "tyme_toggl_import",
                        "first_row_number": firstRow,
                        "page_size": 50
                    };

                    const [timeEntriesResponse, headers] = this.apiClient.request(
                        "/reports/api/v3/workspace/" + id + "/search/time_entries",
                        params,
                        "POST"
                    );

                    firstRow = parseInt(headers["x-next-row-number"]) || null;

                    if (timeEntriesResponse && Array.isArray(timeEntriesResponse)) {
                        this.timeEntries.push(...timeEntriesResponse);

                        if (timeEntriesResponse.length === 0 || firstRow == null) {
                            finished = true;
                        }
                    } else {
                        finished = true;
                    }
                }
                while (!finished);
            }
        }
    }
}

const importer = new TogglImporter(formValue.togglKey);
