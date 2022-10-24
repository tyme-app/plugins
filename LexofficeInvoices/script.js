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
                            'note': ''
                        };

                        if (timeEntry.type === 'timed') {
                            entry.unit = utils.localize('unit.hours')
                        } else if (timeEntry.type === 'mileage') {
                            entry.unit = utils.localize('unit.kilometer')
                        } else if (timeEntry.type === 'fixed') {
                            entry.unit = utils.localize('unit.quantity')
                        }

                        entry.name = timeEntry.task;

                        if (timeEntry.subtask.length > 0) {
                            entry.name += ': ' + timeEntry.subtask
                        }

                        data[key] = entry;
                    }

                    if (timeEntry.type === 'timed') {
                        const durationHours = parseFloat(timeEntry.duration) / 60.0
                        data[key].quantity += durationHours;
                    } else if (timeEntry.type === 'mileage') {
                        const distance = parseFloat(timeEntry.distance)
                        data[key].quantity += distance;
                    } else if (timeEntry.type === 'fixed') {
                        const quantity = parseFloat(timeEntry.quantity)
                        data[key].quantity += quantity;
                    }

                    if (data[key].note.length > 0 && timeEntry.note.length > 0) {
                        data[key].note += '\n';
                    }
                    data[key].note += timeEntry.note;

                    return data;

                }, {});

        return Object.keys(data)
            .map(function (key) {
                return data[key];
            })
            .sort(function (a, b) {
                return a.name > b.name;
            });
    }

    roundNumber(num, places) {
        return (+(Math.round(num + "e+" + places) + "e-" + places)).toFixed(places);
    }

    generatePreview() {
        const data = this.aggregatedTimeEntryData()

        let total = 0.0;
        let str = '';

        str += '![](plugins/LexofficeInvoices/lexoffice_logo.png)\n';
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

            let price = this.roundNumber(entry.price, 2);
            let quantity = this.roundNumber(entry.quantity, 4);
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

class LexOfficeResolver {
    constructor(apiKey, timeEntriesConverter) {
        this.apiKey = apiKey;
        this.timeEntriesConverter = timeEntriesConverter;
        this.baseURL = 'https://api.lexoffice.io';
        this.invoicePath = '/v1/invoices/';
        this.contactPath = '/v1/contacts/';
    }

    getClients() {
        this.clients = [];

        const totalPages = this.getClientPage(0);
        for (let i = 1; i <= totalPages; i++) {
            this.getClientPage(i);
        }

        if (this.clients.length === 0) {
            this.clients.push({
                'name': utils.localize('input.clients.empty'),
                'value': ''
            });
        }

        return this.clients;
    }

    getClientPage(page) {
        const url = this.baseURL + this.contactPath;
        const response = utils.request(url, 'GET', {'Authorization': 'Bearer ' + this.apiKey}, {
            'page': page,
            'size': 25
        });
        const statusCode = response['statusCode'];
        const result = response['result'];

        if (statusCode === 200) {
            const parsedData = JSON.parse(result);
            const content = parsedData['content'];
            const totalPages = parsedData['totalPages'];

            content
                .filter(function (client) {
                    return client.roles.hasOwnProperty('customer');
                })
                .forEach((client, index) => {
                    let clientObject = {
                        'value': client.id
                    }

                    if (client.hasOwnProperty('company') && client.company.hasOwnProperty('name')) {
                        clientObject.name = client.company.name;
                    } else if (client.hasOwnProperty('person') && client.person.hasOwnProperty('firstName') && client.person.hasOwnProperty('lastName')) {
                        clientObject.name = client.person.firstName + ' ' + client.person.lastName;
                    }

                    this.clients.push(clientObject);
                });

            return totalPages;
        } else {
            return 0
        }
    }

    createInvoice() {
        const invoiceID = this.makeCreateInvoiceCall();

        if (invoiceID !== null) {
            if (formValue.markAsBilled) {
                const timeEntryIDs = this.timeEntriesConverter.timeEntryIDs();
                tyme.setBillingState(timeEntryIDs, 1);
            }
            tyme.openURL('https://app.lexoffice.de/permalink/invoices/edit/' + invoiceID);
        }
    }

    makeCreateInvoiceCall() {
        const data = this.timeEntriesConverter.aggregatedTimeEntryData()
        let lineItems = [];

        const taxPercentage = 1.0 + parseFloat(formValue.taxRate) / 100.0;

        data.forEach((entry) => {
            const note = formValue.showNotes ? entry.note : '';

            const lineItem = {
                'type': 'custom',
                'name': entry.name,
                'description': note,
                'quantity': entry.quantity.toFixed(4),
                'unitName': entry.unit,
                'unitPrice': {
                    'currency': tyme.currencyCode(),
                    'taxRatePercentage': formValue.taxRate
                }
            };

            if (formValue.taxType === 'gross') {
                lineItem['unitPrice']['grossAmount'] = (entry.price * taxPercentage).toFixed(2);
            } else {
                lineItem['unitPrice']['netAmount'] = entry.price.toFixed(2);
            }

            lineItems.push(lineItem);
        });

        const params = {
            'voucherDate': new Date().toISOString(),
            'address': {
                'contactId': formValue.clientID
            },
            'lineItems': lineItems,
            'totalPrice': {
                'currency': tyme.currencyCode()
            },
            'taxConditions': {
                'taxType': formValue.taxType
            },
            'shippingConditions': {
                'shippingType': 'serviceperiod',
                'shippingDate': formValue.startDate.toISOString(),
                'shippingEndDate': formValue.endDate.toISOString()
            }
        }

        const url = this.baseURL + this.invoicePath;
        const response = utils.request(url, 'POST', {'Authorization': 'Bearer ' + this.apiKey}, params);
        
        const statusCode = response['statusCode'];
        const result = response['result'];
        const parsedData = JSON.parse(result);

        if (statusCode === 201) {
            return parsedData['id'];
        } else {
            if (parsedData['message'] != null) {
                tyme.showAlert(utils.localize('api.invoice.error.title'), parsedData['message']);
            } else {
                tyme.showAlert(utils.localize('api.invoice.error.title'), JSON.stringify(response));
            }
            return null;
        }
    }
}

const timeEntriesConverter = new TimeEntriesConverter();
const lexOfficeResolver = new LexOfficeResolver(formValue.lexofficeKey, timeEntriesConverter);
