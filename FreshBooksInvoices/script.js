class FreshBooksAPIClient {
    constructor() {
        // this.pluginAuthURL = "https://staging.tyme-app.com/plugins/oauth/";
        this.pluginAuthURL = "http://localhost:8888/plugins/auth/";
        this.freshBooksBaseURL = 'https://api.freshbooks.com/';
        this.authCodeKey = 'code';
    }

    hasAuthCode() {
        return tyme.getSecureValue(this.authCodeKey) != null;
    }

    startAuthFlow() {
        tyme.openURL(this.pluginAuthURL + 'new/freshbooks');
    }

    fetchTokens() {
        const url = this.pluginAuthURL + 'code/freshbooks';
        const code = tyme.getSecureValue(this.authCodeKey);
        const response = utils.request(url, 'POST', {'code': code}, params);
        const statusCode = response['statusCode'];
        const result = response['result'];

        // tyme.setSecureValue(this.authCodeKey, null);

        if (statusCode === 200) {
            const json = JSON.parse(result);
            return true;
        } else {
            utils.log('FreshBooks Auth Error ' + JSON.stringify(response));
            return false;
        }
    }
}

const apiClient = new FreshBooksAPIClient();

class FreshBooks {
    constructor(apiClient) {
        this.apiClient = apiClient;
    }

    startAuthFlow() {

    }
}

const freshBooks = new FreshBooks(apiClient);