class MeinBuero {
    constructor(apiClient, timeEntriesConverter) {
        this.apiClient = apiClient;
        this.timeEntriesConverter = timeEntriesConverter;

        formElement.authButton.isHidden = this.apiClient.hasAccessToken();
        formElement.logoutButton.isHidden = !this.apiClient.hasAccessToken();
    }

    getCustomers() {
        this.customers = [];

        let limit = 100;
        let totalCustomers = this.getCustomerPage(0, limit);
        let totalPages = Math.ceil(totalCustomers / limit);
        for (let i = 1; i <= totalPages; i++) {
            this.getCustomerPage(i * limit, limit);
        }

        return this.customers;
    }

    getCustomerPage(offset, limit) {
        const response = this.apiClient.callResource(
            "customer",
            "GET",
            {'offset': offset, 'limit': limit},
        );

        utils.log("offset " + offset + " limit: " + limit);

        if (response) {
            const json = JSON.parse(response);
            const totalCount = json.meta.totalCount;

            json.data.forEach(customer => {
                utils.log(JSON.stringify(customer));
                this.customers.push({
                    'name': String(customer.name),
                    'value': String(customer.id)
                });
            });

            return totalCount;
        }

        return 0;
    }

    createInvoice() {

    }

    generatePreview() {
        return this.timeEntriesConverter.generatePreview(
            null,
            this.apiClient.hasAccessToken() ? null : utils.localize("not.connected.message")
        );
    }

    login() {
        this.apiClient.startAuthFlow();
    }

    logout() {
        this.apiClient.logout();
    }
}

const timeEntriesConverter = new TimeEntriesConverter(2);
const apiClient = new APIClient("mein_buero_invoices");
const meinBuero = new MeinBuero(apiClient, timeEntriesConverter);