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

  const TRUCKS = ["524656", "524657", "524658", "527549"];

  const state = {
    screen: "login",
    history: [],
    user: readJson("fp365_user", null),
    draft: readJson("fp365_draft", null),
    entries: readJson("fp365_entries", []),
    current: null,
    selectedEntry: null
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

  function readJson(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch {
      return fallback;
    }
  }

  function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

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
    if (prev) {
      state.screen = prev;
      render();
    }
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
    const hide = state.screen === "login" || state.screen === "home";
    backBtn.classList.toggle("hidden", hide);
    homeBtn.classList.toggle("hidden", hide);
  }

  function render() {
    const map = {
      login: renderLogin,
      home: renderHome,
      newEntry: renderNewEntry,
      inspection: renderInspection,
      checklist: renderChecklist,
      entries: renderEntries,
      entryDetail: renderEntryDetail,
      endShift: renderEndShift,
      feedback: renderFeedback,
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
        <p class="field-help">Testing mode currently accepts any employer ID and password.</p>
      </section>`;

    document.getElementById("loginBtn").onclick = () => {
      const id = document.getElementById("employeeId").value.trim();
      const pass = document.getElementById("password").value;
      if (!id || !pass) {
        return showModal("Missing information", "<p>Employer ID and password are required.</p>");
      }

      const savedProfiles = readJson("fp365_profiles", {});
      state.user = savedProfiles[id] || {
        full_name: id === "demo" ? "Steven Arbucci" : `Driver ${id}`,
        employee_id: id,
        phone: "",
        email: "",
        license_number: "",
        license_state: "",
        license_expiration: "",
        medical_expiration: ""
      };

      writeJson("fp365_user", state.user);
      navigate("home", false);
    };

    document.getElementById("forgotBtn").onclick = () =>
      showModal("Password reset", "<p>Password reset will be connected to the company roster and Supabase Auth in the production release.</p>");
  }

  function renderHome() {
    header("Driver Home");
    const name = state.user?.full_name || "Driver";
    main.innerHTML = `
      <section class="card hero">
        <span class="badge">Logged in</span>
        <h1>Welcome, ${esc(name)}</h1>
        <p>Employer ID: ${esc(state.user?.employee_id || "")}</p>
      </section>
      ${state.draft ? `<div class="alert">You have a saved entry in progress.</div>` : ""}
      <section class="grid">
        <button id="newBtn" class="choice"><strong>New Inspection</strong><span>Start a 53’, doubles, single pup, or bobtail entry</span></button>
        ${state.draft ? `<button id="continueBtn" class="choice"><strong>Continue Saved Entry</strong><span>Resume your unfinished entry</span></button>` : ""}
        <button id="entriesBtn" class="choice"><strong>View Entries</strong><span>Open and review your submitted records</span></button>
        <button id="profileBtn" class="choice"><strong>Driver Profile</strong><span>View or update your profile information</span></button>
        <button id="endBtn" class="choice"><strong>End of Shift</strong><span>Complete the checklist and finish your shift</span></button>
        <button id="logoutBtn" class="danger">Log Out</button>
      </section>`;

    document.getElementById("newBtn").onclick = () => navigate("newEntry");
    if (state.draft) {
      document.getElementById("continueBtn").onclick = () => {
        state.current = structuredClone(state.draft);
        navigate("inspection");
      };
    }
    document.getElementById("entriesBtn").onclick = () => navigate("entries");
    document.getElementById("profileBtn").onclick = () => navigate("profile");
    document.getElementById("endBtn").onclick = () => navigate("endShift");
    document.getElementById("logoutBtn").onclick = () => navigate("endShift");
  }

  function renderNewEntry() {
    header("New Inspection");
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

    document.querySelectorAll(".equip").forEach(btn => {
      btn.onclick = () => {
        const type = btn.dataset.key;
        state.current = {
          id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
          employee_id: state.user?.employee_id || "",
          driver_name: state.user?.full_name || "",
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
          extra_photos: [],
          certified: false
        };
        navigate("inspection");
      };
    });
  }

  function field(labelText, id, value, list = "") {
    const listAttr = list ? ` list="${list}"` : "";
    return `<label>${labelText}</label><input id="${id}"${listAttr} value="${esc(value)}" placeholder="${labelText} or NA" />`;
  }

  function renderInspection() {
    if (!state.current) return goHome();
    header(equipment[state.current.type].label);
    const c = state.current;
    const photoList = equipment[c.type].photos;

    main.innerHTML = `
      <section class="card">
        <h2>Trip and equipment details</h2>
        <p class="field-help">Every field is required. Enter NA where it legitimately does not apply.</p>
        ${field("Truck number","truck",c.truck,"truckNumbers")}
        <datalist id="truckNumbers">${TRUCKS.map(t => `<option value="${t}"></option>`).join("")}</datalist>
        ${c.type !== "bobtail" ? field("Trailer 1 number","trailer1",c.trailer1) : ""}
        ${c.type === "doubles" ? field("Dolly number","dolly",c.dolly) + field("Trailer 2 number","trailer2",c.trailer2) : ""}
        ${field("Location From","from",c.from)}
        ${field("Location To","to",c.to)}
        <label>Notes</label>
        <textarea id="notes" placeholder="Enter notes or NA">${esc(c.notes)}</textarea>
      </section>

      ${photoList.length ? `
      <section class="card">
        <h2>Required photos</h2>
        <p class="field-help">Choose Take Photo to open the camera or Upload Photo to select from the photo library.</p>
        ${photoList.map((p,i) => photoControl(p, i, c.photos[i])).join("")}
        <div class="photo-item">
          <strong>Additional photos</strong>
          <div class="photo-actions">
            <label class="file-label">Take Photo<input id="extraCamera" type="file" accept="image/*" capture="environment" multiple></label>
            <label class="file-label">Upload Photo<input id="extraUpload" type="file" accept="image/*" multiple></label>
          </div>
          <div id="extraStatus" class="status ${c.extra_photos.length ? "ok":"missing"}">${c.extra_photos.length} added</div>
        </div>
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

    document.getElementById("bypass").onchange = e => {
      document.getElementById("bypassWrap").style.display = e.target.checked ? "" : "none";
    };

    document.querySelectorAll(".required-photo").forEach(input => {
      input.onchange = async e => {
        const file = e.target.files?.[0];
        if (!file) return;
        const index = e.target.dataset.index;
        c.photos[index] = await fileRecord(file);
        updatePhotoStatus(index, c.photos[index]);
      };
    });

    const extraHandler = async e => {
      for (const file of [...(e.target.files || [])]) {
        c.extra_photos.push(await fileRecord(file));
      }
      document.getElementById("extraStatus").textContent = `${c.extra_photos.length} added`;
      document.getElementById("extraStatus").className = "status ok";
    };

    const extraCamera = document.getElementById("extraCamera");
    const extraUpload = document.getElementById("extraUpload");
    if (extraCamera) extraCamera.onchange = extraHandler;
    if (extraUpload) extraUpload.onchange = extraHandler;

    document.getElementById("saveBtn").onclick = () => {
      syncCurrent();
      state.draft = structuredClone(state.current);
      writeJson("fp365_draft", state.draft);
      showModal("Entry saved", "<p>You can return later using Continue Saved Entry.</p>");
    };

    document.getElementById("nextBtn").onclick = () => {
      syncCurrent();
      const missing = validateCurrent();
      if (missing.length) {
        return showModal("Complete required items", `<p>${missing.map(esc).join("<br>")}</p>`);
      }
      navigate("checklist");
    };
  }

  function photoControl(label, index, record) {
    return `
      <div class="photo-item">
        <strong>${esc(label)}</strong>
        <div id="status-${index}" class="status ${record ? "ok":"missing"}">${record ? `Added: ${esc(record.name)}`:"Required"}</div>
        ${record?.data_url ? `<img id="preview-${index}" class="photo-preview" src="${record.data_url}" alt="${esc(label)}">` : `<img id="preview-${index}" class="photo-preview" alt="${esc(label)}" style="display:none">`}
        <div class="photo-actions">
          <label class="file-label">Take Photo<input class="required-photo" data-index="${index}" type="file" accept="image/*" capture="environment"></label>
          <label class="file-label">Upload Photo<input class="required-photo" data-index="${index}" type="file" accept="image/*"></label>
        </div>
      </div>`;
  }

  async function fileRecord(file) {
    const dataUrl = await compressImage(file, 1280, 0.72);
    return {
      name: file.name || `photo-${Date.now()}.jpg`,
      size: file.size,
      type: file.type,
      data_url: dataUrl
    };
  }

  function compressImage(file, maxDimension, quality) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Unable to read photo."));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error("Unable to process photo."));
        img.onload = () => {
          let { width, height } = img;
          const scale = Math.min(1, maxDimension / Math.max(width, height));
          width = Math.round(width * scale);
          height = Math.round(height * scale);
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL("image/jpeg", quality));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function updatePhotoStatus(index, record) {
    const status = document.getElementById(`status-${index}`);
    const preview = document.getElementById(`preview-${index}`);
    status.textContent = `Added: ${record.name}`;
    status.className = "status ok";
    preview.src = record.data_url;
    preview.style.display = "";
  }

  function syncCurrent() {
    const ids = ["truck","trailer1","trailer2","dolly","from","to","notes"];
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) state.current[id] = el.value.trim();
    });
    state.current.bypass = !!document.getElementById("bypass")?.checked;
    state.current.bypass_reason = document.getElementById("bypassReason")?.value.trim() || "";
  }

  function validateCurrent() {
    const c = state.current;
    const missing = [];
    ["truck","from","to","notes"].forEach(k => {
      if (!c[k]) missing.push(labelFor(k));
    });
    if (c.type !== "bobtail" && !c.trailer1) missing.push("Trailer 1 number");
    if (c.type === "doubles") {
      if (!c.dolly) missing.push("Dolly number");
      if (!c.trailer2) missing.push("Trailer 2 number");
    }
    if (!c.bypass) {
      equipment[c.type].photos.forEach((label,i) => {
        if (!c.photos[i]) missing.push(label);
      });
    } else if (!c.bypass_reason) {
      missing.push("Bypass explanation");
    }
    return missing;
  }

  function labelFor(key) {
    return ({
      truck: "Truck number",
      from: "Location From",
      to: "Location To",
      notes: "Notes"
    })[key] || key;
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
        ${items.map((x,i) => `<label class="check"><input class="cert" type="checkbox" data-i="${i}"><span>${esc(x)}</span></label>`).join("")}
      </section>
      <button id="submitBtn" class="primary">Submit Entry</button>`;

    document.getElementById("submitBtn").onclick = () => {
      if ([...document.querySelectorAll(".cert")].some(x => !x.checked)) {
        return showModal("Certification required", "<p>Complete every checklist item before submitting.</p>");
      }

      state.current.certified = true;
      state.current.submitted_at = new Date().toISOString();
      state.entries.unshift(structuredClone(state.current));

      try {
        writeJson("fp365_entries", state.entries);
      } catch {
        state.entries.shift();
        return showModal("Unable to save", "<p>The photos may be too large for this temporary test version. Remove extra photos or use smaller images and try again.</p>");
      }

      state.draft = null;
      localStorage.removeItem("fp365_draft");
      state.current = null;
      state.history = [];
      state.screen = "home";
      render();
      showModal("Entry submitted", "<p>Your entry was submitted, the saved draft was removed, and you were returned Home.</p>");
    };
  }

  function driverEntries() {
    const employeeId = state.user?.employee_id;
    return state.entries.filter(entry => entry.employee_id === employeeId);
  }

  function renderEntries() {
    header("My Entries");
    const entries = driverEntries();

    main.innerHTML = `
      <section class="card">
        <h2>Submitted entries</h2>
        ${entries.length ? entries.map(e => `
          <button class="entry open-entry" data-id="${esc(e.id)}">
            <h3>${esc(equipment[e.type]?.label || e.type)}</h3>
            <p>${esc(e.from)} → ${esc(e.to)}</p>
            <p>Truck ${esc(e.truck)}${e.trailer1 ? ` • Trailer ${esc(e.trailer1)}`:""}</p>
            <p>${new Date(e.submitted_at).toLocaleString()}</p>
            ${e.bypass ? `<span class="badge" style="border-color:var(--danger);color:#ffd5d3">Red flag / bypass</span>`:""}
          </button>`).join("") : `<p class="muted">No submitted entries yet.</p>`}
      </section>`;

    document.querySelectorAll(".open-entry").forEach(button => {
      button.onclick = () => {
        state.selectedEntry = entries.find(e => e.id === button.dataset.id) || null;
        navigate("entryDetail");
      };
    });
  }

  function renderEntryDetail() {
    const e = state.selectedEntry;
    if (!e) return navigate("entries", false);
    header("Entry Details");

    const photoItems = equipment[e.type]?.photos || [];
    main.innerHTML = `
      <section class="card">
        <h2>${esc(equipment[e.type]?.label || e.type)}</h2>
        <div class="detail-list">
          ${detail("Submitted", new Date(e.submitted_at).toLocaleString())}
          ${detail("Driver", e.driver_name)}
          ${detail("Employer ID", e.employee_id)}
          ${detail("Truck", e.truck)}
          ${e.trailer1 ? detail("Trailer 1", e.trailer1) : ""}
          ${e.dolly ? detail("Dolly", e.dolly) : ""}
          ${e.trailer2 ? detail("Trailer 2", e.trailer2) : ""}
          ${detail("Location From", e.from)}
          ${detail("Location To", e.to)}
          ${detail("Notes", e.notes)}
          ${e.bypass ? detail("Red flag / bypass", e.bypass_reason) : ""}
        </div>
      </section>
      ${photoItems.length ? `
      <section class="card">
        <h2>Photos</h2>
        ${photoItems.map((label,i) => {
          const photo = e.photos?.[i];
          return `<div class="photo-item"><strong>${esc(label)}</strong>${photo?.data_url ? `<img class="photo-preview" src="${photo.data_url}" alt="${esc(label)}">` : `<p class="muted">No photo available.</p>`}</div>`;
        }).join("")}
      </section>` : ""}`;
  }

  function detail(label, value) {
    return `<div class="detail-row"><strong>${esc(label)}</strong><div class="muted">${esc(value || "Not set")}</div></div>`;
  }

  function renderEndShift() {
    header("End of Shift");
    const items = [
      "Logged into Off Duty in Motive?",
      "Leave vehicle in Motive?",
      "Signed logs?",
      "Leave fuel card in the truck?"
    ];
    const todayCount = driverEntries().filter(e => new Date(e.submitted_at).toDateString() === new Date().toDateString()).length;

    main.innerHTML = `
      <section class="card">
        <h2>End-of-shift checklist</h2>
        <p class="field-help">${todayCount} submitted entr${todayCount === 1 ? "y" : "ies"} found for today.</p>
        ${items.map(x => `<label class="check"><input class="shift" type="checkbox"><span>${esc(x)}</span></label>`).join("")}
      </section>
      <button id="finishShift" class="success">Complete End of Shift</button>`;

    document.getElementById("finishShift").onclick = () => {
      if ([...document.querySelectorAll(".shift")].some(x => !x.checked)) {
        return showModal("Checklist incomplete", "<p>Every item must be confirmed before logging out.</p>");
      }

      showModal(
        "Have a good night.",
        "<p>Your checklist is complete. Automatic PDF creation, email delivery, and Google Drive storage require the next Supabase backend update and are not being claimed as complete in this version.</p>"
      );

      localStorage.removeItem("fp365_user");
      state.user = null;
      state.history = [];
      state.screen = "login";
      setTimeout(render, 100);
    };
  }

  function renderProfile() {
    header("Driver Profile");
    const u = state.user || {};
    main.innerHTML = `
      <section class="card">
        <h2>Profile information</h2>
        ${field("Full name","profileName",u.full_name || "")}
        ${field("Employer ID","profileId",u.employee_id || "")}
        ${field("Phone number","profilePhone",u.phone || "")}
        ${field("Email address","profileEmail",u.email || "")}
        ${field("Driver license number","profileLicense",u.license_number || "")}
        ${field("License state","profileState",u.license_state || "")}
        <label>Driver license expiration</label><input id="profileLicenseExpiration" type="date" value="${esc(u.license_expiration || "")}">
        <label>Medical card expiration</label><input id="profileMedicalExpiration" type="date" value="${esc(u.medical_expiration || "")}">
        <button id="saveProfile" class="primary" style="margin-top:16px">Save Profile</button>
      </section>`;

    document.getElementById("profileId").disabled = true;
    document.getElementById("saveProfile").onclick = () => {
      const updated = {
        ...u,
        full_name: document.getElementById("profileName").value.trim(),
        employee_id: u.employee_id,
        phone: document.getElementById("profilePhone").value.trim(),
        email: document.getElementById("profileEmail").value.trim(),
        license_number: document.getElementById("profileLicense").value.trim(),
        license_state: document.getElementById("profileState").value.trim(),
        license_expiration: document.getElementById("profileLicenseExpiration").value,
        medical_expiration: document.getElementById("profileMedicalExpiration").value
      };

      if (!updated.full_name || !updated.email) {
        return showModal("Missing information", "<p>Full name and email address are required.</p>");
      }

      state.user = updated;
      writeJson("fp365_user", updated);
      const profiles = readJson("fp365_profiles", {});
      profiles[updated.employee_id] = updated;
      writeJson("fp365_profiles", profiles);
      showModal("Profile saved", "<p>Your profile was updated on this device.</p>");
    };
  }

  function renderFeedback() {
    header("Feedback / Suggestion");
    main.innerHTML = `
      <section class="card">
        <h2>Send feedback</h2>
        <label>Name</label>
        <input id="fbName" value="${esc(state.user?.full_name || "")}" />
        <label>Category</label>
        <select id="fbCategory">
          <option value="suggestion">Suggestion</option>
          <option value="feedback">Feedback</option>
          <option value="bug">Bug report</option>
        </select>
        <label>Message</label>
        <textarea id="fbMessage" maxlength="750" placeholder="Up to 750 characters"></textarea>
        <p id="charCount" class="field-help">0 / 750</p>
        <button id="sendFeedback" class="primary">Submit</button>
      </section>`;

    const msg = document.getElementById("fbMessage");
    msg.oninput = () => {
      document.getElementById("charCount").textContent = `${msg.value.length} / 750`;
    };

    document.getElementById("sendFeedback").onclick = async () => {
      const name = document.getElementById("fbName").value.trim();
      const category = document.getElementById("fbCategory").value;
      const message = msg.value.trim();

      if (!name || !message) {
        return showModal("Missing information", "<p>Name and message are required.</p>");
      }

      const payload = {
        submitted_by: name,
        employee_id: state.user?.employee_id || null,
        category,
        message,
        app_version: cfg.APP_VERSION || "Driver v1.2",
        user_agent: navigator.userAgent,
        submitted_at: new Date().toISOString()
      };

      try {
        if (!supabaseClient) throw new Error("Supabase is not configured in config.js.");
        const { error } = await supabaseClient.functions.invoke(
          cfg.FEEDBACK_FUNCTION || "send-feedback",
          { body: payload }
        );
        if (error) throw error;
        showModal("Thank you", "<p>Your feedback was submitted successfully.</p>");
        msg.value = "";
        document.getElementById("charCount").textContent = "0 / 750";
      } catch (err) {
        showModal("Unable to submit", `<p>${esc(err.message || String(err))}</p>`);
      }
    };
  }

  render();
})();