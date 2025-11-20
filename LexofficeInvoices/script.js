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
            "plugins/LexofficeInvoices/lexoffice_logo.png",
            this.lexOfficeAPIClient.isAuthenticated() ? null : utils.localize('not.connected.message')
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
            const name = formValue.prefixProject ? entry.project + ": " + entry.name : entry.name;
            const note = formValue.showNotes ? entry.note : '';

            const lineItem = {
                'type': 'custom',
                'name': name.length > 255 ? (name.substring(0, 254) + "…") : name,
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
                'shippingDate': formValue.dateRange[0].toISOString(),
                'shippingEndDate': formValue.dateRange[1].toISOString()
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

                let errorMessage = parsedData['message'];

                if (parsedData['details'] != null) {
                    parsedData['details'].forEach((detailedError) => {
                        if (detailedError["field"] != null && detailedError["message"] != null) {
                            errorMessage += "\n\n";

                            const field = detailedError["field"]
                                .replace(/lineitems/i, "position")
                                .replace(/([0-9])/i, function (match, p1, offset, string) {
                                    return '' + (parseInt(p1) + 1);
                                });
                            errorMessage += field + ": " + detailedError["message"];
                        }
                    });
                }

                tyme.showAlert(utils.localize('api.invoice.error.title'), errorMessage);
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

const timeEntriesConverter = new TimeEntriesConverter(formValue.roundingOption);
const lexOfficeAPIClient = new LexOfficeAPIClient();
const lexOfficeResolver = new LexOfficeResolver(lexOfficeAPIClient, timeEntriesConverter);
