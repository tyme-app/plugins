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
            return null;
        }
    }

    postJSON(path, params = null) {
        const response = utils.request(
            this.baseURL + path,
            'POST',
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

class TogglExporter {
    constructor(apiKey) {
        this.apiClient = new TogglApiClient(apiKey);
        this.workspaces = {};
        this.users = {};
        this.clients = {};
        this.projects = {};
        this.tasks = {};

        if (apiKey.length > 0) {
            this.getWorkspaces()
            this.getUsers();
            this.getClients();
            this.getProjects();
            this.getTasks();
        }
    }

    getUsers() {
        this.users = {};

        if (Object.keys(this.workspaces).length === 0) {
            return;
        }

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

        if (Object.keys(this.workspaces).length === 0) {
            return;
        }

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

        if (Object.keys(this.workspaces).length === 0) {
            return;
        }

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

        if (Object.keys(this.workspaces).length === 0) {
            return;
        }

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

    timeEntriesFromFormValues() {
        return tyme.timeEntries(
            formValue.startDate,
            formValue.endDate,
            formValue.taskIDs,
            null,
            formValue.onlyUnbilled ? 0 : null,
            formValue.includeNonBillable ? null : true,
            formValue.teamMemberID
        )
    }

    getProjectByName(name) {
        for (let key of Object.keys(this.projects)) {
            if (this.projects[key].name === name) {
                return this.projects[key].id
            }
        }
        return null
    }

    getTaskByProjectAndName(name, pid) {
        for (let key of Object.keys(this.tasks)) {
            if (this.tasks[key].name === name && this.tasks[key].pid === pid) {
                return key
            }
        }
        return null
    }

    timeEntryIDs() {
        return this.timeEntriesFromFormValues()
            .map(function (entry) {
                return entry.id;
            });
    }

    generatePreview() {
        let startDisabled = false
        const data = this.timeEntriesFromFormValues()
        let header = '';

        if (Object.keys(this.workspaces).length === 0) {
            header += `## <span style='color: darkred;'>${utils.localize('error.api')}</span>\n\n`;
        }

        let missingPids = new Set()
        let missingTids = new Set()
        let str = `|${utils.localize('table.start')}|${utils.localize('table.duration')}|${utils.localize('table.client')}|${utils.localize('table.project')}|${utils.localize('table.task')}|${utils.localize('table.description')}\n`
        str += '|-|-:|-|-|-|-|\n';
        for (let entry of data) {
            let timeEntry = {"time_entry": {}}
            let pColor = 'black'
            let tColor = 'black'
            let pid = this.getProjectByName(entry["project"])
            if (!pid) {
                startDisabled = true
                missingPids.add(`**${entry["project"]}**`)
                pColor = 'red'
            }
            let tid = this.getTaskByProjectAndName(entry["task"], pid)
            if (!tid) {
                startDisabled = true
                missingTids.add(`**${entry["project"]}**: ${entry["task"]}`)
                tColor = 'red'
            }
            let start = new Date(entry["start"]).toLocaleString()
            let duration = parseInt(entry['duration'])
            let task = entry["task"]
            let project = entry["project"]
            let client = entry["category"]
            let description = entry["note"].replaceAll("|", "-").replaceAll("\n", ";")
            str += `| ${start}`
            str += `| ${duration}`
            str += `| ${client}`
            str += `| <span style="color:${pColor}">${project}</span>`
            str += `| <span style="color:${tColor}">${task}</span>`
            str += `| ${description}`
            str += `|\n`
        }

        if (startDisabled) {
            const missedPids = Array.from(missingPids)
            const missedTids = Array.from(missingTids)
            let missedPidStr = ""
            let missedTidStr = ""
            if (missedPids.length > 0) {
                missedPidStr = `*_${utils.localize('error.missedProjects')}_*\n${missedPids.join()} `
            }
            if (missedTids.length > 0) {
                missedTidStr = `*_${utils.localize('error.missedTasks')}_*\n${missedTids.join("\n")} `
            }
            let errorStr = `**${utils.localize('error.header')}**\n${missedPidStr}\n${missedTidStr}\n\n${utils.localize('error.explain')}\n`
            header += errorStr
        } else {
            let errorStr = `**${utils.localize('error.noError')}**\n`
            header += errorStr
        }

        return utils.markdownToHTML(header + str);
    }

    formatDate(date) {
        var tzo = -date.getTimezoneOffset(),
            dif = tzo >= 0 ? '+' : '-',
            pad = function (num) {
                var norm = Math.floor(Math.abs(num));
                return (norm < 10 ? '0' : '') + norm;
            };

        return date.getFullYear()
            + '-' + pad(date.getMonth() + 1)
            + '-' + pad(date.getDate())
            + 'T' + pad(date.getHours())
            + ':' + pad(date.getMinutes())
            + ':' + pad(date.getSeconds())
            + dif + pad(tzo / 60)
            + ':' + pad(tzo % 60);
    }

    start() {
        const data = this.timeEntriesFromFormValues()
        const path = '/api/v8/time_entries'
        let timeEntries = []
        this.startDisabled = false
        for (let entry of data) {
            let timeEntry = {"time_entry": {}}
            let pid = this.getProjectByName(entry["project"])
            let tid = this.getTaskByProjectAndName(entry["task"], pid)
            let start = this.formatDate(new Date(entry["start"]))
            let duration = parseInt(entry['duration'])
            let task = entry["task"]
            let project = entry["project"]
            let client = entry["category"]
            let description = entry["note"].replaceAll("|", "-").replaceAll("\n", ";")
            timeEntry.time_entry["start"] = start
            timeEntry.time_entry["duration"] = duration * 60
            timeEntry.time_entry["tid"] = tid
            timeEntry.time_entry["pid"] = pid
            timeEntry.time_entry["description"] = description
            timeEntry.time_entry["created_with"] = "Tyme Toggl Exporter"
            timeEntries.push(timeEntry)

            if (!pid || !tid) {
                utils.log("No pid or tid, aborting")
                return
            }
        }
        if (formValue.markAsBilled) {
            const timeEntryIDs = this.timeEntryIDs();
            tyme.setBillingState(timeEntryIDs, 1);
        }
        for (let timeEntry of timeEntries) {
            try {
                this.apiClient.postJSON(path, timeEntry);
            } catch (e) {
                utils.log(e)
            }
        }
    }
}

const exporter = new TogglExporter(formValue.togglKey);
