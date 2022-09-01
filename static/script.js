fetch("generated_date").then(res => res.text())
.then(res => {
    document.getElementById("generated-on").innerText = `Generated on ${res}`;
});

fetch("symbolCount").then(res => res.text())
.then(res => {
    let num = parseInt(res) + 11032;
    let perc = (num / 32362) * 100;
    let rem = 32362 - num;
    document.getElementById("remInfo").innerHTML = `${num}/32362 symbols cracked (${rem} remaining)`;
    document.getElementById("progress-bar-text").innerHTML = `${perc.toFixed(3)}%`;
    document.getElementById("progress-bar-inner").style.width = `${perc}%`;
});

function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
 }

function loadSymbols() {
    fetch("symbolList/symbols").then(res => res.text()).then(res => {
        let data = res.trim().replace(/\r/g, "").split("\n").map(e => {
            let split = e.match(/"[^"]*"|[^,]+/g);
            return {
                "symbol": escapeHtml(split[0].substring(1, split[0].length - 1)),
                "symbol_dnv": escapeHtml(split[1].substring(1, split[1].length - 1)),
                "symbol_d": escapeHtml(split[2].substring(1, split[2].length - 1)),
                "address": parseInt(split[3], 16),
                "time_added": new Date(parseInt(split[4]) * 1000)
            };
        });

        load10Entries(data);
    });
}

function load10Entries(data) {
    let sorted = data.sort((a, b) => b.time_added - a.time_added).slice(0, 10);
    let html = sorted.map(e => {
        return `<div>
            <span class="code">${e.symbol}</span>
            <span class="addedTime">(added at ${e.time_added.toLocaleString()})</span>
        </div>`;
    }).join("");
    document.getElementById("recentSymbols").innerHTML = html;
}


async function submitSymbol() {
    document.getElementById("submit").innerText = "Submitting...";
    let f = await fetch("symbolList/submit_symbol?sym=" + document.getElementById("symbolInput").value);
    let t = await f.text();

    document.getElementById("submit").innerText = "Submit";

    if (t != "ok") {
        alert(t);
        return;
    }

    loadSymbols();
}

loadSymbols();

document.getElementById("search").addEventListener("keydown", ev => {
    if (ev.key == "Enter") {
        startSearch();
    }
})

document.getElementById("start-search").addEventListener("click", startSearch);

let errorHandler = er => {
    document.getElementById("search-results").innerHTML =
    `<h4>An error occured while performing the search.
    Please report this to the website owner. (RootCubed#0001 on Discord)</h4>
    <span class="code">${er}</span>`;
}

function startSearch() {
    document.getElementById("search-results").innerHTML = "<h4>Searching...</h4>";
    let val = document.getElementById("search").value;
    //document.getElementById("search").value = "";
    let url = ".";
    let inReg = "";
    switch (document.getElementById("search-type").value) {
        case "Symbol name/address":
            url += "/search_symbol?sym=" + val;
            break;
        case "PALv1 address":
            url += "/convert_address?sym=" + val + "&from=P1";
            inReg = "PALv1";
            break;
        case "PALv2 address":
            url += "/convert_address?sym=" + val + "&from=P2";
            inReg = "PALv2";
            break;
        case "NTSCv1 address":
            url += "/convert_address?sym=" + val + "&from=E1";
            inReg = "NTSCv1";
            break;
        case "NTSCv2 address":
            url += "/convert_address?sym=" + val + "&from=E2";
            inReg = "NTSCv2";
            break;
        case "JPNv1 address":
            url += "/convert_address?sym=" + val + "&from=J1";
            inReg = "JPNv1";
            break;
        case "JPNv2 address":
            url += "/convert_address?sym=" + val + "&from=J2";
            inReg = "JPNv2";
            break;
        case "KOR address":
            url += "/convert_address?sym=" + val + "&from=K";
            inReg = "KOR";
            break;
        case "TWN address":
            url += "/convert_address?sym=" + val + "&from=W";
            inReg = "TWN";
            break;
        case "CHN address":
            url += "/convert_address?sym=" + val + "&from=C";
            inReg = "CHN";
            break;
    }
    fetch(url).then(res => res.json())
    .then(res => searchResHandler(res, val, inReg))
    .catch(errorHandler);
}

function searchResHandler(res, val, inReg) {
    let html = "";
    switch (res.type) {
        case "none":
            html += `<h3>No symbols found for "${val}"</h3>`;
            break;
        case "symAddr":
            html += `<h3>The symbol <span class="code">${val}</span> was found at:</h3>`
            for (let m of res.matches) {
                html += `
                <h4><span class="code">0x${m.val}</span> for ${m.reg}</h4>
                `
            }
            break;
        case "addrSym":
            html += `<h3>The address <span class="code">0x${val.replace(/0x/, "")}</span> resolves to:</h3>`
            for (let m of res.matches) {
                html += `
                <h4><span class="code">${m.val}</span> for ${m.reg}</h4>
                `
            }
            break;
        case "addrConvert":
            html += `<h3>The address <span class="code">0x${val.replace(/0x/, "")}</span> (${inReg}) converts to:</h3>`
            for (let m of res.matches) {
                //if (m.reg == inReg) continue;
                if (m.val == "-1") {
                    html += `
                    <h4>Unmappable address for ${m.reg}</h4>
                    `
                } else {
                    html += `
                    <h4><span class="code">0x${m.val}</span> for ${m.reg}</h4>
                    `
                }
            }
            break;
    }
    document.getElementById("search-results").innerHTML = html;
}