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
        // Strip UTF-8 BOM if present
        if (text.charCodeAt(0) === 0xFEFF) {
            text = text.slice(1);
        }

        text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

        var rows = [];
        var row = [];
        var field = '';
        var inQuotes = false;
        var i = 0;

        while (i <= text.length) {
            var c = i < text.length ? text[i] : null;

            if (inQuotes) {
                if (c === '"' && text[i + 1] === '"') {
                    field += '"';
                    i += 2;
                } else if (c === '"') {
                    inQuotes = false;
                    i++;
                } else if (c === null) {
                    break;
                } else {
                    field += c;
                    i++;
                }
            } else {
                if (c === '"') {
                    inQuotes = true;
                    i++;
                } else if (c === ',') {
                    row.push(field.trim());
                    field = '';
                    i++;
                } else if (c === '\n' || c === null) {
                    row.push(field.trim());
                    field = '';
                    if (row.some(function(f) { return f !== ''; })) {
                        rows.push(row);
                    }
                    row = [];
                    i++;
                } else {
                    field += c;
                    i++;
                }
            }
        }

        return rows;
    }

    // Find the index of the first header that matches any candidate string (case-insensitive substring).
    findColumn(headers, candidates) {
        for (var i = 0; i < headers.length; i++) {
            var h = headers[i].toLowerCase().trim();
            for (var j = 0; j < candidates.length; j++) {
                if (h.indexOf(candidates[j].toLowerCase()) !== -1) {
                    return i;
                }
            }
        }
        return -1;
    }

    detectColumns(headers) {
        return {
            date:         this.findColumn(headers, ['hour date', 'date', 'day']),
            timestamps:   this.findColumn(headers, ['hour timestamps', 'timestamps', 'time range']),
            startTime:    this.findColumn(headers, ['start time', 'start']),
            endTime:      this.findColumn(headers, ['end time', 'end']),
            duration:     this.findColumn(headers, ['logged hours', 'duration', 'hours']),
            plannedHours: this.findColumn(headers, ['planned hours', 'planned']),
            loggedMoney:  this.findColumn(headers, ['logged money', 'logged amount']),
            note:         this.findColumn(headers, ['hour note', 'note', 'description', 'notes']),
            billed:       this.findColumn(headers, ['billed status', 'billable', 'billed']),
            project:      this.findColumn(headers, ['project name', 'project']),
            client:       this.findColumn(headers, ['client name', 'client']),
            userName:     this.findColumn(headers, ['user name', 'user', 'name'])
        };
    }

    // --- Value parsing ---

    // Timely exports duration as decimal hours (e.g. "1.5" = 90 minutes)
    parseDecimalHours(str) {
        if (!str) { return 0; }
        var h = parseFloat(str.replace(',', '.'));
        return isNaN(h) ? 0 : Math.round(h * 3600);
    }

    // Parse a date string into a Date object, trying ISO then DD/MM/YYYY then MM/DD/YYYY
    parseDate(str) {
        if (!str) { return null; }
        str = str.trim();

        // ISO: YYYY-MM-DD
        if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
            return new Date(str.substring(0, 10) + 'T00:00:00');
        }

        // DD/MM/YYYY or DD.MM.YYYY
        var dmy = str.match(/^(\d{1,2})[\/\.](\d{1,2})[\/\.](\d{4})/);
        if (dmy) {
            return new Date(dmy[3] + '-' + dmy[2].padStart(2, '0') + '-' + dmy[1].padStart(2, '0') + 'T00:00:00');
        }

        // MM/DD/YYYY
        var mdy = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        if (mdy) {
            return new Date(mdy[3] + '-' + mdy[1].padStart(2, '0') + '-' + mdy[2].padStart(2, '0') + 'T00:00:00');
        }

        var parsed = Date.parse(str);
        return isNaN(parsed) ? null : new Date(parsed);
    }

    // Parse "HH:MM" or "HH:MM:SS" into total seconds since midnight
    parseTimeStr(str) {
        if (!str) { return null; }
        str = str.trim();
        var parts = str.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
        if (!parts) { return null; }
        return parseInt(parts[1]) * 3600 + parseInt(parts[2]) * 60 + (parts[3] ? parseInt(parts[3]) : 0);
    }

    // Returns { start: ms, end: ms } for a row, using timestamps or fallback to midnight+duration.
    resolveTimestamps(row, columns, dateBase) {
        var startSecs = null;
        var endSecs = null;

        // Prefer the combined "Hour timestamps" column ("09:00 - 10:30")
        if (columns.timestamps >= 0 && row[columns.timestamps]) {
            var ts = row[columns.timestamps].split(/\s*[-–]\s*/);
            if (ts.length === 2) {
                startSecs = this.parseTimeStr(ts[0]);
                endSecs = this.parseTimeStr(ts[1]);
            }
        }

        // Fall back to separate start/end columns
        if (startSecs === null && columns.startTime >= 0) {
            startSecs = this.parseTimeStr(row[columns.startTime]);
        }
        if (endSecs === null && columns.endTime >= 0) {
            endSecs = this.parseTimeStr(row[columns.endTime]);
        }

        var dayStart = dateBase ? dateBase.getTime() : 0;

        if (startSecs !== null && endSecs !== null) {
            return {
                start: dayStart + startSecs * 1000,
                end:   dayStart + endSecs * 1000
            };
        }

        // Final fallback: anchor to midnight and apply duration
        var durationSecs = this.parseDecimalHours(columns.duration >= 0 ? row[columns.duration] : '');
        return {
            start: dayStart,
            end:   dayStart + durationSecs * 1000
        };
    }

    isBillable(str) {
        if (!str) { return false; }
        var v = str.trim().toLowerCase();
        return v === 'yes' || v === 'ja' || v === 'true' || v === '1' || v === 'oui';
    }

    // --- ID helpers ---

    // Creates a stable slug-style ID component from a display name
    makeSlug(str) {
        return (str || 'unknown')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .substring(0, 60);
    }

    // --- Entity creation ---

    getOrCreateCategory(clientName) {
        if (!clientName) { return null; }
        var id = 'timely-csv-cat-' + this.makeSlug(clientName);
        var cat = Category.fromID(id) ?? Category.create(id);
        cat.name = clientName;
        return cat;
    }

    getOrCreateProject(projectName, clientName) {
        var id = 'timely-csv-proj-' + this.makeSlug(projectName);
        var proj = Project.fromID(id) ?? Project.create(id);
        proj.name = projectName;

        if (clientName) {
            var cat = this.getOrCreateCategory(clientName);
            if (cat) { proj.category = cat; }
        }

        return proj;
    }

    // Timely has no task layer — one default task per project
    getOrCreateTask(projectName) {
        var id = 'timely-csv-task-' + this.makeSlug(projectName);
        var task = TimedTask.fromID(id);
        if (!task) {
            task = TimedTask.create(id);
            task.name = 'Default Task';
            task.project = Project.fromID('timely-csv-proj-' + this.makeSlug(projectName));
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
        var columns = this.detectColumns(headers);

        if (columns.date < 0 || columns.duration < 0 || columns.project < 0) {
            tyme.showAlert('Timely', utils.localize('error.columns'));
            return;
        }

        var dataRows = rows.slice(1);

        // First pass: create all categories, projects and tasks so tasks have their
        // project set before any time entry tries to reference them
        for (var i = 0; i < dataRows.length; i++) {
            var row = dataRows[i];
            var projectName  = columns.project >= 0 ? row[columns.project] : '';
            var clientName   = columns.client  >= 0 ? row[columns.client]  : '';
            var plannedHours = columns.plannedHours >= 0 ? row[columns.plannedHours] : '';
            var loggedMoney  = columns.loggedMoney  >= 0 ? row[columns.loggedMoney]  : '';
            var durationStr  = columns.duration >= 0 ? row[columns.duration] : '';

            if (!projectName) { continue; }

            this.getOrCreateProject(projectName, clientName);
            var task = this.getOrCreateTask(projectName);

            if (plannedHours) {
                var plannedSecs = this.parseDecimalHours(plannedHours);
                if (plannedSecs > 0) { task.plannedDuration = plannedSecs; }
            }

            if (loggedMoney && durationStr) {
                var money = parseFloat(loggedMoney.replace(',', '.'));
                var hours = parseFloat(durationStr.replace(',', '.'));
                if (!isNaN(money) && !isNaN(hours) && hours > 0 && money > 0) {
                    task.hourlyRate = Math.round((money / hours) * 100) / 100;
                }
            }
        }

        // Second pass: create time entries
        for (var j = 0; j < dataRows.length; j++) {
            var row = dataRows[j];
            var projectName = columns.project >= 0 ? row[columns.project] : '';
            if (!projectName) { continue; }

            var dateStr  = columns.date >= 0 ? row[columns.date] : '';
            var dateBase = this.parseDate(dateStr);
            if (!dateBase) { continue; }

            var times = this.resolveTimestamps(row, columns, dateBase);
            if (times.end <= times.start) { continue; }

            var clientName = columns.client   >= 0 ? row[columns.client]   : '';
            var note       = columns.note     >= 0 ? row[columns.note]     : '';
            var billable   = columns.billed   >= 0 ? this.isBillable(row[columns.billed]) : true;
            var userName   = columns.userName >= 0 ? row[columns.userName] : '';

            // Stable entry ID: date + project + start time + user name
            var entryId = 'timely-csv-entry-' + this.makeSlug(
                dateStr + '|' + projectName + '|' + times.start + '|' + userName
            );

            var task = this.getOrCreateTask(projectName);
            task.billable = billable;

            var tymeEntry = TimeEntry.fromID(entryId) ?? TimeEntry.create(entryId);
            tymeEntry.note = note;
            tymeEntry.timeStart = times.start;
            tymeEntry.timeEnd = times.end;
            tymeEntry.parentTask = task;
        }
    }
}

const importer = new TimelyCSVImporter();
