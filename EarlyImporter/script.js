class EarlyApiClient {
    constructor(apiKey, apiSecret) {
        this.apiKey = apiKey;
        this.apiSecret = apiSecret;
        this.baseURL = 'https://api.early.app/api/v4/';
        this.accessToken = null;
    }

    hasAccessToken() {
        return this.accessToken !== null;
    }

    getAccessToken() {
        if (this.hasAccessToken()) {
            return this.accessToken;
        }

        const response = utils.request(
            this.baseURL + "developer/sign-in",
            "POST",
            {},
            {
                "apiKey": this.apiKey,
                "apiSecret": this.apiSecret
            }
        );


        const statusCode = response['statusCode'];
        let result = response['result'];

        if (statusCode === 200) {
            result = JSON.parse(result);
            this.accessToken = result["token"];
        }

        return this.accessToken;
    }

    getJSON(method, path, params = null) {
        const accessToken = this.getAccessToken();

        if (!accessToken) {
            return;
        }

        const headers = {"Authorization": "Bearer " + accessToken};
        const response = utils.request(this.baseURL + path, method, headers, params);
        const statusCode = response['statusCode'];
        const result = response['result'];

        if (statusCode === 200) {
            tyme.showAlert('Early API Response', JSON.stringify(result));
            return JSON.parse(result);
        } else {
            tyme.showAlert('Early API Error', JSON.stringify(response));
            return null;
        }
    }
}

class EarlyImporter {
    constructor(apiKey, apiSecret) {
        this.apiClient = new EarlyApiClient(apiKey, apiSecret);
    }

    start() {
        this.getReport();
    }

    getReport() {
        this.timeEntries = [];

        for (let i = 1; i <= 2; i++) {
            let startDate = new Date();
            startDate.setFullYear(startDate.getFullYear() - i);
            let endDate = new Date();
            endDate.setFullYear(endDate.getFullYear() - (i - 1));

            const startString = startDate.toISOString().split('T')[0]
            const endString = endDate.toISOString().split('T')[0]
            const response = this.apiClient.getJSON(
                "POST",
                "report",
                {
                    "date": {
                        "start": startString,
                        "end": endString
                    },
                    "fileType": "json"
                }
            );

            if (response) {
                this.timeEntries.push(...response["timeEntries"]);
            }
        }

        /*
        {
    "timeEntries": [
        {
            "id": "102379995",
            "activity": {
                "id": "2050941",
                "name": "Design",
                "color": "#22b1ee",
                "folderId": "299831"
            },
            "user": {
                "id": "218275",
                "name": "Lars Gerckens",
                "email": "pwtz9tz8sr@privaterelay.appleid.com"
            },
            "folder": {
                "id": "299831",
                "name": "My Activities"
            },
            "duration": {
                "startedAt": "2025-04-24T09:45:00.000",
                "stoppedAt": "2025-04-24T10:45:00.000"
            },
            "note": {
                "tags": [],
                "mentions": []
            },
            "timezone": "Z"
        },
        {
            "id": "102380006",
            "activity": {
                "id": "2050940",
                "name": "Development",
                "color": "#00bbaa",
                "folderId": "299831"
            },
            "user": {
                "id": "218275",
                "name": "Lars Gerckens",
                "email": "pwtz9tz8sr@privaterelay.appleid.com"
            },
            "folder": {
                "id": "299831",
                "name": "My Activities"
            },
            "duration": {
                "startedAt": "2025-04-24T11:45:00.000",
                "stoppedAt": "2025-04-24T14:00:00.000"
            },
            "note": {
                "tags": [],
                "mentions": []
            },
            "timezone": "Z"
        }
    ]
}
        */
    }
}

const importer = new EarlyImporter(
    formValue.apiKey,
    formValue.apiSecret
);

