import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

type Photo = { name?: string; type?: string; data_url?: string };
type IncidentBody = {
  driver?: { full_name?: string; employee_id?: string; email?: string };
  opened_at?: string;
  time_zone?: string;
  gps?: { latitude?: number; longitude?: number; accuracy_meters?: number; captured_at?: string };
  equipment?: Record<string, unknown>;
  details?: Record<string, unknown>;
  photos?: Photo[];
};

const safe = (value: unknown, fallback = "Not provided") => String(value ?? "").trim() || fallback;
const html = (value: unknown) => safe(value, "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c] || c));

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function reportId(employeeId: string, openedAt: string) {
  const employee = safe(employeeId, "UNKNOWN").replace(/[^A-Z0-9]/gi, "").toUpperCase();
  const stamp = new Date(openedAt).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z").replace("T", "-");
  return `AIR-${employee}-${stamp}`;
}

function formatDateTime(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: true, timeZone, timeZoneName: "short"
  }).format(new Date(value));
}

function decodeDataUrl(dataUrl: string): { bytes: Uint8Array; mime: string } | null {
  const match = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl || "");
  if (!match) return null;
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { bytes, mime: match[1].toLowerCase() };
}

function wrapText(text: string, maxChars: number) {
  const paragraphs = safe(text, "").split(/\r?\n/);
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) { lines.push(""); continue; }
    let line = "";
    for (const word of words) {
      if (!line) line = word;
      else if (`${line} ${word}`.length <= maxChars) line += ` ${word}`;
      else { lines.push(line); line = word; }
    }
    if (line) lines.push(line);
  }
  return lines.length ? lines : [""];
}

export async function makePdf(body: IncidentBody, driver: { full_name: string; employee_id: string; email: string }) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const width = 612, height = 792, margin = 42, bottom = 50;
  const openedAt = safe(body.opened_at, new Date().toISOString());
  const timeZone = safe(body.time_zone, "America/Chicago");
  const id = reportId(driver.employee_id, openedAt);
  const equipment = body.equipment || {};
  const details = body.details || {};
  const gps = body.gps || {};
  let page = pdf.addPage([width, height]);
  let y = height - margin;

  const addPage = () => { page = pdf.addPage([width, height]); y = height - margin; };
  const ensure = (needed: number) => { if (y - needed < bottom) addPage(); };
  const section = (title: string) => {
    ensure(38); y -= 5;
    page.drawText(title, { x: margin, y, size: 13, font: bold, color: rgb(.08, .18, .34) });
    y -= 8;
    page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 1, color: rgb(.7, .74, .8) });
    y -= 17;
  };
  const row = (label: string, value: unknown) => {
    const labelWidth = 176;
    const lines = wrapText(safe(value), 62);
    const rowHeight = Math.max(23, lines.length * 13 + 9);
    ensure(rowHeight);
    page.drawRectangle({ x: margin, y: y - rowHeight + 6, width: labelWidth, height: rowHeight, color: rgb(.94, .96, .98) });
    page.drawRectangle({ x: margin + labelWidth, y: y - rowHeight + 6, width: width - margin * 2 - labelWidth, height: rowHeight, borderColor: rgb(.82, .85, .89), borderWidth: .5 });
    page.drawText(label, { x: margin + 7, y: y - 9, size: 9.5, font: bold });
    lines.forEach((line, index) => page.drawText(line, { x: margin + labelWidth + 7, y: y - 9 - index * 13, size: 9.5, font: regular }));
    y -= rowHeight;
  };
  const narrative = (label: string, value: unknown) => {
    const lines = wrapText(safe(value), 88);
    ensure(34);
    page.drawText(label, { x: margin, y, size: 10.5, font: bold }); y -= 16;
    for (const line of lines) {
      ensure(14);
      page.drawText(line, { x: margin, y, size: 9.5, font: regular }); y -= 13;
    }
    y -= 7;
  };

  pdf.setTitle(`${id} - ACCIDENT/INCIDENT REPORT`);
  pdf.setAuthor("Fleet Protect 365");
  pdf.setSubject(`Accident/Incident report for ${driver.full_name}`);
  pdf.setCreator("Fleet Protect 365");

  page.drawText("Fleet Protect 365", { x: margin, y, size: 21, font: bold, color: rgb(.08, .18, .34) }); y -= 28;
  page.drawText("ACCIDENT/INCIDENT REPORT", { x: margin, y, size: 18, font: bold, color: rgb(.78, .05, .06) }); y -= 28;
  section("Driver and Report Information");
  row("Report ID", id);
  row("Driver Name", driver.full_name);
  row("Employee ID", driver.employee_id);
  row("Driver Email", driver.email);
  row("Date/Time Report Opened", formatDateTime(openedAt, timeZone));
  row("GPS Coordinates", `${safe(gps.latitude)}, ${safe(gps.longitude)}`);
  row("GPS Accuracy", gps.accuracy_meters ? `Approximately ${gps.accuracy_meters} meters` : "Not available");

  section("Equipment");
  row("Tractor Number", equipment.truck);
  row("Trailer 1", equipment.trailer1);
  row("Chassis ID", equipment.chassis);
  row("Dolly Number", equipment.dolly);
  row("Trailer 2", equipment.trailer2);

  section("Incident Location and Conditions");
  row("Nearest City/Town", details.city);
  row("Mile Marker", details.mile_marker);
  row("Nearest Exit", details.nearest_exit);
  row("Highway", details.highway);
  row("Direction", details.direction);
  row("Injuries/Fatalities?", details.injuries);
  row("Hazardous Materials Involved?", details.hazmat);
  row("Fuel Spilled?", details.fuel_spill);

  section("Driver Statement and Sequence of Events");
  narrative("Driver Statement", details.driver_statement);
  section("Witness Information / Statement");
  narrative("Witness Information", details.witness_info);
  section("Tow Company Information");
  row("Tow Company / Contact", details.tow_name);
  row("Tow Company Phone", details.tow_phone);
  section("Police Information");
  row("Police Report Number", details.police_report_number);
  row("Officer Name / Badge", details.officer);
  row("Police Department", details.police_department);
  row("Police Department Phone", details.police_phone);
  section("Details of Incident");
  narrative("Details of Incident", details.incident_details);

  const photos = Array.isArray(body.photos) ? body.photos : [];
  section(`Photo Documentation (${photos.length})`);
  for (let index = 0; index < photos.length; index++) {
    const decoded = decodeDataUrl(photos[index]?.data_url || "");
    if (!decoded) continue;
    try {
      const image = decoded.mime.includes("png") ? await pdf.embedPng(decoded.bytes) : await pdf.embedJpg(decoded.bytes);
      const maxWidth = width - margin * 2;
      const maxHeight = 500;
      const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
      const imageWidth = image.width * scale, imageHeight = image.height * scale;
      ensure(imageHeight + 38);
      page.drawText(`Incident Photo ${index + 1}`, { x: margin, y, size: 11, font: bold }); y -= 17;
      page.drawImage(image, { x: margin, y: y - imageHeight, width: imageWidth, height: imageHeight });
      y -= imageHeight + 20;
    } catch (error) {
      console.error(`Unable to embed incident photo ${index + 1}`, error);
    }
  }

  const pages = pdf.getPages();
  pages.forEach((pdfPage, index) => {
    pdfPage.drawText(`${id}  |  Page ${index + 1} of ${pages.length}`, { x: margin, y: 28, size: 8, font: regular, color: rgb(.35, .39, .44) });
  });
  return { bytes: await pdf.save(), reportId: id, openedAt };
}

async function googleDriveAccessToken() {
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  const refreshToken = Deno.env.get("GOOGLE_REFRESH_TOKEN");
  if (!clientId || !clientSecret || !refreshToken) throw new Error("Google Drive credentials are not configured.");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" })
  });
  const result = await response.json();
  if (!response.ok || !result?.access_token) throw new Error(result?.error_description || "Google Drive authorization failed.");
  return result.access_token as string;
}

function concatBytes(parts: Uint8Array[]) {
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.length; }
  return output;
}

async function uploadToDrive(filename: string, bytes: Uint8Array) {
  const folderId = Deno.env.get("GOOGLE_DRIVE_FOLDER_ID");
  if (!folderId) throw new Error("GOOGLE_DRIVE_FOLDER_ID is not configured.");
  const accessToken = await googleDriveAccessToken();
  const boundary = `fp365-${crypto.randomUUID()}`;
  const encoder = new TextEncoder();
  const body = concatBytes([
    encoder.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: filename, parents: [folderId] })}\r\n--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`),
    bytes,
    encoder.encode(`\r\n--${boundary}--`)
  ]);
  const response = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id%2CwebViewLink", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": `multipart/related; boundary=${boundary}` },
    body
  });
  const result = await response.json();
  if (!response.ok || !result?.id) throw new Error(result?.error?.message || "Google Drive upload failed.");
  return result;
}

export async function handleRequest(req: Request) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed." }, 405);
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const fromEmail = Deno.env.get("FROM_EMAIL") || "Fleet Protect 365 <reports@fleetprotect365.com>";
    const authHeader = req.headers.get("Authorization") || "";
    if (!supabaseUrl || !serviceRoleKey || !resendApiKey || !authHeader.startsWith("Bearer ")) throw new Error("Report services are not configured.");
    const body = await req.json() as IncidentBody;
    if (!body.opened_at || !Number.isFinite(body.gps?.latitude) || !Number.isFinite(body.gps?.longitude)) return json({ ok: false, error: "The incident date/time and exact GPS location are required." }, 400);
    if (!Array.isArray(body.photos) || !body.photos.length) return json({ ok: false, error: "At least one incident photo is required." }, 400);

    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await admin.auth.getUser(authHeader.slice(7));
    if (authError || !authData.user) throw authError || new Error("Driver session is unavailable.");
    const { data: profile, error: profileError } = await admin.from("employee_profiles")
      .select("company_id, full_name, employee_id, email, status").eq("id", authData.user.id).single();
    if (profileError || !profile || profile.status !== "active") throw profileError || new Error("An active driver account is required.");
    const { data: adminRows, error: adminError } = await admin.from("employee_profiles")
      .select("email").eq("company_id", profile.company_id).in("role", ["admin", "super_admin"]).eq("status", "active").is("deleted_at", null);
    if (adminError) throw adminError;
    const recipients = [...new Set([profile.email, ...(adminRows || []).map(row => row.email)].map(value => String(value || "").trim().toLowerCase()).filter(value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)))];
    if (!recipients.length) throw new Error("No active Admin, Super Admin, or driver email recipients were found.");

    const driver = { full_name: safe(profile.full_name, "Driver"), employee_id: safe(profile.employee_id), email: safe(profile.email) };
    const result = await makePdf(body, driver);
    const filename = `${result.reportId}_ACCIDENT_INCIDENT_REPORT.pdf`;
    const driveFile = await uploadToDrive(filename, result.bytes);
    let binary = "";
    for (let i = 0; i < result.bytes.length; i += 0x8000) binary += String.fromCharCode(...result.bytes.subarray(i, i + 0x8000));
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: fromEmail,
        to: recipients,
        subject: `ACCIDENT/INCIDENT REPORT - ${result.reportId} - ${driver.full_name}`,
        html: `<h2 style="color:#c90d10">ACCIDENT/INCIDENT REPORT</h2><p><strong>Driver:</strong> ${html(driver.full_name)}</p><p><strong>Employee ID:</strong> ${html(driver.employee_id)}</p><p><strong>Opened:</strong> ${html(formatDateTime(result.openedAt, safe(body.time_zone, "America/Chicago")))}</p><p><strong>Report ID:</strong> ${html(result.reportId)}</p><p>The full Fleet Protect 365 report is attached and has been archived in Google Drive.</p>`,
        attachments: [{ filename, content: btoa(binary) }]
      })
    });
    const emailResult = await emailResponse.json();
    if (!emailResponse.ok) throw new Error(emailResult?.message || "The report email was rejected.");
    return json({ ok: true, report_id: result.reportId, filename, recipients, drive_archived: true, drive_file_id: driveFile.id, email_id: emailResult?.id || null });
  } catch (error) {
    console.error(error);
    return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 500);
  }
}

if (import.meta.main) Deno.serve(handleRequest);
