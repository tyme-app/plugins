class TimeEntriesConverter {
    constructor() {

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
        ).filter(function (timeEntry) {
            return parseFloat(timeEntry.sum) > 0;
        })
    }

    timeEntryIDs() {
        return this.timeEntriesFromFormValues()
            .map(function (entry) {
                return entry.id;
            });
    }

    aggregatedTimeEntryData() {
        let data =
            this.timeEntriesFromFormValues()
                .reduce(function (data, timeEntry) {
                    const key = timeEntry.task_id + timeEntry.subtask_id;

                    if (data[key] == null) {
                        let entry = {
                            'name': '',
                            'quantity': 0.0,
                            'unit': '',
                            'price': parseFloat(timeEntry.rate),
                            'note': '',
                            'sum': 0.0
                        };

                        // unit: Stk=1, Std=9, km=10

                        if (timeEntry.type === 'timed') {
                            entry.unit = utils.localize('unit.hours')
                            entry.unitID = 9;
                        } else if (timeEntry.type === 'mileage') {
                            entry.unit = utils.localize('unit.kilometer')
                            entry.unitID = 10;
                        } else if (timeEntry.type === 'fixed') {
                            entry.unit = utils.localize('unit.quantity')
                            entry.unitID = 1;
                        }

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

                    if (data[key].note.length > 0 && timeEntry.note.length > 0) {
                        data[key].note += '<br/>';
                    }

                    if (formValue.showTimesInNotes
                        && timeEntry.hasOwnProperty("start")
                        && timeEntry.hasOwnProperty("end")
                        && timeEntry.type !== "fixed") {

                        data[key].note += this.formatDate(timeEntry.start, false) + " ";
                        data[key].note += this.formatDate(timeEntry.start, true) + " - ";
                        data[key].note += this.formatDate(timeEntry.end, true) + " (";
                        data[key].note += this.roundNumber(currentQuantity, 1) + " " + data[key].unit + ")";
                        data[key].note += "<br/>";
                    }

                    data[key].note += timeEntry.note;
                    return data;

                }.bind(this), {});

        return Object.keys(data)
            .map(function (key) {
                return data[key];
            })
            .sort(function (a, b) {
                return a.name > b.name;
            });
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

    generatePreview() {
        const data = this.aggregatedTimeEntryData()

        let total = 0.0;
        var str = '';
        str += '![](plugins/SevDeskInvoices/sevdesk_logo.png)\n';
        str += '## ' + utils.localize('invoice.header') + '\n';

        str += '|' + utils.localize('invoice.position');
        str += '|' + utils.localize('invoice.price');
        str += '|' + utils.localize('invoice.quantity');
        str += '|' + utils.localize('invoice.unit');
        str += '|' + utils.localize('invoice.net');
        str += '|\n';

        str += '|-|-:|-:|-|-:|\n';

        data.forEach((entry) => {

            var name = entry.name;

            if (formValue.showNotes) {
                name = '**' + entry.name + '**';
                name += '<br/>' + entry.note.replace(/\n/g, '<br/>');
            }

            let price = this.roundNumber(entry.price, 2);
            let quantity = this.roundNumber(entry.quantity, formValue.roundingOption);
            let sum = this.roundNumber(parseFloat(price) * parseFloat(quantity), 2);

            total += parseFloat(sum);

            str += '|' + name;
            str += '|' + price + ' ' + tyme.currencySymbol();
            str += '|' + quantity;
            str += '|' + entry.unit;
            str += '|' + sum + ' ' + tyme.currencySymbol();
            str += '|\n';
        });

        str += '|||||**' + this.roundNumber(total, 2) + ' ' + tyme.currencySymbol() + '**|\n';
        return utils.markdownToHTML(str);
    }
}

class SevDeskResolver {
    constructor(apiKey, timeEntriesConverter) {
        this.apiKey = apiKey;
        this.timeEntriesConverter = timeEntriesConverter;
        this.baseURL = 'https://my.sevdesk.de/api';
        this.invoicePath = '/v1/Invoice/Factory/saveInvoice';
        this.invoiceNumberPath = '/v1/Invoice/Factory/getNextInvoiceNumber';
        this.contactsPath = '/v1/Contact';
        this.userPath = '/v1/SevUser';
    }

    getSevUser() {
        const url = this.baseURL + this.userPath;
        const response = utils.request(url, 'GET', {'Authorization': this.apiKey}, null);
        const statusCode = response['statusCode'];
        const result = response['result'];

        if (statusCode === 200) {
            const parsedData = JSON.parse(result);
            const contacts = parsedData['objects'];
            let contactList = [];

            contacts.forEach((contact, index) => {
                contactList.push({
                    "name": contact["fullname"],
                    "value": contact["id"],
                })
            });

            return contactList;

        } else {
            return [
                {
                    'name': utils.localize('input.data.empty'),
                    'value': ''
                }
            ]
        }
    }

    getContacts() {
        let allContacts = [];
        let offset = 0;
        let newContactCount = 1;

        while (newContactCount > 0) {
            let contacts = this.getContactsInternal(offset, 100);
            newContactCount = contacts.length;
            allContacts = allContacts.concat(contacts);
            offset += 100;
        }

        allContacts.sort(function (a, b) {
            return a["name"] < b["name"] ? -1 : 1;
        });

        if (allContacts.length === 0) {
            allContacts.push(
                {
                    'name': utils.localize('input.data.empty'),
                    'value': ''
                }
            );
        }

        return allContacts;
    }

    getContactsInternal(offset, limit) {
        const url = this.baseURL + this.contactsPath;
        const response = utils.request(
            url,
            'GET',
            {'Authorization': this.apiKey},
            {
                "depth": 1,
                "limit": limit,
                "offset": offset
            }
        );
        const statusCode = response['statusCode'];
        const result = response['result'];

        if (statusCode === 200) {
            const parsedData = JSON.parse(result);
            const contacts = parsedData['objects'];
            let contactList = [];

            contacts.forEach((contact, index) => {
                if (contact["name"]) {
                    contactList.push({
                        "name": contact["name"],
                        "value": contact["id"],
                    })
                } else if (contact["surename"] && contact["familyname"]) {
                    contactList.push({
                        "name": contact["surename"] + " " + contact["familyname"],
                        "value": contact["id"],
                    })
                }
            });

            return contactList;

        } else {
            return [];
        }
    }

    createNewInvoice() {
        const invoiceID = this.makeCreateNewInvoiceCall();

        if (invoiceID !== null) {
            if (formValue.markAsBilled) {
                const timeEntryIDs = this.timeEntriesConverter.timeEntryIDs();
                tyme.setBillingState(timeEntryIDs, 1);
            }
            tyme.openURL('https://my.sevdesk.de/#/fi/edit/type/RE/id/' + invoiceID);
        }
    }

    getInvoiceNumber() {
        const params = {
            "objectType": "Invoice",
            "type": "RE"
        };
        const url = this.baseURL + this.invoiceNumberPath;
        const response = utils.request(url, 'GET', {'Authorization': this.apiKey}, params);
        const statusCode = response['statusCode'];
        const result = response['result'];

        if (statusCode === 200) {
            const parsedData = JSON.parse(result);
            return parsedData["objects"];
        } else {
            return null;
        }
    }

    makeCreateNewInvoiceCall() {
        const data = this.timeEntriesConverter.aggregatedTimeEntryData()
        let invoicePosSave = [];

        data.forEach((entry) => {
            const note = formValue.showNotes ? entry.note : '';
            const quantity = this.timeEntriesConverter.roundNumber(entry.quantity, formValue.roundingOption);

            invoicePosSave.push({
                "objectName": "InvoicePos",
                "quantity": quantity,
                "price": entry.price,
                "name": entry.name,
                "unity": {
                    "id": entry.unitID,
                    "objectName": "Unity"
                },
                "text": note,
                "taxRate": formValue.taxRate,
                "mapAll": true
            })
        });

        const params = {
            "invoice": {
                "id": null,
                "objectName": "Invoice",
                "invoiceNumber": this.getInvoiceNumber(),
                "contact": {
                    "id": formValue.contactID,
                    "objectName": "Contact"
                },
                "contactPerson": {
                    "id": formValue.userID,
                    "objectName": "SevUser"
                },
                "invoiceDate": new Date().toISOString(),
                "discount": 0,
                "deliveryDate": formValue.startDate.toISOString(),
                "deliveryDateUntil": formValue.endDate.toISOString(),
                "status": "100",
                "taxRate": formValue.taxRate,
                "taxType": "default",
                "invoiceType": "RE",
                "currency": tyme.currencyCode(),
                "mapAll": true
            },
            "invoicePosSave": invoicePosSave,
            "takeDefaultAddress": true
        }

        const url = this.baseURL + this.invoicePath;
        const response = utils.request(url, 'POST', {'Authorization': this.apiKey}, params);
        const statusCode = response['statusCode'];
        const result = response['result'];

        if (statusCode === 201) {
            const parsedData = JSON.parse(result);
            return parsedData["objects"]["invoice"]["id"];
        } else if (statusCode === 401) {
            const parsedData = JSON.parse(result);
            tyme.showAlert('sevDesk API Error ' + parsedData["status"], parsedData["message"]);
            return null;
        } else {
            tyme.showAlert('sevDesk API Error', JSON.stringify(response));
            return null;
        }
    }
}

const timeEntriesConverter = new TimeEntriesConverter();
const sevDeskResolver = new SevDeskResolver(formValue.apiKey, timeEntriesConverter);