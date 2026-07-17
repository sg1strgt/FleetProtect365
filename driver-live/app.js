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
  const DRIVER_NAMES = {
    "8739135": "Steven Arbucci"
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

  const state = {
    screen: "login",
    history: [],
    user: readJson("fp365_user", null),
    draft: null,
    entries: [],
    current: null,
    selectedEntry: null,
    pretripDone: false
  };

  const DB_NAME = "fp365-driver-db";
  const DB_VERSION = 1;
  const DB_STORE = "kv";

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Unable to open device storage."));
    });
  }

  async function dbGet(key, fallback) {
    try {
      const db = await openDb();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, "readonly");
        const request = tx.objectStore(DB_STORE).get(key);
        request.onsuccess = () => resolve(request.result ?? fallback);
        request.onerror = () => reject(request.error);
      });
    } catch {
      return fallback;
    }
  }

  async function dbSet(key, value) {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readwrite");
      tx.objectStore(DB_STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("Unable to save on this device."));
      tx.onabort = () => reject(tx.error || new Error("Unable to save on this device."));
    });
  }

  async function dbDelete(key) {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readwrite");
      tx.objectStore(DB_STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("Unable to update device storage."));
    });
  }

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
      pretrip: renderPreTrip,
      newEntry: renderNewEntry,
      inspection: renderInspection,
      certification: renderCertification,
      entries: renderEntries,
      entryDetail: renderEntryDetail,
      endShift: renderEndShift,
      feedback: renderFeedback
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
        <input id="employeeId" inputmode="numeric" autocomplete="username" placeholder="Enter employer ID" />
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
      const knownName = DRIVER_NAMES[id];
      state.user = savedProfiles[id] || {
        full_name: knownName || `Driver ${id}`,
        employee_id: id,
        phone: "",
        email: id === "8739135" ? "steven@fleetprotect365.com" : ""
      };
      if (knownName) state.user.full_name = knownName;

      writeJson("fp365_user", state.user);
      navigate("home", false);
    };

    document.getElementById("forgotBtn").onclick = () =>
      showModal("Password reset", "<p>Password reset will be connected to the company roster and Supabase Auth in the production release.</p>");
  }

  function renderHome() {
    header("Driver Home");
    const name = state.user?.full_name || DRIVER_NAMES[state.user?.employee_id] || "Driver";
    main.innerHTML = `
      <section class="card hero">
        <span class="badge">Logged in</span>
        <h1>Welcome, ${esc(name)}</h1>
      </section>
      ${state.draft ? `<div class="alert">You have a saved entry in progress.</div>` : ""}
      <section class="grid">
        <button id="newBtn" class="choice"><strong>New Inspection</strong><span>Begin with the required pre-trip checklist</span></button>
        ${state.draft ? `<button id="continueBtn" class="choice"><strong>Continue Saved Entry</strong><span>Resume your unfinished entry</span></button>` : ""}
        <button id="entriesBtn" class="choice"><strong>View Entries</strong><span>Open and review your submitted records</span></button>
        <button id="endBtn" class="choice"><strong>End of Shift</strong><span>Complete the checklist and finish your shift</span></button>
        <button id="logoutBtn" class="danger">Log Out</button>
      </section>`;

    document.getElementById("newBtn").onclick = () => {
      state.pretripDone = false;
      navigate("pretrip");
    };
    if (state.draft) {
      document.getElementById("continueBtn").onclick = () => {
        state.current = structuredClone(state.draft);
        navigate("inspection");
      };
    }
    document.getElementById("entriesBtn").onclick = () => navigate("entries");
    document.getElementById("endBtn").onclick = () => navigate("endShift");
    document.getElementById("logoutBtn").onclick = () => navigate("endShift");
  }

  function renderPreTrip() {
    header("Quick Pre-Trip Checklist");
    const items = [
      "Walk-around inspection completed",
      "Tires and wheels appear safe",
      "Lights and reflectors checked",
      "Brakes and air system checked",
      "No visible leaks or unsafe defects",
      "Required documents are available"
    ];
    main.innerHTML = `
      <section class="card">
        <h2>Complete before selecting equipment</h2>
        <p class="field-help">Every item must be confirmed.</p>
        ${items.map((x,i) => `<label class="check"><input class="pretrip-item" type="checkbox" data-i="${i}"><span>${esc(x)}</span></label>`).join("")}
      </section>
      <button id="pretripContinue" class="primary">Continue to Equipment</button>`;

    document.getElementById("pretripContinue").onclick = () => {
      if ([...document.querySelectorAll(".pretrip-item")].some(x => !x.checked)) {
        return showModal("Pre-trip incomplete", "<p>Complete every pre-trip checklist item before continuing.</p>");
      }
      state.pretripDone = true;
      navigate("newEntry");
    };
  }

  function renderNewEntry() {
    if (!state.pretripDone) return navigate("pretrip", false);
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
          driver_name: state.user?.full_name || DRIVER_NAMES[state.user?.employee_id] || "",
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

  function textField(labelText, id, value, list = "") {
    const listAttr = list ? ` list="${list}"` : "";
    return `<label>${labelText}</label><input id="${id}"${listAttr} value="${esc(value)}" placeholder="${labelText} or NA" />`;
  }

  function numericField(labelText, id, value, list = "") {
    const listAttr = list ? ` list="${list}"` : "";
    return `
      <label>${labelText}</label>
      <div style="display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center">
        <input id="${id}"${listAttr} inputmode="numeric" pattern="[0-9]*" value="${esc(value)}" placeholder="${labelText}" />
        <button type="button" class="secondary na-btn" data-target="${id}" style="width:auto;padding:12px 16px">NA</button>
      </div>`;
  }

  function renderInspection() {
    if (!state.current) return goHome();
    header(equipment[state.current.type].label);
    const c = state.current;
    const photoList = equipment[c.type].photos;

    main.innerHTML = `
      <section class="card">
        <h2>Trip and equipment details</h2>
        <p class="field-help">Every field is required. Use the NA button where it legitimately does not apply.</p>
        <label>Truck number</label>
        <select id="truck">
          <option value="">Select truck number</option>
          ${TRUCKS.map(t => `<option value="${t}" ${c.truck === t ? "selected" : ""}>${t}</option>`).join("")}
          <option value="NA" ${c.truck === "NA" ? "selected" : ""}>NA</option>
        </select>
        ${c.type !== "bobtail" ? numericField("Trailer 1 number","trailer1",c.trailer1) : ""}
        ${c.type === "doubles" ? numericField("Dolly number","dolly",c.dolly) + numericField("Trailer 2 number","trailer2",c.trailer2) : ""}
        ${textField("Location From","from",c.from)}
        ${textField("Location To","to",c.to)}
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
          <div id="extraPhotoList">
            ${c.extra_photos.map((photo, i) => `
              <div class="photo-item" style="margin-top:10px">
                <img class="photo-preview expandable-photo" src="${photo.data_url}" alt="${esc(photo.name || `Additional photo ${i + 1}`)}" title="Tap to enlarge">
                <button type="button" class="danger remove-extra" data-index="${i}" style="margin-top:8px">Remove Extra Photo</button>
              </div>`).join("")}
          </div>
        </div>
      </section>` : ""}

      <section class="card">
        <button id="bypassBtn" type="button" class="${c.bypass ? "danger" : "secondary"}" style="width:100%">
          ${c.bypass ? "Bypass Active — Red Flag" : "Bypass Required Item"}
        </button>
        <div id="bypassWrap" style="${c.bypass ? "" : "display:none"};margin-top:12px">
          <div class="alert"><strong>RED FLAG:</strong> An explanation is required and will be saved with this entry.</div>
          <label>Bypass explanation</label>
          <textarea id="bypassReason" placeholder="Explain exactly what is being bypassed and why">${esc(c.bypass_reason)}</textarea>
          <button id="cancelBypass" type="button" class="secondary">Cancel Bypass</button>
        </div>
      </section>

      <div class="grid two">
        <button id="saveBtn" class="secondary">Save Entry</button>
        <button id="nextBtn" class="primary">Continue</button>
      </div>`;

    document.querySelectorAll(".na-btn").forEach(button => {
      button.onclick = () => {
        const input = document.getElementById(button.dataset.target);
        input.value = "NA";
        input.focus();
      };
    });

    const bypassBtn = document.getElementById("bypassBtn");
    bypassBtn.onclick = () => {
      c.bypass = true;
      document.getElementById("bypassWrap").style.display = "";
      bypassBtn.textContent = "Bypass Active — Red Flag";
      bypassBtn.className = "danger";
      setTimeout(() => document.getElementById("bypassReason").focus(), 50);
    };
    document.getElementById("cancelBypass").onclick = () => {
      c.bypass = false;
      c.bypass_reason = "";
      document.getElementById("bypassReason").value = "";
      document.getElementById("bypassWrap").style.display = "none";
      bypassBtn.textContent = "Bypass Required Item";
      bypassBtn.className = "secondary";
    };

    document.querySelectorAll(".expandable-photo").forEach(img => {
      if (img.src) img.onclick = () => showPhoto(img.src, img.alt || "Photo");
    });

    document.querySelectorAll(".required-photo").forEach(input => {
      input.onchange = async e => {
        const file = e.target.files?.[0];
        if (!file) return;
        const index = e.target.dataset.index;
        c.photos[index] = await fileRecord(file);
        updatePhotoStatus(index, c.photos[index]);
      };
    });

    document.querySelectorAll(".remove-required").forEach(button => {
      button.onclick = () => {
        const index = button.dataset.index;
        delete c.photos[index];
        renderInspection();
      };
    });

    const extraHandler = async e => {
      for (const file of [...(e.target.files || [])]) c.extra_photos.push(await fileRecord(file));
      renderInspection();
    };
    const extraCamera = document.getElementById("extraCamera");
    const extraUpload = document.getElementById("extraUpload");
    if (extraCamera) extraCamera.onchange = extraHandler;
    if (extraUpload) extraUpload.onchange = extraHandler;

    document.querySelectorAll(".remove-extra").forEach(button => {
      button.onclick = () => {
        const index = Number(button.dataset.index);
        c.extra_photos.splice(index, 1);
        renderInspection();
      };
    });

    document.getElementById("saveBtn").onclick = async () => {
      syncCurrent();
      state.draft = structuredClone(state.current);
      try {
        await dbSet("draft", state.draft);
      } catch (err) {
        return showModal("Unable to save", `<p>${esc(err.message || String(err))}</p>`);
      }
      state.current = null;
      state.history = [];
      state.screen = "home";
      render();
      showModal("Entry saved", "<p>Your entry was saved. Tap Continue Saved Entry to resume it.</p>");
    };

    document.getElementById("nextBtn").onclick = () => {
      syncCurrent();
      const missing = validateCurrent();
      if (missing.length) {
        return showModal("Complete required items", `<p>${missing.map(esc).join("<br>")}</p>`);
      }
      navigate("certification");
    };
  }

  function photoControl(label, index, record) {
    return `
      <div class="photo-item">
        <strong>${esc(label)}</strong>
        <div id="status-${index}" class="status ${record ? "ok":"missing"}">${record ? `Added: ${esc(record.name)}`:"Required"}</div>
        ${record?.data_url ? `<img id="preview-${index}" class="photo-preview expandable-photo" src="${record.data_url}" alt="${esc(label)}" title="Tap to enlarge">` : `<img id="preview-${index}" class="photo-preview expandable-photo" alt="${esc(label)}" style="display:none" title="Tap to enlarge">`}
        <div class="photo-actions">
          <label class="file-label">${record ? "Retake Photo" : "Take Photo"}<input class="required-photo" data-index="${index}" type="file" accept="image/*" capture="environment"></label>
          <label class="file-label">${record ? "Replace from Library" : "Upload Photo"}<input class="required-photo" data-index="${index}" type="file" accept="image/*"></label>
        </div>
        ${record ? `<button type="button" class="danger remove-required" data-index="${index}" style="margin-top:8px">Remove Photo</button>` : ""}
      </div>`;
  }

  async function fileRecord(file) {
    const dataUrl = await compressImage(file, 640, 0.42);
    return { name: file.name || `photo-${Date.now()}.jpg`, size: file.size, type: file.type, data_url: dataUrl };
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
          canvas.getContext("2d").drawImage(img, 0, 0, width, height);
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
    preview.onclick = () => showPhoto(record.data_url, record.name);
  }

  function showPhoto(src, name = "Photo") {
    showModal(
      name,
      `<img src="${src}" alt="${esc(name)}" style="width:100%;height:auto;max-height:70vh;object-fit:contain;border-radius:14px">`
    );
  }

  function syncCurrent() {
    const ids = ["truck","trailer1","trailer2","dolly","from","to","notes"];
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) state.current[id] = el.value.trim();
    });
    state.current.bypass_reason = document.getElementById("bypassReason")?.value.trim() || "";
  }

  function validateCurrent() {
    const c = state.current;
    const missing = [];
    ["truck","from","to","notes"].forEach(k => { if (!c[k]) missing.push(labelFor(k)); });
    if (c.type !== "bobtail" && !c.trailer1) missing.push("Trailer 1 number");
    if (c.type === "doubles") {
      if (!c.dolly) missing.push("Dolly number");
      if (!c.trailer2) missing.push("Trailer 2 number");
    }
    if (!c.bypass) {
      equipment[c.type].photos.forEach((label,i) => { if (!c.photos[i]) missing.push(label); });
    } else if (!c.bypass_reason) {
      missing.push("Bypass explanation");
    }
    return missing;
  }

  function labelFor(key) {
    return ({ truck:"Truck number", from:"Location From", to:"Location To", notes:"Notes" })[key] || key;
  }

  function renderCertification() {
    header("Driver Certification");
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
        <h2>Final review</h2>
        ${state.current?.bypass ? `<div class="alert"><strong>RED FLAG / BYPASS:</strong> ${esc(state.current.bypass_reason)}</div>` : ""}
        ${items.map((x,i) => `<label class="check"><input class="cert" type="checkbox" data-i="${i}"><span>${esc(x)}</span></label>`).join("")}
      </section>
      <button id="submitBtn" class="primary">Submit Entry</button>`;

    document.getElementById("submitBtn").onclick = async () => {
      if ([...document.querySelectorAll(".cert")].some(x => !x.checked)) {
        return showModal("Certification required", "<p>Complete every checklist item before submitting.</p>");
      }
      state.current.certified = true;
      state.current.submitted_at = new Date().toISOString();
      state.entries.unshift(structuredClone(state.current));
      try {
        await dbSet("entries", state.entries);
        await dbDelete("draft");
      } catch (err) {
        state.entries.shift();
        return showModal("Unable to save", `<p>${esc(err.message || String(err))}</p>`);
      }
      state.draft = null;
      state.current = null;
      state.pretripDone = false;
      state.history = [];
      state.screen = "home";
      render();
      showModal("Entry submitted", "<p>Your entry was submitted and you were returned Home.</p>");
    };
  }

  function driverEntries() {
    const employeeId = state.user?.employee_id;
    return state.entries.filter(entry => entry.employee_id === employeeId);
  }

  function renderEntries() {
    header("My Entries");
    const entries = driverEntries();
    main.innerHTML = `<section class="card"><h2>Submitted entries</h2>
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
      ${photoItems.length ? `<section class="card"><h2>Photos</h2>
        ${photoItems.map((label,i) => {
          const photo = e.photos?.[i];
          return `<div class="photo-item"><strong>${esc(label)}</strong>${photo?.data_url ? `<img class="photo-preview expandable-photo" src="${photo.data_url}" alt="${esc(label)}" title="Tap to enlarge">` : `<p class="muted">No photo available.</p>`}</div>`;
        }).join("")}
      </section>` : ""}`;
    document.querySelectorAll(".expandable-photo").forEach(img => {
      img.onclick = () => showPhoto(img.src, img.alt || "Photo");
    });
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

    const now = new Date();
    const todayEntries = driverEntries().filter(entry => {
      const submitted = new Date(entry.submitted_at || entry.created_at);
      return submitted.getFullYear() === now.getFullYear()
        && submitted.getMonth() === now.getMonth()
        && submitted.getDate() === now.getDate();
    });

    main.innerHTML = `
      <section class="card">
        <h2>End-of-shift checklist</h2>
        <p class="field-help">${todayEntries.length} submitted entr${todayEntries.length === 1 ? "y" : "ies"} found for today.</p>
        ${todayEntries.length === 0 ? `<div class="alert">No inspections are available to email for today.</div>` : ""}
        ${items.map(x => `<label class="check"><input class="shift" type="checkbox"><span>${esc(x)}</span></label>`).join("")}
      </section>
      <button id="finishShift" class="success" ${todayEntries.length === 0 ? "disabled" : ""}>
        Email Report and Complete End of Shift
      </button>`;

    document.getElementById("finishShift").onclick = async () => {
      if ([...document.querySelectorAll(".shift")].some(x => !x.checked)) {
        return showModal("Checklist incomplete", "<p>Every item must be confirmed before completing End of Shift.</p>");
      }
      if (!todayEntries.length) return showModal("No inspections found", "<p>There are no submitted inspections for today.</p>");
      if (!supabaseClient) return showModal("Email not configured", "<p>Supabase is not configured in config.js.</p>");

      const button = document.getElementById("finishShift");
      button.disabled = true;
      button.textContent = "Creating and emailing PDF…";

      const payload = {
        driver: {
          full_name: state.user?.full_name || "",
          employee_id: state.user?.employee_id || "",
          email: state.user?.email || ""
        },
        shift_date: [
          now.getFullYear(),
          String(now.getMonth() + 1).padStart(2, "0"),
          String(now.getDate()).padStart(2, "0")
        ].join("-"),
        entries: todayEntries,
        app_version: cfg.APP_VERSION || "Driver v1.7"
      };

      try {
        const { data, error } = await supabaseClient.functions.invoke(
          cfg.END_SHIFT_FUNCTION || "send-end-shift",
          { body: payload }
        );
        if (error) throw error;
        if (!data?.ok) throw new Error(data?.error || "The report email was not confirmed.");

        showModal(
          "Report emailed",
          `<p>Your printable End-of-Shift PDF containing ${todayEntries.length} inspection${todayEntries.length === 1 ? "" : "s"} was emailed to <strong>steven@fleetprotect365.com</strong>.</p><p>Have a good night.</p>`
        );
        localStorage.removeItem("fp365_user");
        state.user = null;
        state.history = [];
        state.screen = "login";
        setTimeout(render, 500);
      } catch (err) {
        button.disabled = false;
        button.textContent = "Email Report and Complete End of Shift";
        showModal(
          "Email was not sent",
          `<p>${esc(err.message || String(err))}</p><p>You remain logged in. Please try again.</p>`
        );
      }
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
    msg.oninput = () => document.getElementById("charCount").textContent = `${msg.value.length} / 750`;
    document.getElementById("sendFeedback").onclick = async () => {
      const name = document.getElementById("fbName").value.trim();
      const category = document.getElementById("fbCategory").value;
      const message = msg.value.trim();
      if (!name || !message) return showModal("Missing information", "<p>Name and message are required.</p>");
      const payload = {
        submitted_by: name,
        employee_id: state.user?.employee_id || null,
        category, message,
        app_version: cfg.APP_VERSION || "Driver v1.7",
        user_agent: navigator.userAgent,
        submitted_at: new Date().toISOString()
      };
      try {
        if (!supabaseClient) throw new Error("Supabase is not configured in config.js.");
        const { error } = await supabaseClient.functions.invoke(cfg.FEEDBACK_FUNCTION || "send-feedback", { body: payload });
        if (error) throw error;
        showModal("Thank you", "<p>Your feedback was submitted successfully.</p>");
        msg.value = "";
        document.getElementById("charCount").textContent = "0 / 750";
      } catch (err) {
        showModal("Unable to submit", `<p>${esc(err.message || String(err))}</p>`);
      }
    };
  }

  async function init() {
    const oldDraft = readJson("fp365_draft", null);
    const oldEntries = readJson("fp365_entries", []);
    state.draft = await dbGet("draft", oldDraft);
    state.entries = await dbGet("entries", oldEntries);

    if (oldDraft && !(await dbGet("draft", null))) await dbSet("draft", oldDraft);
    if (oldEntries.length && !(await dbGet("entries", null))) await dbSet("entries", oldEntries);

    localStorage.removeItem("fp365_draft");
    localStorage.removeItem("fp365_entries");
    render();
  }

  init().catch(err => {
    console.error(err);
    render();
    showModal("Storage notice", "<p>The app opened, but device storage could not be initialized.</p>");
  });
})();
