(() => {
  "use strict";

  const TRUCKS = ["524656", "524657", "524658", "527549"];
  let allowNewInspection = false;

  function readUser() {
    try { return JSON.parse(localStorage.getItem("fp365_user") || "null"); }
    catch { return null; }
  }

  function correctDriverIdentity() {
    const user = readUser();
    if (!user) return;

    if (String(user.employee_id) === "8739135") {
      user.full_name = "Steven Arbucci";
      user.employee_id = "8739135";
      localStorage.setItem("fp365_user", JSON.stringify(user));
    }

    const hero = document.querySelector("main .hero");
    if (hero) {
      const heading = hero.querySelector("h1");
      const paragraph = hero.querySelector("p");
      if (heading && String(user.employee_id) === "8739135") {
        heading.textContent = "Welcome, Steven Arbucci";
      }
      if (paragraph && /Employer ID|Employee ID/i.test(paragraph.textContent || "")) {
        paragraph.textContent = `Employee ID: ${user.employee_id || ""}`;
      }
    }

    document.querySelectorAll(".detail-row").forEach(row => {
      const label = row.querySelector("strong")?.textContent?.trim();
      const value = row.querySelector(".muted");
      if (!value) return;

      if (label === "Driver" && String(user.employee_id) === "8739135") {
        value.textContent = "Steven Arbucci";
      }
      if (label === "Employer ID" || label === "Employee ID") {
        row.querySelector("strong").textContent = "Employee ID";
        value.textContent = user.employee_id || "";
      }
    });
  }

  function removeDriverProfile() {
    document.getElementById("profileBtn")?.remove();
    if (document.getElementById("screenTitle")?.textContent === "Driver Profile") {
      document.getElementById("homeBtn")?.click();
    }
  }

  function convertTruckToDropdown() {
    const input = document.getElementById("truck");
    if (!input || input.tagName === "SELECT") return;

    const select = document.createElement("select");
    select.id = "truck";
    select.innerHTML =
      `<option value="">Select truck</option>` +
      TRUCKS.map(t => `<option value="${t}">${t}</option>`).join("");
    select.value = input.value || "";
    input.replaceWith(select);
    document.getElementById("truckNumbers")?.remove();
  }

  function addNumericAndNA(id) {
    const input = document.getElementById(id);
    if (!input || input.dataset.fixedNumeric === "yes") return;

    input.dataset.fixedNumeric = "yes";
    input.inputMode = "numeric";
    input.pattern = "[0-9]*";
    input.placeholder = "Enter number";

    const row = document.createElement("div");
    row.className = "row";
    input.parentNode.insertBefore(row, input);
    row.appendChild(input);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary";
    button.style.maxWidth = "86px";
    button.textContent = "NA";
    button.onclick = () => {
      if (String(input.value).toUpperCase() === "NA") {
        input.value = "";
        input.readOnly = false;
        input.focus();
      } else {
        input.value = "NA";
        input.readOnly = true;
      }
    };
    row.appendChild(button);
  }

  function relabelEquipmentFields() {
    const title = document.getElementById("screenTitle")?.textContent || "";
    const trailer1 = document.getElementById("trailer1");
    const label = trailer1?.closest(".row")?.previousElementSibling;
    if (label?.tagName !== "LABEL") return;

    if (title.includes("53")) label.textContent = "53’ Trailer number";
    else if (title.includes("Single Pup")) label.textContent = "Single Pup number";
    else if (title.includes("Doubles")) label.textContent = "Trailer 1 number";
  }

  function wireSaveReturnHome() {
    const save = document.getElementById("saveBtn");
    if (!save || save.dataset.homeFix === "yes") return;

    save.dataset.homeFix = "yes";
    save.addEventListener("click", () => {
      setTimeout(() => document.getElementById("homeBtn")?.click(), 50);
    });
  }

  function showPreTrip() {
    document.getElementById("fp365PreTrip")?.remove();

    const dialog = document.createElement("dialog");
    dialog.id = "fp365PreTrip";
    dialog.className = "modal";
    const items = [
      "Walk-around inspection completed",
      "Tires, wheels, lights, and visible components checked",
      "No unsafe condition prevents operation",
      "Required equipment and documents are available"
    ];

    dialog.innerHTML = `
      <form method="dialog" class="modal-card">
        <h2>Quick Pre-Trip Checklist</h2>
        <p class="field-help">Complete every item before selecting equipment.</p>
        ${items.map(item =>
          `<label class="check"><input class="fp-pretrip" type="checkbox"><span>${item}</span></label>`
        ).join("")}
        <button id="fpPreTripContinue" type="button" class="primary">Continue to Equipment Type</button>
        <button value="close" class="secondary" style="margin-top:10px">Cancel</button>
      </form>`;

    document.body.appendChild(dialog);
    dialog.showModal();

    document.getElementById("fpPreTripContinue").onclick = () => {
      if ([...dialog.querySelectorAll(".fp-pretrip")].some(x => !x.checked)) {
        document.getElementById("modalTitle").textContent = "Pre-trip required";
        document.getElementById("modalBody").innerHTML =
          "<p>Complete every pre-trip item before continuing.</p>";
        document.getElementById("modal")?.showModal();
        return;
      }

      allowNewInspection = true;
      dialog.close();
      dialog.remove();
      document.getElementById("newBtn")?.click();
    };
  }

  document.addEventListener("click", event => {
    const button = event.target.closest("#newBtn");
    if (!button) return;

    if (allowNewInspection) {
      allowNewInspection = false;
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    showPreTrip();
  }, true);

  function applyFixes() {
    removeDriverProfile();
    correctDriverIdentity();
    convertTruckToDropdown();
    addNumericAndNA("trailer1");
    addNumericAndNA("dolly");
    addNumericAndNA("trailer2");
    relabelEquipmentFields();
    wireSaveReturnHome();

    const footerVersion = document.querySelector(".footer span");
    if (footerVersion) footerVersion.textContent = "Driver v1.3";
  }

  new MutationObserver(applyFixes).observe(document.getElementById("main"), {
    childList: true,
    subtree: true
  });

  applyFixes();
})();