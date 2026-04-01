class MeinBuero {
    constructor(apiClient, timeEntriesConverter) {
        this.apiClient = apiClient;
        this.timeEntriesConverter = timeEntriesConverter;

        formElement.authButton.isHidden = this.apiClient.hasAccessToken();
        formElement.logoutButton.isHidden = !this.apiClient.hasAccessToken();
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