// Takes the symbols.csv file and converts it to a symbol map file

const fs = require("fs");

const hashesTxt = fs.readFileSync("hashes.txt", "utf-8").trim().replace(/\r/g, "").split("\n");
const lengthForAddr = {};
for (const line of hashesTxt) {
    const parts = line.split("|").map(e => e.trim());
    
    const addr = parseInt(parts[0], 16);
    const length = parseInt(parts[4].match(/Length (0x[0-9a-f]+)/)[1], 16);
    lengthForAddr[addr] = length;
}

const symbolsCsv = fs.readFileSync("symbols.csv", "utf-8").trim().replace(/\r/g, "").split("\n");
const symbolsArr = symbolsCsv.map(e => {
    const matches = e.match(/"([^"]+)"/g).slice(0, 4);
    const addr = parseInt(e.match(/",([0123456789a-f]{8})/)[1], 16);
    return {
        mang: matches[0].match(/"([^"]+)"/)[1],
        dem_nv: matches[1].match(/"([^"]+)"/)[1],
        dem_corr: matches[2].match(/"([^"]+)"/)[1],
        addr: addr,
        length: lengthForAddr[addr]
    };
});

symbolsArr.sort((a, b) => a.addr - b.addr);

let symMap = symbolsArr.map(e => {
    return [
        e.addr.toString(16).padStart(8, "0"),
        e.length.toString(16).padStart(8, "0"),
        e.addr.toString(16).padStart(8, "0"),
        0,
        e.mang
    ].join(" ");
}).join("\n");

fs.writeFileSync("symbols_CHN.map", symMap);
