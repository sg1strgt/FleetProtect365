(() => {
  "use strict";
  const client = window.FP365_ADMIN_CLIENT;
  const byId = id => document.getElementById(id);
  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[char]));
  let profile, company, links = [];

  async function context() {
    if (profile && company) return;
    const {data: session} = await client.auth.getSession();
    if (!session.session?.user) throw new Error("Admin session is unavailable.");
    const {data, error} = await client.from("employee_profiles").select("*,companies(*)").eq("id", session.session.user.id).single();
    if (error) throw error;
    profile = data;
    company = Array.isArray(data.companies) ? data.companies[0] : data.companies;
    if (!company?.id) throw new Error("Company record not found.");
  }

  function decodeBody(value) {
    try { const parsed = JSON.parse(value || "{}"); return {description:String(parsed.description || ""), notes:String(parsed.notes || "")}; }
    catch { return {description:String(value || ""), notes:""}; }
  }

  async function load() {
    try {
      await context();
      byId("importantLinksMsg").textContent = "Loading important links…";
      const {data, error} = await client.from("company_content").select("*").eq("company_id", company.id).eq("content_type", "important_link").order("sort_order").order("title");
      if (error) throw error;
      links = (data || []).map(row => ({...row, ...decodeBody(row.body)}));
      render();
      byId("importantLinksMsg").textContent = "";
    } catch (error) { byId("importantLinksMsg").textContent = error.message; }
  }

  function render() {
    const list = byId("importantLinksList");
    list.innerHTML = links.map(item => `<article class="important-link-item"><div class="important-link-copy"><h3><a href="${esc(item.url)}" target="_blank" rel="noopener">${esc(item.title)}</a></h3><p>${esc(item.description || "No description added.")}</p></div><div class="important-link-actions"><button type="button" data-important-edit="${item.id}">Edit</button><button type="button" class="danger" data-important-remove="${item.id}">Remove</button></div></article>`).join("") || '<p class="empty-content">No important links have been added.</p>';
    list.querySelectorAll("[data-important-edit]").forEach(button => button.onclick = () => openEditor(links.find(item => item.id === button.dataset.importantEdit)));
    list.querySelectorAll("[data-important-remove]").forEach(button => button.onclick = () => removeLink(button.dataset.importantRemove));
  }

  function ensureDialog() {
    if (byId("importantLinkDialog")) return;
    const dialog = document.createElement("dialog");
    dialog.id = "importantLinkDialog";
    dialog.className = "important-link-dialog";
    dialog.innerHTML = `<form id="importantLinkForm"><div class="important-link-dialog-head"><h2 id="importantLinkDialogTitle">Add Important Link</h2><button id="closeImportantLink" type="button" aria-label="Close">×</button></div><input id="importantLinkId" type="hidden"><label>Link Name *<input id="importantLinkName" maxlength="200" required></label><label>Link *<input id="importantLinkUrl" type="url" maxlength="1000" placeholder="https://…" required></label><label>Description *<textarea id="importantLinkDescription" maxlength="1000" rows="4" required></textarea></label><label>Notes <span id="importantLinkNotesCount">0 / 2000</span><textarea id="importantLinkNotes" maxlength="2000" rows="9"></textarea></label><p id="importantLinkFormMsg"></p><div class="important-link-form-actions"><button id="cancelImportantLink" type="button">Cancel</button><button class="primary" type="submit">Save Link</button></div></form>`;
    document.body.appendChild(dialog);
    byId("closeImportantLink").onclick = byId("cancelImportantLink").onclick = () => dialog.close();
    byId("importantLinkForm").onsubmit = saveLink;
    byId("importantLinkNotes").oninput = updateNotesCount;
  }

  function updateNotesCount() { byId("importantLinkNotesCount").textContent = `${byId("importantLinkNotes").value.length} / 2000`; }

  function openEditor(item) {
    ensureDialog();
    byId("importantLinkForm").reset();
    byId("importantLinkId").value = item?.id || "";
    byId("importantLinkName").value = item?.title || "";
    byId("importantLinkUrl").value = item?.url || "";
    byId("importantLinkDescription").value = item?.description || "";
    byId("importantLinkNotes").value = item?.notes || "";
    byId("importantLinkDialogTitle").textContent = item ? "Edit Important Link" : "Add Important Link";
    byId("importantLinkFormMsg").textContent = "";
    updateNotesCount();
    byId("importantLinkDialog").showModal();
  }

  async function saveLink(event) {
    event.preventDefault();
    try {
      await context();
      const id = byId("importantLinkId").value;
      const record = {company_id:company.id, content_type:"important_link", title:byId("importantLinkName").value.trim(), url:byId("importantLinkUrl").value.trim(), body:JSON.stringify({description:byId("importantLinkDescription").value.trim(),notes:byId("importantLinkNotes").value.trim()}), active:true, updated_by:profile.id, updated_at:new Date().toISOString()};
      const query = id ? client.from("company_content").update(record).eq("id", id) : client.from("company_content").insert({...record, created_by:profile.id});
      const {error} = await query;
      if (error) throw error;
      byId("importantLinkDialog").close();
      await load();
    } catch (error) { byId("importantLinkFormMsg").textContent = error.message; }
  }

  async function removeLink(id) {
    const item = links.find(row => row.id === id);
    if (!item || !confirm(`Remove “${item.title}”? This cannot be undone.`)) return;
    const {error} = await client.from("company_content").delete().eq("id", id).eq("company_id", company.id);
    if (error) { byId("importantLinksMsg").textContent = error.message; return; }
    await load();
  }

  document.querySelector('nav [data-view="important_links"]')?.addEventListener("click", event => {
    document.querySelectorAll(".view").forEach(view => view.classList.add("hidden"));
    byId("important_links").classList.remove("hidden");
    document.querySelectorAll("nav [data-view]").forEach(button => button.classList.toggle("active", button === event.currentTarget));
    byId("title").textContent = "Important Links";
    load();
  });
  byId("addImportantLink").onclick = () => openEditor();
  byId("importantLinksHome").onclick = () => document.querySelector('nav [data-view="dashboard"]')?.click();
})();
