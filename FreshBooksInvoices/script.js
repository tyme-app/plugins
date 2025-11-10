class OAuthAPIClient {
    constructor(pluginID) {
        this.pluginID = pluginID;
        this.pluginAuthURL = "http://localhost:8888/plugins/";
        this.authCodeKey = 'auth_code';
        this.accessTokenKey = 'access_token';
        this.refreshTokenKey = 'refresh_token';
    }

    hasAuthCode() {
        return tyme.getSecureValue(this.authCodeKey) != null;
    }

    hasTokens() {
        return tyme.getSecureValue(this.accessTokenKey) != null;
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

        tyme.showAlert("codeexchange", JSON.stringify(response));

        // tyme.setSecureValue(this.authCodeKey, null);

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
}


class FreshBooks {
    constructor(oAuthAPIClient) {
        this.oAuthAPIClient = oAuthAPIClient;
    }

    generatePreview() {

        if(oAuthAPIClient.hasAuthCode()) {
            oAuthAPIClient.fetchTokensFromCode();
        }

        return "hasAuthCode: " + oAuthAPIClient.hasAuthCode() +
            ", hasTokens: " + oAuthAPIClient.hasTokens();
    }

    startAuthFlow() {
        this.oAuthAPIClient.startAuthFlow();
    }
}

const oAuthAPIClient = new OAuthAPIClient("freshbooks");
const freshBooks = new FreshBooks(oAuthAPIClient);