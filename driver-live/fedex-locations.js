(() => {
  "use strict";
  const client = window.FP365_DRIVER_CLIENT;
  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[char]));
  const byId = id => document.getElementById(id);
  let locations = [], selected = null, zoom = 15;

  function numericSort(a, b) {
    return Number(a.code) - Number(b.code) || String(a.code).localeCompare(String(b.code));
  }

  function ensureDialog() {
    if (byId("fedexDriverDialog")) return;
    const dialog = document.createElement("dialog");
    dialog.id = "fedexDriverDialog";
    dialog.className = "fedex-driver-dialog";
    dialog.innerHTML = `
      <div class="fedex-driver-shell">
        <header class="fedex-driver-header">
          <div><div class="fedex-wordmark"><span>Fed</span><b>Ex</b> Locations</div><small>Wade Freight Services</small></div>
          <button id="fedexDriverClose" type="button" aria-label="Close FedEx Locations">×</button>
        </header>
        <main id="fedexDriverBody" class="fedex-driver-body"></main>
      </div>`;
    document.body.appendChild(dialog);
    byId("fedexDriverClose").onclick = closeLocations;
    dialog.addEventListener("cancel", event => { event.preventDefault(); closeLocations(); });

    const photo = document.createElement("dialog");
    photo.id = "fedexDriverPhoto";
    photo.className = "fedex-driver-photo";
    photo.innerHTML = '<button id="fedexDriverPhotoClose" type="button" aria-label="Close photo">×</button><img id="fedexDriverPhotoImage" alt="FedEx location reference">';
    document.body.appendChild(photo);
    byId("fedexDriverPhotoClose").onclick = () => photo.close();
  }

  async function signedFigures(rows) {
    return Promise.all((rows || []).sort((a,b) => a.display_order - b.display_order).map(async row => {
      const {data, error} = await client.storage.from("fedex-location-figures").createSignedUrl(row.storage_path, 3600);
      return {...row, url: error ? "" : data?.signedUrl || ""};
    }));
  }

  async function loadLocations() {
    if (!client) throw new Error("The secure location service is unavailable.");
    const user = JSON.parse(localStorage.getItem("fp365_user") || "null");
    if (!user?.company_id) throw new Error("Your company could not be identified. Log out and back in, then try again.");
    const {data: company, error: companyError} = await client.from("companies").select("company_code").eq("id", user.company_id).maybeSingle();
    if (companyError) throw companyError;
    if (String(company?.company_code || "").toUpperCase() !== "WFS") throw new Error("FedEx Locations is currently available only to Wade Freight drivers.");
    const {data, error} = await client.from("fedex_locations").select("*,fedex_location_figures(*)").eq("company_id", user.company_id).eq("active", true).order("code");
    if (error) throw error;
    locations = await Promise.all((data || []).map(async row => ({...row, figures: await signedFigures(row.fedex_location_figures)})));
    locations.sort(numericSort);
  }

  async function openLocations() {
    ensureDialog();
    const sourceModal = byId("modal");
    if (sourceModal?.open) sourceModal.close();
    byId("fedexDriverBody").innerHTML = '<div class="fedex-driver-loading">Loading FedEx locations…</div>';
    byId("fedexDriverDialog").showModal();
    document.body.classList.add("fedex-driver-open");
    try {
      await loadLocations();
      renderLookup();
    } catch (error) {
      byId("fedexDriverBody").innerHTML = `<section class="fedex-driver-message"><h2>Locations unavailable</h2><p>${esc(error.message)}</p><button type="button" data-fedex-return>Return to Home</button></section>`;
      byId("fedexDriverBody").querySelector("[data-fedex-return]").onclick = closeLocations;
    }
  }

  function closeLocations() {
    byId("fedexDriverDialog")?.close();
    document.body.classList.remove("fedex-driver-open");
    selected = null;
  }

  function renderLookup() {
    const body = byId("fedexDriverBody");
    body.innerHTML = `
      <section class="fedex-driver-search">
        <label for="fedexDriverSelect">Select a location</label>
        <select id="fedexDriverSelect"><option value="">Choose a location</option>${locations.map(row => `<option value="${esc(row.id)}">${esc(row.code)} — ${esc(row.name)}</option>`).join("")}</select>
        <label for="fedexDriverCode">Enter location code</label>
        <div class="fedex-code-entry"><input id="fedexDriverCode" inputmode="numeric" maxlength="10" placeholder="Location code"><button id="fedexDriverFind" type="button" aria-label="Find location">→</button></div>
        <p id="fedexDriverSearchMsg" class="fedex-search-message">${locations.length} location${locations.length === 1 ? "" : "s"} available</p>
      </section>
      <section id="fedexDriverResult" class="fedex-driver-result"><div class="fedex-driver-empty">Choose a location or enter its code.</div></section>`;
    byId("fedexDriverSelect").onchange = event => event.target.value && showLocation(event.target.value);
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
    byId("fedexDriverSelect").value = match.id;
    showLocation(match.id);
  }

  const mapUrl = (latitude, longitude, level = zoom) => `https://www.google.com/maps?q=${latitude},${longitude}&z=${level}&output=embed`;

  function showLocation(id) {
    selected = locations.find(row => row.id === id);
    if (!selected) return;
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
          <div class="fedex-driver-actions"><a href="${mapsUrl}" target="_blank" rel="noopener">⌖ Open in Maps</a>${selected.phone ? `<a href="tel:${String(selected.phone).replace(/\D/g,"")}">☎ Call</a>` : ""}<button type="button" data-fedex-return>⌂ Return to Home</button></div>
        </section>
        ${routes.length ? `<section class="fedex-driver-routes">${routes.map((route,index) => `<details><summary><span>FROM${index ? ` (${index+1})` : ""}: ${esc(route.from)}</span><span>TO${index ? ` (${index+1})` : ""}: ${esc(route.to)}</span></summary><p>${esc(route.directions || "No route directions added.")}</p></details>`).join("")}</section>` : ""}
        <section class="fedex-driver-details"><div><h2>Directions</h2><p>${esc(selected.directions || "No general directions added.")}</p><h2>Instructions</h2><p>${esc(selected.instructions || "No instructions added.")}</p><h2>Notes</h2><p>${esc(selected.notes || "No notes added.")}</p></div><div><h2>Reference Figures</h2><div class="fedex-driver-figures">${selected.figures.filter(row => row.url).map((row,index) => `<button type="button" data-fedex-photo="${index}"><img src="${row.url}" alt="${esc(row.original_name || `Reference photo ${index+1}`)}"></button>`).join("") || '<p>No reference figures added.</p>'}</div><h2>External Links</h2><div class="fedex-driver-links">${(selected.links || []).filter(link => link.url).map(link => `<a href="${esc(link.url)}" target="_blank" rel="noopener">${esc(link.title || link.url)}</a>`).join("") || '<p>No external links added.</p>'}</div></div></section>
      </article>`;
    byId("fedexDriverResult").querySelector("[data-fedex-return]").onclick = closeLocations;
    byId("fedexDriverResult").querySelectorAll("[data-fedex-zoom]").forEach(button => button.onclick = () => changeZoom(Number(button.dataset.fedexZoom)));
    if (byId("fedexDriverLocate")) byId("fedexDriverLocate").onclick = locateDevice;
    byId("fedexDriverResult").querySelectorAll("[data-fedex-photo]").forEach(button => button.onclick = () => openPhoto(Number(button.dataset.fedexPhoto)));
    byId("fedexDriverResult").scrollIntoView({behavior:"smooth",block:"start"});
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

  document.addEventListener("click", event => {
    if (event.target.closest("[data-open-fedex-locations]")) openLocations();
  });
  window.FP365_OPEN_FEDEX_LOCATIONS = openLocations;
})();
