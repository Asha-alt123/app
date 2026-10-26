(function () {
  var form = document.getElementById("user-form");
  var nameEl = document.getElementById("name");
  var emailEl = document.getElementById("email");
  var nameErr = document.getElementById("name-error");
  var emailErr = document.getElementById("email-error");
  var submitBtn = document.getElementById("submit-btn");
  var statusEl = document.getElementById("status");

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function setStatus(msg, kind) {
    statusEl.textContent = msg;
    statusEl.className = "status" + (kind ? " " + kind : "");
  }

  function setError(input, msgEl, msg) {
    msgEl.textContent = msg;
    if (msg) input.setAttribute("aria-invalid", "true");
    else input.removeAttribute("aria-invalid");
  }

  function validate() {
    var ok = true;
    var name = nameEl.value.trim();
    var email = emailEl.value.trim();
    if (name.length < 2) { setError(nameEl, nameErr, "Enter your full name."); ok = false; }
    else setError(nameEl, nameErr, "");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      setError(emailEl, emailErr, "Enter a valid email address, like name@example.com.");
      ok = false;
    } else setError(emailEl, emailErr, "");
    return ok;
  }

  nameEl.addEventListener("input", function () { if (nameEl.hasAttribute("aria-invalid")) validate(); });
  emailEl.addEventListener("input", function () { if (emailEl.hasAttribute("aria-invalid")) validate(); });

  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    setStatus("");
    if (!validate()) return;

    submitBtn.disabled = true;
    fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: nameEl.value.trim(), email: emailEl.value.trim() })
    })
      .then(function (res) {
        return res.json().then(function (data) { return { ok: res.ok, data: data }; });
      })
      .then(function (r) {
        if (!r.ok) {
          if (r.data.field === "name") setError(nameEl, nameErr, r.data.error);
          else if (r.data.field === "email") setError(emailEl, emailErr, r.data.error);
          else setStatus(r.data.error || "Could not save the entry.", "bad");
          return;
        }
        form.reset();
        nameEl.focus();
        setStatus("Thank you! Your details have been saved.", "ok");
      })
      .catch(function () {
        setStatus("Could not reach the server. Check your connection and try again.", "bad");
      })
      .then(function () { submitBtn.disabled = false; });
  });

})();
