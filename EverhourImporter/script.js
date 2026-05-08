class EverhourApiClient {

    constructor(apiKey) {
        this.apiKey = apiKey;
        this.baseURL = 'https://api.everhour.com';
    }

    request(path, params) {
        const response = utils.request(
            this.baseURL + path,
            'GET',
            {
                'X-Api-Key': this.apiKey,
                'X-Accept-Version': '1.2'
            },
            params || null
        );

        if (response['statusCode'] === 200) {
            return JSON.parse(response['result']);
        }
        return null;
    }

    // Everhour list endpoints return plain arrays; paginate until a short page is received.
    getAllPages(path, extraParams) {
        var all = [];
        var page = 1;
        var limit = 100;
        var params = extraParams || {};

        do {
            var requestParams = {};
            for (var k in params) {
                requestParams[k] = params[k];
            }
            requestParams['limit'] = limit;
            requestParams['page'] = page;

            var data = this.request(path, requestParams);
            if (!data || !Array.isArray(data) || data.length === 0) { break; }

            all = all.concat(data);
            if (data.length < limit) { break; }
            page++;
        } while (true);

        return all;
    }
}

class EverhourImporter {

    constructor(apiKey) {
        this.apiClient = new EverhourApiClient(apiKey);
    }

    start() {
        if (!formValue.everhourApiKey) {
            tyme.showAlert('Everhour', 'Please enter your API key.');
            return;
        }

        if (!this.validateCredentials()) {
            tyme.showAlert('Everhour', 'Invalid API key. You can find your key in Account Settings → My Profile.');
            return;
        }

        this.fetchClients();
        this.fetchProjects();
        this.fetchUsers();
        this.fetchTasks();
        this.fetchTimeRecords();
        this.processData();
    }

    validateCredentials() {
        return this.apiClient.request('/users/me') !== null;
    }

    fetchClients() {
        this.clients = {};
        this.apiClient.getAllPages('/clients').forEach(function(c) {
            this.clients[c['id']] = c;
        }.bind(this));
    }

    fetchProjects() {
        this.projects = {};
        this.apiClient.getAllPages('/projects').forEach(function(p) {
            this.projects[p['id']] = p;
        }.bind(this));
    }

    fetchUsers() {
        this.users = {};
        this.apiClient.getAllPages('/team/users').forEach(function(u) {
            this.users[u['id']] = u;
        }.bind(this));
    }

    fetchTasks() {
        // Fetch tasks per project. A task can belong to multiple projects; the last
        // project we encounter it under is used as its Tyme parent.
        this.tasks = {};
        for (var projectId in this.projects) {
            var tasks = this.apiClient.getAllPages('/projects/' + projectId + '/tasks');
            tasks.forEach(function(task) {
                this.tasks[task['id']] = { task: task, projectId: projectId };
            }.bind(this));
        }
    }

    fetchTimeRecords() {
        var now = new Date();
        var twoYearsAgo = new Date();
        twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

        this.timeRecords = this.apiClient.getAllPages('/team/time', {
            'from': twoYearsAgo.toISOString().split('T')[0],
            'to':   now.toISOString().split('T')[0]
        });
    }

    processData() {
        var prefix = 'everhour-';

        // Clients → Tyme Categories
        for (var clientId in this.clients) {
            var client = this.clients[clientId];
            var catId = prefix + 'client-' + clientId;

            var cat = Category.fromID(catId) ?? Category.create(catId);
            cat.name = client['name'];
        }

        // Projects → Tyme Projects
        for (var projectId in this.projects) {
            var project = this.projects[projectId];
            var projTymeId = prefix + 'proj-' + projectId;

            var proj = Project.fromID(projTymeId) ?? Project.create(projTymeId);
            proj.name = project['name'];

            var rate = project['rate'];
            if (rate && rate['rate']) {
                // Everhour stores rates in cents
                proj.defaultHourlyRate = rate['rate'] / 100;
            }

            var budget = project['budget'];
            if (budget && budget['budget']) {
                if (budget['type'] === 'time') {
                    proj.plannedDuration = budget['budget'];
                } else if (budget['type'] === 'money' && rate && rate['rate']) {
                    // Convert money budget to hours using the project rate, both in cents
                    proj.plannedDuration = (budget['budget'] / rate['rate']) * 3600;
                }
            }

            if (project['client']) {
                var cat = Category.fromID(prefix + 'client-' + project['client']);
                if (cat) {
                    proj.category = cat;
                }
            }
        }

        // Tasks → Tyme TimedTasks
        for (var taskId in this.tasks) {
            var entry = this.tasks[taskId];
            var task = entry['task'];
            var taProjId = entry['projectId'];

            var taskTymeId = prefix + 'task-' + taskId;
            var projTymeId = prefix + 'proj-' + taProjId;

            var tymeTask = TimedTask.fromID(taskTymeId) ?? TimedTask.create(taskTymeId);
            tymeTask.name = task['name'];
            tymeTask.isCompleted = task['status'] === 'closed' || !!task['completed'];
            var taskProject = this.projects[taProjId];
            tymeTask.billable = taskProject && taskProject['billing'];
            
            var tymeProj = Project.fromID(projTymeId);
            if (tymeProj) {
                tymeTask.project = tymeProj;
                if (tymeProj.isCompleted) {
                    tymeTask.isCompleted = true;
                }
            }

            if (task['estimate'] && task['estimate']['total']) {
                tymeTask.plannedDuration = task['estimate']['total'];
            }

            if (task['rate']) {
                // Task-level rate overrides project rate; also in cents
                tymeTask.hourlyRate = task['rate'] / 100;
            }
        }

        // Time records → Tyme TimeEntries
        for (var i = 0; i < this.timeRecords.length; i++) {
            var record = this.timeRecords[i];
            if (!record['task']) { continue; }

            var recordTask = record['task'];
            var recordTaskId = recordTask['id'];
            var entryTymeId = prefix + 'entry-' + record['id'];

            var parentTask = TimedTask.fromID(prefix + 'task-' + recordTaskId);

            // Task not in the fetched set — likely belongs to an integration project
            // (Asana, Trello, etc.) that wasn't enumerated. Reconstruct from the
            // nested task object embedded in the time record.
            if (!parentTask) {
                var nestedProjects = recordTask['projects'];
                var nestedProjId = nestedProjects && nestedProjects.length > 0
                    ? nestedProjects[0]
                    : null;

                if (!nestedProjId) { continue; }

                var fallbackProjTymeId = prefix + 'proj-' + nestedProjId;
                var fallbackProj = Project.fromID(fallbackProjTymeId);
                if (!fallbackProj) {
                    fallbackProj = Project.create(fallbackProjTymeId);
                    fallbackProj.name = 'Default';
                }

                parentTask = TimedTask.create(prefix + 'task-' + recordTaskId);
                parentTask.name = recordTask['name'] || 'Default Task';
                parentTask.billable = !recordTask['unbillable'];
                parentTask.isCompleted = recordTask['status'] === 'closed';
                parentTask.project = fallbackProj;
            }

            // Everhour records only store date + total seconds — no start/end clock times
            var dayStart = new Date(record['date'] + 'T00:00:00').getTime();
            var durationMs = (record['time'] || 0) * 1000;

            var tymeEntry = TimeEntry.fromID(entryTymeId) ?? TimeEntry.create(entryTymeId);
            tymeEntry.note = record['comment'] || '';
            tymeEntry.timeStart = dayStart;
            tymeEntry.timeEnd = dayStart + durationMs;
            tymeEntry.parentTask = parentTask;

            var userId = record['user'];
            if (userId) {
                var user = this.users[userId];
                if (user && user['email']) {
                    var tymeUserId = tyme.userIDForEmail(user['email']);
                    if (tymeUserId) {
                        tymeEntry.userID = tymeUserId;
                    }
                }
            }
        }
    }
}

const importer = new EverhourImporter(formValue.everhourApiKey);
