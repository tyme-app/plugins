class APIClient {
    constructor(pluginID) {
        this.pluginID = pluginID;
        this.pluginAuthURL = "https://staging.tyme-app.com/plugins/";
        this.authCodeKey = 'auth_code';
        this.accessTokenKey = 'access_token';

        utils.log(this.pluginID);
        utils.log(tyme.getSecureValue(this.authCodeKey));
        utils.log(tyme.getSecureValue(this.accessTokenKey));

        if(this.hasAuthCode() && !this.hasAccessToken()) {
            this.fetchTokensFromCode();
        }
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
    }
}