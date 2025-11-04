class FreshBooksAPIClient {
    constructor() {
        this.baseURL = 'https://api.freshbooks.com/';
        this.authCodeKey = 'code';
    }

    hasAuthCode() {
        return tyme.getSecureValue(this.authCodeKey) != null;
    }

    startAuthFlow() {
        tyme.openURL("https://auth.freshbooks.com/oauth/authorize?client_id=1ebc88ccee2f960a9f6ac08d34435e115dc876ef1adecb17e44384ae5c568e9a&response_type=code&redirect_uri=tyme%3A%2F%2Fexport%2Fredirect%2Ffreshbooks&scope=user%3Aprofile%3Aread%20user%3Aclients%3Aread%20user%3Ainvoices%3Awrite");
        // tyme.openURL("https://auth.freshbooks.com/oauth/authorize?client_id=1ebc88ccee2f960a9f6ac08d34435e115dc876ef1adecb17e44384ae5c568e9a&response_type=code&redirect_uri=tyme%3A%2F%2Fexport%2Fredirect%2Ffreshbooks&scope=user%3Aprofile%3Aread%20user%3Aclients%3Aread%20user%3Ainvoices%3Awrite&_gl=1*rr36xx*_gcl_au*MjkwNDE2OTQ4LjE3NjIyNjQzMDA.*_ga*NDk0NzE1OTYzLjE3NTk3MzA5NDM.*_ga_LNDHWTHSMK*czE3NjIyNjQzMDIkbzEkZzEkdDE3NjIyNjcwMjUkajYkbDAkaDE5NjE2MDU1Mjg.*_fplc*emhFQXUxMXVrZk5uWVcwZGliRzB4UTlnMVl3blRDNm1xeW1JMmsyVGlXeVJDRGI3YzZiTDM3RjBLckFyZ2RKNFdIdW1uUE56R3BqTkcycThkYUtaS3VSRFAxOER3WkN0Z29qbHRGREliQUhNeUQwb2Z2V0NaazhINGZuUEV3JTNEJTNE");
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