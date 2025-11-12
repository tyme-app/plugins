class FreshBooks {
    constructor(oAuthAPIClient, timeEntriesConverter) {
        this.oAuthAPIClient = oAuthAPIClient;
        this.timeEntriesConverter = timeEntriesConverter;
        this.accountIDKey = "account_id";
        this.clients = [];
        this.getAccountID();
    }

    getAccountID() {
        let accountID = tyme.getSecureValue(this.accountIDKey);

        if (accountID) {
            return accountID;
        }

        const response = oAuthAPIClient.callResource(
            "https://api.freshbooks.com/auth/api/v1/users/me",
            "GET",
            {}
        );

        if (response) {
            const json = JSON.parse(response);

            if (json.response && json.response.roles && json.response.roles.length > 0) {
                accountID = json.response.roles[0].accountid;
                tyme.setSecureValue(this.accountIDKey, accountID);
            }
        }

        return accountID;
    }

    createInvoice() {
        let taxValue = formValue.taxID.split("#");
        let taxName = taxValue[0];
        let taxAmount = taxValue[1];
        let lines = [];

        const data = this.timeEntriesConverter.aggregatedTimeEntryData();
        data.forEach((entry) => {
            const name = formValue.prefixProject ? entry.project + ": " + entry.name : entry.name;
            const note = formValue.showNotes ? entry.note : '';

            const lineItem = {
                "type": 0,
                "qty": this.timeEntriesConverter.roundNumber(entry.quantity, 2),
                "unit_cost": {
                    "amount": entry.price,
                    "code": tyme.currencyCode()
                },
                "name": name.length > 255 ? (name.substring(0, 254) + "…") : name,
                "description": note,
                "taxName1": taxName,
                "taxAmount1": taxAmount
            };

            lines.push(lineItem);
        });

        let now = new Date();
        let params = {
            "invoice": {
                "create_date": now.toISOString().split('T')[0],
                "customerid": formValue.clientID,
                "lines": lines
            }
        };

        const response = oAuthAPIClient.callResource(
            "https://api.freshbooks.com/accounting/account/" + this.getAccountID() + "/invoices/invoices",
            "POST",
            params,
        );

        if (response) {
            const json = JSON.parse(response);
            const invoiceID = json.response.result.invoice.invoiceid;
            const invoiceURL = "https://my.freshbooks.com/#/invoice/" + this.getAccountID() + "-" + invoiceID;
            tyme.openURL(invoiceURL);
        }
    }

    getTaxes() {
        this.taxes = [];

        this.taxes.push({
            'name': utils.localize('input.tax.empty'),
            'value': '#'
        });

        const response = oAuthAPIClient.callResource(
            "https://api.freshbooks.com/accounting/account/" + this.getAccountID() + "/taxes/taxes",
            "GET",
            {}
        );

        if (response) {
            const json = JSON.parse(response);
            json.response.result.taxes.forEach(tax => {
                let name = tax.name;

                if (tax.number != null) {
                    name += ", " + tax.number;
                }

                this.taxes.push({
                    'name': String(name),
                    'value': String(tax.name + "#" + tax.amount)
                });
            });
        }

        return this.taxes;
    }

    getClients() {
        this.clients = [];

        let totalPages = this.getClientPage(1);
        for (let i = 2; i <= totalPages; i++) {
            this.getClientPage(i);
        }

        this.clients.sort(function (a, b) {
            if (a.name < b.name) return -1;
            if (a.name > b.name) return 1;
            return 0;
        });

        if (this.clients.length === 0) {
            this.clients.push({
                'name': utils.localize('input.clients.empty'),
                'value': ''
            });
        }

        return this.clients;
    }

    getClientPage(page) {
        const response = oAuthAPIClient.callResource(
            "https://api.freshbooks.com/accounting/account/" + this.getAccountID() + "/users/clients",
            "GET",
            {'page': page, 'per_page': 10},
        );

        if (response) {
            const json = JSON.parse(response);
            const pages = json.response.result.pages;
            json.response.result.clients.forEach(client => {
                let name = client.fname.length > 0 ? (client.fname + " " + client.lname) : (client.organization);

                this.clients.push({
                    'name': String(name),
                    'value': String(client.id)
                });
            });

            return pages;
        }

        return 0;
    }

    generatePreview() {
        formElement.authButton.isHidden = this.oAuthAPIClient.hasAccessToken();
        formElement.logoutButton.isHidden = !this.oAuthAPIClient.hasAccessToken();

        return this.timeEntriesConverter.generatePreview(
            null,
            this.oAuthAPIClient.hasAccessToken() ? null : utils.localize("not.connected.message")
        );
    }

    startAuthFlow() {
        this.oAuthAPIClient.startAuthFlow();
    }

    logout() {
        this.oAuthAPIClient.logout();
        this.clients = [];
        this.taxes = [];
        tyme.setSecureValue(this.accountIDKey, null);
        formElement.clientID.reload();
        formElement.taxID.reload();
    }
}

const timeEntriesConverter = new TimeEntriesConverter();

const oAuthAPIClient = new OAuthAPIClient(
    "freshbooks"
);

const freshBooks = new FreshBooks(oAuthAPIClient, timeEntriesConverter);