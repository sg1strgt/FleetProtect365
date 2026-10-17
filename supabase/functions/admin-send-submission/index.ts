import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { makePdf, uploadPdfToGoogleDrive } from "../_shared/admin-end-shift-pdf.ts";

const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
const day = (value: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const base64 = (bytes: Uint8Array) => { let text = ""; for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(text); };

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  let stage = "authorization";
  let emailAccepted = false;
  try {
    const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer /, "");
    const { data: auth, error: authError } = await client.auth.getUser(token);
    if (authError || !auth.user) return json({ error: "Please sign in again before sending a report." }, 401);
    const { data: admin, error: adminError } = await client.from("employee_profiles").select("company_id,role,status,deleted_at").eq("id", auth.user.id).single();
    if (adminError || !admin || admin.deleted_at || admin.status !== "active" || !["admin", "super_admin"].includes(admin.role)) return json({ error: "Active Admin access is required." }, 403);
    const { inspectionId, action, requestId, expectedInspectionIds, expectedRecipients } = await req.json();
    if (!["preview", "send"].includes(action) || !/^[0-9a-f-]{36}$/i.test(String(inspectionId || ""))) return json({ error: "Select a valid submission." }, 400);
    stage = "submission lookup";
    const { data: selected, error: selectedError } = await client.from("inspections").select("*").eq("id", inspectionId).is("deleted_at", null).single();
    if (selectedError || !selected) return json({ error: "The selected submission is unavailable." }, 404);
    if (selected.company_id !== admin.company_id) return json({ error: "This submission belongs to another company." }, 403);
    if (!selected.submitted_at) return json({ error: "Only submitted inspections can be emailed." }, 400);
    const reportDate = day(selected.submitted_at);
    // A UTC window covers the entire selected Central calendar day, including DST transitions.
    const center = Date.parse(`${reportDate}T12:00:00Z`);
    const [driverResult, companyResult, inspectionsResult, recipientsResult, adminsResult] = await Promise.all([
      client.from("employee_profiles").select("full_name,display_name,employee_id,email").eq("id", selected.driver_id).eq("company_id", admin.company_id).single(),
      client.from("companies").select("company_name,company_code").eq("id", admin.company_id).single(),
      client.from("inspections").select("*").eq("company_id", admin.company_id).eq("driver_id", selected.driver_id).is("deleted_at", null).gte("submitted_at", new Date(center - 36 * 3600000).toISOString()).lt("submitted_at", new Date(center + 36 * 3600000).toISOString()).order("submitted_at"),
      client.from("report_recipients").select("email").eq("company_id", admin.company_id).eq("active", true).eq("receive_end_of_shift", true).is("deleted_at", null),
      client.from("employee_profiles").select("email").eq("company_id", admin.company_id).eq("role", "super_admin").eq("status", "active").is("deleted_at", null)
    ]);
    for (const result of [driverResult, companyResult, inspectionsResult, recipientsResult, adminsResult]) if (result.error) throw result.error;
    const driver = driverResult.data!;
    const company = companyResult.data!;
    const inspections = (inspectionsResult.data || []).filter(row => day(row.submitted_at) === reportDate);
    const ids = inspections.map(row => row.id);
    if (!ids.includes(selected.id)) throw new Error("The selected submission was not found in this shift.");
    const recipients = [...new Set([driver.email, ...(recipientsResult.data || []).map(row => row.email), ...(adminsResult.data || []).map(row => row.email)].map(email => String(email || "").trim().toLowerCase()).filter(email => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))].sort();
    const { data: photos, error: photosError } = await client.from("inspection_photos").select("inspection_id,photo_key,photo_label,is_required,storage_path,mime_type").in("inspection_id", ids).is("deleted_at", null).order("display_order");
    if (photosError) throw photosError;
    const uncertified = inspections.some(row => !row.driver_certified);
    const missingPhotos = inspections.some(row => {
      const required = ({ doubles: 9, "53_trailer": 4, container: 4, single_pup: 4 } as Record<string, number>)[row.equipment_type] || 0;
      return (photos || []).filter(photo => photo.inspection_id === row.id && photo.is_required).length < required;
    });
    const warnings = missingPhotos ? ["Some required inspection photos have not reached the server. The report will include only the saved photos."] : [];
    const preview = { ok: true, driver: driver.full_name || driver.display_name, report_date: reportDate, inspection_count: ids.length, inspection_ids: ids, photo_count: photos?.length || 0, recipients, warnings, can_send: !uncertified && recipients.length > 0, blocked_reason: uncertified ? "One or more inspections lack the driver's certification. They cannot be sent as a certified End-of-Shift report." : !recipients.length ? "No report recipients are configured." : null };
    if (action === "preview") return json(preview);
    if (!preview.can_send) return json({ error: preview.blocked_reason }, 400);
    if (!/^[0-9a-f-]{36}$/i.test(String(requestId || ""))) return json({ error: "Refresh the send preview and try again." }, 400);
    const same = (a: unknown, b: string[]) => Array.isArray(a) && JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
    if (!same(expectedInspectionIds, ids) || !same(expectedRecipients, recipients)) return json({ error: "The shift or recipients changed. Review the updated preview before sending." }, 409);
    const reportId = `${String(company.company_code || "WFS").replace(/[^A-Z0-9]/gi, "").toUpperCase()}-${String(driver.employee_id).replace(/[^A-Z0-9]/gi, "")}-${reportDate.replace(/-/g, "")}-ADMIN-${requestId.replace(/-/g, "").toUpperCase()}`;
    const { data: previous, error: previousError } = await client.from("end_shift_reports").select("email_status,storage_path,email_recipients,inspection_ids,created_at").eq("report_id", reportId).maybeSingle();
    if (previousError) throw previousError;
    if (previous && (!same(previous.email_recipients, recipients) || !same(previous.inspection_ids, ids))) return json({ error: "This send request no longer matches the report. Close and reopen the preview." }, 409);
    if (previous?.email_status === "sent") return json({ ok: true, report_id: reportId, recipients, inspection_count: ids.length, already_sent: true });
    if (previous && Date.now() - Date.parse(previous.created_at) > 23 * 3600000) return json({ error: "This send request has expired. Check the inbox before opening a new send preview." }, 409);
    stage = "PDF generation";
    const entries = [];
    for (const inspection of inspections) {
      const requiredPhotos: Record<string, { name: string; type: string; data_url: string }> = {};
      const extras = [];
      for (const photo of (photos || []).filter(row => row.inspection_id === inspection.id)) {
        const { data: file, error } = await client.storage.from("inspection-photos").download(photo.storage_path);
        if (error || !file) throw new Error(`Unable to load ${photo.photo_label || "an inspection photo"}. Try again before sending.`);
        const image = { name: photo.photo_label || "Photo", type: photo.mime_type || file.type || "image/jpeg", data_url: `data:${photo.mime_type || file.type || "image/jpeg"};base64,${base64(new Uint8Array(await file.arrayBuffer()))}` };
        if (photo.is_required) requiredPhotos[String(photo.photo_key).replace(/^required-/, "")] = image;
        else extras.push(image);
      }
      entries.push({ id: inspection.id, type: ({ "53_trailer": "53", single_pup: "pup" } as Record<string, string>)[inspection.equipment_type] || inspection.equipment_type, submitted_at: inspection.submitted_at, created_at: inspection.started_at || inspection.created_at, truck: inspection.truck_number, trailer1: inspection.trailer_1_number, trailer2: inspection.trailer_2_number, dolly: inspection.dolly_number, chassis: inspection.chassis_id, from: inspection.location_from, to: inspection.location_to, notes: inspection.notes, bypass: inspection.has_bypass, bypass_reason: inspection.template_snapshot?.bypass_reason, driver_name: driver.full_name, photos: requiredPhotos, extra_photos: extras });
    }
    let pdfBytes: Uint8Array;
    if (previous?.storage_path) {
      const { data: saved, error } = await client.storage.from("end-shift-reports").download(previous.storage_path);
      if (error || !saved) throw new Error("The saved send request could not be loaded. Try again.");
      pdfBytes = new Uint8Array(await saved.arrayBuffer());
    } else {
      const generated = await makePdf({ report_id: reportId, driver, entries, shift_date: reportDate, company_name: company.company_name, company_code: company.company_code, time_zone: "America/Chicago", app_version: "Admin recovery from saved submissions" });
      pdfBytes = generated.bytes;
    }
    const filename = `${reportId}_End_of_Shift.pdf`;
    const storagePath = `${admin.company_id}/${selected.driver_id}/${filename}`;
    stage = "report archive";
    const { error: uploadError } = await client.storage.from("end-shift-reports").upload(storagePath, pdfBytes, { contentType: "application/pdf", upsert: true });
    if (uploadError) throw uploadError;
    const { error: archiveError } = await client.from("end_shift_reports").upsert({ company_id: admin.company_id, driver_id: selected.driver_id, report_id: reportId, report_date: reportDate, pdf_file_name: filename, storage_path: storagePath, inspection_ids: ids, email_recipients: recipients, email_status: "pending", drive_status: "pending" }, { onConflict: "report_id" });
    if (archiveError) throw archiveError;
    stage = "email delivery";
    const apiKey = Deno.env.get("RESEND_API_KEY");
    if (!apiKey) throw new Error("Report email is not configured.");
    const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": `admin-submission/${requestId}` }, body: JSON.stringify({ from: Deno.env.get("REPORT_FROM_EMAIL") || "Fleet Protect 365 <reports@fleetprotect365.com>", to: recipients, subject: `${reportId} — End-of-Shift Report — ${driver.full_name || driver.display_name}`, html: `<h2>End-of-Shift Report</h2><p>Driver: ${escapeHtml(driver.full_name || driver.display_name)}</p><p>Report date: ${escapeHtml(reportDate)}</p><p>Sent by an administrator from ${ids.length} saved submission(s). Only centrally saved inspection records and photos are included. This action does not complete the driver's app checklist.</p>`, attachments: [{ filename, content: base64(pdfBytes) }] }) });
    const delivery = await response.json();
    if (!response.ok || !delivery.id) {
      await client.from("end_shift_reports").update({ email_status: "failed", error_message: String(delivery.message || "Email provider rejected the report.") }).eq("report_id", reportId);
      throw new Error(String(delivery.message || "Email provider rejected the report."));
    }
    emailAccepted = true;
    stage = "email status update";
    const { error: statusError } = await client.from("end_shift_reports").update({ email_status: "sent", emailed_at: new Date().toISOString(), completed_at: new Date().toISOString(), error_message: null }).eq("report_id", reportId);
    let driveWarning = null;
    try {
      const drive = await uploadPdfToGoogleDrive(filename, pdfBytes);
      await client.from("end_shift_reports").update({ drive_status: "uploaded", drive_file_id: drive.id, drive_web_view_link: drive.webViewLink, drive_uploaded_at: new Date().toISOString() }).eq("report_id", reportId);
    } catch (error) {
      driveWarning = error instanceof Error ? error.message : String(error);
      await client.from("end_shift_reports").update({ drive_status: "failed", error_message: driveWarning }).eq("report_id", reportId);
    }
    return json({ ok: true, report_id: reportId, recipients, email_id: delivery.id, inspection_count: ids.length, warning: statusError ? "The email provider accepted the report, but its archive status could not be updated. Do not resend without checking your inbox." : driveWarning ? "Email accepted. The PDF is saved in Reports, but the Google Drive copy could not be saved." : null });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error), stage, email_accepted: emailAccepted }, 500);
  }
});
