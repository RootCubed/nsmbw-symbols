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
    let demangler = spawn("python3", ["demangler.py", "demangle", name]);
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

let regionNames = [
    "P1", "P2",
    "E1", "E2",
    "J1", "J2",
    "K",
    "W",
    "C"
];

let fullRegionNames = {
    P1: "PALv1",
    P2: "PALv2",
    E1: "NTSCv1",
    E2: "NTSCv2",
    J1: "JPNv1",
    J2: "JPNv2",
    K: "KOR",
    W: "TWN",
    C: "CHN"
};

let portFile = parsePortFile(fs.readFileSync("data/versions_nsmbw.txt").toString());

function parsePortFile(content) {
    let portFileObject = {};
    content = content.replace(/\r/g, "");
    for (let reg of regionNames) {
        let regex = new RegExp(`\\[${reg}\\]\n([^\\[]+)(\\[|$(?![\r\n]))`, "m");
        let porter = content.match(regex);
        if (porter) {
            porter = porter[1].split("\n");
            porter = porter.filter(line => !line.startsWith("#") && line != "");
            let rules = [];
            let extender = "";
            for (let line of porter) {
                let extend = line.match(/extend (.+)/);
                if (extend) {
                    extender = extend[1];
                }
                let lineMatch = line.match(/(?:0x)?([^-]+)-([^:]+): (\+|-)(?:0x)?([0-9A-F]+)/i);
                if (lineMatch && lineMatch.length == 5) {
                    let from = parseInt(lineMatch[1], 16);
                    let to = (lineMatch[2] == "*") ? "any" : parseInt(lineMatch[2], 16);
                    let positive = (lineMatch[3] == "+");
                    let offset = parseInt(lineMatch[4], 16);
                    rules.push({
                        from: from,
                        to: to,
                        positive: positive,
                        offset: offset
                    });
                }
            }
            portFileObject[reg] = {
                extend: extender,
                rules: rules.sort((a, b) => a.from - b.from)
            };
        } else {
            console.log(reg + " couldn't be found in versions file");
        }
    }
    return portFileObject;
}

function convertAddr(addr, from, to) {
    if (from != "" && !portFile[from]) return -1;
    if (to != "" && !portFile[to]) return -1;
    if (from == to) return addr;
    let extendList_to = [];
    let curr = to;
    while (portFile[curr]) {
        extendList_to.push(curr);
        curr = portFile[curr].extend;
    }
    let baseRegion = from;
    while (portFile[baseRegion]) {
        if (extendList_to.indexOf(baseRegion) > -1) break;
        baseRegion = portFile[baseRegion].extend;
    }
    if (from == to) return addr;
    if (from != baseRegion && portFile[from]) {
        let found = false;
        for (let r of portFile[from].rules) {
            let offs = r.positive ? r.offset : -r.offset;
            if (addr >= r.from + offs && r.to == "any") {
                addr -= offs;
                found = true;
                break;
            }
            if (addr >= r.from + offs && addr < r.to + offs) {
                //console.log(`[${from}, ${to}] Applied to ${addr.toString(16)}: ${r.from.toString(16)}-${r.to.toString(16)}`)
                addr -= offs;
                found = true;
                break;
            }
        }
        if (!found) return -1;
        //console.log(`[${from}, ${to}] After step 1: ${addr.toString(16)}`);
        if (portFile[portFile[from].extend]) {
            addr = convertAddr(addr, portFile[from].extend, baseRegion);
        }
        //console.log(`[${from}, ${to}] After step 2: ${addr.toString(16)}`);
    }
    if (portFile[to] && baseRegion != to) {
        if (portFile[portFile[to].extend]) {
            addr = convertAddr(addr, baseRegion, portFile[to].extend);
        }
        //console.log(`[${from}, ${to}] After step 3: ${addr.toString(16)}`);
        let found = false;
        for (let r of portFile[to].rules) {
            let offs = r.positive ? r.offset : -r.offset;
            if (addr >= r.from && r.to == "any") {
                addr += offs;
                found = true;
                break;
            }
            if (addr >= r.from && addr < r.to) {
                //console.log(`[${from}, ${to}] Applied to ${addr.toString(16)}: ${r.from.toString(16)}-${r.to.toString(16)}`)
                addr += offs;
                found = true;
                break;
            }
        }
        if (!found) return -1;
    }
    return addr;
}

indexRouter.get("/convert_address", (req, res) => {
    if (!req.query.sym) {
        res.sendStatus(400);
        return;
    }
    let search = req.query.sym.replace("0x", "");
    if (parseInt(search, 16).toString(16).toUpperCase() != search.toUpperCase()) {
        res.sendStatus(400);
        return;
    }
    search = parseInt(search, 16);
    let from = req.query.from;
    let r = {
        type: "addrConvert",
        matches: []
    };
    for (let reg of regionNames) {
        r.matches.push({
            reg: fullRegionNames[reg],
            val: convertAddr(search, from, reg).toString(16)
        });
    }
    res.send(r);
});

indexRouter.get("/search_symbol", (req, res) => {
    let search = req.query.sym;
    let r = {
        type: "none",
        matches: []
    };
    if (!search) {
        res.send(r);
        return;
    }
    if (search.startsWith("0x") || parseInt(search, 16).toString(16).toUpperCase() == search.toUpperCase()) {
        r.type = "addrSym";
        let regAddr = parseInt(search, 16);
        for (let reg of regionNames) {
            let chnAddr = convertAddr(regAddr, reg, "C");
            for (let sym of symbolsArr) {
                if (sym.addr == chnAddr) {
                    r.matches.push({
                        reg: fullRegionNames[reg],
                        val: sym.mang.toString(16)
                    });
                    break;
                }
            }
        }
    } else {
        r.type = "symAddr";
        let chnAddr;
        for (let sym of symbolsArr) {
            if (sym.mang == search || sym.dem_nv == search || sym.dem_corr == search) {
                chnAddr = sym.addr;
                break;
            }
        }
        if (chnAddr) {
            for (let reg of regionNames) {
                let regAddr = convertAddr(chnAddr, "C", reg);
                if (regAddr != -1) {
                    r.matches.push({
                        reg: fullRegionNames[reg],
                        val: "0x" + regAddr.toString(16)
                    });
                }
            }
        }
    }
    if (r.matches.length == 0) {
        r.type = "none";
    }
    res.send(r);
});

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

indexRouter.get("/symbolList/submit_symbol", async (req, res) => {
    let val = req.query.sym;
    if (val.match(/@\d+$/g)) {
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
    res.send("ok");
});

const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || "/";

app.use(BASE_URL, indexRouter);

app.listen(PORT, () => console.log("Web server is up and running on port " + PORT));
