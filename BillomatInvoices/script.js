class BillomatResolver {
    constructor(billomatID, apiKey, timeEntriesConverter) {
        this.apiKey = apiKey;
        this.billomatID = billomatID.length !== 0 ? billomatID : "default";
        this.headers = {'X-BillomatApiKey': this.apiKey};
        this.baseURL = 'https://' + this.billomatID + '.billomat.net/api/';
        this.timeEntriesConverter = timeEntriesConverter;
    }

    getClientContacts() {
        this.clients = [];

        const entriesPerPage = 500;
        let currentPage = 1;
        let newContactCount = 1;

        while (newContactCount > 0) {
            newContactCount = this.getClientPage(currentPage, entriesPerPage);
            ++currentPage;
        }

        if (this.clients.length === 0) {
            this.clients.push({
                'name': utils.localize('input.data.empty'),
                'value': ''
            });
        }

        return this.clients;
    }

    getClientPage(page, entriesPerPage) {
        const url = this.baseURL + 'clients';
        const response = utils.request(url, 'GET', this.headers, {'per_page': entriesPerPage, 'page': page});
        const statusCode = response['statusCode'];
        const result = response['result'];

        if (statusCode === 200) {
            const parsedData = JSON.parse(result);

            if (!parsedData['clients']["client"]) {
                return 0;
            }

            const clients = parsedData['clients']["client"];

            for (let client of clients) {
                this.clients.push({
                    'name': client['name'] + " - " + client['first_name'] + " " + client['last_name'],
                    'value': client['id']
                });
            }

            return clients.length;
        } else {
            return 0;
        }
    }

    generatePreview() {
        return this.timeEntriesConverter.generatePreview(
            "plugins/BillomatInvoices/billomat_logo.png",
            null
        );
    }

    createNewInvoice() {
        const invoiceID = this.makeCreateInvoiceCall();

        if (invoiceID !== null) {
            if (formValue.markAsBilled) {
                const timeEntryIDs = this.timeEntriesConverter.timeEntryIDs();
                tyme.setBillingState(timeEntryIDs, 1);
            }

            tyme.openURL('https://' + this.billomatID + '.billomat.net/app/invoices/show/entityId/' + invoiceID);
        }
    }

    makeCreateInvoiceCall() {
        const clientID = formValue.clientContact;
        const data = this.timeEntriesConverter.aggregatedTimeEntryData()
        let invoiceItems = [];

        data.forEach((entry) => {
            const name = formValue.prefixProject ? entry.project + ": " + entry.name : entry.name;
            const note = formValue.showNotes ? entry.note.replaceAll('<br/>', '\n') : '';

            invoiceItems.push({
                "invoice-item": {
                    "unit": entry.unit,
                    "unit_price": entry.price.toFixed(2),
                    "quantity": entry.quantity.toFixed(2),
                    "title": name,
                    "description": note
                }
            })
        });

        let params = {
            "invoice": {
                "client_id": clientID,
                "supply_date_type": "SUPPLY_TEXT",
                "supply_date": formValue.dateRange[0].toLocaleDateString() + " - " + formValue.dateRange[1].toLocaleDateString(),
                "net_gross": "NET",
                "invoice-items": invoiceItems
            }
        };

        const url = this.baseURL + 'invoices';
        const response = utils.request(url, 'POST', this.headers, params);
        const statusCode = response['statusCode'];
        const result = response['result'];

        if (statusCode === 201) {
            const parsedData = JSON.parse(result);
            return parsedData["invoice"]["id"];
        } else {
            tyme.showAlert('Billomat API Error', JSON.stringify(response));
            return null;
        }
    }
}

const timeEntriesConverter = new TimeEntriesConverter(2);
const billomatResolver = new BillomatResolver(formValue.billomatID, formValue.apiKey, timeEntriesConverter);