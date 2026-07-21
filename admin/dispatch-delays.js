(()=>{
  const $ = id => document.getElementById(id);
  const STORAGE_KEY = "fp365_dispatch_delays_v1";
  const knownViews = ["login","dashboard","drivers","dispatch","trucks","recipients","audit","settings"];
  let records = [];

  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  })[char]);

  const today = () => {
    const date = new Date();
    const offset = date.getTimezoneOffset();
    return new Date(date.getTime() - offset * 60000).toISOString().slice(0,10);
  };

  const minutesBetween = (scheduled, actual) => {
    if (!scheduled || !actual) return 0;
    const [sh,sm] = scheduled.split(":").map(Number);
    const [ah,am] = actual.split(":").map(Number);
    let scheduledMinutes = sh * 60 + sm;
    let actualMinutes = ah * 60 + am;
    if (actualMinutes < scheduledMinutes) actualMinutes += 24 * 60;
    return Math.max(0, actualMinutes - scheduledMinutes);
  };

  const durationText = minutes => {
    if (!minutes) return "0 minutes";
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (!hours) return `${mins} minute${mins === 1 ? "" : "s"}`;
    return `${hours} hr${hours === 1 ? "" : "s"}${mins ? ` ${mins} min` : ""}`;
  };

  const loadRecords = () => {
    try { records = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); }
    catch { records = []; }
  };

  const saveRecords = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(records));

  const updateDuration = () => {
    $("delayDuration").value = durationText(minutesBetween($("scheduledTime").value, $("actualTime").value));
  };

  const populateDrivers = () => {
    const select = $("dispatchDriver");
    const current = select.value;
    const rows = Array.from(document.querySelectorAll("#driversBody tr"));
    const drivers = rows.map(row => {
      const cells = row.querySelectorAll("td");
      return {
        name: cells[0]?.querySelector("b")?.textContent?.trim() || "",
        employeeId: cells[1]?.textContent?.trim() || ""
      };
    }).filter(item => item.name && item.employeeId);

    select.innerHTML = '<option value="">Select driver</option>' +
      drivers.map(item => `<option value="${esc(item.name)}" data-employee-id="${esc(item.employeeId)}">${esc(item.name)}</option>`).join("");

    if (current && drivers.some(item => item.name === current)) select.value = current;
  };

  const clearForm = () => {
    $("dispatchEditId").value = "";
    $("dispatchFormTitle").textContent = "Add Dispatch Delay";
    $("dispatchDate").value = today();
    $("dispatchDriver").value = "";
    $("dispatchEmployeeId").value = "";
    $("dispatchTruck").value = "";
    $("dispatchTrailer").value = "";
    $("scheduledTime").value = "";
    $("actualTime").value = "";
    $("delayDuration").value = "0 minutes";
    $("delayReason").value = "";
    $("delayNotes").value = "";
    $("saveDispatch").textContent = "Save Delay";
    $("dispatchMsg").textContent = "";
    $("dispatchMsg").className = "";
  };

  const render = () => {
    const body = $("dispatchBody");
    const sorted = [...records].sort((a,b) => `${b.date} ${b.actual}`.localeCompare(`${a.date} ${a.actual}`));
    body.innerHTML = sorted.map(item => `<tr>
      <td>${esc(item.date)}</td><td><b>${esc(item.driver)}</b><br><small>${esc(item.employeeId)}</small></td>
      <td>${esc(item.truck)}</td><td>${esc(item.trailer)}</td><td>${esc(item.scheduled)}</td>
      <td>${esc(item.actual)}</td><td><b>${esc(durationText(item.delayMinutes))}</b></td>
      <td>${esc(item.reason)}${item.notes ? `<br><small>${esc(item.notes)}</small>` : ""}</td>
      <td><div class="dispatch-row-actions"><button class="edit-button" data-edit-delay="${esc(item.id)}">Edit</button><button class="danger-button" data-delete-delay="${esc(item.id)}">Delete</button></div></td>
    </tr>`).join("") || '<tr><td colspan="9">No dispatch delays have been entered.</td></tr>';

    body.querySelectorAll("[data-edit-delay]").forEach(button => button.onclick = () => editRecord(button.dataset.editDelay));
    body.querySelectorAll("[data-delete-delay]").forEach(button => button.onclick = () => deleteRecord(button.dataset.deleteDelay));
  };

  const editRecord = id => {
    const item = records.find(record => record.id === id);
    if (!item) return;
    $("dispatchEditId").value = item.id;
    $("dispatchFormTitle").textContent = "Edit Dispatch Delay";
    $("dispatchDate").value = item.date;
    $("dispatchDriver").value = item.driver;
    $("dispatchEmployeeId").value = item.employeeId;
    $("dispatchTruck").value = item.truck;
    $("dispatchTrailer").value = item.trailer;
    $("scheduledTime").value = item.scheduled;
    $("actualTime").value = item.actual;
    $("delayReason").value = item.reason;
    $("delayNotes").value = item.notes || "";
    $("delayDuration").value = durationText(item.delayMinutes);
    $("saveDispatch").textContent = "Update Delay";
    window.scrollTo({top:0,behavior:"smooth"});
  };

  const deleteRecord = id => {
    if (!confirm("Delete this dispatch delay entry?")) return;
    records = records.filter(record => record.id !== id);
    saveRecords();
    render();
    clearForm();
  };

  const saveRecord = () => {
    const selectedOption = $("dispatchDriver").selectedOptions[0];
    const employeeId = $("dispatchEmployeeId").value.trim();
    const values = {
      date: $("dispatchDate").value,
      driver: $("dispatchDriver").value,
      employeeId,
      truck: $("dispatchTruck").value.trim(),
      trailer: $("dispatchTrailer").value.trim(),
      scheduled: $("scheduledTime").value,
      actual: $("actualTime").value,
      reason: $("delayReason").value,
      notes: $("delayNotes").value.trim()
    };

    if (!values.date || !values.driver || !values.employeeId || !values.truck || !values.trailer || !values.scheduled || !values.actual || !values.reason) {
      $("dispatchMsg").textContent = "Complete all required fields.";
      $("dispatchMsg").className = "error";
      return;
    }

    const delayMinutes = minutesBetween(values.scheduled, values.actual);
    const editId = $("dispatchEditId").value;
    const record = {
      id: editId || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())),
      ...values,
      delayMinutes,
      updatedAt: new Date().toISOString()
    };

    if (editId) records = records.map(item => item.id === editId ? record : item);
    else records.push({...record, createdAt:new Date().toISOString()});

    saveRecords();
    render();
    clearForm();
    $("dispatchMsg").textContent = editId ? "Dispatch delay updated." : "Dispatch delay saved.";
    $("dispatchMsg").className = "success";
  };

  const exportCsv = () => {
    if (!records.length) {
      alert("There are no dispatch delays to export.");
      return;
    }
    const headers = ["Dispatch Date","Driver","Employee ID","Truck","Trailer","Scheduled","Actual","Delay Minutes","Delay Reason","Notes"];
    const quote = value => `"${String(value ?? "").replaceAll('"','""')}"`;
    const rows = records.map(item => [item.date,item.driver,item.employeeId,item.truck,item.trailer,item.scheduled,item.actual,item.delayMinutes,item.reason,item.notes].map(quote).join(","));
    const blob = new Blob([[headers.map(quote).join(","),...rows].join("\n")],{type:"text/csv;charset=utf-8"});
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `FP365-Dispatch-Delays-${today()}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const openDispatch = () => {
    knownViews.forEach(id => $(id)?.classList.toggle("hidden", id !== "dispatch"));
    document.querySelectorAll("nav button").forEach(button => button.classList.toggle("active", button.dataset.view === "dispatch"));
    $("title").textContent = "Dispatch Delays";
    populateDrivers();
    render();
    if (!$("dispatchDate").value) clearForm();
  };

  const wireNavigation = () => {
    document.querySelectorAll("nav button").forEach(button => {
      const original = button.onclick;
      if (button.dataset.view === "dispatch") {
        button.onclick = openDispatch;
      } else {
        button.onclick = event => {
          $("dispatch").classList.add("hidden");
          if (typeof original === "function") original.call(button,event);
        };
      }
    });
  };

  $("dispatchDriver").addEventListener("change", () => {
    const option = $("dispatchDriver").selectedOptions[0];
    $("dispatchEmployeeId").value = option?.dataset.employeeId || "";
  });
  $("scheduledTime").addEventListener("input", updateDuration);
  $("actualTime").addEventListener("input", updateDuration);
  $("saveDispatch").addEventListener("click", saveRecord);
  $("cancelDispatch").addEventListener("click", clearForm);
  $("newDispatchDelay").addEventListener("click", clearForm);
  $("exportDispatchCsv").addEventListener("click", exportCsv);

  loadRecords();
  clearForm();
  render();
  setTimeout(wireNavigation,0);
})();