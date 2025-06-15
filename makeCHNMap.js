// Takes the symbols.csv file and converts it to a symbol map file

const fs = require("fs");

function hash(str) {
    let outHash = new Uint32Array(2); // second entry is used as a temporary u32 variable
    outHash[0] = 0x1505; // Initial hash value.
    for (let i = 0; i < str.length; i++) {
        outHash[1] = outHash[0];
        outHash[0] = (outHash[0] << 5);
        outHash[0] += outHash[1];
        outHash[0] ^= str.charCodeAt(i);
    }
    return outHash[0];
}

const hashesTxt = fs.readFileSync("hashes.txt", "utf-8").trim().replace(/\r/g, "").split("\n");
const symbolMeta = [];
const hashLookup = new Map();
for (const line of hashesTxt) {
    const parts = line.split("|").map(e => e.trim());

    const addr = parseInt(parts[0], 16);
    const mangHash = parts[2].substring(1).toUpperCase();
    const demHash = parts[3].substring(1).toUpperCase();
    const length = parseInt(parts[4].match(/Length (0x[0-9a-f]+)/)[1], 16);
    const meta = {
        addr,
        length,
        hashname: `hash_${mangHash}_${demHash}`,
    };
    symbolMeta.push(meta);
    if (!hashLookup.has(meta.hashname)) {
        hashLookup.set(meta.hashname, []);
    }
    hashLookup.get(meta.hashname).push(meta);
}

const symbolsCsv = fs.readFileSync("symbols.csv", "utf-8").trim().replace(/\r/g, "").split("\n");
const symbols = symbolsCsv.map(e => {
    const matches = e.match(/"([^"]+)"/g).slice(0, 4);
    const addr = parseInt(e.match(/",([0123456789a-f]{8})/)[1], 16);
    return {
        addr,
        mang: matches[0].match(/"([^"]+)"/)[1],
        dem_nv: matches[1].match(/"([^"]+)"/)[1],
        dem_corr: matches[2].match(/"([^"]+)"/)[1]
    };
});

// Re-generate @... symbols
for (let i = 1; i <= 112488; i++) {
    const symHash = hash(`@${i}`);
    const hashHex = symHash.toString(16).toUpperCase().padStart(8, "0");
    const meta = hashLookup.get(`hash_${hashHex}_${hashHex}`);
    if (meta) {
        for (const m of meta) {
            symbols.push({
                addr: m.addr,
                mang: `@${i}`,
                dem_nv: `@${i}`,
                dem_corr: `@${i}`
            });
        }
    }
}

symbolMeta.sort((a, b) => a.addr - b.addr);

let symMap = symbolMeta.map(metadata => {
    let sym = metadata.hashname;
    const symbol = symbols.find(s => s.addr == metadata.addr);
    if (symbol) {
        sym = symbol.mang;
    }
    return [
        metadata.addr.toString(16).padStart(8, "0"),
        metadata.length.toString(16).padStart(8, "0"),
        metadata.addr.toString(16).padStart(8, "0"),
        0,
        sym
    ].join(" ");
}).join("\n");

fs.writeFileSync("symbols_CHN.map", symMap);
