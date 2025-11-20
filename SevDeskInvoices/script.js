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
            let contacts = this.getContactsInternal(offset, 500);
            newContactCount = contacts.length;
            allContacts = allContacts.concat(contacts);
            offset += 500;
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

    generatePreview() {
        return this.timeEntriesConverter.generatePreview(
            "plugins/SevDeskInvoices/sevdesk_logo.png",
            null
        );
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
            const name = formValue.prefixProject ? entry.project + ": " + entry.name : entry.name;
            const note = formValue.showNotes ? entry.note : '';
            const quantity = this.timeEntriesConverter.roundNumber(entry.quantity, 2);

            if (entry.type === 'timed') {
                entry.unitID = 9;
            } else if (timeEntry.type === 'mileage') {
                entry.unitID = 10;
            } else if (timeEntry.type === 'fixed') {
                entry.unitID = 1;
            }

            invoicePosSave.push({
                "objectName": "InvoicePos",
                "quantity": quantity,
                "price": entry.price,
                "name": name,
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
                "deliveryDate": formValue.dateRange[0].toISOString(),
                "deliveryDateUntil": formValue.dateRange[1].toISOString(),
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
        } else if (statusCode === 422) {
            tyme.showAlert(
                utils.localize('export.error.title'),
                utils.localize('export.empty.error')
            );
            return null;
        } else if (statusCode === 401) {
            const parsedData = JSON.parse(result);
            tyme.showAlert('sevdesk API Error ' + parsedData["status"], parsedData["message"]);
            return null;
        } else {
            tyme.showAlert('sevdesk API Error', JSON.stringify(response));
            return null;
        }
    }
}

const timeEntriesConverter = new TimeEntriesConverter(2);
const sevdeskResolver = new SevDeskResolver(formValue.apiKey, timeEntriesConverter);