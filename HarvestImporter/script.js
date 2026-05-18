class HarvestApiClient {

    constructor(token, accountId) {
        this.token = token;
        this.accountId = accountId;
        this.baseURL = 'https://api.harvestapp.com/v2';
    }

    request(path, params) {
        const response = utils.request(
            this.baseURL + path,
            'GET',
            {
                'Authorization': 'Bearer ' + this.token,
                'Harvest-Account-Id': this.accountId,
                'User-Agent': 'Tyme Harvest Importer'
            },
            params || null
        );

        if (response['statusCode'] === 200) {
            return JSON.parse(response['result']);
        }
        return null;
    }

    getAllPages(path, dataKey, extraParams) {
        var all = [];
        var page = 1;
        var params = extraParams || {};

        do {
            var requestParams = {};
            for (var k in params) {
                requestParams[k] = params[k];
            }
            requestParams['page'] = page;
            requestParams['per_page'] = 100;

            var data = this.request(path, requestParams);
            if (!data) {
                break;
            }

            var items = data[dataKey];
            if (!items || items.length === 0) {
                break;
            }

            all = all.concat(items);

            var totalPages = data['total_pages'] || 1;
            if (page >= totalPages) {
                break;
            }
            page++;
        } while (true);

        return all;
    }
}

class HarvestImporter {

    constructor(token, accountId) {
        this.apiClient = new HarvestApiClient(token, accountId);
    }

    start() {
        if (!formValue.harvestToken || !formValue.harvestAccountId) {
            tyme.showAlert('Harvest', 'Please enter your API token and Account ID.');
            return;
        }

        if (!this.validateCredentials()) {
            tyme.showAlert('Harvest', 'Invalid API token or Account ID. Please check your credentials at https://id.getharvest.com/developers.');
            return;
        }

        this.fetchClients();
        this.fetchProjects();
        this.fetchUsers();
        this.fetchTasks();
        this.fetchTaskAssignments();
        this.fetchTimeEntries();
        this.processData();
    }

    validateCredentials() {
        return this.apiClient.request('/users/me') !== null;
    }

    fetchClients() {
        this.clients = {};
        this.apiClient.getAllPages('/clients', 'clients').forEach(function (client) {
            this.clients[client['id']] = client;
        }.bind(this));
    }

    fetchProjects() {
        this.projects = {};
        let active = this.apiClient.getAllPages('/projects', 'projects', {'is_active': 'true'});
        let inactive = this.apiClient.getAllPages('/projects', 'projects', {'is_active': 'false'});

        active.concat(inactive).forEach(function (project) {
            this.projects[project['id']] = project;
        }.bind(this));
    }

    fetchUsers() {
        this.users = {};
        this.apiClient.getAllPages('/users', 'users').forEach(function (user) {
            this.users[user['id']] = user;
        }.bind(this));
    }

    fetchTasks() {
        this.tasks = {};
        this.apiClient.getAllPages('/tasks', 'tasks').forEach(function (task) {
            this.tasks[task['id']] = task;
        }.bind(this));
    }

    fetchTaskAssignments() {
        // Harvest tasks are global but assigned per-project; we key by "projectId-taskId"
        // so the same task name in two projects becomes two distinct Tyme tasks.
        this.taskAssignments = {};

        for (var projectId in this.projects) {
            let assignments = this.apiClient.getAllPages(
                '/projects/' + projectId + '/task_assignments',
                'task_assignments'
            );
            assignments.forEach(function (ta) {
                var key = projectId + '-' + ta['task']['id'];
                this.taskAssignments[key] = {
                    assignment: ta,
                    projectId: projectId
                };
            }.bind(this));
        }
    }

    fetchTimeEntries() {
        let now = new Date();
        let twoYearsAgo = new Date();
        twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

        this.timeEntries = this.apiClient.getAllPages('/time_entries', 'time_entries', {
            'from': twoYearsAgo.toISOString().split('T')[0],
            'to': now.toISOString().split('T')[0]
        });
    }

    // Harvest returns times as strings like "9:00am" or "1:30pm" paired with a "YYYY-MM-DD" date.
    parseHarvestTime(dateStr, timeStr) {
        const match = timeStr.match(/^(\d+):(\d+)(am|pm)$/i);
        if (!match) {
            return null;
        }

        let hours = parseInt(match[1]);
        let minutes = parseInt(match[2]);
        let meridiem = match[3].toLowerCase();

        if (meridiem === 'pm' && hours !== 12) {
            hours += 12;
        }
        if (meridiem === 'am' && hours === 12) {
            hours = 0;
        }

        let d = new Date(dateStr + 'T00:00:00');
        d.setHours(hours, minutes, 0, 0);
        return d.getTime();
    }

    processData() {
        const prefix = 'harvest-';

        // Clients → Tyme Categories
        for (const clientId in this.clients) {
            const client = this.clients[clientId];
            const catId = prefix + clientId;

            const cat = Category.fromID(catId) ?? Category.create(catId);
            cat.name = client['name'];
            cat.isCompleted = !client['is_active'];
        }

        // Projects → Tyme Projects
        for (const projectId in this.projects) {
            const project = this.projects[projectId];
            const projTymeId = prefix + projectId;

            const proj = Project.fromID(projTymeId) ?? Project.create(projTymeId);
            proj.name = project['name'];
            proj.isCompleted = !project['is_active'];

            if (project['hourly_rate']) {
                proj.defaultHourlyRate = project['hourly_rate'];
            }

            // budget_by === 'project' means hours budget applies to the whole project
            if (project['budget_by'] === 'project' && project['budget']) {
                proj.plannedDuration = project['budget'] * 3600;
            }

            if (project['client']) {
                var linkedCatId = prefix + project['client']['id'];
                var linkedCat = Category.fromID(linkedCatId);
                if (linkedCat) {
                    proj.category = linkedCat;
                    if (linkedCat.isCompleted) {
                        proj.isCompleted = true;
                    }
                }
            }
        }

        // Task assignments → Tyme Tasks (scoped per project)
        for (const taKey in this.taskAssignments) {
            const taEntry = this.taskAssignments[taKey];
            const assignment = taEntry['assignment'];
            const taProjId = taEntry['projectId'];
            const task = assignment['task'];

            const taskTymeId = prefix + taProjId + '-' + task['id'];
            const projTymeRef = prefix + taProjId;

            const tymeTask = TimedTask.fromID(taskTymeId) ?? TimedTask.create(taskTymeId);
            tymeTask.name = task['name'];
            tymeTask.isCompleted = !assignment['is_active'];
            tymeTask.billable = assignment['billable'];

            const tymeProj = Project.fromID(projTymeRef);
            if (tymeProj) {
                tymeTask.project = tymeProj;
                if (tymeProj.isCompleted) {
                    tymeTask.isCompleted = true;
                }
            }

            let hourlyRate = assignment['hourly_rate'];
            if (!hourlyRate) {
                const globalTask = this.tasks[task['id']];
                if (globalTask) {
                    hourlyRate = globalTask['default_hourly_rate'];
                }
            }

            const project = this.projects[taProjId];
            if (project['bill_by'] === "Project") {
                hourlyRate = project['default_hourly_rate'];
            }

            if (hourlyRate) {
                tymeTask.hourlyRate = hourlyRate;
            }

            // budget_by === 'task' on the project means per-task hour budget
            if (assignment['budget']) {
                tymeTask.plannedDuration = assignment['budget'] * 3600;
            }
        }

        // Time entries → Tyme TimeEntries
        for (let i = 0; i < this.timeEntries.length; i++) {
            const entry = this.timeEntries[i];

            if (entry['is_running']) {
                continue;
            }

            const entryTymeId = prefix + entry['id'];
            const entryProjectId = entry['project'] ? entry['project']['id'] : null;
            const entryTaskId = entry['task'] ? entry['task']['id'] : null;

            let parentTask = null;

            if (entryProjectId && entryTaskId) {
                parentTask = TimedTask.fromID(prefix + entryProjectId + '-' + entryTaskId);
            }

            // Task assignment may have been deleted after time was logged; create a fallback task
            if (!parentTask) {
                const fallbackTaskId = entryProjectId
                    ? prefix + entryProjectId + '-default'
                    : prefix + 'default-task';

                parentTask = TimedTask.fromID(fallbackTaskId);

                if (!parentTask) {
                    parentTask = TimedTask.create(fallbackTaskId);
                    parentTask.name = 'Default Task';

                    let fallbackProj = entryProjectId
                        ? Project.fromID(prefix + entryProjectId)
                        : null;

                    if (!fallbackProj) {
                        const defaultProjId = prefix + 'default';
                        fallbackProj = Project.fromID(defaultProjId) ?? Project.create(defaultProjId);
                        fallbackProj.name = 'Default';
                    }

                    parentTask.project = fallbackProj;
                }
            }

            let timeStart = null;
            let timeEnd = null;

            if (entry['started_time'] && entry['ended_time']) {
                timeStart = this.parseHarvestTime(entry['spent_date'], entry['started_time']);
                timeEnd = this.parseHarvestTime(entry['spent_date'], entry['ended_time']);
            }

            if (!timeStart) {
                // No explicit start/end; anchor to midnight and apply duration
                timeStart = new Date(entry['spent_date'] + 'T00:00:00').getTime();
                timeEnd = timeStart + Math.round(entry['hours'] * 3600 * 1000);
            }

            const tymeEntry = TimeEntry.fromID(entryTymeId) ?? TimeEntry.create(entryTymeId);
            tymeEntry.note = entry['notes'] || '';
            tymeEntry.timeStart = timeStart;
            tymeEntry.timeEnd = timeEnd;
            tymeEntry.parentTask = parentTask;

            if (entry['user']) {
                const harvestUser = this.users[entry['user']['id']];
                if (harvestUser && harvestUser['email']) {
                    const tymeUserId = tyme.userIDForEmail(harvestUser['email']);
                    if (tymeUserId) {
                        tymeEntry.userID = tymeUserId;
                    }
                }
            }
        }
    }
}

const importer = new HarvestImporter(formValue.harvestToken, formValue.harvestAccountId);
