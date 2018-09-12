/*
 *  This file is part of RuneScape-Discord Chat Sync
 *  Copyright (C) 2018 Alejandro Ramos
 *
 *  This program is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU Affero General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU Affero General Public License for more details.
 *
 *  You should have received a copy of the GNU Affero General Public License
 *  along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require('path');
const Queue = require("./Queue");

let frame;
let page;
let browser;

let on = false;
let sending = false;

const lastIndex = {
    number: -1
};
let toQueue;
let fromQueue;

let config;
let scripts1;
let scripts = [];

async function processRunescapeMessage(author, message) {
    var split = message.split(' ');
    var command = split[0].replace('.', '').toLowerCase();
    message = message.replace('.');
    if (!scripts[command]) return;
    var _scripts = scripts[command].callbacks;
    for (var i = 0; i < _scripts.length; i++) {
        var script = _scripts[i];
        if (!script.processRunescapeMessage) return;
        script.processRunescapeMessage(author, message, command, split, fromQueue, toQueue);
    }
}

async function startup(page) {
    async function waitForSelector(selector, timeout, hidden) {
        try {
            await frame.waitForSelector(selector, {
                timeout: timeout,
                hidden: hidden
            });
            return true;
        } catch (e) {
            await console.log(getDateTime() + ": Took too long to load");
            return false;
        }
    }

    lastIndex.number = -1;

    await page.goto("http://www.runescape.com/companion/comapp.ws");
    await console.log(getDateTime() + ": Loaded page");
    frame = await page.frames()[1];

    if (await waitForSelector("body:not(.initial-load)", 10000, false)) {
        await console.log(getDateTime() + ": Fully loaded page");

        await frame.type("input#username", config.login.username); // type the username
        await frame.type("input#password", config.login.password); // type the password
        await frame.click("button.icon-login"); // click on the submit button
        if (await waitForSelector("div.modal-body.ng-scope", 15000, false)) {
            if (await frame.$("div[ng-include=\"'partials/save_credentials.ws'\"]")) {
                await console.log(getDateTime() + ": Logged in");

                await frame.click("a[ng-click='modalCancel()']"); // click on the "no" button on the save password dialog
                if (await waitForSelector("div.modal-body.ng-scope", 5000, true)) {
                    await console.log(getDateTime() + ": In app");

                    await frame.click("li.all-chat"); // click on the chat tab
                    if (await waitForSelector("section.chat.all-chat.ng-scope", 10000, false)) {
                        await sleep(250); // wait for the slider to show it
                        await console.log(getDateTime() + ": In chat tab");

                        if (config.configs.chatType === "clan") {
                            await frame.click("i.icon-clanchat:not(.icon)"); // click on the clan chat tab
                        } else if (config.configs.chatType === "friends") {
                            await frame.click("i.icon-friendschat:not(.icon)"); // click on the friends chat tab
                        } else {
                            await console.log(getDateTime() + ": Not a valid chat type. must be \"clan\" or \"friends\"");
                            await shutdown();
                        }
                        if (await waitForSelector("input#message", 10000, false)) {
                            await console.log(getDateTime() + ": In " + config.configs.chatType + " chat tab");

                            await console.log(getDateTime() + ": Ready to chat!");
                            toQueue.clear();
                            on = true;
                            sending = false;

                            async function handleRead() {
                                if (on) {
                                    const output = await read(page, lastIndex);
                                    lastIndex.number = output[1];
                                    if (output[0] === "disconnected") { // the bot disconnected from the game
                                        await console.log(getDateTime() + ": Lost connection");
                                        if (!await waitForSelector("div.modal-body.ng-scope", 5000, false)) {
                                            const dateTime = getDateTime().replace(/:/g, ".");
                                            await console.log(dateTime + ": Unexpected error, dumping data");

                                            await fs.writeFile(config.configs.errorDirectory + dateTime + ".html", await frame.content(), (err) => {
                                                if (!err) {
                                                    console.log(dateTime + ": Saved HTML data as: " + dateTime + ".html");
                                                } else {
                                                    console.log(dateTime + ": Error saving HTML data:");
                                                    console.log(err);
                                                }
                                            });

                                            await page.screenshot({
                                                path: config.configs.errorDirectory + dateTime + ": error1" + ".png"
                                            });
                                            await console.log(dateTime + ": Saved screenshot as: " + dateTime + ".png");
                                        }
                                        on = false;
                                        await restart(page);
                                    } else if (output[0] !== "clear") { // there was a message
                                        fromQueue.push([output[0][0], output[0][1], new Date()]); // add the message to the discord queue
                                        processRunescapeMessage(output[0][1], output[0][0]);
                                        setTimeout(handleRead, 0);
                                    } else { // the output was "clear" (there was no message)
                                        setTimeout(handleRead, 600);
                                    }
                                } else {
                                    restart(page);
                                }
                            }

                            setTimeout(handleRead, 0);
                            return;
                        }
                    }
                }
            } else {
                throw Error("Could not login because it's already logged in elsewhere");
            }
        }
    }
    await restart(page);
}

async function send() {
    if (!sending) {
        sending = true;
        while (toQueue.length() > 0) {
            if (on) {
                // if the message is too long to send in runescape (80 character limit)
                if (toQueue.getMessage(0).length + ((toQueue.getAuthor(0) !== undefined) ? (toQueue.getAuthor(0).length + 2) : 0) > 80) {
                    toQueue.unshift([toQueue.getMessage(0).substring(0, (80 - ((toQueue.getAuthor(0).length > 0) ? (toQueue.getAuthor(0).length + 2) : 0))), toQueue.getAuthor(0), toQueue.getDate(0)]);
                    toQueue.setMessage(1, toQueue.getMessage(1).substring((80 - ((toQueue.getAuthor(0).length > 0) ? (toQueue.getAuthor(0).length + 2) : 0)), toQueue.getMessage(1).length));
                } else {
                    const startNumber = await page.evaluate(() => {
                        return window.frames[0].document.getElementsByClassName("content push-top-double push-bottom-double").item(0).getElementsByTagName("ul").item(0).querySelectorAll("li.message.clearfix.ng-scope.my-message").length;
                    });

                    await frame.type("input#message", ((toQueue.getAuthor(0) !== undefined) ? (toQueue.getAuthor(0) + ": ") : "") + toQueue.getMessage(0));
                    await frame.click("input[type='submit']"); // click on the send button

                    // wait up to two seconds for the message to send before resending
                    const startTime = Date.now();
                    while (Date.now() - startTime < 2000) {
                        // checks if the message was actually sent
                        const currentNumber = await page.evaluate(() => {
                            return window.frames[0].document.getElementsByClassName("content push-top-double push-bottom-double").item(0).getElementsByTagName("ul").item(0).querySelectorAll("li.message.clearfix.ng-scope.my-message").length;
                        });

                        // the message sent successfully, so it can be removed from the queue
                        if (startNumber < currentNumber) {
                            toQueue.shift();
                            break;
                        }
                    }
                }
            } else {
                return;
            }
        }
        sending = false;
    }
}

async function read(page, lastIndex) {
    return await page.evaluate((lastIndex) => {
        function getNextMessage(ul, lastIndex) {
            let list = ul.querySelectorAll("li.message.clearfix.ng-scope:not(.my-message):not(.historical)");
            if (lastIndex.number < list.length - 1) {
                return list[++lastIndex.number];
            } else {
                // if the bot restarted and the messages were cleared
                if (lastIndex >= list.length) {
                    lastIndex.number = list.length - 1; // make it seem like the bot has completed the message queue (put the bot back on track)
                }
                return null;
            }
        }

        let div = window.frames[0].document.getElementsByClassName("content push-top-double push-bottom-double").item(0); // the div that holds the list
        if (div != null) {
            let ul = div.getElementsByTagName("ul").item(0); // the list
            if (ul != null) { // if there are messages
                let lastMessage = getNextMessage(ul, lastIndex);

                if (lastMessage !== null) {
                    let authorElement = lastMessage.getElementsByClassName("author").item(0);
                    let messageElement = lastMessage.getElementsByTagName("p").item(0);
                    if (authorElement != null) {
                        authorElement = authorElement.childNodes[0].nodeValue;
                        authorElement = authorElement.substring(0, (authorElement.length - 3)); // trim the " - " from the end of the author string
                    } else {
                        authorElement = undefined;
                    }
                    if (messageElement != null) {
                        messageElement = messageElement.childNodes[0].nodeValue;
                    } else {
                        messageElement = undefined;
                    }
                    return [
                        [messageElement, authorElement], lastIndex.number
                    ];
                }
            }
        } else {
            return ["disconnected", lastIndex.number]; // there was an error and the bot is no longer in the chat screen
        }
        return ["clear", lastIndex.number]; // there are no messages to read, so just send nothing
    }, lastIndex);
}

function restart(page) {
    console.log(getDateTime() + ": Restarting...\n");
    startup(page);
}

function shutdown() {
    console.log("\n" + getDateTime() + ": Shutting down!");
    browser.close();
}

function getDateTime() {
    let date = new Date();
    return date.getUTCFullYear() + ":" + ("0" + (date.getUTCMonth() + 1)).slice(-2) + ":" + ("0" + date.getUTCDate()).slice(-2) + ":" + ("0" + date.getUTCHours()).slice(-2) + ":" + ("0" + date.getUTCMinutes()).slice(-2) + ":" + ("0" + date.getUTCSeconds()).slice(-2);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

class RuneScapeSync {
    constructor(toQueue1 = new Queue(), fromQueue1 = new Queue(), config1, scripts2) {
        fromQueue = fromQueue1;
        toQueue = toQueue1;
        config = config1;
        scripts1 = scripts2;
    }

    async loadScripts() {
        for (var i = 0; i < scripts1.length; i++) {
            var mod = scripts1[i];
            if (!mod.getRunescapeCommands) continue;
            var commands = mod.getRunescapeCommands();
            if (!Array.isArray(commands)) continue;
            for (var k = 0; k < commands.length; k++) {
                var command = commands[k];
                if (!scripts[command]) {
                    var sub = {
                        callbacks: []
                    };
                    sub.callbacks.push(mod);
                    scripts[command] = sub;
                } else {
                    scripts[command].callbacks.push(mod);
                }
            }
        }
    }

    static get toQueueListener() {
        return () => {
            send();
        };
    }

    async start() {
        await console.log(getDateTime() + ": Started bot");
        browser = await puppeteer.launch({
            args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-web-security", "--user-data-dir"]
        });
        page = await browser.newPage();
        await this.loadScripts();
        await startup(page);
    }

    getHTML() {
        if (frame !== undefined) {
            return frame.content();
        } else {
            return undefined;
        }
    }

    getScreenshot() {
        if (page !== undefined) {
            return page.screenshot();
        } else {
            return undefined;
        }
    }

    async shutdown() {
        return browser.close();
    }

    async restart() {
        on = false;
    }
}

module.exports = RuneScapeSync;