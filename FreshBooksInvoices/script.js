class OAuthAPIClient {
    constructor(pluginID) {
        this.pluginID = pluginID;
        this.pluginAuthURL = "http://localhost:8888/plugins/";
        // this.pluginAuthURL = "https://api.tyme-app.com/plugins/";
        this.authCodeKey = 'auth_code';
        this.accessTokenKey = 'access_token';
        this.refreshTokenKey = 'refresh_token';
    }

    hasAuthCode() {
        return tyme.getSecureValue(this.authCodeKey) != null;
    }

    hasAccessToken() {
        return tyme.getSecureValue(this.accessTokenKey) != null;
    }

    hasRefreshToken() {
        return tyme.getSecureValue(this.refreshTokenKey) != null;
    }

    startAuthFlow() {
        tyme.openURL(this.pluginAuthURL + 'auth_start/' + this.pluginID);
    }

    fetchTokensFromCode() {
        const url = this.pluginAuthURL + 'auth_code/' + this.pluginID;
        const code = tyme.getSecureValue(this.authCodeKey);
        const response = utils.request(url, 'POST', {}, {'code': code});
        const statusCode = response['statusCode'];
        const result = response['result'];

        tyme.setSecureValue(this.authCodeKey, null);

        if (statusCode === 200) {
            const json = JSON.parse(result);
            tyme.setSecureValue(this.accessTokenKey, json['access_token']);
            tyme.setSecureValue(this.refreshTokenKey, json['refresh_token']);
            return true;
        } else {
            utils.log('Code Exchange Error ' + JSON.stringify(response));
            tyme.setSecureValue(this.accessTokenKey, null);
            tyme.setSecureValue(this.refreshTokenKey, null);
            return false;
        }
    }

    refreshTokens() {
        const url = this.pluginAuthURL + 'refresh_token/' + this.pluginID;
        const refreshToken = tyme.getSecureValue(this.refreshTokenKey);
        const response = utils.request(url, 'POST', {}, {'refresh_token': refreshToken});
        const statusCode = response['statusCode'];
        const result = response['result'];

        if (statusCode === 200) {
            const json = JSON.parse(result);
            tyme.setSecureValue(this.accessTokenKey, json['access_token']);
            tyme.setSecureValue(this.refreshTokenKey, json['refresh_token']);
            return true;
        } else {
            utils.log('Token Refresh Error ' + JSON.stringify(response));
            tyme.setSecureValue(this.accessTokenKey, null);
            tyme.setSecureValue(this.refreshTokenKey, null);
            return false;
        }
    }

    callResource(url, method, params) {
        if (!this.hasAccessToken()) {
            if (this.hasAuthCode()) {
                this.fetchTokensFromCode();
                return this.callResource(url, method, params);
            } else {
                return null;
            }
        }

        const response = utils.request(
            url,
            method,
            {
                "Authorization": "Bearer " + tyme.getSecureValue(this.accessTokenKey)
            },
            params
        );

        if (response['statusCode'] === 401 && this.hasRefreshToken()) {
            if (this.refreshTokens()) {
                return this.callResource(url, method, params);
            } else {
                return null;
            }
        }

        return response['result'];
    }
}


class FreshBooks {
    constructor(oAuthAPIClient, timeEntriesConverter) {
        this.oAuthAPIClient = oAuthAPIClient;
        this.timeEntriesConverter = timeEntriesConverter;
        this.accountID = null;
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

    generatePreview() {
        if (!this.accountID) {
            this.getAccountID();
            if (!this.accountID) {
                return "Failed to get account ID";
            }
        }

        timeEntriesConverter.generatePreview(
            "logo",
            "authmessage",
            utils.localize('invoice.header'),
            utils.localize('invoice.position'),
            utils.localize('invoice.price'),
            utils.localize('invoice.quantity'),
            utils.localize('invoice.unit'),
            utils.localize('invoice.net')
        );

        return "authcode: " + tyme.getSecureValue("auth_code") +
            "<br/>access: " + tyme.getSecureValue("access_token") +
            "<br/>refresh: " + tyme.getSecureValue("refresh_token") +
            "<br/>accountID: " + this.accountID;
    }

    startAuthFlow() {
        this.oAuthAPIClient.startAuthFlow();
    }

    destroyAuth() {
        tyme.setSecureValue("access_token");
    }
}

const timeEntriesConverter = new TimeEntriesConverter(
    utils.localize('locale.identifier'),
    utils.localize('unit.hours'),
    utils.localize('unit.kilometer'),
    utils.localize('unit.quantity')
);

const oAuthAPIClient = new OAuthAPIClient(
    "freshbooks"
);

const freshBooks = new FreshBooks(oAuthAPIClient, timeEntriesConverter);