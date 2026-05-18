class TimelyCSVImporter {

    start() {
        tyme.selectFile(
            utils.localize('dialog.select'),
            ['csv'],
            function(content) {
                if (!content) { return; }
                this.process(content);
            }.bind(this)
        );
    }

    // --- CSV parsing ---

    parseCSV(text) {
        if (text.charCodeAt(0) === 0xFEFF) { text = text.slice(1); }
        text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

        var rows = [];
        var row = [];
        var field = '';
        var inQuotes = false;
        var i = 0;

        while (i <= text.length) {
            var c = i < text.length ? text[i] : null;

            if (inQuotes) {
                if (c === '"' && text[i + 1] === '"') { field += '"'; i += 2; }
                else if (c === '"') { inQuotes = false; i++; }
                else if (c === null) { break; }
                else { field += c; i++; }
            } else {
                if (c === '"') { inQuotes = true; i++; }
                else if (c === ',') { row.push(field.trim()); field = ''; i++; }
                else if (c === '\n' || c === null) {
                    row.push(field.trim());
                    field = '';
                    if (row.some(function(f) { return f !== ''; })) { rows.push(row); }
                    row = [];
                    i++;
                } else { field += c; i++; }
            }
        }

        return rows;
    }

    findColumn(headers, candidates) {
        for (var i = 0; i < headers.length; i++) {
            var h = headers[i].toLowerCase().trim();
            for (var j = 0; j < candidates.length; j++) {
                if (h.indexOf(candidates[j].toLowerCase()) !== -1) { return i; }
            }
        }
        return -1;
    }

    detectColumns(headers) {
        return {
            date:         this.findColumn(headers, ['hour date', 'date', 'day']),
            duration:     this.findColumn(headers, ['logged hours', 'duration', 'hours']),
            plannedHours: this.findColumn(headers, ['planned hours', 'planned']),
            loggedMoney:  this.findColumn(headers, ['logged money', 'logged amount']),
            note:         this.findColumn(headers, ['hour note', 'note', 'description', 'notes']),
            billable:     this.findColumn(headers, ['billed status', 'billable', 'billed']),
            project:      this.findColumn(headers, ['project name', 'project']),
            client:       this.findColumn(headers, ['client name', 'client']),
            userName:     this.findColumn(headers, ['user name', 'user', 'name'])
        };
    }

    // --- Value parsing ---

    parseDecimalHours(str) {
        if (!str) { return 0; }
        var h = parseFloat(str.replace(',', '.'));
        return isNaN(h) ? 0 : Math.round(h * 3600);
    }

    parseDate(str) {
        if (!str) { return null; }
        str = str.trim();

        if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
            return new Date(str.substring(0, 10) + 'T00:00:00');
        }

        var dmy = str.match(/^(\d{1,2})[\/\.](\d{1,2})[\/\.](\d{4})/);
        if (dmy) {
            return new Date(dmy[3] + '-' + dmy[2].padStart(2, '0') + '-' + dmy[1].padStart(2, '0') + 'T00:00:00');
        }

        var parsed = Date.parse(str);
        return isNaN(parsed) ? null : new Date(parsed);
    }

    isBillable(str) {
        if (!str) { return false; }
        var v = str.trim().toLowerCase();
        return v === 'yes' || v === 'ja' || v === 'true' || v === '1' || v === 'oui' || v === 'billable';
    }

    makeSlug(str) {
        return (str || 'unknown')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .substring(0, 60);
    }

    // --- Entity creation ---

    getOrCreateCategory() {
        var cat = Category.fromID('timely-category') ?? Category.create('timely-category');
        cat.name = 'Timely';
        return cat;
    }

    getOrCreateProject(clientName) {
        var id = 'timely-proj-' + (clientName ? this.makeSlug(clientName) : 'no-client');
        var proj = Project.fromID(id) ?? Project.create(id);
        proj.name = clientName || 'Timely Import';
        proj.category = this.getOrCreateCategory();
        return proj;
    }

    getOrCreateTask(projectName, clientName) {
        var id = 'timely-task-' + (clientName ? this.makeSlug(clientName) : 'no-client') + '-' + this.makeSlug(projectName);
        var task = TimedTask.fromID(id);
        if (!task) {
            task = TimedTask.create(id);
            task.name = projectName;
            task.project = this.getOrCreateProject(clientName);
        }
        return task;
    }

    // --- Main processing ---

    process(content) {
        var rows = this.parseCSV(content);

        if (rows.length < 2) {
            tyme.showAlert('Timely', utils.localize('error.empty'));
            return;
        }

        var headers = rows[0];
        var col = this.detectColumns(headers);

        if (col.date < 0 || col.duration < 0 || col.project < 0) {
            tyme.showAlert('Timely', utils.localize('error.columns'));
            return;
        }

        var dataRows = rows.slice(1);

        for (var i = 0; i < dataRows.length; i++) {
            var row = dataRows[i];

            var projectName = row[col.project] || '';
            if (!projectName) { continue; }

            var dateBase = this.parseDate(row[col.date]);
            if (!dateBase) { continue; }

            var durationSecs = this.parseDecimalHours(row[col.duration]);
            if (durationSecs <= 0) { continue; }

            var clientName = col.client   >= 0 ? row[col.client]   : '';
            var note       = col.note     >= 0 ? row[col.note]     : '';
            var billable   = col.billable >= 0 ? this.isBillable(row[col.billable]) : true;
            var userName   = col.userName >= 0 ? row[col.userName] : '';

            var task = this.getOrCreateTask(projectName, clientName);
            task.billable = billable;

            var plannedSecs = this.parseDecimalHours(col.plannedHours >= 0 ? row[col.plannedHours] : '');
            if (plannedSecs > 0) { task.plannedDuration = plannedSecs; }

            if (col.loggedMoney >= 0 && row[col.loggedMoney] && durationSecs > 0) {
                var money = parseFloat(row[col.loggedMoney].replace(',', '.'));
                var hours = durationSecs / 3600;
                if (!isNaN(money) && money > 0) {
                    task.hourlyRate = Math.round((money / hours) * 100) / 100;
                }
            }

            var dayStart = dateBase.getTime();
            var entryId = 'timely-entry-' + this.makeSlug(row[col.date] + '|' + projectName + '|' + durationSecs + '|' + userName);

            var tymeEntry = TimeEntry.fromID(entryId) ?? TimeEntry.create(entryId);
            tymeEntry.note = note;
            tymeEntry.timeStart = dayStart;
            tymeEntry.timeEnd = dayStart + durationSecs * 1000;
            tymeEntry.parentTask = task;
        }
    }
}

const importer = new TimelyCSVImporter();
