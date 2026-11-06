(() => {
  "use strict";
  const byId = id => document.getElementById(id);
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const config = window.FP365_CONFIG;
  const client = config && window.supabase?.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
    auth: { storageKey: "fp365-fedex-locations-auth", detectSessionInUrl: false }
  });
  const login = byId("login"), status = byId("status");
  let locations = [], selected = null, zoom = 15, revision = "", photoRefresh = 0;
  let sessionId = null, generation = 0, pending = false;
  const clear = () => {
    generation++;
    sessionId = null;
    locations = []; selected = null; revision = "";
    byId("fedexDriverPhoto").close();
    byId("fedexDriverPhotoImage").removeAttribute("src");
    byId("fedexDriverBody").replaceChildren();
    byId("fedexDriverBody").hidden = byId("controls").hidden = true;
    login.hidden = false;
  };

  async function refresh() {
    if (pending || !sessionId) return;
    pending = true;
    const current = generation;
    try {
      const {data: profile, error: profileError} = await client.from("employee_profiles")
        .select("company_id,status,role,deleted_at,password_reset_required").eq("id",sessionId).maybeSingle();
      if (profileError) throw profileError;
      if (current !== generation) return;
      if (!profile || profile.status !== "active" || profile.role === "user" || profile.deleted_at || profile.password_reset_required) {
        clear();
        await client.auth.signOut({scope:"local"});
        status.textContent = "An active driver account is required. Complete any password reset in the Driver App.";
        return;
      }
      const {data: company, error: companyError} = await client.from("companies")
        .select("company_code").eq("id",profile.company_id).maybeSingle();
      if (companyError) throw companyError;
      if (current !== generation) return;
      if (String(company?.company_code).toUpperCase() !== "WFS") {
        clear();
        await client.auth.signOut({scope:"local"});
        status.textContent = "FedEx Locations is available only to Wade Freight drivers.";
        return;
      }
      const rows = [];
      for (let offset = 0; ; offset += 500) {
        const {data, error} = await client.from("fedex_locations").select("*,fedex_location_figures(*)")
          .eq("company_id",profile.company_id).eq("active",true).order("code").order("id").range(offset,offset+499);
        if (error) throw error;
        if (current !== generation) return;
        rows.push(...data);
        if (data.length < 500) break;
      }
      rows.sort((a,b) => Number(a.code)-Number(b.code) || String(a.code).localeCompare(String(b.code)));
      rows.forEach(row => (row.fedex_location_figures || []).sort((a,b) => a.display_order-b.display_order || a.id.localeCompare(b.id)));
      const next = JSON.stringify(rows);
      if (next !== revision || Date.now() >= photoRefresh) {
        const updated = await Promise.all(rows.map(async row => ({...row, figures: await Promise.all(
          (row.fedex_location_figures || []).map(async figure => {
            const {data} = await client.storage.from("fedex-location-figures").createSignedUrl(figure.storage_path,3600);
            return {...figure,url:data?.signedUrl || ""};
          })
        )})));
        if (current !== generation) return;
        const previous = selected?.id;
        const input = byId("fedexDriverCode");
        const code = input?.value || "", focused = document.activeElement === input;
        const pickerOpen = byId("fedexDriverPicker")?.open;
        byId("fedexDriverPhoto").close();
        byId("fedexDriverPhotoImage").removeAttribute("src");
        locations = updated;
        selected = null;
        revision = next;
        photoRefresh = Date.now() + 45 * 60000;
        renderLookup();
        if (previous && locations.some(row => row.id === previous)) showLocation(previous, false);
        else if (previous) byId("fedexDriverSearchMsg").textContent = "This location is no longer available.";
        byId("fedexDriverPicker").open = !!pickerOpen;
        byId("fedexDriverCode").value = code;
        if (focused) byId("fedexDriverCode").focus({preventScroll:true});
      }
      status.textContent = "";
    } catch {
      if (current === generation) status.textContent = "Could not refresh locations. Check your connection and try Refresh.";
    } finally {
      pending = false;
      if (current !== generation && sessionId) refresh();
    }
  }

  function open(session) {
    sessionId = session.user.id;
    login.hidden = true;
    byId("controls").hidden = byId("fedexDriverBody").hidden = false;
    status.textContent = "Loading FedEx locations…";
    refresh();
  }

  if (!client) {
    status.textContent = "The sign-in service could not load. Refresh to try again.";
    byId("submit").disabled = true;
    return;
  }
  login.addEventListener("submit", async event => {
    event.preventDefault();
    byId("submit").disabled = true;
    status.textContent = "Signing in…";
    try {
      const {data,error} = await client.functions.invoke("driver-auth", {
        body:{action:"login",employeeId:byId("employee").value.trim(),password:byId("password").value}
      });
      if (error) throw new Error("Sign-in is unavailable. Please try again.");
      if (!data?.ok) throw new Error(data?.error || "Could not sign in.");
      if (data.mustChangePassword) throw new Error("Set your permanent password in the Driver App first.");
      const result = await client.auth.setSession({access_token:data.accessToken,refresh_token:data.refreshToken});
      if (result.error || !result.data.session) throw new Error("Could not start your session. Please try again.");
      open(result.data.session);
    } catch (error) {
      status.textContent = error.message;
    } finally {
      byId("password").value = "";
      byId("submit").disabled = false;
    }
  });
  byId("logout").onclick = async () => {
    clear();
    login.hidden = true;
    status.textContent = "Signing out…";
    const {error} = await client.auth.signOut({scope:"local"});
    login.hidden = false;
    status.textContent = error ? "Sign-out could not be completed. Try again when connected." : "";
    if (error) {
      const {data} = await client.auth.getSession();
      if (data.session) { open(data.session); status.textContent = "Sign-out could not be completed. Try again when connected."; }
    }
  };
  byId("refresh").onclick = refresh;
  byId("fedexDriverPhotoClose").onclick = () => byId("fedexDriverPhoto").close();
  client.auth.onAuthStateChange(event => {
    if (event === "SIGNED_OUT" && sessionId) { clear(); status.textContent = "Please sign in again."; }
  });
  byId("submit").disabled = true;
  client.auth.getSession().then(({data}) => { if (data.session) open(data.session); })
    .finally(() => { byId("submit").disabled = false; });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
  window.addEventListener("online", refresh);
  setInterval(() => { if (!document.hidden) refresh(); }, 30000);

  function renderLookup() {
    const body = byId("fedexDriverBody");
    body.innerHTML = `
      <section class="fedex-driver-search">
        <label>Select a location</label>
        <details id="fedexDriverPicker" class="fedex-location-picker">
          <summary id="fedexDriverPickerLabel">Choose a location</summary>
          <div class="fedex-location-options" role="listbox">${locations.map(row => `<button type="button" role="option" data-fedex-location="${esc(row.id)}"><strong>${esc(row.code)}</strong><span>${esc(row.name)}</span></button>`).join("")}</div>
        </details>
        <label for="fedexDriverCode">Enter location code</label>
        <div class="fedex-code-entry"><input id="fedexDriverCode" inputmode="numeric" maxlength="10" placeholder="Location code"><button id="fedexDriverFind" type="button" aria-label="Find location">→</button></div>
        <p id="fedexDriverSearchMsg" class="fedex-search-message">${locations.length} location${locations.length === 1 ? "" : "s"} available</p>
      </section>
      <section id="fedexDriverResult" class="fedex-driver-result"><div class="fedex-driver-empty">Choose a location or enter its code.</div></section>`;
    body.querySelectorAll("[data-fedex-location]").forEach(button => button.onclick = () => showLocation(button.dataset.fedexLocation));
    byId("fedexDriverFind").onclick = findCode;
    byId("fedexDriverCode").onkeydown = event => { if (event.key === "Enter") findCode(); };
    byId("fedexDriverCode").oninput = event => { event.target.value = event.target.value.replace(/\D/g, "").slice(0,10); };
  }

  function findCode() {
    const code = byId("fedexDriverCode").value.trim();
    const match = locations.find(row => row.code === code);
    if (!match) {
      byId("fedexDriverSearchMsg").textContent = code ? `Location ${code} was not found.` : "Enter a location code.";
      return;
    }
    showLocation(match.id);
  }

  const mapUrl = (latitude, longitude, level = zoom) => `https://www.google.com/maps?q=${latitude},${longitude}&z=${level}&output=embed`;

  function showLocation(id, scroll = true) {
    selected = locations.find(row => row.id === id);
    if (!selected) return;
    byId("fedexDriverPickerLabel").textContent = `${selected.code} — ${selected.name}`;
    byId("fedexDriverPicker").open = false;
    zoom = 15;
    const routes = (selected.routes || []).filter(route => route.from && route.to);
    const hasMap = selected.latitude != null && selected.longitude != null;
    const mapsUrl = hasMap
      ? `https://www.google.com/maps/search/?api=1&query=${selected.latitude},${selected.longitude}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selected.address || `${selected.code} ${selected.name}`)}`;
    byId("fedexDriverResult").innerHTML = `
      <article class="fedex-location-card">
        ${hasMap ? `<div class="fedex-driver-map-wrap"><iframe id="fedexDriverMap" title="${esc(selected.code)} location map" src="${mapUrl(selected.latitude,selected.longitude)}"></iframe><div class="fedex-driver-zoom"><button type="button" data-fedex-zoom="1" aria-label="Zoom in">+</button><button type="button" data-fedex-zoom="-1" aria-label="Zoom out">−</button></div><button id="fedexDriverLocate" class="fedex-driver-locate" type="button" aria-label="Show current location" title="Show current location">➤</button><span id="fedexDriverMapStatus" class="fedex-driver-map-status"></span></div>` : ""}
        <section class="fedex-driver-summary">
          <div><h1>${esc(selected.code)} ${esc(selected.name)}</h1><p>${esc(selected.address || "Address unavailable")}</p><small>${selected.latitude ?? "—"}, ${selected.longitude ?? "—"}</small></div>
          <div class="fedex-driver-actions"><a href="${mapsUrl}" target="_blank" rel="noopener">⌖ Open in Maps</a>${selected.phone ? `<a href="tel:${String(selected.phone).replace(/\D/g,"")}">☎ Call</a>` : ""}<button type="button" data-fedex-return>Back to locations</button></div>
        </section>
        ${routes.length ? `<section class="fedex-driver-routes">${routes.map((route,index) => `<details><summary><span>FROM${index ? ` (${index+1})` : ""}: ${esc(route.from)}</span><span>TO${index ? ` (${index+1})` : ""}: ${esc(route.to)}</span></summary><p>${esc(route.directions || "No route directions added.")}</p></details>`).join("")}</section>` : ""}
        <section class="fedex-driver-details"><div><h2>Directions</h2><p>${esc(selected.directions || "No general directions added.")}</p><h2>Instructions</h2><p>${esc(selected.instructions || "No instructions added.")}</p><h2>Notes</h2><p>${esc(selected.notes || "No notes added.")}</p></div><div><h2>Reference Figures</h2><div class="fedex-driver-figures">${selected.figures.filter(row => row.url).map((row,index) => `<button type="button" data-fedex-photo="${index}"><img src="${esc(row.url)}" alt="${esc(row.original_name || `Reference photo ${index+1}`)}"></button>`).join("") || '<p>No reference figures added.</p>'}</div><h2>External Links</h2><div class="fedex-driver-links">${(selected.links || []).filter(link => /^https?:\/\//i.test(link.url)).map(link => `<a href="${esc(link.url)}" target="_blank" rel="noopener">${esc(link.title || link.url)}</a>`).join("") || '<p>No external links added.</p>'}</div></div></section>
      </article>`;
    byId("fedexDriverResult").querySelector("[data-fedex-return]").onclick = () => { selected = null; renderLookup(); window.scrollTo(0,0); };
    byId("fedexDriverResult").querySelectorAll("[data-fedex-zoom]").forEach(button => button.onclick = () => changeZoom(Number(button.dataset.fedexZoom)));
    if (byId("fedexDriverLocate")) byId("fedexDriverLocate").onclick = locateDevice;
    byId("fedexDriverResult").querySelectorAll("[data-fedex-photo]").forEach(button => button.onclick = () => openPhoto(Number(button.dataset.fedexPhoto)));
    if (scroll) byId("fedexDriverResult").scrollIntoView({behavior:"smooth",block:"start"});
  }

  function changeZoom(delta) {
    if (!selected || !byId("fedexDriverMap")) return;
    zoom = Math.max(3, Math.min(20, zoom + delta));
    byId("fedexDriverMap").src = mapUrl(selected.latitude, selected.longitude, zoom);
  }

  function locateDevice() {
    const status = byId("fedexDriverMapStatus"), button = byId("fedexDriverLocate");
    if (!navigator.geolocation) { status.textContent = "Current location is unavailable."; return; }
    button.disabled = true; status.textContent = "Finding your location…";
    navigator.geolocation.getCurrentPosition(position => {
      byId("fedexDriverMap").src = mapUrl(position.coords.latitude, position.coords.longitude, 16);
      status.textContent = "Showing your current location."; button.disabled = false;
    }, error => {
      status.textContent = error.code === 1 ? "Location permission was denied." : "Current location could not be found.";
      button.disabled = false;
    }, {enableHighAccuracy:true,timeout:15000,maximumAge:60000});
  }

  function openPhoto(index) {
    const figure = selected?.figures?.filter(row => row.url)[index];
    if (!figure) return;
    byId("fedexDriverPhotoImage").src = figure.url;
    byId("fedexDriverPhoto").showModal();
  }

})();
