function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

let symbolFilter = () => true;

function loadSymbols() {
    symbolFilter = () => true;
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

        loadTableData(data, "time_added", false, 1);
    });
}

const sortNames = ["sortAsc", "sortDec", "sortDeac"];
const symbolType = ["Mangled", "NVIDIA Demangled", "Demangled"];
const symbolTypeField = ["symbol", "symbol_dnv", "symbol_d"];

let useSymbolType = 0;
let numItemsPerRow = 50;

let searchListener = null;

function sortData(data, sortBy, sortAsc) {
    return data.sort((a, b) => {
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
}

function loadTableData(data, sortBy, sortAsc, page) {
    let filtered = data.filter(e => symbolFilter(e));
    let sorted = sortData(filtered, sortBy, sortAsc);
    
    let sortClassSym = (sortBy == "symbol") ? sortAsc ? 0 : 1 : 2;
    let sortClassAddr = (sortBy == "address") ? sortAsc ? 0 : 1 : 2;
    let sortClassTime = (sortBy == "time_added") ? sortAsc ? 0 : 1 : 2;

    let lastPageNumber = Math.ceil(sorted.length / numItemsPerRow);
    let paginationData = "";

    if (page > 1) {
        paginationData += `<a href="#">&laquo;</a>`;
    }
    if (page < 4) {
        for (let i = 1; i < Math.min(4, lastPageNumber); i++) {
            if (i == page) {
                paginationData += `<a href="#" class="active">${i}</a>`;
            } else {
                paginationData += `<a href="#">${i}</a>`;
            }
        }
    } else {
        paginationData += `<a href="#">1</a>`;
        paginationData += `<input type="text" placeholder="...">`;
    }


    if (page >= lastPageNumber - 3) {
        for (let i = Math.max(lastPageNumber - 3, Math.min(4, lastPageNumber)); i <= lastPageNumber; i++) {
            if (i == page) {
                paginationData += `<a href="#" class="active">${i}</a>`;
            } else {
                paginationData += `<a href="#">${i}</a>`;
            }
        }
    } else {
        if (page >= 4) {
            paginationData += `<a href="#" class="active">${page}</a>`;
        }
        paginationData += `<input type="text" placeholder="...">`;
        paginationData += `<a href="#">${lastPageNumber}</a>`;
    }
    if (page < lastPageNumber) {
        paginationData += `<a href="#">&raquo;</a>`;
    }

    let tableHTML = `
    <div id="paginationTop">
        <div class="pagLeft">
            # Rows per page:
            <select name="selectNumberRows" id="selectNumberRows">
                <option value="50" ${numItemsPerRow == 50 ? "selected" : ""}>50</option>
                <option value="100" ${numItemsPerRow == 100 ? "selected" : ""}>100</option>
                <option value="500" ${numItemsPerRow == 500 ? "selected" : ""}>500</option>
                <option value="1000" ${numItemsPerRow == 1000 ? "selected" : ""}>1000</option>
            </select>
        </div>
        <div class="pagRight">
            ${paginationData}
        </div>
    </div>
    <table><tbody>
        <tr>
            <th class="${sortNames[sortClassSym]}">Symbol (<a id="symType" href="#">${symbolType[useSymbolType]}</a>)</th>
            <th class="${sortNames[sortClassAddr]}">Address (CHN)</th>
            <th class="${sortNames[sortClassTime]}">Time added</th>
        </tr>
    </tbody></table>
    <div id="paginationBottom">
        <div class="pagRight">
            ${paginationData}
        </div>
    </div>`;
    document.getElementById("symbolTable").innerHTML = tableHTML;

    let tableRows = sorted.map(e => {
        return `<tr>
            <td>${useSymbolType == 0 ? e.symbol : useSymbolType == 1 ? e.symbol_dnv : e.symbol_d}</td>
            <td>0x${e.address.toString(16)}</td>
            <td>${e.time_added.toLocaleString()}</td>
        </tr>`;
    }).slice((page - 1) * numItemsPerRow, (page - 1) * numItemsPerRow + numItemsPerRow).join("");

    document.querySelector("tbody").innerHTML += tableRows;

    let headers = Array.from(document.querySelectorAll("#symbolTable th"));
    headers[0].addEventListener("click", e => {
        if (e.target == document.getElementById("symType")) {
            useSymbolType = (useSymbolType + 1) % 3;
            loadTableData(data, sortBy, sortAsc, page);
        } else {
            if (sortBy == "symbol") {
                loadTableData(data, "symbol", !sortAsc, 1);
            } else {
                loadTableData(data, "symbol", true, 1);
            }
        }
    });
    headers[1].addEventListener("click", () => {
        if (sortBy == "address") {
            loadTableData(data, "address", !sortAsc, 1);
        } else {
            loadTableData(data, "address", true, 1);
        }
    });
    headers[2].addEventListener("click", () => {
        if (sortBy == "time_added") {
            loadTableData(data, "time_added", !sortAsc, 1);
        } else {
            loadTableData(data, "time_added", false, 1);
        }
    });

    document.querySelectorAll(".pagRight input").forEach(e => {
        e.addEventListener("blur", e => {
            if (parseInt(e.target.value) == e.target.value) {
                loadTableData(data, sortBy, sortAsc, parseInt(e.target.value));
            }
        });
    });

    document.querySelectorAll(".pagRight a").forEach(e => {
        e.addEventListener("click", e => {
            console.log(e.target.innerHTML);
            if (e.target.innerHTML == "«") {
                page = Math.max(0, page - 1);
            } else if (e.target.innerHTML == "»") {
                page = Math.min(lastPageNumber, page + 1);
            } else {
                page = parseInt(e.target.innerText);
            }
            loadTableData(data, sortBy, sortAsc, page);
        });
    });

    document.getElementById("selectNumberRows").addEventListener("change", e => {
        numItemsPerRow = parseInt(e.target.value);
        loadTableData(data, sortBy, sortAsc, 1);
    });

    document.getElementById("symbolSearch").removeEventListener("keyup", searchListener);

    searchListener = e => {
        if (e.target.value.length >= 1) {
            symbolFilter = v => v.symbol.includes(escapeHtml(e.target.value));
            loadTableData(data, sortBy, sortAsc, page);
        }
        if (e.target.value.length == 0) {
            symbolFilter = () => true;
            loadTableData(data, sortBy, sortAsc, page);
        }
    };
    

    document.getElementById("jumpAddress").addEventListener("click", () => {
        let v = document.getElementById("addressInput").value.replace(/0x/, "");
        if (parseInt(v, 16).toString(16) == v) {
            // find address in data
            sortBy = "address";
            sortAsc = true;
            let newSort = sortData(filtered, sortBy, sortAsc);
            let index = newSort.findIndex(e => e.address == parseInt(v, 16));
            page = Math.floor(index / numItemsPerRow) + 1;
            loadTableData(data, sortBy, sortAsc, page);
        }
    });

    document.getElementById("symbolSearch").addEventListener("keyup", searchListener);
}

async function submitSymbol() {
    document.getElementById("submit").innerText = "Submitting...";
    let f = await fetch("submit_symbol?sym=" + document.getElementById("symbolInput").value);
    let t = await f.text();

    document.getElementById("submit").innerText = "Submit";

    if (t != "ok") {
        alert(t);
        return;
    }

    document.querySelector("table").innerHTML = "Loading...";
    loadSymbols();
}

document.getElementById("submit").addEventListener("click", submitSymbol);
document.getElementById("symbolInput").addEventListener("keypress", e => {
    if (e.key == "Enter") submitSymbol();
});

loadSymbols();