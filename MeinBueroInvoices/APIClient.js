class APIClient {
    constructor(pluginID) {
        this.pluginID = pluginID;
        this.pluginAuthURL = "https://staging.tyme-app.com/plugins/";
        this.meinBueroAPIURL = "https://api.meinbuero.de/openapi/";
        this.authCodeKey = 'auth_code';
        this.accessTokenKey = 'access_token';
    }

    hasAuthCode() {
        return tyme.getSecureValue(this.authCodeKey) != null;
    }

    hasAccessToken() {
        return tyme.getSecureValue(this.accessTokenKey) != null;
    }

    startAuthFlow() {
        this.logout();
        tyme.openURL("https://app.meinbuero.de/apps/edit/69c280f77b39d64a2d14d824/1");
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
            tyme.setSecureValue(this.accessTokenKey, json['token']);
            return true;
        } else {
            utils.log('Code Exchange Error ' + JSON.stringify(response));
            this.logout();
            return false;
        }
    }

    logout() {
        tyme.setSecureValue(this.authCodeKey, null);
        tyme.setSecureValue(this.accessTokenKey, null);
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
            this.meinBueroAPIURL + url,
            method,
            {
                "Authorization": "Bearer " + tyme.getSecureValue(this.accessTokenKey)
            },
            params
        );

        if (response['statusCode'] === 401) {
            this.logout();
            return null;
        }

        return response['result'];
    }
}