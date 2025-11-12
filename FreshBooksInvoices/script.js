class FreshBooks {
    constructor(oAuthAPIClient, timeEntriesConverter) {
        this.oAuthAPIClient = oAuthAPIClient;
        this.timeEntriesConverter = timeEntriesConverter;
        this.accountID = null;
        this.clients = [];
        this.getAccountID();
    }

    getAccountID() {
        const response = oAuthAPIClient.callResource(
            "https://api.freshbooks.com/auth/api/v1/users/me",
            "GET",
            {}
        );

        if (response) {
            const json = JSON.parse(response);

            if (json.response && json.response.roles && json.response.roles.length > 0) {
                this.accountID = json.response.roles[0].accountid;
            }
        }
    }

    createInvoice() {
        let taxValue = formValue.taxID.split("#");
        let taxName = taxValue[0];
        let taxAmount = taxValue[1];

        let lines = [
            {
                "type": 0,
                "qty": 1.5,
                "unit_cost": {
                    "amount": 123.45,
                    "code": "EUR"
                },
                "name": "Name of Item",
                "description": "Test Line Item",
                "taxName1": taxName,
                "taxAmount1": taxAmount
            }
        ];

        let now = new Date();
        let params = {
            "invoice": {
                "create_date": now.toISOString().split('T')[0],
                "customerid": formValue.clientID,
                "lines": lines
            }
        };

        const response = oAuthAPIClient.callResource(
            "https://api.freshbooks.com/accounting/account/" + this.accountID + "/invoices/invoices",
            "POST",
            params,
        );

        if (response) {
            const json = JSON.parse(response);
            const invoiceID = json.response.result.invoice.invoiceid;
            const invoiceURL = "https://my.freshbooks.com/#/invoice/" + this.accountID + "-" + invoiceID;
            tyme.openURL(invoiceURL);
        }
    }

    getTaxes() {
        this.taxes = [];

        const response = oAuthAPIClient.callResource(
            "https://api.freshbooks.com/accounting/account/" + this.accountID + "/taxes/taxes",
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
            "https://api.freshbooks.com/accounting/account/" + this.accountID + "/users/clients",
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
        formElement.authHint.isHidden = this.oAuthAPIClient.hasAccessToken();
        formElement.logoutButton.isHidden = !this.oAuthAPIClient.hasAccessToken();

        return this.timeEntriesConverter.generatePreview(
            null,
            this.oAuthAPIClient.hasAccessToken() ? null : "authmessage"
        );

        // return "authcode: " + tyme.getSecureValue("auth_code") +
        //     "<br/>access: " + tyme.getSecureValue("access_token") +
        //     "<br/>refresh: " + tyme.getSecureValue("refresh_token") +
        //     "<br/>accountID: " + this.accountID;
    }

    startAuthFlow() {
        this.oAuthAPIClient.startAuthFlow();
    }

    logout() {
        this.oAuthAPIClient.logout();
        this.clients = [];
        formElement.clientID.reload();
    }
}

const timeEntriesConverter = new TimeEntriesConverter();

const oAuthAPIClient = new OAuthAPIClient(
    "freshbooks"
);

const freshBooks = new FreshBooks(oAuthAPIClient, timeEntriesConverter);