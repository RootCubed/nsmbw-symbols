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

loadSymbols();
