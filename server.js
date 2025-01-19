const express = require("express");
const app = express();
const compression = require("compression");
const fs = require("fs");
const { spawn } = require("child_process");
const EventEmitter = require("events");
const https = require("https");

app.use(compression());

let indexRouter = express.Router();

let symbolsCsv = fs.readFileSync("symbols.csv", "utf-8").trim().replace(/\r/g, "").split("\n");
let symbolsArr = symbolsCsv.map(e => {
    let matches = e.match(/"([^"]+)"/g).slice(0, 4);
    let res = {
        mang: matches[0].match(/"([^"]+)"/)[1],
        dem_nv: matches[1].match(/"([^"]+)"/)[1],
        dem_corr: matches[2].match(/"([^"]+)"/)[1],
        addr: parseInt(e.match(/",([0123456789a-f]{8})/)[1], 16)
    };
    return res;
});

let foundMang = (symbolsCsv == []) ? [] : symbolsCsv.map(e => {
    let sym = e.match(/"[^"]*"|[^,]+/g)[0];
    return sym.substring(1, sym.length - 1);
});

let demangler, bus;
let rProm = () => {};
setupDemangler();

function setupDemangler() {
    demangler = spawn("./nvidia_demangler");
    bus = new EventEmitter();

    bus.on("demangled", data => rProm(data));

    demangler.stdout.on("data", data => {
        const demOut = data.toString().split("\n")[0].trim();
        bus.emit("demangled", demOut);
    });

    demangler.on("exit", () => {
        setupDemangler();
    });
}

async function demangleNVIDIA(name) {
    let rej;
    r = new Promise((r, j) => {
        rProm = r;
        rej = j;
    });
    demangler.stdin.write(name + "\n");
    let timeout = setTimeout(() => rej(), 500);
    let res = await r;
    clearTimeout(timeout);
    return res;
}

async function demangleCorrect(name) {
    let demangler = spawn("python3", ["demangler.py", "-m", "demangle", name]);
    let resFunc, rejFunc;
    let errorData = "";
    let prom = new Promise((res, rej) => {
        resFunc = res;
        rejFunc = rej;
        setTimeout(() => rej("Demangler timeout."), 4000);
    });

    demangler.stdout.on("data", data => {
        if (resFunc) {
            resFunc(data.toString().trim());
        }
    });

    demangler.stderr.on("data", data => {
        errorData += data.toString();
    });

    demangler.on("exit", () => {
        rejFunc(errorData.toString().trim());
    });

    return prom;
}

let hashData = fs.readFileSync("hashes.txt", "utf-8").trim().replace(/\r/g, "").split("\n").map(e => {
    let tmp = e.split("|").map(v => v.trim());
    return {
        address: parseInt(tmp[0], 16),
        mangledHash: parseInt(tmp[2].substring(1), 16),
        demangledHash: parseInt(tmp[3].substring(1), 16)
    };
});

indexRouter.use(express.static("static"));

indexRouter.get("/symbolList/symbols", (req, res) => {
    res.send(symbolsCsv.join("\n"));
});

indexRouter.get("/symbolCount", (req, res) => {
    res.send(symbolsCsv.length.toString());
});

function hash(str) {
    let h = new Uint32Array(1);
    h[0] = 0x1505;
    for (let c of str.trim().split("").map(e => e.charCodeAt(0))) {
        h[0] = ((h[0] * 33) ^ c) & 0xFFFFFFFF;
    }
    return h[0];
}

let mapUpdaterCallbackTimeout = null;

indexRouter.get("/symbolList/submit_symbol", async (req, res) => {
    let val = req.query.sym;
    if (val.match(/^@\d+$/g)) {
        res.send("Submitting @<number> hashes is currently turned off.");
        return;
    }
    if (foundMang.indexOf(val) > -1) {
        res.send("Symbol already in database!");
        return;
    }
    let demNV, demCorr;
    try {
        demNV = await demangleNVIDIA(val);
        demCorr = await demangleCorrect(val);
    } catch (e) {
        res.send(e);
        return;
    }
    let found = [];
    for (let hD of hashData) {
        if (hash(val) == hD.mangledHash && hash(demNV) == hD.demangledHash) {
            found.push(hD);
        }
    }
    if (found.length == 0) {
        res.send("Hash not found!");
        return;
    }
    for (let f of found) {
        symbolsCsv.push(`"${val}","${demNV}","${demCorr}",${f.address.toString(16)},${Math.floor(new Date().getTime() / 1000)}`);
        symbolsArr.push({
            mang: val,
            dem_nv: demNV,
            dem_corr: demCorr,
            addr: f.address
        });
        if (process.env.DISCORD_WEBHOOK) {
            let data = JSON.stringify({
                "content": null,
                "embeds": [{
                    "title": `New symbol added @ 0x${f.address.toString(16)}`,
                    "color": 2736949,
                    "fields": [{
                    "name": "Symbol info",
                    "value": `Mangled: \`${val}\`\n\nDemangled: \`${demCorr}\``
                }],
                "author": {
                    "name": "NSMBW Symbols",
                    "url": "https://rootcubed.dev/nsmbw-symbols/symbolList/"
                },
                    "timestamp": new Date().toISOString()
                }],
                "username": "NSMBW Symbol Maps"
            });
            let req = https.request(process.env.DISCORD_WEBHOOK, {
                port: 443,
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Content-Length": data.length
                }
            });
            req.write(data);
            req.end();
        }
    }
    foundMang.push(val);
    fs.writeFileSync("symbols.csv", symbolsCsv.join("\n"));

    // Update map files, with a cooldown of 5 minutes
    clearTimeout(mapUpdaterCallbackTimeout);
    mapUpdaterCallbackTimeout = setTimeout(() => spawn("sh", ["update_maps.sh"]), 30 * 1000);

    res.send("ok");
});

const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || "/";

app.use(BASE_URL, indexRouter);

app.listen(PORT, () => console.log("Web server is up and running on port " + PORT));
