const fs = require("fs");

let filePath = process.argv[2];

if (process.argv.length < 3) {
    throw "Usage: node alfToDol.js <input> [-x]";
}

if (!fs.existsSync(filePath)) {
    throw "The file was not found.";
}

let fileBuffer = fs.readFileSync(filePath);

const correctMagic = Buffer.from([0x52, 0x42, 0x4F, 0x46]);

let alfMagic = fileBuffer.subarray(0, 4);
let alfVersion = fileBuffer.readUInt32LE(4);
let entryPoint = fileBuffer.readUInt32LE(8);
let numSections = fileBuffer.readUInt32LE(12);

if (alfMagic.compare(correctMagic)) {
    console.log("Invalid file. Magic doesn't match!");
    process.exit(1);
}

console.log(
`version 0x${alfVersion.toString(16)}
entry point at 0x${entryPoint.toString(16)}
${numSections} sections`);

let sections = [];

let fileLocStart = Infinity;
let fileLocEnd = 0;

let secCount = 0;
let filePointer = 0x10;
while (secCount < numSections) {
    let virtualMemoryLocation = fileBuffer.readUInt32LE(filePointer);
    let sectionPhysLength = fileBuffer.readUInt32LE(filePointer + 4);
    let sectionVirtLength = fileBuffer.readUInt32LE(filePointer + 8);
    console.log(
`Section ${secCount + 1} at offset 0x${filePointer.toString(16)} into file:
    Location: 0x${virtualMemoryLocation.toString(16)}
    Section Length in file: 0x${sectionPhysLength.toString(16)}
    Section Length in memory: 0x${sectionVirtLength.toString(16)}
`);
    filePointer += 0xC;

    let secBuffer = Buffer.alloc(sectionVirtLength);
    if (sectionPhysLength > 0) {
        fileBuffer.copy(secBuffer, 0, filePointer, filePointer + sectionPhysLength);
    }
    sections.push({
        address: virtualMemoryLocation,
        buffer: secBuffer
    });

    if (virtualMemoryLocation < fileLocStart) {
        fileLocStart = virtualMemoryLocation;
    }
    if (virtualMemoryLocation + sectionVirtLength > fileLocEnd) {
        fileLocEnd = virtualMemoryLocation + sectionVirtLength;
    }

    filePointer += sectionPhysLength;
    secCount++;
}

let outFileBuffer = Buffer.alloc(fileLocEnd - fileLocStart);

for (let section of sections) {
    section.buffer.copy(outFileBuffer, section.address - fileLocStart, 0, section.buffer.length);
}

fs.writeFileSync(filePath + ".bin", outFileBuffer);

console.log("Creating .dol...");

// this is currently hardcoded for NSMBW
let sectionTypes = [
    "text", // 1
    "data", // 2
    "data", // 3
    "text", // 4
    "data", // 5
    "data", // 6
    "data", // 7
    "data", // 8
    "bss",  // 9
    "data", // 10
    "data", // 11
    "data", // 12
    "data", // 13
];

let dolHeader = Buffer.alloc(0x100);

// entry point
dolHeader.writeUInt32BE(entryPoint, 0xE0);

let currPos = 0x100;
let textCount = 0;
let dataCount = 0;
for (let i = 0; i < sectionTypes.length; i++) {
    let sectionType = sectionTypes[i];
    let currSec = sections[i];

    if (sectionType == "text") {
        // file offset
        dolHeader.writeUInt32BE(currPos, 0x0 + textCount * 4);
        // address
        dolHeader.writeUInt32BE(currSec.address, 0x48 + textCount * 4);
        // size
        dolHeader.writeUInt32BE(currSec.buffer.length, 0x90 + textCount * 4);
        textCount++;
    } else if (sectionType == "data") {
        // file offset
        dolHeader.writeUInt32BE(currPos, 0x1c + dataCount * 4);
        // address
        dolHeader.writeUInt32BE(currSec.address, 0x64 + dataCount * 4);
        // size
        dolHeader.writeUInt32BE(currSec.buffer.length, 0xac + dataCount * 4);
        dataCount++;
    } else if (sectionType == "bss") {
        // address
        dolHeader.writeUInt32BE(currSec.address, 0xd8);
        // size
        dolHeader.writeUInt32BE(currSec.buffer.length, 0xdc);
    }

    currPos += currSec.buffer.length;
}

let dolFileBuf = Buffer.concat([dolHeader, ...sections.map(el => el.buffer)]);
if (fs.existsSync("main.dol")) {
    console.log("main.dol already exists. Skipping...");
} else {
    fs.writeFileSync("main.dol", dolFileBuf);
}

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

if (process.argv.length == 4 && process.argv[3] == "-x") {
    let nameToHashes = {};
    
    const useMangledHash = true;

    let nameList = [];
    let lines = [];
    if (fs.existsSync(useMangledHash ? "names.txt" : "demangled_names.txt")) {
        nameList = fs.readFileSync(useMangledHash ? "names.txt" : "demangled_names.txt").toString().replace(/ ?\/\/.+/g, "").replace(/\r/g, "").replace(/\n(?=\n)/g, "").split("\n");
        lines = fs.readFileSync(useMangledHash ? "names.txt" : "demangled_names.txt").toString().replace(/\r/g, "").split("\n");
    }
    for (let n of nameList) {
        nameToHashes[hash(n).toString(16).padStart(8, "0").toUpperCase()] = n;
    }

    //console.log(nameToHashes);

    let hashSecSize = fileBuffer.readUInt32LE(filePointer);

    filePointer += 4;

    let hashSecEnd = filePointer + hashSecSize;

    let hashes = [];
    let mapFileHashes = [];

    let foundMatches = 0;

    let foundNames = [];


    while (filePointer < hashSecEnd) {
        let field1 = fileBuffer.readUInt32LE(filePointer);
        filePointer += 4;
        let hashStrLength = fileBuffer.readUInt32LE(filePointer);
        if (hashStrLength == 0) {
            break;
        }
        filePointer += 4;
        let hash = fileBuffer.toString("ascii", filePointer, filePointer + hashStrLength);
        filePointer += hashStrLength;
        let hash2StrLength = fileBuffer.readUInt32LE(filePointer);
        filePointer += 4;
        let hash2 = fileBuffer.toString("ascii", filePointer, filePointer + hash2StrLength);
        filePointer += hash2StrLength;
        let address = fileBuffer.readUInt32LE(filePointer);
        filePointer += 4;
        let funcLen = fileBuffer.readUInt32LE(filePointer);
        filePointer += 4;
        let symbolType = fileBuffer.readUInt32LE(filePointer);
        filePointer += 4;

        let symbTypeName = (symbolType == 0) ? "FUNCTION    " : "NON-FUNCTION";
        hashes.push([address, `0x${address.toString(16)} | ${symbTypeName} | ${hash} | ${hash2} | Length 0x${funcLen.toString(16)} (unknown field: ${field1.toString(16)})\n`]);
        let hashToUse = (useMangledHash) ? hash : hash2;
        if (nameToHashes[hashToUse.substr(1)]) {
            foundNames.push(nameToHashes[hashToUse.substr(1)]);
            foundMatches++;
            //console.log(`Found hash for ${nameToHashes[hash.substr(1)]} at ${address.toString(16)}`);
            mapFileHashes.push([address, nameToHashes[hashToUse.substr(1)], (symbolType == 0) ? "f" : "l"]);
        } else {
            mapFileHashes.push([address, `hash_${hash.substr(1)}_${hashToUse.substr(1)}`, (symbolType == 0) ? "f" : "l"]);
        }
    }


    let notFound = [];

    for (let i = 0; i < lines.length; i++) {
        let n = lines[i].replace(/ ?\/\/.+/g, "");
        if (n == "") continue;
        if (foundNames.indexOf(n) == -1) {
            lines.splice(i, 1);
            notFound.push(n);
            i--;
        }
    }

    fs.writeFileSync(useMangledHash ? "names.txt" : "demangled_names.txt", lines.join('\n'));
    fs.writeFileSync("notFound.txt", notFound.join('\n'));

    console.log(`
You now have ${foundMatches} labelled symbols! (${(foundMatches / hashes.length * 100).toFixed(3)}% of the symbols in main.dol)`);

    hashes.sort((a, b) => a[0] - b[0]);
    mapFileHashes.sort((a, b) => a[0] - b[0]);

    let hashFileText = hashes.map(el => el[1]).join("");
    let mapFileText = mapFileHashes.map(el => `${el[1]} 0x${el[0].toString(16).padStart(8, '0')} ${el[2]}`).join("\n");

    fs.writeFileSync("hashes.txt", hashFileText);
    fs.writeFileSync(filePath + ".map", mapFileText);
}