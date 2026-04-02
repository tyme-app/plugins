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

        if (this.customers.length === 0) {
            this.customers.push({
                'name': utils.localize('input.customer.empty'),
                'value': ''
            });
        }

        return this.customers;
    }

    getCustomerPage(offset, limit) {
        const response = this.apiClient.callResource(
            "customer",
            "GET",
            {'offset': offset, 'limit': limit},
        );

        if (response) {
            const json = JSON.parse(response);
            const totalCount = json.meta.totalCount;

            json.data.forEach(customer => {
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
        const data = this.timeEntriesConverter.aggregatedTimeEntryData();
        const taxRate = Number(formValue.taxRate);
        const taxPercentage = 1.0 + taxRate / 100.0;
        let positions = [];

        data.forEach((entry) => {
            const name = formValue.prefixProject ? entry.project + ": " + entry.name : entry.name;
            const note = formValue.showNotes ? entry.note : '';
            const priceNet = Number(entry.price.toFixed(2));
            const priceGross = Number((entry.price * taxPercentage).toFixed(2));

            const position = {
                "discountPercent": 0,
                "amount": entry.quantity,
                "priceNet": priceNet,
                "priceGross": priceGross,
                "vatPercent": taxRate,
                "unit": entry.unit,
                "title": name.length > 255 ? (name.substring(0, 254) + "…") : name,
                "description": note.replace(/\n/g, '</br>'),
                "showDescription": formValue.showNotes,
                "metaData": {
                    "type": "custom",
                }
            };

            positions.push(position);
        });

        let params = {
            "customerId": formValue.customerID,
            "positions": positions
        };

        const response = this.apiClient.callResource("order", "POST", params);

        if (response) {
            const json = JSON.parse(response);
            const orderID = json.data.id;

            if (formValue.markAsBilled) {
                const timeEntryIDs = this.timeEntriesConverter.timeEntryIDs();
                tyme.setBillingState(timeEntryIDs, 1);
            }

            const orderURL = "https://app.meinbuero.de/orders/" + orderID;
            tyme.openURL(orderURL);
        }
    }

    generatePreview() {
        return this.timeEntriesConverter.generatePreview(
            "plugins/MeinBueroInvoices/logo.png",
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