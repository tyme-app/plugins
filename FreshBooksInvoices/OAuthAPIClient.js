class OAuthAPIClient {
    constructor(pluginID) {
        this.pluginID = pluginID;
        this.pluginAuthURL = "https://api.tyme-app.com/plugins/";
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
        this.logout();
        tyme.openURL(this.pluginAuthURL + 'auth_start/' + this.pluginID);
    }

    logout() {
        tyme.setSecureValue(this.authCodeKey, null);
        tyme.setSecureValue(this.accessTokenKey, null);
        tyme.setSecureValue(this.refreshTokenKey, null);
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
            this.logout();
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
            this.logout();
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