class ClockodoApiClient {

    constructor(email, apiKey) {
        this.email = email;
        this.apiKey = apiKey;
        this.baseURL = 'https://my.clockodo.com/api';
    }

    request(path, params) {
        const response = utils.request(
            this.baseURL + path,
            'GET',
            {
                'X-ClockodoApiUser': this.email,
                'X-ClockodoApiKey': this.apiKey,
                'X-Clockodo-External-Application': 'Tyme Clockodo Importer;support@tyme-app.com'
            },
            params || null
        );

        if (response['statusCode'] === 200) {
            return JSON.parse(response['result']);
        }
        return null;
    }

    getAllPages(path, dataKey, extraParams) {
        let all = [];
        let page = 1;
        const params = extraParams || {};

        do {
            const requestParams = {};
            for (const k in params) {
                requestParams[k] = params[k];
            }
            requestParams['page'] = page;

            const data = this.request(path, requestParams);
            if (!data) { break; }

            const items = data[dataKey];
            if (!items || items.length === 0) { break; }

            all = all.concat(items);

            const paging = data['paging'];
            if (!paging || page >= paging['count_pages']) { break; }
            page++;
        } while (true);

        return all;
    }
}

class ClockodoImporter {

    constructor(email, apiKey) {
        this.apiClient = new ClockodoApiClient(email, apiKey);
    }

    start() {
        if (!formValue.clockodoEmail || !formValue.clockodoApiKey) {
            tyme.showAlert('Clockodo', 'Please enter your email address and API key.');
            return;
        }

        if (!this.validateCredentials()) {
            tyme.showAlert('Clockodo', 'Invalid credentials. Please check your email and API key in your Clockodo profile settings.');
            return;
        }

        this.fetchCustomers();
        this.fetchProjects();
        this.fetchServices();
        this.fetchUsers();
        this.fetchEntries();
        this.processData();
    }

    validateCredentials() {
        return this.apiClient.request('/v2/aggregates/users/me') !== null;
    }

    fetchCustomers() {
        this.customers = {};
        const active = this.apiClient.getAllPages('/v2/customers', 'customers', {'filter[active]': 'true'});
        const inactive = this.apiClient.getAllPages('/v2/customers', 'customers', {'filter[active]': 'false'});
        active.concat(inactive).forEach(function(c) {
            this.customers[c['id']] = c;
        }.bind(this));
    }

    fetchProjects() {
        this.projects = {};
        const active = this.apiClient.getAllPages('/v2/projects', 'projects', {'filter[active]': 'true'});
        const inactive = this.apiClient.getAllPages('/v2/projects', 'projects', {'filter[active]': 'false'});
        active.concat(inactive).forEach(function(p) {
            this.projects[p['id']] = p;
        }.bind(this));
    }

    fetchServices() {
        // Services are a flat global list with no pagination
        this.services = {};
        const data = this.apiClient.request('/v2/services', null);
        if (data && data['services']) {
            data['services'].forEach(function(s) {
                this.services[s['id']] = s;
            }.bind(this));
        }
    }

    fetchUsers() {
        // Users are also a flat list; use getAllPages for safety in large accounts
        this.users = {};
        this.apiClient.getAllPages('/v2/users', 'users').forEach(function(u) {
            this.users[u['id']] = u;
        }.bind(this));
    }

    fetchEntries() {
        const now = new Date();
        const twoYearsAgo = new Date();
        twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

        // Clockodo requires ISO 8601 UTC without milliseconds
        const timeSince = twoYearsAgo.toISOString().replace(/\.\d{3}Z$/, 'Z');
        const timeUntil = now.toISOString().replace(/\.\d{3}Z$/, 'Z');

        this.entries = this.apiClient.getAllPages('/v2/entries', 'entries', {
            'time_since': timeSince,
            'time_until': timeUntil
        });
    }

    // Returns or creates the "No Project" Tyme project for a customer.
    // Used when a Clockodo entry has no project assigned.
    getNoProjectContainer(customersId) {
        const prefix = 'clockodo-';
        const noProjectId = prefix + 'c' + customersId + '-noproj';

        let proj = Project.fromID(noProjectId);
        if (!proj) {
            proj = Project.create(noProjectId);
            proj.name = 'No Project';
            if (customersId) {
                const cat = Category.fromID(prefix + customersId);
                if (cat) { proj.category = cat; }
            }
        }
        return proj;
    }

    processData() {
        let cat;
        const prefix = 'clockodo-';

        // Customers → Tyme Categories
        for (const customerId in this.customers) {
            const customer = this.customers[customerId];
            const catId = prefix + customerId;

            cat = Category.fromID(catId) ?? Category.create(catId);
            cat.name = customer['name'];
            cat.isCompleted = !customer['active'];

            if (customer['color']) {
                cat.color = customer['color'];
            }
        }

        // Projects → Tyme Projects
        for (const projectId in this.projects) {
            const project = this.projects[projectId];
            const projTymeId = prefix + projectId;

            const proj = Project.fromID(projTymeId) ?? Project.create(projTymeId);
            proj.name = project['name'];
            proj.isCompleted = !project['active'] || !!project['completed'];

            if (project['note']) {
                proj.note = project['note'];
            }

            if (project['hourly_rate']) {
                proj.defaultHourlyRate = project['hourly_rate'];
            }

            // budget_is_hours == true means budget_money stores an hours value
            if (project['budget_is_hours'] && project['budget_money']) {
                proj.plannedDuration = project['budget_money'] * 3600;
            }

            if (project['customers_id']) {
                cat = Category.fromID(prefix + project['customers_id']);
                if (cat) {
                    proj.category = cat;
                    if (cat.isCompleted) {
                        proj.isCompleted = true;
                    }
                }
            }
        }

        // Entries → Tyme Tasks (created on demand) + Tyme TimeEntries
        //
        // Clockodo services are global; the same service can appear in many projects.
        // We create one Tyme task per (project, service) combination so tasks stay
        // properly scoped inside their project — matching Tyme's data model.
        for (let i = 0; i < this.entries.length; i++) {
            const entry = this.entries[i];

            // Skip lumpsum entries (type 2 = LumpsumValue, type 3 = LumpsumService)
            if (entry['type'] !== 1) {
                continue;
            }

            // Skip running (unclosed) entries
            if (!entry['time_until']) {
                continue;
            }

            const entryProjectsId = entry['projects_id'];
            const entryServicesId = entry['services_id'];
            const entryCustomersId = entry['customers_id'];

            // Build a stable task ID scoped to the project (or the customer when no project)
            let taskTymeId;
            if (entryProjectsId) {
                taskTymeId = prefix + entryProjectsId + '-' + entryServicesId;
            } else {
                taskTymeId = prefix + 'c' + entryCustomersId + '-' + entryServicesId;
            }

            let parentTask = TimedTask.fromID(taskTymeId);

            if (!parentTask) {
                parentTask = TimedTask.create(taskTymeId);

                var service = this.services[entryServicesId];
                parentTask.name = service ? service['name'] : 'Default Task';
                parentTask.isCompleted = service ? !service['active'] : false;

                // Inherit billable default from the project, or the customer
                if (entryProjectsId && this.projects[entryProjectsId]) {
                    parentTask.billable = !!this.projects[entryProjectsId]['billable_default'];
                } else if (entryCustomersId && this.customers[entryCustomersId]) {
                    parentTask.billable = !!this.customers[entryCustomersId]['billable_default'];
                }

                var tymeProj;
                if (entryProjectsId) {
                    tymeProj = Project.fromID(prefix + entryProjectsId);
                    if (!tymeProj) {
                        // Project not in our fetched set (edge case); create a placeholder
                        tymeProj = Project.create(prefix + entryProjectsId);
                        tymeProj.name = 'Default';
                    }
                } else {
                    tymeProj = this.getNoProjectContainer(entryCustomersId);
                }

                parentTask.project = tymeProj;
                if (tymeProj.isCompleted) {
                    parentTask.isCompleted = true;
                }

                if (entry['hourly_rate']) {
                    parentTask.hourlyRate = entry['hourly_rate'];
                }
            }

            var entryTymeId = prefix + entry['id'];
            var tymeEntry = TimeEntry.fromID(entryTymeId) ?? TimeEntry.create(entryTymeId);
            tymeEntry.note = entry['text'] || '';
            tymeEntry.timeStart = Date.parse(entry['time_since']);
            tymeEntry.timeEnd = Date.parse(entry['time_until']);
            tymeEntry.parentTask = parentTask;

            if (entry['users_id']) {
                var clockodoUser = this.users[entry['users_id']];
                if (clockodoUser && clockodoUser['email']) {
                    var tymeUserId = tyme.userIDForEmail(clockodoUser['email']);
                    if (tymeUserId) {
                        tymeEntry.userID = tymeUserId;
                    }
                }
            }
        }
    }
}

const importer = new ClockodoImporter(formValue.clockodoEmail, formValue.clockodoApiKey);
