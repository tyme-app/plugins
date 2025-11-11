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
        return this.timeEntriesConverter.generatePreview(
            "logo",
            "authmessage"
        );

        // return "authcode: " + tyme.getSecureValue("auth_code") +
        //     "<br/>access: " + tyme.getSecureValue("access_token") +
        //     "<br/>refresh: " + tyme.getSecureValue("refresh_token") +
        //     "<br/>accountID: " + this.accountID;
    }

    startAuthFlow() {
        this.oAuthAPIClient.startAuthFlow();
    }

    killAuth() {
        tyme.setSecureValue('access_token', null);
        tyme.setSecureValue('refresh_token', null);
    }
}

const timeEntriesConverter = new TimeEntriesConverter();

const oAuthAPIClient = new OAuthAPIClient(
    "freshbooks"
);

const freshBooks = new FreshBooks(oAuthAPIClient, timeEntriesConverter);