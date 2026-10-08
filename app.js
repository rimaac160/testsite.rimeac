(function () {
  var view = document.getElementById("view");
  var gate = document.getElementById("gate");
  var shell = document.getElementById("shell");
  var tab = "people";

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function apiBase() {
    var saved = window.RIMA_API || localStorage.getItem("rimaApi") || "";
    while (saved.length > 0 && saved.charAt(saved.length - 1) === "/") saved = saved.substring(0, saved.length - 1);
    return saved;
  }

  function api(method, path, body, done) {
    var base = apiBase();
    var xhr = new XMLHttpRequest();
    xhr.open(method, base + path, true);
    xhr.setRequestHeader("X-Rima", "1");
    if (body) xhr.setRequestHeader("Content-Type", "application/json");
    var token = sessionStorage.getItem("rimaToken");
    if (token) xhr.setRequestHeader("Authorization", "Bearer " + token);
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      var data = {};
      try { data = JSON.parse(xhr.responseText || "{}"); } catch (e) { data = {}; }
      if (xhr.status === 0) {
        done(0, { error: "Can't reach Rima Admin. Leave it open on this PC." });
        return;
      }
      if (xhr.status === 401 && path !== "/api/login") {
        sessionStorage.removeItem("rimaToken");
        showGate();
        return;
      }
      done(xhr.status, data);
    };
    xhr.send(body ? JSON.stringify(body) : null);
  }

  function when(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString();
  }

  function duration(scan) {
    var a = new Date(scan.startedAt);
    var b = new Date(scan.finishedAt);
    if (isNaN(a.getTime()) || isNaN(b.getTime())) return "—";
    var s = Math.max(0, Math.round((b.getTime() - a.getTime()) / 1000));
    var m = Math.floor(s / 60);
    var r = s % 60;
    return m + "m " + (r < 10 ? "0" : "") + r + "s";
  }

  function showGate() {
    gate.hidden = false;
    shell.hidden = true;
  }

  function showShell() {
    gate.hidden = true;
    shell.hidden = false;
    applyRole();
    openTab(tab);
  }

  function role() {
    return sessionStorage.getItem("rimaRole") || "owner";
  }

  function applyRole() {
    var owner = role() === "owner";
    var buttons = document.querySelectorAll(".nav");
    for (var i = 0; i < buttons.length; i++) {
      var name = buttons[i].getAttribute("data-tab");
      if (name === "subs" || name === "settings") buttons[i].style.display = owner ? "" : "none";
    }
    var group = document.querySelector(".group");
    if (group) group.textContent = owner ? "Owner" : "Customer";
    if (!owner && (tab === "subs" || tab === "settings")) tab = "people";
  }

  function openTab(name) {
    tab = name;
    var buttons = document.querySelectorAll(".nav");
    for (var i = 0; i < buttons.length; i++) {
      if (!buttons[i].getAttribute("data-tab")) continue;
      buttons[i].className = buttons[i].getAttribute("data-tab") === name ? "nav on" : "nav";
    }
    if (name === "people") loadPeople();
    else if (name === "codes") loadCodes();
    else if (name === "subs") loadSubs();
    else loadSettings();
  }

  function crumb(parts) {
    var box = el("div", "crumb");
    for (var i = 0; i < parts.length; i++) {
      if (i) box.appendChild(document.createTextNode("  /  "));
      if (i === parts.length - 1) box.appendChild(el("b", null, parts[i]));
      else box.appendChild(document.createTextNode(parts[i]));
    }
    return box;
  }

  function loadPeople() {
    view.innerHTML = "";
    view.appendChild(crumb(["Dashboard", "Results"]));
    var head = el("div", "panel");
    head.appendChild(el("h1", null, "Scan results"));
    head.appendChild(el("p", "lede", role() === "owner" ? "Every scan lands here. Customers only see their own codes." : "Scans from the codes you generated."));
    view.appendChild(head);
    if (role() !== "owner") view.appendChild(discordCard());
    var list = el("div", "panel hits");
    list.style.marginTop = "16px";
    view.appendChild(list);
    api("GET", "/api/users", null, function (status, data) {
      var users = data.users || [];
      list.innerHTML = "";
      if (status !== 200) {
        list.appendChild(el("p", "empty", data.error || "Couldn't load results."));
        return;
      }
      if (!users.length) {
        list.appendChild(el("p", "empty", "No scans yet."));
        return;
      }
      for (var i = 0; i < users.length; i++) list.appendChild(personRow(users[i]));
    });
  }

  function personRow(user) {
    var button = el("button", "person");
    button.type = "button";
    var left = el("div");
    left.appendChild(el("strong", null, user.name || user.userName || "Unknown"));
    left.appendChild(el("div", "meta", (user.discord || "Discord unknown") + "  ·  " + (user.steamSummary || "Steam unknown")));
    left.appendChild(el("div", "meta", (user.lastIp || "No IP") + (user.localIps ? "  ·  " + user.localIps : "")));
    var count = user.lastDetections || 0;
    var risk = typeof user.lastRisk === "number" ? user.lastRisk : 0;
    var right = el("div");
    right.appendChild(el("div", count ? "tag" : "tag calm", count ? "CHEATING" : "CLEAN"));
    right.appendChild(el("div", "meta", "Risk " + risk));
    button.appendChild(left);
    button.appendChild(right);
    button.onclick = function () { loadPerson(user.id); };
    return button;
  }

  function loadPerson(id) {
    view.innerHTML = "";
    var back = el("button", "back", "Dashboard");
    back.type = "button";
    back.onclick = function () { openTab("people"); };
    view.appendChild(back);
    api("GET", "/api/users/" + encodeURIComponent(id), null, function (status, data) {
      if (status !== 200 || !data.user) {
        view.appendChild(el("p", "empty", data.error || "That person was not found."));
        return;
      }
      var user = data.user;
      var scans = data.scans || [];
      var scan = scans.length ? scans[0] : null;
      var findings = scan && scan.findings ? scan.findings : [];
      var cheating = findings.length > 0;
      view.appendChild(crumb(["Dashboard", "Results", user.name || user.userName || "Scan"]));
      var hero = el("div", "hero");
      var left = el("section", "panel");
      left.appendChild(el("h1", null, "Scan results"));
      left.appendChild(el("p", "lede", "What was on this PC."));
      var metrics = el("div", "metrics");
      metrics.appendChild(metric("Code", scan && scan.code ? scan.code : "—"));
      metrics.appendChild(metric("Scan duration", scan ? duration(scan) : "—"));
      left.appendChild(metrics);
      var pills = el("div", "pills");
      pills.appendChild(el("span", "pill", "GAME  " + ((scan && scan.game) || user.game || "FiveM")));
      pills.appendChild(el("span", "pill", when(scan ? scan.receivedAt : user.lastSeen)));
      left.appendChild(pills);
      var risk = scan && typeof scan.risk === "number" ? scan.risk : (user.lastRisk || 0);
      var verdict = el("section", cheating || risk >= 60 ? "panel verdict bad" : "panel verdict good");
      verdict.appendChild(el("div", "shield", "▣"));
      verdict.appendChild(el("strong", "risk-num", String(risk)));
      verdict.appendChild(el("span", null, "RISK  " + ((scan && scan.riskLabel) || user.lastRiskLabel || "")));
      verdict.appendChild(el("strong", "word", cheating ? "CHEATING" : "CLEAN"));
      verdict.appendChild(el("span", null, cheating ? (findings.length === 1 ? "1 cheat file" : findings.length + " cheat files") : "No cheat files"));
      if (scan && scan.discordNote) verdict.appendChild(el("span", null, scan.discordNote));
      hero.appendChild(left);
      hero.appendChild(verdict);
      view.appendChild(hero);

      var grid = el("div", "grid");
      var overview = el("section", "panel");
      overview.appendChild(el("p", "kicker", "Scan overview"));
      var stats = el("div", "stats");
      stats.appendChild(stat(cheating ? "hot" : "", "Detections", String(findings.length)));
      stats.appendChild(stat("", "Steam", String(scan ? scan.steamAccounts : user.steamAccounts || 0)));
      stats.appendChild(stat("", "Scans", String(user.scans || scans.length || 0)));
      overview.appendChild(stats);
      var info = el("section", "panel");
      info.appendChild(el("p", "kicker", "PC information"));
      var rows = el("div", "rows");
      rows.appendChild(infoRow("Discord", (scan && scan.discord) || user.discord || "Unknown"));
      rows.appendChild(infoRow("Steam", (scan && scan.steamSummary) || user.steamSummary || "Unknown"));
      rows.appendChild(infoRow("IP", (scan && scan.ip) || user.lastIp || "Unknown"));
      rows.appendChild(infoRow("PC address", (scan && scan.localIps) || user.localIps || "Not sent"));
      rows.appendChild(infoRow("System", (scan && scan.os) || user.os || "Windows"));
      rows.appendChild(infoRow("Computer", user.computerName || ""));
      rows.appendChild(infoRow("Account", user.userName || ""));
      rows.appendChild(infoRow("Game", (scan && scan.game) || user.game || "—"));
      info.appendChild(rows);
      grid.appendChild(overview);
      grid.appendChild(info);
      view.appendChild(grid);

      var det = el("section", "panel");
      det.style.marginTop = "16px";
      det.appendChild(el("p", "kicker", "Detection results"));
      if (!findings.length) det.appendChild(el("p", "lede", "No cheat files found."));
      var hits = el("div", "hits");
      for (var i = 0; i < findings.length; i++) {
        var row = el("div", "hit");
        var text = el("div");
        text.appendChild(el("p", null, findings[i].category || "Cheat file"));
        text.appendChild(el("p", "path", findings[i].path || ""));
        row.appendChild(text);
        row.appendChild(el("span", "tag", "Cheat"));
        hits.appendChild(row);
      }
      det.appendChild(hits);
      view.appendChild(det);
      var reasons = scan && scan.reasons ? scan.reasons : [];
      if (reasons.length) {
        var riskBox = el("section", "panel");
        riskBox.style.marginTop = "16px";
        riskBox.appendChild(el("p", "kicker", "Risk"));
        for (var r = 0; r < reasons.length; r++) riskBox.appendChild(el("p", "lede", reasons[r]));
        view.appendChild(riskBox);
      }

      if (scans.length > 1) {
        var older = el("section", "panel");
        older.style.marginTop = "16px";
        older.appendChild(el("p", "kicker", "Earlier scans"));
        for (var n = 1; n < scans.length; n++) older.appendChild(olderScan(scans[n]));
        view.appendChild(older);
      }
    });
  }

  function metric(label, value) {
    var box = el("div", "metric");
    box.appendChild(el("span", "kicker", label));
    box.appendChild(el("b", null, value));
    return box;
  }

  function stat(kind, label, value) {
    var box = el("div", kind ? "stat " + kind : "stat");
    box.appendChild(el("span", "kicker", label));
    box.appendChild(el("b", null, value));
    return box;
  }

  function infoRow(label, value) {
    var row = el("div", "row");
    row.appendChild(el("span", null, label));
    row.appendChild(el("b", null, value));
    return row;
  }

  function olderScan(scan) {
    var findings = scan.findings || [];
    var box = el("div", "hit");
    var text = el("div");
    text.appendChild(el("p", null, when(scan.receivedAt) + "  ·  " + (scan.code || "")));
    text.appendChild(el("p", "path", (scan.discord || "") + "  ·  " + (scan.steamSummary || "") + "  ·  " + (findings.length ? findings.length + " cheat files" : "No cheat files")));
    box.appendChild(text);
    return box;
  }

  function loadCodes() {
    view.innerHTML = "";
    view.appendChild(crumb(["Dashboard", "Codes"]));
    var panel = el("section", "panel");
    panel.appendChild(el("h1", null, "Codes"));
    panel.appendChild(el("p", "lede", role() === "owner" ? "Give them the code and Rima.exe. The code works once." : "You can make 30 codes a day. Each code works once."));
    if (role() !== "owner") {
      api("GET", "/api/me", null, function (status, data) {
        if (status === 200) panel.insertBefore(el("p", "lede", (data.madeToday || 0) + " of " + (data.dailyLimit || 30) + " codes today. " + (data.daysLeft || 0) + " days left."), form);
      });
    }
    var form = el("div", "split");
    var note = document.createElement("input");
    note.placeholder = "Note";
    var ttl = document.createElement("input");
    ttl.type = "number";
    ttl.min = "5";
    ttl.value = "30";
    var button = el("button", "btn slim", "Generate");
    button.type = "button";
    form.appendChild(note);
    form.appendChild(ttl);
    form.appendChild(button);
    panel.appendChild(form);
    var msg = el("p", "msg");
    panel.appendChild(msg);
    var list = el("div", "hits");
    panel.appendChild(list);
    view.appendChild(panel);
    function refresh() {
      api("GET", "/api/codes", null, function (status, data) {
        list.innerHTML = "";
        var codes = data.codes || [];
        if (!codes.length) {
          list.appendChild(el("p", "empty", "No codes yet."));
          return;
        }
        for (var i = 0; i < codes.length; i++) list.appendChild(codeRow(codes[i], refresh));
      });
    }
    button.onclick = function () {
      msg.textContent = "";
      api("POST", "/api/codes", { note: note.value, ttlMinutes: parseInt(ttl.value, 10) || 30 }, function (status, data) {
        if (status !== 200) {
          msg.className = "msg";
          msg.textContent = data.error || "Couldn't create a code.";
          return;
        }
        msg.className = "msg ok";
        msg.textContent = data.code && data.code.code ? data.code.code : "Created.";
        note.value = "";
        refresh();
      });
    };
    refresh();
  }

  function codeRow(code, refresh) {
    var row = el("div", "hit");
    var left = el("div");
    left.appendChild(el("p", null, code.code || ""));
    left.appendChild(el("p", "path", (code.note || "No note") + "  ·  " + (code.status || "")));
    var right = el("div");
    var copy = el("button", "nav", "Copy");
    copy.type = "button";
    copy.onclick = function () { copyText(code.code || ""); };
    right.appendChild(copy);
    if (!code.revoked && !code.usedAt) {
      var revoke = el("button", "nav", "Revoke");
      revoke.type = "button";
      revoke.onclick = function () {
        api("POST", "/api/codes/revoke", { code: code.code }, function () { refresh(); });
      };
      right.appendChild(revoke);
    }
    row.appendChild(left);
    row.appendChild(right);
    return row;
  }

  function copyText(text) {
    var box = document.createElement("textarea");
    box.value = text;
    document.body.appendChild(box);
    box.select();
    try { document.execCommand("copy"); } catch (e) {}
    document.body.removeChild(box);
  }

  function loadSettings() {
    view.innerHTML = "";
    view.appendChild(crumb(["Dashboard", "Settings"]));
    var panel = el("section", "panel");
    panel.appendChild(el("h1", null, "Settings"));
    view.appendChild(panel);
    api("GET", "/api/settings", null, function (status, data) {
      if (status !== 200) {
        panel.appendChild(el("p", "empty", data.error || "Couldn't load settings."));
        return;
      }
      panel.appendChild(el("p", "lede", "Rima.exe sends scans to " + (data.bakedUrl || "this PC") + "."));
      panel.appendChild(el("p", "lede", data.reach || ""));
      if (data.checkerDownload) {
        var link = document.createElement("a");
        link.className = "ghost";
        link.href = apiBase() + "/download/Rima.exe";
        link.textContent = "Download Rima.exe";
        panel.appendChild(link);
      }
      var current = document.createElement("input");
      current.type = "password";
      current.placeholder = "Current passcode";
      var next = document.createElement("input");
      next.type = "password";
      next.placeholder = "New passcode";
      var again = document.createElement("input");
      again.type = "password";
      again.placeholder = "Repeat new passcode";
      var savePass = el("button", "btn slim", "Update passcode");
      savePass.type = "button";
      var passMsg = el("p", "msg");
      var passBox = el("div", "stack");
      passBox.appendChild(current);
      passBox.appendChild(next);
      passBox.appendChild(again);
      passBox.appendChild(savePass);
      passBox.appendChild(passMsg);
      panel.appendChild(passBox);
      savePass.onclick = function () {
        passMsg.textContent = "";
        passMsg.className = "msg";
        if (next.value !== again.value) {
          passMsg.textContent = "The new passcodes don't match.";
          return;
        }
        api("POST", "/api/passcode", { current: current.value, next: next.value }, function (code, body) {
          if (code !== 200) {
            passMsg.textContent = body.error || "Couldn't update the passcode.";
            return;
          }
          passMsg.className = "msg ok";
          passMsg.textContent = "Passcode updated.";
          current.value = "";
          next.value = "";
          again.value = "";
        });
      };
      var port = document.createElement("input");
      port.type = "number";
      port.value = data.port || 8787;
      var ttl = document.createElement("input");
      ttl.type = "number";
      ttl.value = data.defaultTtlMinutes || 30;
      var pub = document.createElement("input");
      pub.value = data.publicUrl || "";
      pub.placeholder = "https://rima.yourdomain.com";
      var token = document.createElement("input");
      token.type = "password";
      token.placeholder = data.tunnelTokenSet ? "(saved) paste a new token to replace it" : "Cloudflare tunnel token";
      if (data.tunnelTokenSet) token.value = "(saved)";
      var save = el("button", "btn slim", "Save");
      save.type = "button";
      var setMsg = el("p", "msg");
      var box = el("div", "stack");
      box.appendChild(labeled("Port", port));
      box.appendChild(labeled("Code lifetime in minutes", ttl));
      box.appendChild(el("p", "lede", "Permanent address: buy a cheap domain, put it on Cloudflare, make a Tunnel, point the hostname to http://127.0.0.1:" + (data.port || 8787) + ", then paste the https address and tunnel token below. After that the address stays the same."));
      box.appendChild(labeled("Permanent https address", pub));
      box.appendChild(labeled("Cloudflare tunnel token", token));
      box.appendChild(save);
      box.appendChild(setMsg);
      panel.appendChild(box);
      save.onclick = function () {
        var tokenValue = token.value;
        if (tokenValue === "(saved)") tokenValue = "(saved)";
        api("POST", "/api/settings", { port: parseInt(port.value, 10), defaultTtlMinutes: parseInt(ttl.value, 10), publicUrl: pub.value, tunnelToken: tokenValue }, function (code, body) {
          setMsg.className = code === 200 ? "msg ok" : "msg";
          if (code !== 200) setMsg.textContent = body.error || "Couldn't save.";
          else setMsg.textContent = "Saved. Close Rima Admin and open it again.";
        });
      };
    });
  }

  function discordCard() {
    var panel = el("section", "panel");
    panel.style.marginTop = "16px";
    panel.appendChild(el("p", "kicker", "Your Discord webhook"));
    panel.appendChild(el("p", "lede", "Paste the webhook from your Discord channel. Scans from your codes are sent there."));
    var row = el("div", "split");
    row.style.gridTemplateColumns = "1fr auto";
    var input = document.createElement("input");
    input.placeholder = "https://discord.com/api/webhooks/...";
    input.maxLength = 400;
    var button = el("button", "btn slim", "Save");
    button.type = "button";
    var msg = el("p", "msg");
    row.appendChild(input);
    row.appendChild(button);
    panel.appendChild(row);
    panel.appendChild(msg);
    api("GET", "/api/me", null, function (status, data) {
      if (status === 200 && data.webhookSet) input.placeholder = "Webhook saved. Paste a new one to replace it.";
    });
    button.onclick = function () {
      api("POST", "/api/me/discord", { webhook: input.value }, function (status, data) {
        msg.className = status === 200 ? "msg ok" : "msg";
        msg.textContent = status === 200 ? (input.value ? "Saved. New scans will go to this webhook." : "Webhook cleared.") : (data.error || "Couldn't save that webhook.");
      });
    };
    return panel;
  }

  function loadSubs() {
    view.innerHTML = "";
    view.appendChild(crumb(["Dashboard", "Subscriptions"]));
    var panel = el("section", "panel");
    panel.appendChild(el("h1", null, "Subscriptions"));
    panel.appendChild(el("p", "lede", "A key lasts 30 days. Send the key and Rima.exe. They activate it, then make up to 30 scan codes a day."));
    var form = el("div", "split");
    var note = document.createElement("input");
    note.placeholder = "Buyer name";
    var button = el("button", "btn slim", "Make 30-day key");
    button.type = "button";
    form.appendChild(note);
    form.appendChild(button);
    panel.appendChild(form);
    var msg = el("p", "msg");
    panel.appendChild(msg);
    var list = el("div", "hits");
    panel.appendChild(list);
    view.appendChild(panel);
    function refresh() {
      api("GET", "/api/subscriptions", null, function (status, data) {
        list.innerHTML = "";
        var rows = data.subscriptions || [];
        if (!rows.length) {
          list.appendChild(el("p", "empty", "No keys yet."));
          return;
        }
        for (var i = 0; i < rows.length; i++) {
          var row = el("div", "hit");
          var left = el("div");
          var sub = rows[i];
          left.appendChild(el("p", null, sub.key || ""));
          left.appendChild(el("p", "path", (sub.note || "No name") + "  ·  until " + when(sub.expiresAt) + (sub.webhookSet ? "  ·  webhook set" : "  ·  no webhook") + (sub.revoked ? "  ·  revoked" : "")));
          row.appendChild(left);
          if (!sub.revoked) {
            var revoke = el("button", "btn slim", "Revoke");
            revoke.type = "button";
            (function (key, button) {
              button.onclick = function () {
                api("POST", "/api/subscriptions/revoke", { passcode: key }, function () { refresh(); });
              };
            })(sub.key, revoke);
            row.appendChild(revoke);
          }
          list.appendChild(row);
        }
      });
    }
    button.onclick = function () {
      msg.textContent = "";
      api("POST", "/api/subscriptions", { note: note.value }, function (status, data) {
        if (status !== 200 || !data.subscription) {
          msg.className = "msg";
          msg.textContent = data.error || "Couldn't make a key.";
          return;
        }
        msg.className = "msg ok";
        msg.textContent = data.subscription.key;
        note.value = "";
        refresh();
      });
    };
    refresh();
  }

  function labeled(text, input) {
    var box = el("label", "field");
    box.appendChild(el("span", null, text));
    box.appendChild(input);
    return box;
  }

  var apiInput = document.getElementById("apiBase");
  if (apiInput) apiInput.value = localStorage.getItem("rimaApi") || "";

  document.getElementById("gateForm").onsubmit = function (event) {
    event.preventDefault();
    var msg = document.getElementById("gateMsg");
    msg.textContent = "";
    if (apiInput) {
      var raw = (apiInput.value || "").replace(/^\s+|\s+$/g, "");
      if (!raw) {
        msg.textContent = "Paste the address from Rima Admin.";
        return;
      }
      if (raw.indexOf("https://") !== 0 && raw.indexOf("http://") !== 0) {
        msg.textContent = "The address needs to start with https://";
        return;
      }
      while (raw.length > 0 && raw.charAt(raw.length - 1) === "/") raw = raw.substring(0, raw.length - 1);
      localStorage.setItem("rimaApi", raw);
    }
    api("POST", "/api/login", { passcode: document.getElementById("pass").value }, function (status, data) {
      if (status !== 200 || !data.token) {
        msg.textContent = data.error || (status === 0 ? "Can't reach Rima Admin. Leave it open on this PC." : "Wrong key.");
        return;
      }
      sessionStorage.setItem("rimaToken", data.token);
      sessionStorage.setItem("rimaRole", data.role || "owner");
      document.getElementById("pass").value = "";
      showShell();
    });
  };

  document.getElementById("leave").onclick = function () {
    api("POST", "/api/logout", {}, function () {
      sessionStorage.removeItem("rimaToken");
      sessionStorage.removeItem("rimaRole");
      showGate();
    });
  };

  var nav = document.querySelectorAll(".nav");
  for (var i = 0; i < nav.length; i++) {
    if (!nav[i].getAttribute("data-tab")) continue;
    nav[i].onclick = function () { openTab(this.getAttribute("data-tab")); };
  }

  if (sessionStorage.getItem("rimaToken")) showShell();
})();
