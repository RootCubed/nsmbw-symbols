const fs = require("fs");

let file = fs.readFileSync("symbols.csv", "utf-8").trim().split("\n");

let out = "count,time\n";
out += "32362,1645274835\n";
for (let i = 0; i < file.length; i++) {
    let splitted = file[i].split(",");
    let time = Math.floor(new Date(parseInt(splitted[splitted.length - 1]) * 1000).getTime() / 1000);
    out += `${32362 - 11032 - i},${time}\n`;
}

fs.writeFileSync("symbols_plot.csv", out);