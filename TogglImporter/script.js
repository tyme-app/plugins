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

        for (const workspace of this.workspaces) {
            const workspaceID = workspace["id"];
            const defaultHourlyRate = workspace["default_hourly_rate"];
            const rounding = workspace["rounding"] + 1;
            const roundingMinutes = workspace["rounding_minutes"];

            for (let clientID in this.clients) {
                const client = this.clients[clientID];
                const id = idPrefix + clientID;
                const wid = client["wid"];

                if (wid !== workspaceID) {
                    continue;
                }

                let tymeCategory = Category.fromID(id) ?? Category.create(id);
                tymeCategory.name = client["name"];
            }

            for (let projectID in this.projects) {
                const project = this.projects[projectID];
                const id = idPrefix + projectID;
                const clientID = idPrefix + project["cid"];
                const wid = project["wid"];

                if (wid !== workspaceID) {
                    continue;
                }

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
                const wid = task["wid"];
                const projectID = idPrefix + task["pid"];
                let billable = true;
                const togglProject = this.projects[task["pid"]]

                if (togglProject) {
                    billable = togglProject["billable"];
                }

                if (wid !== workspaceID) {
                    continue;
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

        /*
        {
            "8543447": {
                "id": 8543447,
                "default_wid": 6453792,
                "email": "sandbox_tester1@tyme-app.com",
                "fullname": "Sandbox_tester1",
                "jquery_timeofday_format": "h:i A",
                "jquery_date_format": "m/d/Y",
                "timeofday_format": "h:mm A",
                "date_format": "MM/DD/YYYY",
                "store_start_and_stop_time": false,
                "beginning_of_week": 1,
                "language": "en_US",
                "image_url": "https://assets.track.toggl.com/images/profile.png",
                "at": "2022-06-05T16:10:12+00:00",
                "created_at": "2022-06-05T16:10:12+00:00",
                "record_timeline": false,
                "should_upgrade": true,
                "timezone": "Europe/Berlin",
                "openid_enabled": false,
                "send_product_emails": true,
                "send_weekly_report": true,
                "send_timer_notifications": true,
                "invitation": {},
                "duration_format": "improved"
            }
        }
        */
    }

    getWorkspaces() {
        const workspaceResponse = this.apiClient.getJSON("/api/v8/workspaces");
        if (!workspaceResponse) {
            return false;
        }

        this.workspaces = workspaceResponse;
        /*
                [{
                    "id": 6453792,
                    "name": "Sandbox_tester1's workspace",
                    "profile": 102,
                    "premium": true,
                    "admin": true,
                    "default_hourly_rate": 0,
                    "default_currency": "USD",
                    "only_admins_may_create_projects": false,
                    "only_admins_see_billable_rates": false,
                    "only_admins_see_team_dashboard": false,
                    "projects_billable_by_default": true,
                    "rounding": 1,
                    "rounding_minutes": 0,
                    "api_token": "adcfa72098ad32281ff40b509614345e",
                    "at": "2022-06-05T16:10:12+00:00",
                    "logo_url": "https://assets.toggl.com/images/workspace.jpg",
                    "ical_url": "/ical/workspace_user/00d417f4d4e2f3a5687954c2b73758f4",
                    "ical_enabled": true
                }]
        */
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

        /*
        [{
            "id": 58852166,
            "wid": 6453792,
            "name": "A client",
            "at": "2022-06-08T08:47:30+00:00"
        }]
        */
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

        /*
        [{
            "id": 182848734,
            "wid": 6453792,
            "cid": 58852166,
            "name": "My Furst Project rate 100 USD, estimate 100",
            "billable": true,
            "is_private": true,
            "active": true,
            "template": false,
            "at": "2022-06-08T08:50:06+00:00",
            "created_at": "2022-06-08T08:47:30+00:00",
            "color": "13",
            "auto_estimates": false,
            "estimated_hours": 100,
            "actual_hours": 6,
            "rate": 100,
            "currency": "USD",
            "hex_color": "#d92b2b"
        }, {
            "id": 182848755,
            "wid": 6453792,
            "name": "Project no client task estimate",
            "billable": true,
            "is_private": true,
            "active": true,
            "template": false,
            "at": "2022-06-08T08:50:41+00:00",
            "created_at": "2022-06-08T08:48:13+00:00",
            "color": "14",
            "auto_estimates": true,
            "estimated_hours": 100,
            "actual_hours": 14,
            "currency": "USD",
            "hex_color": "#525266"
        }]
        */
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

        /*
        {
            "82618735": {
                "id": 82618735,
                "name": "some task!",
                "wid": 6453792,
                "pid": 182848734,
                "active": true,
                "at": "2022-06-08T08:50:06+00:00",
                "estimated_seconds": 0
            },
            "82618758": {
                "id": 82618758,
                "name": "another task",
                "wid": 6453792,
                "pid": 182848755,
                "active": true,
                "at": "2022-06-08T08:50:31+00:00",
                "estimated_seconds": 360000,
                "tracked_seconds": 50400
            },
            "82618795": {
                "id": 82618795,
                "name": "donetask",
                "wid": 6453792,
                "pid": 182848755,
                "active": false,
                "at": "2022-06-08T08:50:41+00:00",
                "estimated_seconds": 0
            }
        }
        */
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

                /*
                    {
                    "total_grand": 75641000,
                    "total_billable": 72031000,
                    "total_currencies": [{
                        "currency": "USD",
                        "amount": 600.61
                    }],
                    "total_count": 4,
                    "per_page": 50,
                    "data": [{
                        "id": 2523771768,
                        "pid": 182848755,
                        "tid": null,
                        "uid": 8543447,
                        "description": "hello description",
                        "start": "2022-06-08T10:48:49+02:00",
                        "end": "2022-06-08T10:48:58+02:00",
                        "updated": "2022-06-08T10:49:04+02:00",
                        "dur": 9000,
                        "user": "Sandbox_tester1",
                        "use_stop": true,
                        "client": null,
                        "project": "Project no client task estimate",
                        "project_color": "0",
                        "project_hex_color": "#525266",
                        "task": null,
                        "billable": 0,
                        "is_billable": true,
                        "cur": "USD",
                        "tags": []
                    }, {
                        "id": 2523775211,
                        "pid": null,
                        "tid": null,
                        "uid": 8543447,
                        "description": "no assigned anything",
                        "start": "2022-06-08T09:50:59+02:00",
                        "end": "2022-06-08T10:51:09+02:00",
                        "updated": "2022-06-08T10:51:09+02:00",
                        "dur": 3610000,
                        "user": "Sandbox_tester1",
                        "use_stop": true,
                        "client": null,
                        "project": null,
                        "project_color": "0",
                        "project_hex_color": null,
                        "task": null,
                        "billable": 0,
                        "is_billable": false,
                        "cur": "USD",
                        "tags": []
                    }, {
                        "id": 2523772288,
                        "pid": 182848734,
                        "tid": null,
                        "uid": 8543447,
                        "description": "more tracking oder wat?",
                        "start": "2022-06-08T04:49:08+02:00",
                        "end": "2022-06-08T10:49:30+02:00",
                        "updated": "2022-06-08T10:49:36+02:00",
                        "dur": 21622000,
                        "user": "Sandbox_tester1",
                        "use_stop": true,
                        "client": "A client",
                        "project": "My Furst Project rate 100 USD, estimate 100",
                        "project_color": "0",
                        "project_hex_color": "#d92b2b",
                        "task": null,
                        "billable": 600.61,
                        "is_billable": true,
                        "cur": "USD",
                        "tags": []
                    }, {
                        "id": 2523775606,
                        "pid": 182848755,
                        "tid": 82618758,
                        "uid": 8543447,
                        "description": "task assigned",
                        "start": "2022-06-06T10:51:00+02:00",
                        "end": "2022-06-07T00:51:00+02:00",
                        "updated": "2022-06-08T10:51:47+02:00",
                        "dur": 50400000,
                        "user": "Sandbox_tester1",
                        "use_stop": true,
                        "client": null,
                        "project": "Project no client task estimate",
                        "project_color": "0",
                        "project_hex_color": "#525266",
                        "task": "another task",
                        "billable": 0,
                        "is_billable": true,
                        "cur": "USD",
                        "tags": []
                    }]
                }
                */
            }
        }
    }
}

const importer = new TogglImporter(formValue.togglKey);
