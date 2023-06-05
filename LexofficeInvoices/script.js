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

                    if (data[key].note.length > 0 && timeEntry.note.length > 0) {
                        data[key].note += '\n';
                    }

                    if (formValue.showTimesInNotes
                        && timeEntry.hasOwnProperty("start")
                        && timeEntry.hasOwnProperty("end")
                        && timeEntry.type !== "fixed") {

                        data[key].note += this.formatDate(timeEntry.start, false) + " ";
                        data[key].note += this.formatDate(timeEntry.start, true) + " - ";
                        data[key].note += this.formatDate(timeEntry.end, true) + " (";
                        data[key].note += this.roundNumber(currentQuantity, 1) + " " + data[key].unit + ")";
                        data[key].note += "\n";
                    }

                    data[key].note += timeEntry.note;
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
            if (entry.note.length > 2000) {
                entry.note = entry.note.substring(0, 1999) + "…";
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

    generatePreview(isAuthenticated) {
        const data = this.aggregatedTimeEntryData()

        let total = 0.0;
        let str = '';

        str += '![](plugins/LexofficeInvoices/lexoffice_logo.png)\n';

        if (!isAuthenticated) {
            str += "#### <span style='color: darkred; font-size: 16px;'>" + utils.localize('not.connected.message') + "</span>\n";
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
            let quantity = this.roundNumber(entry.quantity, formValue.roundingOption);
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
    constructor(lexOfficeAPIClient, timeEntriesConverter) {
        this.lexOfficeAPIClient = lexOfficeAPIClient;
        this.timeEntriesConverter = timeEntriesConverter;
        this.invoicePath = '/v1/invoices/';
        this.contactPath = '/v1/contacts/';
    }

    getContacts() {
        this.contacts = [];

        const totalPages = this.getContactPage(0);
        for (let i = 1; i <= totalPages; i++) {
            this.getContactPage(i);
        }

        if (this.contacts.length === 0) {
            this.contacts.push({
                'name': utils.localize('input.clients.empty'),
                'value': ''
            });
        }

        return this.contacts;
    }

    getContactPage(page) {
        const response = this.lexOfficeAPIClient.callResource(
            this.contactPath,
            'GET',
            {'page': page, 'size': 25},
            false
        );

        if (response == null) {
            return 0;
        }

        const statusCode = response['statusCode'];
        const result = response['result'];

        if (statusCode === 200) {
            const parsedData = JSON.parse(result);
            const content = parsedData['content'];
            const totalPages = parsedData['totalPages'];

            content
                .filter(function (contact) {
                    return contact.roles.hasOwnProperty('customer');
                })
                .forEach((contact, index) => {
                    let contactObject = {
                        'value': contact.id
                    }

                    if (contact.hasOwnProperty('company') && contact.company.hasOwnProperty('name')) {
                        contactObject.name = contact.company.name;
                    } else if (contact.hasOwnProperty('person') && contact.person.hasOwnProperty('firstName') && contact.person.hasOwnProperty('lastName')) {
                        contactObject.name = contact.person.firstName + ' ' + contact.person.lastName;
                    }

                    this.contacts.push(contactObject);
                });

            return totalPages;
        } else {
            return 0
        }
    }

    generatePreview() {
        return this.timeEntriesConverter.generatePreview(
            this.lexOfficeAPIClient.isAuthenticated()
        )
    }

    createInvoice() {
        const invoiceID = this.makeCreateInvoiceCall();

        if (invoiceID !== null) {
            if (formValue.markAsBilled) {
                const timeEntryIDs = this.timeEntriesConverter.timeEntryIDs();
                tyme.setBillingState(timeEntryIDs, 1);
            }

            this.lexOfficeAPIClient.editInvoice(invoiceID);
        }
    }

    makeCreateInvoiceCall() {
        const data = this.timeEntriesConverter.aggregatedTimeEntryData()
        let lineItems = [];

        const taxPercentage = 1.0 + parseFloat(formValue.taxRate) / 100.0;

        data.forEach((entry) => {
            const name = formValue.prefixProject ? entry.project + ": " +  entry.name : entry.name;
            const note = formValue.showNotes ? entry.note : '';

            const lineItem = {
                'type': 'custom',
                'name': name,
                'description': note,
                'quantity': this.timeEntriesConverter.roundNumber(entry.quantity, formValue.roundingOption),
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
                'contactId': formValue.contactID
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

        const response = this.lexOfficeAPIClient.callResource(
            this.invoicePath,
            'POST',
            params,
            true
        );

        if (response == null) {
            return null;
        }

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

class LexOfficeAPIClient {
    constructor() {
        this.baseURL = 'https://api.tyme-app.com/lex/';
        this.lexTokenKey = 'lexoffice_token';
        this.authCodeKey = 'lexoffice_auth_code';
    }

    editInvoice(invoiceID) {
        tyme.openURL(this.baseURL + 'invoice/edit/' + invoiceID);
    }

    startAuthFlow() {
        tyme.openURL(this.baseURL + 'auth/new');
    }

    hasAuthCode() {
        return tyme.getSecureValue(this.authCodeKey) != null;
    }

    isAuthenticated() {
        return tyme.getSecureValue(this.lexTokenKey) != null
    }

    fetchTokenFromCode() {
        const url = this.baseURL + 'auth/code';
        const code = tyme.getSecureValue(this.authCodeKey);
        const response = utils.request(url, 'POST', {}, {'code': code});
        const statusCode = response['statusCode'];
        const result = response['result'];

        tyme.setSecureValue(this.authCodeKey, null);

        if (statusCode === 200) {
            const json = JSON.parse(result);
            tyme.setSecureValue(this.lexTokenKey, json['lex_token']);
            return true;
        } else {
            utils.log('lexoffice Auth Error ' + JSON.stringify(response));
            tyme.setSecureValue(this.lexTokenKey, null);
            return false;
        }
    }

    callResource(path, method, params, doAuth) {
        if (!this.isAuthenticated()) {
            if (this.hasAuthCode()) {
                this.fetchTokenFromCode();
            } else if (doAuth) {
                this.startAuthFlow();
                return null;
            }
        }

        const url = this.baseURL + 'resource';
        const lexofficeToken = tyme.getSecureValue(this.lexTokenKey);

        const combinedParams = {
            'path': path,
            'method': method,
            'params': params,
            'lex_token': lexofficeToken
        }

        const response = utils.request(url, 'POST', {}, combinedParams);

        if (response['statusCode'] === 401 && this.isAuthenticated()) {
            tyme.setSecureValue(this.lexTokenKey, null);
        }

        return response;
    }
}

const timeEntriesConverter = new TimeEntriesConverter();
const lexOfficeAPIClient = new LexOfficeAPIClient();
const lexOfficeResolver = new LexOfficeResolver(lexOfficeAPIClient, timeEntriesConverter);
