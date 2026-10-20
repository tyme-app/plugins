/*
    RUKK Invoices — Tyme export plugin
    -----------------------------------
    Sendir valdar tímafærslur úr Tyme beint í RUKK sem drög að reikningi,
    gegnum sérsniðna `rukk://` slóð. Engin nettenging — gögnin fara aðeins
    á milli appanna á þessari vél.

    Form-gildi (sjá form.json):
        formValue.dateRange[0], formValue.dateRange[1]
        formValue.taskIDs, formValue.teamMemberID
        formValue.onlyUnbilled, formValue.includeNonBillable
        formValue.clusterOption, formValue.prefixProject
        formValue.showNotes, formValue.markAsBilled
*/

class RukkResolver {
    constructor(fractionDigits) {
        this.fractionDigits = fractionDigits;
    }

    // MARK: - Lestur úr Tyme

    timeEntries() {
        return tyme.timeEntries(
            formValue.dateRange[0],
            formValue.dateRange[1],
            formValue.taskIDs,
            null,
            formValue.onlyUnbilled ? 0 : null,
            formValue.includeNonBillable ? null : true,
            formValue.teamMemberID,
            formValue.clusterOption
        ).filter(function (entry) {
            return parseFloat(entry.sum) > 0;
        });
    }

    timeEntryIDs() {
        return this.timeEntries().map(function (entry) {
            return entry.id;
        });
    }

    /// Þjappar færslum saman eftir verkþætti/undirþætti í reikningslínur.
    aggregated() {
        const grouped = {};
        const order = [];

        for (const entry of this.timeEntries()) {
            const key = entry.task_id + '|' + entry.subtask_id;

            if (grouped[key] == null) {
                let unit = utils.localize('unit.hours');
                if (entry.type === 'mileage') {
                    unit = utils.localize('unit.kilometer');
                } else if (entry.type === 'fixed') {
                    unit = utils.localize('unit.quantity');
                }

                let name = entry.task;
                if (entry.subtask && entry.subtask.length > 0) {
                    name += ': ' + entry.subtask;
                }

                grouped[key] = {
                    project: entry.project || '',
                    name: name,
                    unit: unit,
                    type: entry.type,
                    price: parseFloat(entry.rate),
                    quantity: 0.0,
                    note: ''
                };
                order.push(key);
            }

            let quantity = 0;
            if (entry.type === 'timed') {
                quantity = parseFloat(entry.duration) / 60.0;
            } else if (entry.type === 'mileage') {
                quantity = parseFloat(entry.distance);
            } else if (entry.type === 'fixed') {
                quantity = parseFloat(entry.quantity);
            }
            grouped[key].quantity += quantity;

            if (formValue.showNotes && entry.note && entry.note.length > 0) {
                if (grouped[key].note.length > 0) {
                    grouped[key].note += '\n';
                }
                grouped[key].note += entry.note;
            }
        }

        return order.map(function (key) { return grouped[key]; });
    }

    /// Breytir samanþjöppuðum færslum í línur fyrir RUKK-greiðslubyrðina.
    lines() {
        const self = this;
        return this.aggregated().map(function (entry) {
            let description = entry.name;
            if (formValue.prefixProject && entry.project.length > 0) {
                description = entry.project + ': ' + description;
            }
            if (formValue.showNotes && entry.note.length > 0) {
                description += '\n' + entry.note;
            }
            return {
                description: description,
                quantity: Number(entry.quantity.toFixed(self.fractionDigits)),
                unitPrice: Number(entry.price.toFixed(self.fractionDigits)),
                unit: entry.unit
            };
        });
    }

    /// Sameiginlegt verkefnaheiti ef allar færslur tilheyra sama verkefni (annars tómt).
    commonProject() {
        const projects = this.aggregated()
            .map(function (e) { return e.project; })
            .filter(function (p) { return p && p.length > 0; });
        if (projects.length === 0) { return ''; }
        const first = projects[0];
        return projects.every(function (p) { return p === first; }) ? first : '';
    }

    // MARK: - Útflutningur í RUKK

    createInvoice() {
        const lines = this.lines();

        if (lines.length === 0) {
            tyme.showAlert(utils.localize('alert.title'), utils.localize('alert.empty'));
            return;
        }

        const payload = {
            version: 1,
            source: 'tyme',
            currency: tyme.currencyCode(),
            customer: this.commonProject(),
            lines: lines
        };

        const encoded = encodeURIComponent(utils.base64Encode(JSON.stringify(payload)));
        tyme.openURL('rukk://invoice?data=' + encoded);

        if (formValue.markAsBilled) {
            tyme.setBillingState(this.timeEntryIDs(), 1);
        }
    }

    // MARK: - Forskoðun

    generatePreview() {
        const lines = this.lines();
        let total = 0;
        let rows = '';

        for (const line of lines) {
            const amount = line.quantity * line.unitPrice;
            total += amount;
            rows +=
                '<tr>' +
                '<td style="padding:4px 8px;border-bottom:1px solid #ddd">' +
                    this.escape(line.description).replaceAll('\n', '<br/>') + '</td>' +
                '<td style="padding:4px 8px;border-bottom:1px solid #ddd;text-align:right;white-space:nowrap">' +
                    this.formatNumber(line.quantity) + ' ' + this.escape(line.unit) + '</td>' +
                '<td style="padding:4px 8px;border-bottom:1px solid #ddd;text-align:right;white-space:nowrap">' +
                    this.formatNumber(line.unitPrice) + '</td>' +
                '<td style="padding:4px 8px;border-bottom:1px solid #ddd;text-align:right;white-space:nowrap">' +
                    this.formatNumber(amount) + '</td>' +
                '</tr>';
        }

        return '' +
            '<html><head><meta charset="utf-8"></head><body style="font-family:-apple-system,sans-serif;font-size:13px;color:#222">' +
            '<h3 style="margin:0 0 4px 0">RUKK</h3>' +
            '<p style="margin:0 0 12px 0;color:#888">' + this.escape(utils.localize('preview.summary')) + '</p>' +
            '<table style="border-collapse:collapse;width:100%">' +
            '<thead><tr style="text-align:left;color:#888">' +
            '<th style="padding:4px 8px">' + this.escape(utils.localize('invoice.position')) + '</th>' +
            '<th style="padding:4px 8px;text-align:right">' + this.escape(utils.localize('invoice.quantity')) + '</th>' +
            '<th style="padding:4px 8px;text-align:right">' + this.escape(utils.localize('invoice.price')) + '</th>' +
            '<th style="padding:4px 8px;text-align:right">' + this.escape(utils.localize('invoice.net')) + '</th>' +
            '</tr></thead><tbody>' + rows + '</tbody>' +
            '<tfoot><tr style="font-weight:600">' +
            '<td style="padding:8px" colspan="3">' + this.escape(utils.localize('invoice.net')) + '</td>' +
            '<td style="padding:8px;text-align:right">' + this.formatNumber(total) + ' ' + this.escape(tyme.currencyCode()) + '</td>' +
            '</tr></tfoot></table></body></html>';
    }

    // MARK: - Hjálparföll

    formatNumber(value) {
        return value.toLocaleString(utils.localize('locale.identifier'), {
            minimumFractionDigits: 0,
            maximumFractionDigits: this.fractionDigits
        });
    }

    escape(text) {
        return String(text)
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;');
    }
}

const rukk = new RukkResolver(2);
