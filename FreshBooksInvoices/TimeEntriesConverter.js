/*

    The TimeEntriesConverter assumes that the following values are set in the form and localization files:

    Form:

    formValue.dateRange[0],
    formValue.dateRange[1],
    formValue.taskIDs,
    formValue.onlyUnbilled
    formValue.includeNonBillable,
    formValue.teamMemberID,
    formValue.clusterOption
    formValue.showTimesInNotes
    formValue.showNotes
    formValue.prefixProject

    Localization:

    unit.hours
    unit.kilometer
    unit.quantity
    locale.identifier
    invoice.header
    invoice.position
    invoice.price
    invoice.quantity
    invoice.unit
    invoice.net
*/

class TimeEntriesConverter {
    constructor() {

    }

    timeEntriesFromFormValues(useClusterOption) {
        return tyme.timeEntries(
            formValue.dateRange[0],
            formValue.dateRange[1],
            formValue.taskIDs,
            null,
            formValue.onlyUnbilled ? 0 : null,
            formValue.includeNonBillable ? null : true,
            formValue.teamMemberID,
            useClusterOption ? formValue.clusterOption : null
        ).filter(function (timeEntry) {
            return parseFloat(timeEntry.sum) > 0;
        })
    }

    timeEntryIDs() {
        return this.timeEntriesFromFormValues(false)
            .map(function (entry) {
                return entry.id;
            });
    }

    aggregatedTimeEntryData() {
        let data =
            this.timeEntriesFromFormValues(true)
                .reduce(function (data, timeEntry) {
                    const key = timeEntry.task_id + timeEntry.subtask_id;

                    if (data[key] == null) {
                        let entry = {
                            'project': '',
                            'name': '',
                            'quantity': 0.0,
                            'unit': '',
                            'price': parseFloat(timeEntry.rate),
                            'note': ''
                        };

                        if (timeEntry.type === 'timed') {
                            entry.unit = utils.localize('unit.hours')
                        } else if (timeEntry.type === 'mileage') {
                            entry.unit = utils.localize('unit.kilometer')
                        } else if (timeEntry.type === 'fixed') {
                            entry.unit = utils.localize('unit.quantity')
                        }

                        entry.project = timeEntry.project;
                        entry.name = timeEntry.task;

                        if (timeEntry.subtask.length > 0) {
                            entry.name += ': ' + timeEntry.subtask
                        }

                        data[key] = entry;
                    }

                    let currentQuantity = 0;

                    if (timeEntry.type === 'timed') {
                        currentQuantity = parseFloat(timeEntry.duration) / 60.0
                        data[key].quantity += currentQuantity;
                    } else if (timeEntry.type === 'mileage') {
                        currentQuantity = parseFloat(timeEntry.distance)
                        data[key].quantity += currentQuantity;
                    } else if (timeEntry.type === 'fixed') {
                        currentQuantity = parseFloat(timeEntry.quantity)
                        data[key].quantity += currentQuantity;
                    }

                    if (formValue.showTimesInNotes && timeEntry.type !== "fixed") {

                        if (data[key].note.length > 0) {
                            data[key].note += '\n';
                        }

                        if (timeEntry.hasOwnProperty("start") && timeEntry.hasOwnProperty("end")) {
                            data[key].note += this.formatDate(timeEntry.start, false) + " ";
                            data[key].note += this.formatDate(timeEntry.start, true) + " - ";
                            data[key].note += this.formatDate(timeEntry.end, true);
                        } else if (timeEntry.hasOwnProperty("date")) {
                            data[key].note += this.formatDate(timeEntry.date, false);
                        }

                        data[key].note += " (" + this.roundNumber(currentQuantity, 2) + " " + data[key].unit + ")";

                        if (timeEntry.note.length > 0) {
                            data[key].note += "\n";
                            data[key].note += timeEntry.note;
                        }

                    } else if (timeEntry.note.length > 0) {
                        if (data[key].note.length > 0) {
                            data[key].note += '\n';
                        }
                        data[key].note += timeEntry.note;
                    }

                    return data;

                }.bind(this), {});

        let sortedData = Object.keys(data)
            .map(function (key) {
                return data[key];
            })
            .sort(function (a, b) {
                return a.name > b.name;
            });

        sortedData.forEach((entry) => {
            if (entry.note.length > 1800) {
                entry.note = entry.note.substring(0, 1799) + "…";
            }
        });

        return sortedData;
    }

    formatDate(dateString, timeOnly) {
        let locale = utils.localize('locale.identifier');
        if (timeOnly) {
            return (new Date(dateString)).toLocaleTimeString(locale, {hour: '2-digit', minute: '2-digit'});
        } else {
            return (new Date(dateString)).toLocaleDateString(locale);
        }
    }

    roundNumber(num, places) {
        return (+(Math.round(num + "e+" + places) + "e-" + places)).toFixed(places);
    }

    generatePreview(logoPath, authMessage) {
        const data = this.aggregatedTimeEntryData();

        let total = 0.0;
        let str = '';

        if (logoPath) {
            str += '![](logoPath)\n';
        }

        if (authMessage) {
            str += "#### <span style='color: darkred; font-size: 16px;'>" + authMessage + "</span>\n";
        }

        str += '## ' + utils.localize('invoice.header') + '\n';
        str += '|' + utils.localize('invoice.position');
        str += '|' + utils.localize('invoice.price');
        str += '|' + utils.localize('invoice.quantity');
        str += '|' + utils.localize('invoice.unit');
        str += '|' + utils.localize('invoice.net');
        str += '|\n';

        str += '|-|-:|-:|-|-:|\n';

        data.forEach((entry) => {
            let name = entry.name;

            if (formValue.showNotes) {
                name = '**' + entry.name + '**';
                name += '<br/>' + entry.note.replace(/\n/g, '<br/>');
            }

            if (formValue.prefixProject) {
                name = '**' + entry.project + ':** ' + name;
            }

            let price = this.roundNumber(entry.price, 2);
            let quantity = this.roundNumber(entry.quantity, 2);
            let sum = this.roundNumber(parseFloat(price) * parseFloat(quantity), 2);

            total += parseFloat(sum);

            str += '|' + name;
            str += '|' + price + ' ' + tyme.currencySymbol();
            str += '|' + quantity;
            str += '|' + entry.unit;
            str += '|' + this.roundNumber(sum, 2) + ' ' + tyme.currencySymbol();
            str += '|\n';
        });

        str += '|||||**' + this.roundNumber(total, 2) + ' ' + tyme.currencySymbol() + '**|\n';
        return utils.markdownToHTML(str);
    }
}