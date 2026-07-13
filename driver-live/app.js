(() => {
  "use strict";

  const cfg = window.FP365_CONFIG || {};
  const hasSupabaseConfig =
    cfg.SUPABASE_URL &&
    cfg.SUPABASE_ANON_KEY &&
    !cfg.SUPABASE_URL.includes("PASTE_") &&
    !cfg.SUPABASE_ANON_KEY.includes("PASTE_");

  const supabaseClient = hasSupabaseConfig
    ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY)
    : null;

  const state = {
    screen: "login",
    history: [],
    user: JSON.parse(localStorage.getItem("fp365_user") || "null"),
    draft: JSON.parse(localStorage.getItem("fp365_draft") || "null"),
    entries: JSON.parse(localStorage.getItem("fp365_entries") || "[]"),
    current: null
  };

  const equipment = {
    "53": {
      label: "53’ Trailer",
      photos: [
        "Fifth wheel plate connected",
        "Landing gear raised",
        "Air, brake, and electrical lines connected"
      ]
    },
    doubles: {
      label: "Doubles",
      photos: [
        "Fifth wheel plate connected to Trailer 1",
        "Trailer 1 landing gear raised",
        "Pintle hook connected and closed",
        "Safety chains connected",
        "Air, brake, and electrical lines connected",
        "Fifth wheel plate connected to Trailer 2",
        "Trailer 2 landing gear raised"
      ]
    },
    pup: {
      label: "Single Pup",
      photos: [
        "Fifth wheel plate connected",
        "Landing gear raised",
        "Air, brake, and electrical lines connected"
      ]
    },
    bobtail: { label: "Bobtail", photos: [] }
  };

  const main = document.getElementById("main");
  const title = document.getElementById("screenTitle");
  const backBtn = document.getElementById("backBtn");
  const homeBtn = document.getElementById("homeBtn");
  const modal = document.getElementById("modal");

  function esc(s = "") {
    return String(s).replace(/[&<>"']/g, c => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
    })[c]);
  }

  function showModal(t, body) {
    document.getElementById("modalTitle").textContent = t;
    document.getElementById("modalBody").innerHTML = body;
    modal.showModal();
  }

  function navigate(screen, push = true) {
    if (push && state.screen !== screen) state.history.push(state.screen);
    state.screen = screen;
    render();
  }

  function goBack() {
    const prev = state.history.pop();
    if (prev) { state.screen = prev; render(); }
  }

  function goHome() {
    state.history = [];
    state.screen = state.user ? "home" : "login";
    render();
  }

  backBtn.onclick = goBack;
  homeBtn.onclick = goHome;
  document.getElementById("feedbackFooter").onclick = () => navigate("feedback");

  function header(name) {
    title.textContent = name;
    backBtn.classList.toggle("hidden", state.screen === "login" || state.screen === "home");
    homeBtn.classList.toggle("hidden", state.screen === "login" || state.screen === "home");
  }

  function render() {
    const map = {
      login: renderLogin, home: renderHome, newEntry: renderNewEntry,
      inspection: renderInspection, checklist: renderChecklist,
      entries: renderEntries, endShift: renderEndShift, feedback: renderFeedback,
      profile: renderProfile
    };
    (map[state.screen] || renderLogin)();
  }

  function renderLogin() {
    header("Driver Login");
    main.innerHTML = `
      <section class="card hero">
        <span class="badge">Mobile-first driver application</span>
        <h1>Every connection.<br>Every inspection.<br>Every day.</h1>
        <p>Secure driver documentation, required photos, saved entries, and end-of-shift reporting.</p>
      </section>
      <section class="card">
        <label>Employer ID</label>
        <input id="employeeId" autocomplete="username" placeholder="Enter employer ID" />
        <label>Password</label>
        <input id="password" type="password" autocomplete="current-password" placeholder="Enter password" />
        <button id="loginBtn" class="primary" style="margin-top:16px">Log In</button>
        <button id="forgotBtn" class="text-btn" style="width:100%;margin-top:8px">Forgot password?</button>
        <p class="field-help">Demo/testing mode accepts any employer ID and password. Connect Supabase Auth before production use.</p>
      </section>`;
    document.getElementById("loginBtn").onclick = () => {
      const id = document.getElementById("employeeId").value.trim();
      const pass = document.getElementById("password").value;
      if (!id || !pass) return showModal("Missing information", "<p>Employer ID and password are required.</p>");
      state.user = { full_name: id === "demo" ? "Steven Arbucci" : `Driver ${id}`, employee_id: id, email: "" };
      localStorage.setItem("fp365_user", JSON.stringify(state.user));
      navigate("home", false);
    };
    document.getElementById("forgotBtn").onclick = () =>
      showModal("Password reset", "<p>Production reset will send a secure reset link after Supabase Auth and the driver roster are connected.</p>");
  }

  function renderHome() {
    header("Driver Home");
    const name = state.user?.full_name || "Driver";
    main.innerHTML = `
      <section class="card hero">
        <span class="badge">Logged in</span>
        <h1>Welcome, ${esc(name)}</h1>
        <p>${esc(state.user?.employee_id || "")}</p>
      </section>
      ${state.draft ? `<div class="alert">You have a saved entry in progress.</div>` : ""}
      <section class="grid">
        <button id="newBtn" class="choice"><strong>New Entry</strong><span>Start a new inspection or bobtail record</span></button>
        ${state.draft ? `<button id="continueBtn" class="choice"><strong>Continue Saved Entry</strong><span>Resume your unfinished entry</span></button>` : ""}
        <button id="entriesBtn" class="choice"><strong>View Entries</strong><span>View only your submitted records</span></button>
        <button id="endBtn" class="choice"><strong>End of Shift</strong><span>Complete checklist and email your daily PDF</span></button>
        <button id="profileBtn" class="choice"><strong>Driver Profile</strong><span>Review your roster information</span></button>
        <button id="logoutBtn" class="danger">Log Out</button>
      </section>`;
    document.getElementById("newBtn").onclick = () => navigate("newEntry");
    if (state.draft) document.getElementById("continueBtn").onclick = () => {
      state.current = state.draft;
      navigate("inspection");
    };
    document.getElementById("entriesBtn").onclick = () => navigate("entries");
    document.getElementById("endBtn").onclick = () => navigate("endShift");
    document.getElementById("profileBtn").onclick = () => navigate("profile");
    document.getElementById("logoutBtn").onclick = () => navigate("endShift");
  }

  function renderNewEntry() {
    header("New Entry");
    main.innerHTML = `
      <section class="card">
        <h2>Select equipment type</h2>
        <div class="grid">
          ${Object.entries(equipment).map(([key,val]) => `
            <button class="choice equip" data-key="${key}">
              <strong>${esc(val.label)}</strong>
              <span>${key === "bobtail" ? "Tractor movement without trailer" : "Connection and inspection documentation"}</span>
            </button>`).join("")}
        </div>
      </section>`;
    document.querySelectorAll(".equip").forEach(btn => btn.onclick = () => {
      const type = btn.dataset.key;
      state.current = {
        id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
        type,
        created_at: new Date().toISOString(),
        truck: "",
        trailer1: "",
        trailer2: "",
        dolly: "",
        from: "",
        to: "",
        notes: "",
        bypass: false,
        bypass_reason: "",
        photos: {},
        certified: false
      };
      navigate("inspection");
    });
  }

  function renderInspection() {
    header(equipment[state.current.type].label);
    const c = state.current;
    const photoList = equipment[c.type].photos;
    main.innerHTML = `
      <section class="card">
        <h2>Trip and equipment details</h2>
        <p class="field-help">Every field is required. Enter NA where it legitimately does not apply.</p>
        ${field("Truck number","truck",c.truck)}
        ${c.type !== "bobtail" ? field("Trailer 1 number","trailer1",c.trailer1) : ""}
        ${c.type === "doubles" ? field("Dolly number","dolly",c.dolly) + field("Trailer 2 number","trailer2",c.trailer2) : ""}
        ${field("Location From","from",c.from)}
        ${field("Location To","to",c.to)}
        <label>Notes</label><textarea id="notes" placeholder="Enter notes or NA">${esc(c.notes)}</textarea>
      </section>
      ${photoList.length ? `
      <section class="card">
        <h2>Required photos</h2>
        <p class="field-help">Take or upload each required photo. Additional photos are allowed.</p>
        ${photoList.map((p,i) => `
          <div class="photo-item">
            <div><strong>${esc(p)}</strong><div id="status-${i}" class="status ${c.photos[i] ? "ok":"missing"}">${c.photos[i] ? "Added":"Required"}</div></div>
            <input class="photo" data-index="${i}" type="file" accept="image/*" capture="environment" />
          </div>`).join("")}
        <label>Additional photos</label>
        <input id="extraPhotos" type="file" accept="image/*" capture="environment" multiple />
      </section>` : ""}
      <section class="card">
        <div class="check">
          <input id="bypass" type="checkbox" ${c.bypass ? "checked":""} />
          <div><strong>Bypass a required item</strong><div class="field-help">Creates a red flag and requires an explanation.</div></div>
        </div>
        <div id="bypassWrap" style="${c.bypass ? "":"display:none"}">
          <label>Bypass explanation</label>
          <textarea id="bypassReason">${esc(c.bypass_reason)}</textarea>
        </div>
      </section>
      <div class="grid two">
        <button id="saveBtn" class="secondary">Save Entry</button>
        <button id="nextBtn" class="primary">Continue</button>
      </div>`;
    bindCurrentFields();
    document.getElementById("bypass").onchange = e => {
      document.getElementById("bypassWrap").style.display = e.target.checked ? "" : "none";
    };
    document.querySelectorAll(".photo").forEach(inp => inp.onchange = e => {
      if (e.target.files[0]) {
        c.photos[e.target.dataset.index] = { name:e.target.files[0].name, size:e.target.files[0].size };
        const s = document.getElementById(`status-${e.target.dataset.index}`);
        s.textContent = "Added"; s.className = "status ok";
      }
    });
    document.getElementById("saveBtn").onclick = () => {
      syncCurrent();
      state.draft = state.current;
      localStorage.setItem("fp365_draft", JSON.stringify(state.draft));
      showModal("Entry saved", "<p>You can safely return later using Continue Saved Entry.</p>");
    };
    document.getElementById("nextBtn").onclick = () => {
      syncCurrent();
      const missing = validateCurrent();
      if (missing.length) return showModal("Complete required items", `<p>${missing.map(esc).join("<br>")}</p>`);
      navigate("checklist");
    };
  }

  function field(labelText, id, value) {
    return `<label>${labelText}</label><input id="${id}" value="${esc(value)}" placeholder="${labelText} or NA" />`;
  }

  function bindCurrentFields() {}

  function syncCurrent() {
    const ids = ["truck","trailer1","trailer2","dolly","from","to","notes"];
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) state.current[id] = el.value.trim();
    });
    const bypass = document.getElementById("bypass");
    state.current.bypass = !!bypass?.checked;
    const reason = document.getElementById("bypassReason");
    state.current.bypass_reason = reason ? reason.value.trim() : "";
  }

  function validateCurrent() {
    const c = state.current, missing = [];
    ["truck","from","to","notes"].forEach(k => { if (!c[k]) missing.push(k); });
    if (c.type !== "bobtail" && !c.trailer1) missing.push("trailer1");
    if (c.type === "doubles") ["dolly","trailer2"].forEach(k => { if (!c[k]) missing.push(k); });
    if (!c.bypass) {
      equipment[c.type].photos.forEach((_,i) => { if (!c.photos[i]) missing.push(`photo ${i+1}`); });
    } else if (!c.bypass_reason) missing.push("bypass explanation");
    return missing;
  }

  function renderChecklist() {
    header("Quick Pre-Trip Checklist");
    const items = [
      "Equipment numbers and locations are correct",
      "Connection points are secure",
      "Landing gear is raised where required",
      "Air, brake, and electrical lines are connected",
      "Required photos are clear and complete",
      "This entry is complete and accurate"
    ];
    main.innerHTML = `
      <section class="card">
        <h2>Driver certification</h2>
        ${items.map((x,i)=>`<label class="check"><input class="cert" type="checkbox" data-i="${i}"><span>${esc(x)}</span></label>`).join("")}
      </section>
      <button id="submitBtn" class="primary">Submit Entry</button>`;
    document.getElementById("submitBtn").onclick = async () => {
      if ([...document.querySelectorAll(".cert")].some(x => !x.checked))
        return showModal("Certification required","<p>Complete every checklist item before submitting.</p>");
      state.current.certified = true;
      state.current.submitted_at = new Date().toISOString();
      state.entries.unshift(state.current);
      localStorage.setItem("fp365_entries", JSON.stringify(state.entries));
      state.draft = null;
      localStorage.removeItem("fp365_draft");
      showModal("Entry submitted","<p>Your entry was submitted and the saved draft was removed.</p>");
      state.current = null;
      state.history = [];
      state.screen = "newEntry";
      setTimeout(render, 50);
    };
  }

  function renderEntries() {
    header("My Entries");
    const entries = state.entries.filter(e => !state.user?.employee_id || true);
    main.innerHTML = `
      <section class="card">
        <h2>Submitted entries</h2>
        ${entries.length ? entries.map(e => `
          <article class="entry">
            <h3>${esc(equipment[e.type]?.label || e.type)}</h3>
            <p>${esc(e.from)} → ${esc(e.to)}</p>
            <p>Truck ${esc(e.truck)}${e.trailer1 ? ` • Trailer ${esc(e.trailer1)}`:""}</p>
            <p>${new Date(e.submitted_at).toLocaleString()}</p>
            ${e.bypass ? `<span class="badge" style="border-color:var(--danger);color:#ffd5d3">Red flag / bypass</span>`:""}
          </article>`).join("") : `<p class="muted">No submitted entries yet.</p>`}
      </section>`;
  }

  function renderEndShift() {
    header("End of Shift");
    const items = [
      "Logged into Off Duty in Motive?",
      "Leave vehicle in Motive?",
      "Signed logs?",
      "Leave fuel card in the truck?"
    ];
    main.innerHTML = `
      <section class="card">
        <h2>End-of-shift checklist</h2>
        ${items.map((x,i)=>`<label class="check"><input class="shift" type="checkbox"><span>${esc(x)}</span></label>`).join("")}
      </section>
      <button id="finishShift" class="success">Complete End of Shift</button>`;
    document.getElementById("finishShift").onclick = () => {
      if ([...document.querySelectorAll(".shift")].some(x => !x.checked))
        return showModal("Checklist incomplete","<p>Every item must be confirmed before logging out.</p>");
      showModal("Have a good night.", "<p>Your end-of-shift checklist is complete. Production mode will generate and email your consolidated daily PDF to the email in your driver profile.</p>");
      localStorage.removeItem("fp365_user");
      state.user = null; state.history = []; state.screen = "login";
      setTimeout(render, 100);
    };
  }

  function renderProfile() {
    header("Driver Profile");
    const u = state.user || {};
    main.innerHTML = `
      <section class="card">
        <h2>${esc(u.full_name || "Driver")}</h2>
        <p><strong>Employer ID:</strong> ${esc(u.employee_id || "Not set")}</p>
        <p><strong>Email:</strong> ${esc(u.email || "Not set")}</p>
        <p class="muted">Production roster fields: full name, employer ID, phone, email, driver license number/state/expiration/photo, and medical card expiration.</p>
      </section>`;
  }

  function renderFeedback() {
    header("Feedback / Suggestion");
    main.innerHTML = `
      <section class="card">
        <h2>Send feedback</h2>
        <label>Name</label>
        <input id="fbName" value="${esc(state.user?.full_name || "")}" />
        <label>Category</label>
        <select id="fbCategory"><option value="suggestion">Suggestion</option><option value="feedback">Feedback</option><option value="bug">Bug report</option></select>
        <label>Message</label>
        <textarea id="fbMessage" maxlength="750" placeholder="Up to 750 characters"></textarea>
        <p id="charCount" class="field-help">0 / 750</p>
        <button id="sendFeedback" class="primary">Submit</button>
      </section>`;
    const msg = document.getElementById("fbMessage");
    msg.oninput = () => document.getElementById("charCount").textContent = `${msg.value.length} / 750`;
    document.getElementById("sendFeedback").onclick = async () => {
      const name = document.getElementById("fbName").value.trim();
      const category = document.getElementById("fbCategory").value;
      const message = msg.value.trim();
      if (!name || !message) return showModal("Missing information","<p>Name and message are required.</p>");
      const payload = {
        submitted_by: name,
        employee_id: state.user?.employee_id || null,
        category,
        message,
        app_version: cfg.APP_VERSION || "Driver v1.1",
        user_agent: navigator.userAgent,
        submitted_at: new Date().toISOString()
      };
      try {
        if (!supabaseClient) throw new Error("Supabase is not configured in config.js.");
        const { data, error } = await supabaseClient.functions.invoke(cfg.FEEDBACK_FUNCTION || "send-feedback", { body: payload });
        if (error) throw error;
        showModal("Thank you","<p>Your feedback was submitted successfully.</p>");
        msg.value = "";
      } catch (err) {
        showModal("Unable to submit", `<p>${esc(err.message || String(err))}</p>`);
      }
    };
  }

  render();
})();
