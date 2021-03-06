var Logger = require('../logger/logger');
let MealFactory = require('../orderFood/factory/MealFactory');
let MenuFactory = require('../orderFood/factory/MenuFactory');
let Day = require('../orderFood/lunchList/Day');
let Sheet = require('../orderFood/lunchList/Sheet');
let Employee = require('../registration/Employee.js');
let BotSettings = require('../settings/BotSettings.js');
let Choice = require('../orderFood/employeesChoises/Choice');
let WorkingDay = require('../orderFood/employeesChoises/WorkingDay');
let User = require('../orderFood/employeesChoises/User');
let ChoicesSheet = require('../orderFood/employeesChoises/ChoicesSheet');
let SheetUtil = require('../util/SheetUtil');
let Book = require('../viewBooks/Book');
let Notifications = require('../registration/Notifications');
let Menu = require('../model/Menu.js');
let MenusToOrder = require('../orderFood/lunchList/menusToOrder/MenusToOrder');
let ProviderToOrderFrom = require('../orderFood/lunchList/menusToOrder/ProviderToOrderFrom');

class ModelBuilder {
    constructor() {
    }

    /**
     * Create Menu Sheet
     * @param columns
     * @returns {Sheet}
     */
    static createMenuModelSheet(rows, session) {
        let menus = [];
        let pattern = /(\d{2})\.(\d{2})\.(\d{4})/;
        let updateDate = null;
        let menuNr;
        let allMenuTypes = [];
        for (let i = 0; i < rows.length;) {
            if (rows[i].length > 0 && rows[i][0].toLowerCase().substring(0, 4) === "menu") {
                let split = rows[i][0].split("-");
                let provider = split[1];
                let title = split[2];
                let sizes = split[3].split('');
                menuNr = split[4];
                sizes.forEach(function (size) {
                    allMenuTypes.push(menuNr + size);
                });

                for (let col = 1; col < 6; col++) {
                    let firstMeal = (rows[i + 1][col]);
                    let secondMeal = (rows[i + 2][col]);
                    let garnish = (rows[i + 3][col]);
                    let menuUrl = (rows[i + 4][col]);
                    let imgUrl = (rows[i + 5][col]);

                    // to do: fetch default image url from setting document
                    if (imgUrl == undefined) {
                        imgUrl = 'https://i.imgur.com/M6UUe2S.png';
                    }

                    let menuDate = new Date(updateDate.getFullYear(), updateDate.getMonth(), updateDate.getDate() + (col - 1));
                    if ((firstMeal && firstMeal.trim() !== "") || (secondMeal && secondMeal.trim() !== "") || (garnish && garnish.trim() !== "")) {
                        menus.push(new Menu(title, provider, sizes, firstMeal, secondMeal, garnish, menuDate, menuNr, menuUrl, imgUrl));
                    }
                }
                i += 6;
            } else if (rows[i].length > 0 && rows[i][0] === "Update date:") {
                updateDate = new Date(rows[i][1].replace(pattern, '$3-$2-$1'));
                i++;
            } else {
                i++;
            }
        }
        Logger.logger().debug('Menu fetched from db');
        session.userData.allMenuTypes = allMenuTypes;
        return new Sheet(menus, updateDate);
    }

    /**
     * Create Employee Choices Sheet
     * @param sheetRows
     * @returns {ChoicesSheet}
     */
    static createChoiceModelSheet(sheetRows, employees, orderActionDate) {
        Logger.logger().debug("Creating choice model");
        let actionDate = new Date(orderActionDate);
        let workingDays = [];
        Logger.logger().debug("Creating WorkingDay");
        sheetRows[3].forEach(function (date, columnIndex) {
            if (ModelBuilder.isNumeric(date)) {
                let currentDate = new Date(actionDate.getFullYear(), actionDate.getMonth(), parseInt(date));
                let columnLetter = SheetUtil.columnToLetter(columnIndex + 1);
                Logger.logger().debug("Created a WorkingDay for date [%s] on columns index [%d] and column letter [%s]", currentDate, columnIndex, columnLetter);
                workingDays.push(new WorkingDay(currentDate, columnIndex, columnLetter));
            }
        });

        let users = [];
        sheetRows.filter(function (row) {
            return row.length > 0;
        });
        sheetRows.forEach(function (row, index, rows) {
            //checking if we have an employee with this name
            let employee;
            employees.forEach(function (e) {
                if (e._name == row[0]) {//TO DO: check why getters doesn't work
                    employee = e;
                    Logger.logger().debug("Found employee [%s] in the list of registered employees", e._name);


                }
            });
            if (employee) {
                if (employee._id.length > 0) {
                    Logger.logger().debug("Creating user");
                    let user = ModelBuilder.createUser(row, index, rows, workingDays, employee);
                    users.push(user);
                    Logger.logger().debug("User[%s] pushed", user.fullName);
                } else {
                    Logger.logger().debug('Employee [%s] has no id', employee._name);
                }
            } else {
                Logger.logger().debug('Employee [%s] is not in the list of registered employees', row[0]);
            }
        });
        return new ChoicesSheet(workingDays, users);
    }


    static createOrderListModel(sheetRows, orderActionDate) {
        Logger.logger().debug("Creating order list model");
        let actionDate = new Date(orderActionDate);
        let workingDay;
        sheetRows[3].forEach(function (date, columnIndex) {
            if (ModelBuilder.isNumeric(date) && date == actionDate.getDate()) {
                let currentDate = new Date(actionDate.getFullYear(), actionDate.getMonth(), parseInt(date));
                let columnLetter = SheetUtil.columnToLetter(columnIndex + 1);
                Logger.logger().debug("Created a WorkingDay for date [%s] on columns index [%d] and column letter [%s]", currentDate, columnIndex, columnLetter);
                workingDay = new WorkingDay(currentDate, columnIndex, columnLetter);
                return;
            }
        });

        let users = [];
        sheetRows.filter(function (row) {
            return row.length > 0;
        });

        //only total rows are needed, they have S or M in second column
        sheetRows = sheetRows.filter(function (row) {
            return row.length > 1 && (row[1].toUpperCase() == 'S' || row[1].toUpperCase() == 'M');
        });

        let providerToOrderFrom = [];
        let menusToOrder = [];
        //collecting all MenusToOrder
        sheetRows.forEach(function (row, index, rows) {
            let nrOfMenus = row[workingDay.columnNumber];

            //only totals which have nr of menu needed
            if (nrOfMenus !== undefined) {//to add: check if row[1] is S or M
                let menuName = row[0];
                let menuType = row[1];

                // menuName is given just for menus of type S(google sheet specific), so for M menuType, menuName should be the same as previous record(of type S)
                if (row[1] == 'M') {//menuName == undefined
                    menuName = rows[index - 1][0];
                }
                menusToOrder.push(new MenusToOrder(menuName, menuType, nrOfMenus));
                Logger.logger().debug(` row [${index}] with name [${row[0]}] and value[${nrOfMenus}] `);
            } else {
                Logger.logger().debug(` Skipping row [${index}] with name [${row[0]}], menuType [${row[1]}] and value[${nrOfMenus}] `);
            }
        });

        //building providerToOrderFrom(separate MenusToOrder per provider)
        while (menusToOrder.length > 0) {
            //get first menu
            let firstMenu = menusToOrder[0];

            //get provider name(assuming that all menu names have provider name as first word)
            let firstProviderName = firstMenu.menuName.substring(0, firstMenu.menuName.indexOf(' '));
            let menusToOrderPerProvider = [];
            let totalNrOfMenusPerProvider = 0;

            //temporary array to be used for removing needed menus for it(not possible to remove directly menusToOrder while iterating over it)
            let tempMenusToOrder = menusToOrder.slice();
            let tempMenusToOrderIndex = 0;

            // find all menus with same provider
            menusToOrder.forEach(function (menuToOrder) {
                let providerName = menuToOrder.menuName.substring(0, menuToOrder.menuName.indexOf(' '));

                //if firstProviderName from main loop is equal with current providerName => move menusToOrder to current provider list
                if (firstProviderName == providerName) {
                    totalNrOfMenusPerProvider+= parseInt(menuToOrder.nrOfMenus);
                    menusToOrderPerProvider.push(tempMenusToOrder.splice(tempMenusToOrderIndex, 1)[0]);
                    tempMenusToOrderIndex--;
                }
                tempMenusToOrderIndex++;
                Logger.logger().debug(` menuToOrder length => [${tempMenusToOrder.length}] and menusToOrderPerProvider length => [${menusToOrderPerProvider.length}] `);// TO DO: to be removed
            });
            providerToOrderFrom.push(new ProviderToOrderFrom(firstProviderName, menusToOrderPerProvider, totalNrOfMenusPerProvider));
            menusToOrder = tempMenusToOrder;
        }
        Logger.logger().debug(` ProviderToOrderFrom[${providerToOrderFrom.length}]`);// TO DO: to be removed
        return providerToOrderFrom;
    }

    /**
     * Creates User
     * @param row google sheet row
     * @param index index of current row
     * @param rows array
     * @param workingWeekDays working days
     * @returns {User}
     */
    static createUser(row, index, rows, workingWeekDays, registeredEmployee) {
        let id = registeredEmployee._id;
        let skypeAccount = registeredEmployee._skypeAccount;
        let fullName = registeredEmployee._name;
        Logger.logger().debug("Skype account is valid");
        let user = new User(id, skypeAccount, fullName);
        Logger.logger().debug("User created with id[%s],skypeName[%s],fullname[%s]", id, skypeAccount, fullName);
        Logger.logger().debug("Determining choices for user[%s]..", user.skypeName);
        workingWeekDays.forEach(function (workingDay) {
            let choices = ModelBuilder.getUserChoices(user, workingDay, row, index, rows);
            user.addListOfChoicesPerDay(workingDay, choices);
            workingDay.insertChoices(choices);
        });
        return user;
    }

    /**
     * Gets user choices per a working day, and check if there are more choices for the same user on the next row
     * @param user
     * @param workingDay
     * @param row
     * @param currentRowIndex
     * @param rows
     * @returns {Array}
     */
    static getUserChoices(user, workingDay, row, currentRowIndex, rows) {
        let choices = [];
        let namesAndTotalMainColumnNumber = 0;//or workingDay.columnNumber - 2
        Logger.logger().debug("Determining choices for user[%s] for day [%s]", user.skypeName, workingDay.date);
        let firstChoice = row[workingDay.columnNumber];
        if (firstChoice) {
            let fullChoice = SheetUtil.splitDigitsFromString(firstChoice);
            let choiceMenuNumber = fullChoice[0];
            let choiceMenuName = fullChoice[1];
            let choice = new Choice(choiceMenuNumber, choiceMenuName, workingDay, user, currentRowIndex + 1);
            choices.push(choice);
        } else {
            let choice = new Choice("", "", workingDay, user, currentRowIndex + 1);
            choices.push(choice);
        }
        Logger.logger().debug("User has [%s] choice [%s] for [%s]", choices.length, firstChoice, workingDay.date);
        Logger.logger().debug("Check next row for new choices for user[%s] and working day[%s]", user.skypeName, workingDay.date);
        for (let nextRowIndex = currentRowIndex + 1; nextRowIndex < rows.length; nextRowIndex++) {
            let isNextRowANewUser = rows[nextRowIndex][namesAndTotalMainColumnNumber] && rows[nextRowIndex][namesAndTotalMainColumnNumber].length > 0;
            let isNextRowATotal = rows[nextRowIndex][namesAndTotalMainColumnNumber] && rows[nextRowIndex][namesAndTotalMainColumnNumber].includes("Total Main");
            if (!isNextRowANewUser) {
                Logger.logger().debug("Next row is not a new user");
                if (!isNextRowATotal) {
                    Logger.logger().debug("Next row is not totals");
                    let nextChoiceValue = rows[nextRowIndex][workingDay.columnNumber];
                    let nextChoice = null;
                    if (nextChoiceValue) {
                        Logger.logger().debug('Next choice exists in row');
                        let fullChice = SheetUtil.splitDigitsFromString(nextChoiceValue);
                        let nextChoiceMenuNumber = fullChice[0];
                        let nextChoiceMenuName = fullChice[1];
                        nextChoice = new Choice(nextChoiceMenuNumber, nextChoiceMenuName, workingDay, user, nextRowIndex + 1)
                        Logger.logger().debug("User has [%s] choice [%s] for [%s]", choices.length, nextChoiceValue, workingDay.date);
                    } else {
                        Logger.logger().debug('Next choice does not exists in row.Creating a dummy empty choice');
                        let nextChoiceMenuNumber = "";
                        let nextChoiceMenuName = "";
                        nextChoice = new Choice(nextChoiceMenuNumber, nextChoiceMenuName, workingDay, user, nextRowIndex + 1)
                    }
                    choices.push(nextChoice);
                } else {
                    Logger.logger().debug('On the next row a totals');
                    break;
                }
            } else {
                Logger.logger().debug('On the next row is a new skype account[%s]. Taking next day for [%s]', rows[nextRowIndex][namesAndTotalMainColumnNumber], user.skypeName);
                break;
            }
        }
        return choices;
    }

    static isNumeric(n) {
        return !isNaN(parseFloat(n)) && isFinite(n);
    }

    static createRegisteredEmployees(rows) {
        let rowNumber = 1;//starting from 2 since first row was excluded in fetchRegisteredEmployees(taking in account increment)
        return rows.map(function (row) {
            rowNumber++;
            if (row.length != 0) {
                return new Employee(row[0], row[1], row[2], row[3], row[4], new Notifications(row[5], row[6], row[7]), rowNumber);
            }
        });
        /*.filter(function (employee) {
         return employee.skypeAccount.startsWith('inther') || employee.skypeAccount.startsWith('live:')
         });*/
    }

    static createBotSettings(rows) {
        let settingsMap = new Map();
        rows.filter(function (row) {
            return row.length != 0;
        }).forEach(function (row) {
            settingsMap.set(row[0], row[1]);
        });
        return new BotSettings(settingsMap);
    }

    static createBooksModel(rows) {
        Logger.logger().debug("Creating books model");
        var firstBook = 2;
        let bookObjects = [];
        let numberOfItems = rows[1].length;
        let rowsWithBooks = rows.slice(firstBook, rows.length);
        let stopLoop = false;

        rowsWithBooks.forEach(function (row, columnIndex, allRows) {
            //stop processing when get "NON-TECHNICAL", 'break' doesn't works :)
            if (row[0] === "NON-TECHNICAL") {
                stopLoop = true;
            }
            if (stopLoop) {
                return;
            }

            //we get rows of different length, and we need to make sure they are the same
            if (row.length < numberOfItems) {
                ModelBuilder.addEmptyValues(row, numberOfItems);
            }
            let book = new Book(row[0], row[1], row[2], row[3], row[4], row[5], row[6], row[7], row[8], row[9]);
            bookObjects.push(book);
        });
        return bookObjects;
    }

    //adding to the array empty values till specified length
    static addEmptyValues(row, nr) {
        while (row.length < nr) {
            row.push("");
        }
    }
}

module.exports = ModelBuilder;
