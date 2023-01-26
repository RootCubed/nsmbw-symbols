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
});

document.getElementById("start-search").addEventListener("click", startSearch);

let errorHandler = er => {
    document.getElementById("search-results").innerHTML =
    `<h4>An error occured while performing the search.
    Please report this to the website owner. (RootCubed#0001 on Discord)</h4>
    <span class="code">${er}</span>`;
};

function startSearch() {
    document.getElementById("search-results").innerHTML = "<h4>Searching...</h4>";
    let val = document.getElementById("search").value;
    let url = "./search_symbol?sym=" + val;
    fetch(url).then(res => res.json())
    .then(res => searchResHandler(res, val))
    .catch(errorHandler);
}

function searchResHandler(res, val) {
    let html = "";
    const makeStr = m => {
        if (m.val == "-1") {
            return `<span class="mapped-addr">Unmappable address for ${m.reg}</span>`;
        } else {
            return `<span class="mapped-addr"><span class="code">${m.val}</span> for ${m.reg}</span>`;
        }
    };
    switch (res.type) {
        case "none":
            html += `<h3>No symbols found for "${val}"</h3>`;
            break;
        case "symAddr":
            html += `<h3>The symbol <span class="code">${val}</span> was found at:</h3>`;
            for (let m of res.matches) {
                html += makeStr(m);
            }
            break;
        case "addrSym":
            html += `<h3>The address <span class="code">0x${val.replace(/0x/, "")}</span> resolves to:</h3>`;
            for (let m of res.matches) {
                html += makeStr(m);
            }
            break;
    }
    document.getElementById("search-results").innerHTML = html;
}