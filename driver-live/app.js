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
  window.FP365_DRIVER_CLIENT = supabaseClient;

  let activeTrucks = [];
  const DRIVER_NAMES = {
    "8739135": "Steven Arbucci"
  };

  const equipment = {
    "53": {
      label: "53’ Trailer",
      photos: [
        "Fifth wheel plate connected",
        "Landing gear raised",
        "Air, brake, and electrical lines connected",
        "Rear door and seal secure"
      ]
    },
    container: {
      label: "Container",
      photos: [
        "Fifth wheel plate connected",
        "Landing gear raised",
        "Air, brake, and electrical lines connected",
        "Rear door and seal secure"
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
        "Trailer 1 rear door and seal secure",
        "Fifth wheel plate connected to Trailer 2",
        "Trailer 2 landing gear raised",
        "Trailer 2 rear door and seal secure"
      ]
    },
    pup: {
      label: "Single Pup",
      photos: [
        "Fifth wheel plate connected",
        "Landing gear raised",
        "Air, brake, and electrical lines connected",
        "Rear door and seal secure"
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
    pretripDone: false,
    companyContent: null,
    entryRetentionHours: Number(readJson("fp365_entry_retention_hours", cfg.LOCAL_ENTRY_RETENTION_HOURS || 24)) || 24
  };

  const DEFAULT_QUESTIONS = {
    question_pre: [
      "Walk-around inspection completed",
      "Tires and wheels appear safe",
      "Lights and reflectors checked",
      "Brakes and air system checked",
      "No visible leaks or unsafe defects",
      "Required documents are available"
    ],
    question_final: [
      "Equipment numbers and locations are correct",
      "Connection points are secure",
      "Landing gear is raised where required",
      "Air, brake, and electrical lines are connected",
      "Required photos are clear and complete",
      "This entry is complete and accurate"
    ],
    question_post: [
      "Logged into Off Duty in Motive?",
      "Leave vehicle in Motive?",
      "Signed logs?",
      "Leave fuel card in the truck?"
    ]
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
  const menuBtn = document.getElementById("menuBtn");
  const modal = document.getElementById("modal");

  async function loadActiveTrucks() {
    if (!supabaseClient) {
      activeTrucks = [];
      return;
    }
    const { data, error } = await supabaseClient
      .from("trucks")
      .select("truck_number")
      .eq("status", "active")
      .is("deleted_at", null)
      .order("truck_number");
    if (error) throw error;
    activeTrucks = (data || []).map(row => String(row.truck_number));
  }

  async function loadCompanyContent() {
    state.companyContent = null;
    if (!supabaseClient || !state.user) return;
    try {
      let companyId = state.user.company_id;
      if (!companyId && state.user.id) {
        const { data: profile, error: profileError } = await supabaseClient
          .from("employee_profiles")
          .select("company_id")
          .eq("id", state.user.id)
          .maybeSingle();
        if (profileError) throw profileError;
        companyId = profile?.company_id || "";
        if (companyId) {
          state.user.company_id = companyId;
          writeJson("fp365_user", state.user);
        }
      }
      if (!companyId) throw new Error("The driver company could not be identified.");
      const { data, error } = await supabaseClient
        .from("company_content")
        .select("id,content_type,title,body,url,sort_order")
        .eq("company_id", companyId)
        .eq("active", true)
        .in("content_type", ["question_pre", "question_post", "question_final", "fmcsa"])
        .order("sort_order", { ascending: true })
        .order("title", { ascending: true });
      if (error) throw error;
      state.companyContent = data || [];
    } catch (error) {
      console.warn("Company questions and links are temporarily unavailable; using built-in questions.", error);
    }
  }

  async function loadCompanyPreferences() {
    if (!supabaseClient || !state.user) return;
    try {
      let companyId = state.user.company_id;
      if (!companyId && state.user.id) {
        const { data: profile, error: profileError } = await supabaseClient
          .from("employee_profiles")
          .select("company_id")
          .eq("id", state.user.id)
          .maybeSingle();
        if (profileError) throw profileError;
        companyId = profile?.company_id || "";
      }
      if (!companyId) return;
      const { data, error } = await supabaseClient
        .from("companies")
        .select("driver_entry_retention_hours")
        .eq("id", companyId)
        .maybeSingle();
      if (error) throw error;
      const hours = Number(data?.driver_entry_retention_hours);
      if (Number.isInteger(hours) && hours >= 1 && hours <= 720) {
        state.entryRetentionHours = hours;
        writeJson("fp365_entry_retention_hours", hours);
      }
    } catch (error) {
      console.warn("Company cleanup preference unavailable:", error);
    }
  }

  function checklistItems(type) {
    const synced = state.companyContent?.filter(item => item.content_type === type) || [];
    return synced.length ? synced.map(item => item.title) : DEFAULT_QUESTIONS[type];
  }

  function showResourceMenu() {
    const fedexMarker = "[[FEDEX_LOCATION]]";
    const resourceSection = (title, type, emptyMessage) => {
      const links = (state.companyContent || []).filter(item => {
        if (item.content_type !== "fmcsa" || !item.url) return false;
        const isFedexLocation = String(item.body || "").startsWith(fedexMarker);
        return type === "fedex_location" ? isFedexLocation : !isFedexLocation;
      });
      return `<details class="resource-section"><summary>${esc(title)}</summary>${links.length
        ? `<div class="resource-list">${links.map(item => { const description = String(item.body || "").replace(fedexMarker, "").trim(); return `<a class="resource-link" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer"><strong>${esc(item.title)}</strong>${description ? `<span>${esc(description)}</span>` : ""}</a>`; }).join("")}</div>`
        : `<p class="resource-empty">${esc(emptyMessage)}</p>`}</details>`;
    };
    showModal("Resources",
      resourceSection("FMCSA Resources", "fmcsa", "No FMCSA links have been added by your administrator yet.") +
      '<details class="resource-section"><summary>FedEx Locations</summary><div class="resource-list"><button type="button" class="resource-link fedex-resource-launch" data-open-fedex-locations><strong>Open FedEx Locations</strong><span>Maps, directions, contact information, routes, photos, and links.</span></button></div></details>'
    );
  }

  const CENTRAL_SYNC_START = Date.parse("2026-07-25T00:00:00Z");

  function inspectionEquipmentType(type) {
    return ({ "53": "53_trailer", container: "container", pup: "single_pup", doubles: "doubles", bobtail: "bobtail" })[type] || "bobtail";
  }

  function inspectionPhotoRecords(entry) {
    const requiredLabels = equipment[entry.type]?.photos || [];
    const required = requiredLabels.flatMap((label, index) => {
      const photo = entry.photos?.[index];
      return photo?.data_url ? [{
        key: `required-${index}`,
        label,
        order: index,
        required: true,
        photo
      }] : [];
    });
    const extras = (entry.extra_photos || []).flatMap((photo, index) => photo?.data_url ? [{
      key: `extra-${index}`,
      label: photo.name || `Additional photo ${index + 1}`,
      order: requiredLabels.length + index,
      required: false,
      photo
    }] : []);
    return [...required, ...extras];
  }

  function safePhotoName(value, fallback) {
    const cleaned = String(value || fallback).replace(/[^A-Za-z0-9._-]/g, "-").slice(-90);
    return cleaned || fallback;
  }

  async function syncInspectionPhotos(entry, companyId, userId) {
    if (entry.photos_synced_to_supabase) return false;
    const photos = inspectionPhotoRecords(entry);
    if (!photos.length) {
      entry.photos_synced_to_supabase = true;
      return true;
    }

    const { data: existingRows, error: existingError } = await supabaseClient
      .from("inspection_photos")
      .select("photo_key")
      .eq("inspection_id", entry.id)
      .is("deleted_at", null);
    if (existingError) throw existingError;
    const existingKeys = new Set((existingRows || []).map(row => row.photo_key));

    for (const item of photos) {
      if (existingKeys.has(item.key)) continue;
      const response = await fetch(item.photo.data_url);
      if (!response.ok) throw new Error(`Unable to prepare ${item.label}.`);
      const blob = await response.blob();
      const fileName = safePhotoName(item.photo.name, `${item.key}.jpg`);
      const storagePath = `${companyId}/${userId}/${entry.id}/${item.key}-${fileName}`;
      const { error: uploadError } = await supabaseClient.storage
        .from("inspection-photos")
        .upload(storagePath, blob, {
          contentType: item.photo.type || blob.type || "image/jpeg",
          upsert: false
        });
      if (uploadError && !/already exists|duplicate/i.test(uploadError.message || "")) throw uploadError;

      const { error: rowError } = await supabaseClient.from("inspection_photos").insert({
        company_id: companyId,
        inspection_id: entry.id,
        driver_id: userId,
        photo_key: item.key,
        photo_label: item.label,
        display_order: item.order,
        is_required: item.required,
        status: "uploaded",
        source: "upload",
        storage_path: storagePath,
        original_file_name: item.photo.name || fileName,
        mime_type: item.photo.type || blob.type || "image/jpeg",
        file_size_bytes: blob.size,
        captured_at: entry.submitted_at || new Date().toISOString(),
        gps_status: "not_captured",
        created_by: userId,
        updated_by: userId
      });
      if (rowError && rowError.code !== "23505") throw rowError;
    }
    entry.photos_synced_to_supabase = true;
    return true;
  }

  async function syncInspection(entry) {
    if (!supabaseClient) return false;
    const submittedTime = Date.parse(entry.submitted_at || "");
    if (!Number.isFinite(submittedTime) || submittedTime < CENTRAL_SYNC_START) return false;
    if (entry.synced_to_supabase && entry.photos_synced_to_supabase) return false;

    const metadataEntry = { ...entry, photos: {}, extra_photos: [] };
    const { data, error } = await supabaseClient.functions.invoke("sync-inspection", {
      body: { entry: metadataEntry }
    });
    if (error) throw error;
    if (!data?.ok) throw new Error(data?.error || "The inspection could not be synchronized.");

    for (const item of inspectionPhotoRecords(entry)) {
      const { data: photoData, error: photoError } = await supabaseClient.functions.invoke("sync-inspection", {
        body: {
          entry: { id: entry.id, submitted_at: entry.submitted_at },
          photo_item: item
        }
      });
      if (photoError) throw photoError;
      if (!photoData?.ok) throw new Error(photoData?.error || `The photo ${item.label} could not be synchronized.`);
    }

    entry.inspection_number = data.inspection_number || entry.inspection_number;
    entry.synced_to_supabase = true;
    entry.photos_synced_to_supabase = true;
    return true;
  }

  async function syncPendingInspections() {
    let changed = false;
    const failures = [];
    for (const entry of state.entries) {
      try {
        if (await syncInspection(entry)) changed = true;
      } catch (error) {
        console.warn("Inspection sync pending:", error);
        failures.push({ entry, error });
      }
    }
    if (changed) await dbSet("entries", state.entries);
    return failures;
  }

  function localEntryRetentionHours() {
    const configured = Number(state.entryRetentionHours || cfg.LOCAL_ENTRY_RETENTION_HOURS);
    return Number.isFinite(configured) && configured > 0 ? configured : 24;
  }

  async function removeConfirmedEntriesAfterRetentionPeriod() {
    const cutoff = Date.now() - (localEntryRetentionHours() * 60 * 60 * 1000);
    const kept = state.entries.filter((entry) => {
      if (!entry.end_shift_email_confirmed_at) return true;
      if (!entry.synced_to_supabase || !entry.photos_synced_to_supabase) return true;
      const confirmed = Date.parse(entry.end_shift_email_confirmed_at);
      return !Number.isFinite(confirmed) || confirmed > cutoff;
    });
    if (kept.length !== state.entries.length) {
      state.entries = kept;
      await dbSet("entries", state.entries);
    }
  }

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
  menuBtn.onclick = showResourceMenu;
  document.getElementById("feedbackFooter").onclick = () => navigate("feedback");

  function header(name) {
    title.textContent = name;
    const hide = state.screen === "login" || state.screen === "home";
    backBtn.classList.toggle("hidden", hide);
    homeBtn.classList.toggle("hidden", hide);
    menuBtn.classList.toggle("hidden", state.screen !== "home");
  }

  function render() {
    const map = {
      login: renderLogin,
      passwordChange: renderPasswordChange,
      home: renderHome,
      pretrip: renderPreTrip,
      newEntry: renderNewEntry,
      inspection: renderInspection,
      inspectionPhotos: renderInspectionPhotos,
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
        <p class="field-help">Use the Employee ID and password provided by your administrator.</p>
      </section>`;

    document.getElementById("loginBtn").onclick = async () => {
      const id = document.getElementById("employeeId").value.trim();
      const pass = document.getElementById("password").value;
      if (!id || !pass) {
        return showModal("Missing information", "<p>Employer ID and password are required.</p>");
      }
      if (!supabaseClient) {
        return showModal("Login unavailable", "<p>The secure login service is not configured.</p>");
      }

      const button = document.getElementById("loginBtn");
      button.disabled = true;
      button.textContent = "Logging in…";
      try {
        const { data, error } = await supabaseClient.functions.invoke("driver-auth", {
          body: { action: "login", employeeId: id, password: pass }
        });
        if (error) throw error;
        if (!data?.ok) throw new Error(data?.error || "Unable to log in.");
        const { error: sessionError } = await supabaseClient.auth.setSession({
          access_token: data.accessToken,
          refresh_token: data.refreshToken
        });
        if (sessionError) throw sessionError;
        state.user = data.profile;
        writeJson("fp365_user", state.user);
        await Promise.all([loadActiveTrucks(), loadCompanyContent(), loadCompanyPreferences()]);
        await removeConfirmedEntriesAfterRetentionPeriod();
        navigate(data.mustChangePassword ? "passwordChange" : "home", false);
      } catch (err) {
        showModal("Login unsuccessful", `<p>${esc(err.message || String(err))}</p>`);
        button.disabled = false;
        button.textContent = "Log In";
      }
    };

    document.getElementById("forgotBtn").onclick = () =>
      showModal("Password reset", "<p>Password reset will be connected to the company roster and Supabase Auth in the production release.</p>");
  }

  function renderPasswordChange() {
    header("Create New Password");
    main.innerHTML = `
      <section class="card">
        <h2>Temporary password accepted</h2>
        <p>You must create a permanent password before continuing.</p>
        <label>New password</label>
        <input id="newPassword" type="password" autocomplete="new-password" placeholder="At least 8 letters and numbers" />
        <label>Confirm new password</label>
        <input id="confirmPassword" type="password" autocomplete="new-password" placeholder="Enter the password again" />
        <p class="field-help">Use at least 8 letters and numbers, including one capital and one number. Do not use special characters or your Employee ID.</p>
        <button id="changePasswordBtn" class="primary" style="margin-top:16px">Save New Password</button>
      </section>`;

    document.getElementById("changePasswordBtn").onclick = async () => {
      const password = document.getElementById("newPassword").value;
      const confirmation = document.getElementById("confirmPassword").value;
      const employeeId = String(state.user?.employee_id || "");
      const valid = password.length >= 8 &&
        /[A-Z]/.test(password) &&
        /[A-Za-z]/.test(password) &&
        /\d/.test(password) &&
        /^[A-Za-z0-9]+$/.test(password) &&
        !password.toLowerCase().includes(employeeId.toLowerCase());
      if (!valid) {
        return showModal("Password not accepted", "<p>Use at least 8 letters and numbers, including one capital and one number. Do not use special characters or your Employee ID.</p>");
      }
      if (password !== confirmation) {
        return showModal("Passwords do not match", "<p>Enter the same new password in both fields.</p>");
      }

      const button = document.getElementById("changePasswordBtn");
      button.disabled = true;
      button.textContent = "Saving…";
      try {
        const { data, error } = await supabaseClient.functions.invoke("driver-auth", {
          body: { action: "change_password", password }
        });
        if (error) throw error;
        if (!data?.ok) throw new Error(data?.error || "Unable to change the password.");
        navigate("home", false);
        showModal("Password updated", "<p>Your permanent password is ready. Use it the next time you log in.</p>");
      } catch (err) {
        button.disabled = false;
        button.textContent = "Save New Password";
        showModal("Password was not changed", `<p>${esc(err.message || String(err))}</p>`);
      }
    };
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
    document.getElementById("logoutBtn").onclick = logoutDriver;
  }

  async function logoutDriver() {
    try {
      if (supabaseClient) await supabaseClient.auth.signOut();
    } catch (error) {
      console.warn("Supabase sign-out failed; clearing the local session.", error);
    } finally {
      localStorage.removeItem("fp365_user");
      state.user = null;
      state.history = [];
      state.screen = "login";
      if (modal.open) modal.close();
      render();
    }
  }

  function renderPreTrip() {
    header("Quick Pre-Trip Checklist");
    const items = checklistItems("question_pre");
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
          chassis: "",
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
    main.innerHTML = `
      <section class="card">
        <h2>Trip and equipment details</h2>
        <p class="field-help">Every field is required. Use the NA button where it legitimately does not apply.</p>
        <label>Truck number</label>
        <select id="truck">
          <option value="">Select truck number</option>
          ${activeTrucks.map(t => `<option value="${t}" ${c.truck === t ? "selected" : ""}>${t}</option>`).join("")}
          <option value="NA" ${c.truck === "NA" ? "selected" : ""}>NA</option>
        </select>
        ${c.type === "container"
          ? textField("Trailer ID","trailer1",c.trailer1) + textField("Chassis ID","chassis",c.chassis)
          : c.type !== "bobtail" ? numericField("Trailer 1 number","trailer1",c.trailer1) : ""}
        ${c.type === "doubles" ? numericField("Dolly number","dolly",c.dolly) + numericField("Trailer 2 number","trailer2",c.trailer2) : ""}
        ${textField("Location From","from",c.from)}
        ${textField("Location To","to",c.to)}
        <label>Notes</label>
        <textarea id="notes" placeholder="Enter notes or NA">${esc(c.notes)}</textarea>
      </section>

      <div class="grid two">
        <button id="saveBtn" class="secondary">Save Entry</button>
        <button id="nextBtn" class="primary">Continue to Photos</button>
      </div>`;

    document.querySelectorAll(".na-btn").forEach(button => {
      button.onclick = () => {
        const input = document.getElementById(button.dataset.target);
        input.value = "NA";
        input.focus();
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
      const missing = validateTripDetails();
      if (missing.length) {
        return showModal("Complete required items", `<p>${missing.map(esc).join("<br>")}</p>`);
      }
      navigate("inspectionPhotos");
    };
  }

  function renderInspectionPhotos() {
    if (!state.current) return goHome();
    header("Inspection Photos");
    const c = state.current;
    const photoList = equipment[c.type].photos;
    main.innerHTML = `
      <section class="card">
        <h2>${photoList.length ? "Required photos" : "Inspection photos"}</h2>
        <p class="field-help">${photoList.length ? "Take or upload every required photo before continuing." : "No required photos are configured for this equipment. You may add photos if needed."}</p>
        ${photoList.map((p,i) => photoControl(p, i, c.photos[i])).join("")}
        <div class="photo-item">
          <strong>Additional photos</strong>
          <div class="photo-actions">
            <label class="file-label">Take Photo<input id="extraCamera" type="file" accept="image/*" capture="environment" multiple></label>
            <label class="file-label">Upload Photo<input id="extraUpload" type="file" accept="image/*" multiple></label>
          </div>
          <div class="status ${c.extra_photos.length ? "ok":"missing"}">${c.extra_photos.length} added</div>
          ${c.extra_photos.map((photo, i) => `<div class="photo-item" style="margin-top:10px"><img class="photo-preview expandable-photo" src="${photo.data_url}" alt="${esc(photo.name || `Additional photo ${i + 1}`)}" title="Tap to enlarge"><button type="button" class="danger remove-extra" data-index="${i}" style="margin-top:8px">Remove Extra Photo</button></div>`).join("")}
        </div>
      </section>
      <section class="card">
        <button id="bypassBtn" type="button" class="${c.bypass ? "danger" : "secondary"}" style="width:100%">${c.bypass ? "Bypass Active — Red Flag" : "Bypass Required Photos"}</button>
        <div id="bypassWrap" style="${c.bypass ? "" : "display:none"};margin-top:12px">
          <div class="alert"><strong>RED FLAG:</strong> An explanation is required and will be saved with this entry.</div>
          <label>Bypass explanation</label>
          <textarea id="bypassReason" placeholder="Explain exactly what is being bypassed and why">${esc(c.bypass_reason)}</textarea>
          <button id="cancelBypass" type="button" class="secondary">Cancel Bypass</button>
        </div>
      </section>
      <button id="photosContinue" class="primary">Continue to Final Review</button>`;

    const bypassBtn = document.getElementById("bypassBtn");
    bypassBtn.onclick = () => { c.bypass = true; document.getElementById("bypassWrap").style.display = ""; bypassBtn.textContent = "Bypass Active — Red Flag"; bypassBtn.className = "danger"; };
    document.getElementById("cancelBypass").onclick = () => { c.bypass = false; c.bypass_reason = ""; document.getElementById("bypassReason").value = ""; document.getElementById("bypassWrap").style.display = "none"; bypassBtn.textContent = "Bypass Required Photos"; bypassBtn.className = "secondary"; };
    document.querySelectorAll(".expandable-photo").forEach(img => { if (img.src) img.onclick = () => showPhoto(img.src, img.alt || "Photo"); });
    document.querySelectorAll(".required-photo").forEach(input => { input.onchange = async e => { const file = e.target.files?.[0]; if (!file) return; const index = e.target.dataset.index; c.photos[index] = await fileRecord(file); updatePhotoStatus(index, c.photos[index]); }; });
    document.querySelectorAll(".remove-required").forEach(button => { button.onclick = () => { delete c.photos[button.dataset.index]; renderInspectionPhotos(); }; });
    const extraHandler = async e => { for (const file of [...(e.target.files || [])]) c.extra_photos.push(await fileRecord(file)); renderInspectionPhotos(); };
    document.getElementById("extraCamera").onchange = extraHandler;
    document.getElementById("extraUpload").onchange = extraHandler;
    document.querySelectorAll(".remove-extra").forEach(button => { button.onclick = () => { c.extra_photos.splice(Number(button.dataset.index), 1); renderInspectionPhotos(); }; });
    document.getElementById("photosContinue").onclick = () => {
      c.bypass_reason = document.getElementById("bypassReason")?.value.trim() || "";
      const missing = validatePhotos();
      if (missing.length) return showModal("Complete required photos", `<p>${missing.map(esc).join("<br>")}</p>`);
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
    const ids = ["truck","trailer1","chassis","trailer2","dolly","from","to","notes"];
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) state.current[id] = el.value.trim();
    });
    state.current.bypass_reason = document.getElementById("bypassReason")?.value.trim() || "";
  }

  function validateTripDetails() {
    const c = state.current;
    const missing = [];
    ["truck","from","to","notes"].forEach(k => { if (!c[k]) missing.push(labelFor(k)); });
    if (c.type !== "bobtail" && !c.trailer1) missing.push("Trailer 1 number");
    if (c.type === "container" && !c.chassis) missing.push("Chassis ID");
    if (c.type === "doubles") {
      if (!c.dolly) missing.push("Dolly number");
      if (!c.trailer2) missing.push("Trailer 2 number");
    }
    return missing;
  }

  function validatePhotos() {
    const c = state.current;
    const missing = [];
    if (!c.bypass) equipment[c.type].photos.forEach((label,i) => { if (!c.photos[i]) missing.push(label); });
    else if (!c.bypass_reason) missing.push("Bypass explanation");
    return missing;
  }

  function labelFor(key) {
    return ({ truck:"Truck number", from:"Location From", to:"Location To", notes:"Notes" })[key] || key;
  }

  function renderCertification() {
    header("Driver Certification");
    const items = checklistItems("question_final");
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
      try {
        await syncInspection(state.entries[0]);
        await dbSet("entries", state.entries);
        showModal("Entry submitted", "<p>Your inspection was submitted successfully.</p>");
      } catch (error) {
        console.warn("Inspection sync pending:", error);
        showModal("Entry saved", "<p>Your inspection is safe on this device and will submit automatically when the connection is available.</p>");
      }
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
          ${e.chassis ? detail("Chassis ID", e.chassis) : ""}
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
    const items = checklistItems("question_post");

    const now = new Date();
    const todayEntries = driverEntries().filter(entry => {
      const submitted = new Date(entry.submitted_at || entry.created_at);
      return submitted.getFullYear() === now.getFullYear()
        && submitted.getMonth() === now.getMonth()
        && submitted.getDate() === now.getDate();
    }).sort((a, b) => {
      const aSubmitted = new Date(a.submitted_at || a.created_at).getTime();
      const bSubmitted = new Date(b.submitted_at || b.created_at).getTime();
      return aSubmitted - bSubmitted;
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
        const syncFailures = await syncPendingInspections();
        const unsynced = todayEntries.filter(entry =>
          !entry.synced_to_supabase || !entry.photos_synced_to_supabase
        );
        if (unsynced.length) {
          const matchingFailure = syncFailures.find(({ entry }) => unsynced.some(item => item.id === entry.id));
          throw new Error(matchingFailure?.error?.message || "The inspection or its photos are still uploading. Please keep the app open and try End of Shift again.");
        }
        const { data, error } = await supabaseClient.functions.invoke(
          cfg.END_SHIFT_FUNCTION || "send-end-shift",
          { body: payload }
        );
        if (error) throw error;
        if (!data?.ok) throw new Error(data?.error || "The report email was not confirmed.");

        const confirmedAt = new Date().toISOString();
        todayEntries.forEach((entry) => {
          entry.end_shift_email_confirmed_at = confirmedAt;
        });
        await dbSet("entries", state.entries);

        showModal(
          "Report emailed",
          `<p>Your printable End-of-Shift PDF containing ${todayEntries.length} inspection${todayEntries.length === 1 ? "" : "s"} was emailed to the Admin and your driver email.</p><p>Have a good night.</p>`
        );
        await supabaseClient.auth.signOut();
        localStorage.removeItem("fp365_user");
        state.user = null;
        state.history = [];
        state.screen = "login";
        setTimeout(render, 500);
      } catch (err) {
        button.disabled = false;
        button.textContent = "Email Report and Complete End of Shift";
        showModal(
          "End of Shift could not be confirmed",
          `<p>${esc(err.message || String(err))}</p><p>The report may have been delivered, but completion was not confirmed.</p><p>You can try again or log out now.</p><button type="button" id="endShiftErrorLogout" class="danger">Log Out Now</button>`
        );
        document.getElementById("endShiftErrorLogout").onclick = logoutDriver;
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
    await removeConfirmedEntriesAfterRetentionPeriod();
    if (supabaseClient) {
      const { data } = await supabaseClient.auth.getSession();
      if (!data.session) {
        state.user = null;
        localStorage.removeItem("fp365_user");
        state.screen = "login";
      } else {
        await Promise.all([loadActiveTrucks(), loadCompanyContent(), loadCompanyPreferences()]);
        await removeConfirmedEntriesAfterRetentionPeriod();
        await syncPendingInspections();
      }
    }
    render();
  }

  init().catch(err => {
    console.error(err);
    render();
    showModal("Storage notice", "<p>The app opened, but device storage could not be initialized.</p>");
  });
})();
