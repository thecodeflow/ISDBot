var google = require('googleapis');
var Logger = require('../logger/logger');
var gserviceaccount = process.env.G_SERVICE_ACCOUNT;
var googleKeyPem = process.env.G_KEY_PEM;

class GoogleConnection {
    constructor() {
    }

    static getConnection() {
        var jwtClient = new google.auth.JWT(
            gserviceaccount,
            null,
            googleKeyPem,
            ['https://www.googleapis.com/auth/spreadsheets']
        );

        jwtClient.authorize(function (err, tokens) {
            if (err) {
                Logger.logger().error(err);
                return;
            } else {
                Logger.logger().info("Successfully connected!");
            }
        });
        return jwtClient;
    }

    static fetchGoogleSheet(spreadsheetId, sheetName, majorDimension, callback) {
        Logger.logger().info('Fetching google sheet [%s]', sheetName);
        var sheets = google.sheets('v4');

        sheets.spreadsheets.values.get({
            auth: this.getConnection(),
            spreadsheetId: spreadsheetId,
            range: sheetName,
            majorDimension: majorDimension
        }, function (err, response) {
            if (err) {
                Logger.logger().error('The API returned an error: ' + err);
                return;
            }
            Logger.logger().info('Fetched google sheet [%s]', sheetName);
            callback(response)
        });
    }

    static fetchRegisteredEmployees(c) {
        Logger.logger().info('Fetching registered employees from dialog');
        var sheets = google.sheets('v4');
        var month = new Date().toLocaleString("en-us", {month: "long"});
        var year = new Date().getFullYear();
        var choiceSheetName = month + " " + year;
        var spreadsheetId = process.env.G_SPREADSHEET_ID;
        sheets.spreadsheets.values.get({
            auth: this.getConnection(),
            spreadsheetId: spreadsheetId,
            range: choiceSheetName + '!A5:C50',
            majorDimension: 'ROWS'
        }, function (err, response) {
            if (err) {
                Logger.logger().error('The API returned an error: ' + err);
                return;
            }
            Logger.logger().info('Registered employees fetched');
            c(response);
        });
    }

    static fetchBotSettings(callback) {
        Logger.logger().info('Fetching Bot settings');
        var sheets = google.sheets('v4');
        var choiceSheetName = "bot_settings";
        var spreadsheetId = process.env.G_SPREADSHEET_ID;
        sheets.spreadsheets.values.get({
            auth: this.getConnection(),
            spreadsheetId: spreadsheetId,
            range: choiceSheetName + '!A1:B50',
            majorDimension: 'ROWS'
        }, function (err, response) {
            if (err) {
                Logger.logger().error('The API returned an error: ' + err);
                return;
            }
            Logger.logger().info('Bot settings fetched');
            callback(response);
        });
    }

    static updateValue(columnLetter, row, value, sheetName, callback) {
        var sheets = google.sheets('v4');
        var spreadsheetId = process.env.G_SPREADSHEET_ID;
        Logger.logger().info("Writing value[%s] on [%s]![%s][%s]", value, sheetName, columnLetter, row);
        sheets.spreadsheets.values.update({
            auth: this.getConnection(),
            spreadsheetId: spreadsheetId,
            range: sheetName + '!' + columnLetter + row,
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: [
                    [value]
                ]
            }
        }, function (err, response) {
            if (err) {
                Logger.logger().error('The API returned an error: ' + err);
                return;
            }
            Logger.logger().info('Range[%s] updated with value[%s]', response.updatedRange, value);
            callback(response);
        });
    }

    static deleteValue(columnLetter, row, sheetName, callback) {
        var sheets = google.sheets('v4');
        var spreadsheetId = process.env.G_SPREADSHEET_ID;
        Logger.logger().info("Deleting value on [%s]![%s][%s]",  sheetName, columnLetter, row);
        sheets.spreadsheets.values.update({
            auth: this.getConnection(),
            spreadsheetId: spreadsheetId,
            range: sheetName + '!' + columnLetter + row,
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: [
                    ['']
                ]
            }
        }, function (err, response) {
            if (err) {
                Logger.logger().error('The API returned an error: ' + err);
                return;
            }
            Logger.logger().info('Range[%s] cleared for spreadsheetId[%s]', response.clearedRange, response.spreadsheetId);
            callback(response);
        });
    }

}
module.exports = GoogleConnection;