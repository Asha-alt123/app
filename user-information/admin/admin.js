(function () {
  var statusEl = document.getElementById("status");
  var rowsEl = document.getElementById("rows");
  var countEl = document.getElementById("count");
  var refreshBtn = document.getElementById("refresh-btn");

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function formatDate(value) {
    var d = new Date(value);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleString("en-IN", {
      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
    });
  }

  function render(users) {
    rowsEl.textContent = "";
    countEl.textContent = users.length;
    if (users.length === 0) {
      var tr = el("tr");
      var td = el("td", "empty", "No entries yet.");
      td.colSpan = 4;
      tr.appendChild(td);
      rowsEl.appendChild(tr);
      return;
    }
    users.forEach(function (u) {
      var tr = el("tr");
      tr.appendChild(el("td", "num", String(u.id)));
      tr.appendChild(el("td", "", u.name));
      tr.appendChild(el("td", "email", u.email));
      tr.appendChild(el("td", "when", formatDate(u.created_at)));
      rowsEl.appendChild(tr);
    });
  }

  function loadUsers() {
    return fetch("/api/users", { credentials: "same-origin" })
      .then(function (res) {
        if (!res.ok) throw new Error("load failed");
        return res.json();
      })
      .then(render)
      .catch(function () {
        if (statusEl) { statusEl.textContent = "Could not load entries. Try Refresh."; statusEl.className = "status bad"; }
      });
  }

  refreshBtn.addEventListener("click", loadUsers);
  loadUsers();
})();
