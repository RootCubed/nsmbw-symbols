function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
 }

function loadSymbols() {
    fetch("symbols").then(res => res.text()).then(res => {
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

        loadTableData(data, "time_added", false);
    });
}

const sortNames = ["sortAsc", "sortDec", "sortDeac"];
const symbolType = ["Mangled", "NVIDIA Demangled", "Demangled"];
const symbolTypeField = ["symbol", "symbol_dnv", "symbol_d"];

let useSymbolType = 0;

function loadTableData(data, sortBy, sortAsc) {
    let sorted = data.sort((a, b) => {
        switch (sortBy) {
            case "symbol":
                let sT = symbolTypeField[useSymbolType];
                return sortAsc ? a[sT].localeCompare(b[sT]) : b[sT].localeCompare(a[sT]);
            case "address":
            case "time_added":
                return sortAsc ? a[sortBy] - b[sortBy] : b[sortBy] - a[sortBy];
        }
        return 0;
    });
    let sortClassSym = (sortBy == "symbol") ? sortAsc ? 0 : 1 : 2;
    let sortClassAddr = (sortBy == "address") ? sortAsc ? 0 : 1 : 2;
    let sortClassTime = (sortBy == "time_added") ? sortAsc ? 0 : 1 : 2;
    let tableHTML = `<table>
    <tbody>
        <tr>
            <th class="${sortNames[sortClassSym]}">Symbol (<a id="symType" href="#">${symbolType[useSymbolType]}</a>)</th>
            <th class="${sortNames[sortClassAddr]}">Address (CHN)</th>
            <th class="${sortNames[sortClassTime]}">Time added</th>
        </tr>
        ${sorted.map(e => {
            return `<tr>
                <td>${useSymbolType == 0 ? e.symbol : useSymbolType == 1 ? e.symbol_dnv : e.symbol_d}</td>
                <td>0x${e.address.toString(16)}</td>
                <td>${e.time_added.toLocaleString()}</td>
            </tr>`;
        }).join("")}
    </tbody></table>`;
    document.getElementById("symbolTable").innerHTML = tableHTML;

    let headers = Array.from(document.querySelectorAll("#symbolTable th"));
    headers[0].addEventListener("click", e => {
        if (e.target == document.getElementById("symType")) {
            useSymbolType = (useSymbolType + 1) % 3;
            loadTableData(data, sortBy, sortAsc);
        } else {
            if (sortBy == "symbol") {
                loadTableData(data, "symbol", !sortAsc);
            } else {
                loadTableData(data, "symbol", true);
            }
        }
    });
    headers[1].addEventListener("click", () => {
        if (sortBy == "address") {
            loadTableData(data, "address", !sortAsc);
        } else {
            loadTableData(data, "address", true);
        }
    });
    headers[2].addEventListener("click", () => {
        if (sortBy == "time_added") {
            loadTableData(data, "time_added", !sortAsc);
        } else {
            loadTableData(data, "time_added", false);
        }
    });
}

document.getElementById("submit").addEventListener("click", async () => {
    document.querySelector("table").innerHTML = "Loading...";
    let f = await fetch("submit_symbol?sym=" + document.getElementById("symbolInput").value);
    let t = await f.text();

    if (t != "ok") {
        alert(t);
    }

    loadSymbols();
});


loadSymbols();