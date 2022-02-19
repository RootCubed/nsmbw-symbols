const express = require("express");
const app = express();
const compression = require("compression");
const fs = require("fs");
const { spawn } = require("child_process")

app.use(compression());

let indexRouter = express.Router();

let generatedDate = new Date(parseInt(fs.readFileSync("generatedDate.txt").toString()));

let symbolsCsv = fs.readFileSync("symbols.csv", "utf-8").trim().replace(/\r/g, "").split("\n").slice(0, -1);

let foundMang = symbolsCsv.map(e => e.match(/"[^"]*"|[^,]+/g)[0]);

async function demangle(name, mode) {
    let demangler = spawn(`python3 demangler.py ${mode} "${name}"`, [], {shell: true});
    let resFunc;
    let prom = new Promise((res, rej) => {
        resFunc = res;
        setTimeout(rej, 4000);
    });

    demangler.stdout.on("data", data => {
        if (resFunc) {
            resFunc(data.toString().trim());
        }
    });

    return prom;
}

let hashData = fs.readFileSync("hashes.txt", "utf-8").trim().replace(/\r/g, "").split("\n").map(e => {
    let tmp = e.split("|").map(v => v.trim());
    return {
        address: parseInt(tmp[0], 16),
        mangledHash: parseInt(tmp[2].substring(1), 16),
        demangledHash: parseInt(tmp[3].substring(1), 16)
    }
});

function toCustomTime(time) {
    return time.getFullYear().toString().padStart(4, '0') + "-"
        + (time.getMonth() + 1).toString().padStart(2, '0') + "-"
        + time.getDate().toString().padStart(2, '0') + " "
        + time.getHours().toString().padStart(2, '0') + ":"
        + time.getMinutes().toString().padStart(2, '0') + " (UTC+2)";
}

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

const mapFiles = {
    P1: "data/WIIMJ2DNP.alf.map",
    P2: "data/WIIMJ2DNP.alf.map",
    E1: "data/WIIMJ2DNP.alf.map",
    E2: "data/WIIMJ2DNP.alf.map",
    J1: "data/WIIMJ2DNP.alf.map",
    J2: "data/WIIMJ2DNP.alf.map",
    K: "data/WIIMJ2DNP.alf.map",
    W: "data/WIIMJ2DNP.alf.map",
    C: "data/WIIMJ2DNP.alf.map"
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

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

indexRouter.get("/generated_date", (req, res) => {
    res.send(toCustomTime(generatedDate));
});

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
    }
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
        let addrRegex = new RegExp(`^([^ \\n]+) 0x${search.replace(/0x/, "")} .`, "im");
        for (let reg of regionNames) {
            if (!mapFiles[reg]) continue;
            let map = fs.readFileSync(mapFiles[reg]).toString().replace(/\r/g, "");
            let addrMatch = map.match(addrRegex);
            if (addrMatch != null) {
                r.matches.push({
                    reg: fullRegionNames[reg],
                    val: addrMatch[1]
                });
            }
        }
    } else {
        r.type = "symAddr";
        for (let reg of regionNames) {
            if (!mapFiles[reg]) continue;
            let map = fs.readFileSync(mapFiles[reg]).toString().replace(/\r/g, "");
            let symRegex = new RegExp(`^${escapeRegExp(search)} 0x([0-9a-f]{8}) .`, "im");
            let symMatch = map.match(symRegex);
            if (symMatch != null) {
                r.matches.push({
                    reg: fullRegionNames[reg],
                    val: symMatch[1]
                });
            }
        }
    }
    if (r.matches.length == 0) {
        r.type = "none"
    }
    res.send(r);
});

indexRouter.get("/submitSymbols/symbols", (req, res) => {
    res.send(symbolsCsv.join("\n"));
});

function hash(str) {
    let h = new Uint32Array(1);
    h[0] = 0x1505;
    for (let c of str.trim().split("").map(e => e.charCodeAt(0))) {
        h[0] = ((h[0] * 33) ^ c) & 0xFFFF_FFFF;
    }
    return h[0];
}

indexRouter.get("/submitSymbols/submit_symbol", async (req, res) => {
    let val = req.query.sym;
    if (foundMang.indexOf(val) > -1) {
        res.send("Hash already in database!");
        return;
    }
    let demNV = await demangle(val, "demangle_nvidia");
    let demCorr = await demangle(val, "demangle");
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
    }
    foundMang.push(val);
    fs.writeFileSync("symbols.csv", symbolsCsv.join("\n"));
    res.send("ok");
});

const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || "/";

app.use(BASE_URL, indexRouter);

app.listen(PORT, () => console.log("Web server is up and running on port " + PORT));
