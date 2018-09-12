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

const RuneScapeSync = require("./RuneScapeSync");
const Queue = require("./Queue");
const DiscordSync = require("./DiscordSync");
const fs = require("fs");
const path = require('path');
const readline = require("readline").createInterface({
    input: process.stdin,
    output: process.stdout
});

const config = require("./config.json");

let scripts = [];

let runeScapePause = false;
let discordPause = false;

let toRuneScapeQueue = new Queue(RuneScapeSync.toQueueListener);
let fromRuneScapeQueue = new Queue(() => {
    while (fromRuneScapeQueue.length() > 0) {
        switch (fromRuneScapeQueue.getMessage(0)) {
            case config.configs.runeScapePrefix + "help":
            case config.configs.runeScapePrefix + "info":
            case config.configs.runeScapePrefix + "license":
            case config.configs.runeScapePrefix + "source":
                toRuneScapeQueue.push(["RuneScape-Discord Chat Sync is a free program licensed under the GNU AGPL-3.0"]);
                toRuneScapeQueue.push(["Help, source code, and full license info can be found on GitHub"]);
                break;
            default:
                if (!discordPause) {
                    toDiscordQueue.push(fromRuneScapeQueue.get(0));
                }
                break;
        }
        fromRuneScapeQueue.shift();
    }
});

let toDiscordQueue = new Queue(DiscordSync.toQueueListener);
let fromDiscordQueue = new Queue(() => {
    while (fromDiscordQueue.length() > 0) {
        switch (fromDiscordQueue.getMessage(0)) {
            case config.configs.discordPrefix + "help":
            case config.configs.discordPrefix + "info":
            case config.configs.discordPrefix + "license":
            case config.configs.discordPrefix + "source":
                toDiscordQueue.push(["RuneScape-Discord Chat Sync is a free program licensed under the GNU AGPL-3.0\n" +
                    "Help, source code, and full license info can be found on GitHub (https://github.com/aeramos/RuneScape-Discord-Chat-Sync)"
                ]);
                break;
            default:
                if (!runeScapePause) {
                    toRuneScapeQueue.push(fromDiscordQueue.get(0));
                }
                break;
        }
        fromDiscordQueue.shift();
    }
});

let rs = new RuneScapeSync(toRuneScapeQueue, fromRuneScapeQueue, config, scripts);
let discord = new DiscordSync(toDiscordQueue, fromDiscordQueue, config, scripts);

(async () => {
    await loadScripts();
    rs.start();
    discord.start();
})();

async function loadScripts() {
    var items = await fs.readdirSync('./scripts');
    for (var i = 0; i < items.length; i++) {
        var item = items[i];
        try {
            var p = path.resolve('./scripts/' + item);
            var mod = require(p)();
            if (mod.processRunescapeMessage || mod.processDiscordMessage)
                scripts.push(mod);
        } catch (error) {
            console.error(error);
        }
    }
}

readline.on("line", async (originalInput) => {
    const input = originalInput.toLowerCase().split(" ");
    switch (input[0]) {
        case "help":
            if (input.length > 1) {
                switch (input[1]) {
                    case "help":
                        console.log("help [command]");
                        console.log("Lists commands, or when given a command, prints info about the command");
                        break;
                    case "html":
                        console.log("html");
                        console.log("Saves current HTML data of RuneScape page to configured htmlDumpDirectory");
                        break;
                    case "license":
                        console.log("license");
                        console.log("Prints license information (AGPL-3.0+)");
                        break;
                    case "pause":
                        console.log("pause [service]");
                        console.log("Pauses syncing completely or to the given service (\"runescape\" or \"discord\")");
                        break;
                    case "resume":
                        console.log("resume [service]");
                        console.log("Resumes syncing completely or to the given service (\"runescape\" or \"discord\")");
                        break;
                    case "restart":
                        console.log("restart [service]");
                        console.log("Restarts the bot or just the given service (\"runescape\" or \"discord\")");
                        break;
                    case "screenshot":
                        console.log("screenshot");
                        console.log("Saves screenshot of RuneScape page to configured screenshotDirectory");
                        break;
                    case "shutdown":
                        console.log("shutdown");
                        console.log("Shuts down the bot");
                        break;
                    default:
                        console.log("Error: No such command: " + originalInput.substring(5));
                        break;
                }
            } else {
                console.log("Commands: help, html, license, pause, resume, restart, screenshot, shutdown");
            }
            break;
        case "html":
            let html = await rs.getHTML();
            if (html !== undefined) {
                const name = getDateTime().replace(/:/g, ".") + ".html";
                fs.writeFile(config.configs.htmlDumpDirectory + name, html, (err) => {
                    if (!err) {
                        console.log("Saved HTML data as: " + name);
                    } else {
                        console.log(err);
                    }
                });
            } else {
                console.log("Error: Can not get HTML data because the browser is not ready yet");
            }
            break;
        case "license":
            console.log(
                "RuneScape-Discord Chat Sync is a RuneScape Companion and Discord bot that\n" +
                "synchronizes a RuneScape Friends/Clan Chat with Discord chat\n" +
                "Copyright (C) 2018 Alejandro Ramos\n" +
                "\n" +
                "This program is free software: you can redistribute it and/or modify\n" +
                "it under the terms of the GNU Affero General Public License as published by\n" +
                "the Free Software Foundation, either version 3 of the License, or\n" +
                "(at your option) any later version.\n" +
                "\n" +
                "This program is distributed in the hope that it will be useful,\n" +
                "but WITHOUT ANY WARRANTY; without even the implied warranty of\n" +
                "MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the\n" +
                "GNU Affero General Public License for more details.\n" +
                "\n" +
                "You should have received a copy of the GNU Affero General Public License\n" +
                "along with this program.  If not, see <https://www.gnu.org/licenses/>.");
            break;
        case "pause":
            switch (input[1]) {
                case "runescape":
                    console.log("Paused syncing messages to RuneScape");
                    runeScapePause = true;
                    break;
                case "discord":
                    console.log("Paused syncing messages to Discord");
                    discordPause = true;
                    break;
                case undefined:
                    console.log("Paused syncing messages");
                    runeScapePause = true;
                    discordPause = true;
                    break;
                default:
                    console.log("Error: Invalid service selected");
                    console.log("       pause [service]");
                    console.log("       Pauses syncing completely or just to the given service (\"runescape\" or \"discord\")");
                    break;
            }
            break;
        case "resume":
            switch (input[1]) {
                case "runescape":
                    console.log("Resumed syncing messages to RuneScape");
                    runeScapePause = false;
                    break;
                case "discord":
                    console.log("Resumed syncing messages to Discord");
                    discordPause = false;
                    break;
                case undefined:
                    console.log("Resumed syncing messages");
                    runeScapePause = false;
                    discordPause = false;
                    break;
                default:
                    console.log("Error: Invalid service selected");
                    console.log("       resume [service]");
                    console.log("       Resumes syncing completely or just to the given service (\"runescape\" or \"discord\")");
            }
            break;
        case "restart":
            switch (input[1]) {
                case "runescape":
                    console.log("Restarting RuneScape...");
                    rs.restart();
                    break;
                case "discord":
                    console.log("Restarting Discord...");
                    discord.restart();
                    break;
                case undefined:
                    console.log("Restarting all...");
                    Promise.all([rs.restart(), discord.restart()]);
                    break;
                default:
                    console.log("Error: Invalid service selected");
                    console.log("       restart [service]");
                    console.log("       Restarts the bot or just the given service (\"runescape\" or \"discord\")");
            }
            break;
        case "screenshot":
            let screenshot = await rs.getScreenshot();
            if (screenshot !== undefined) {
                const name = getDateTime().replace(/:/g, ".") + ".png";
                fs.writeFile(config.configs.screenshotDirectory + name, screenshot, (err) => {
                    if (!err) {
                        console.log("Saved screenshot as: " + name);
                    } else {
                        console.log(err);
                    }
                });
            } else {
                console.log("Error: Can not take screenshot because the browser is not ready yet");
            }
            break;
        case "shutdown":
            shutdown();
            break;
        default:
            console.log("Unknown command: " + originalInput);
            break;
    }
});

function shutdown() {
    console.log("\n" + getDateTime() + ": Shutting down!");
    Promise.all([rs.shutdown(), discord.shutdown()]);
    process.exit();
}

readline.on("close", () => {
    shutdown();
});

function getDateTime() {
    let date = new Date();
    return date.getUTCFullYear() + ":" + ("0" + (date.getUTCMonth() + 1)).slice(-2) + ":" + ("0" + date.getUTCDate()).slice(-2) + ":" + ("0" + date.getUTCHours()).slice(-2) + ":" + ("0" + date.getUTCMinutes()).slice(-2) + ":" + ("0" + date.getUTCSeconds()).slice(-2);
}