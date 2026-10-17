// PDF layout and Drive archival copied from the deployed driver report on 2026-10-17.
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const COMPANY_NAME = "Wade Freight Systems";
const COMPANY_CODE = "WFS";
const DEFAULT_TIME_ZONE = "America/Chicago";

type Photo = { name?: string; type?: string; data_url?: string };
type Entry = {
  id?: string; employee_id?: string; driver_name?: string; type?: string;
  submitted_at?: string; created_at?: string; truck?: string; trailer1?: string;
  trailer2?: string; dolly?: string; chassis?: string; from?: string; to?: string; notes?: string;
  bypass?: boolean; bypass_reason?: string; photos?: Record<string, Photo>;
  extra_photos?: Photo[];
};
type RequestBody = {
  report_id?: string;
  driver?: { full_name?: string; employee_id?: string; email?: string };
  entries?: Entry[]; shift_date?: string; app_version?: string;
  company_name?: string; company_code?: string; report_sequence?: number;
  time_zone?: string; end_shift_completed_at?: string;
};

function safe(value: unknown, fallback = "Not provided"): string {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function equipmentName(type?: string): string {
  return ({
    "53": "53’ Trailer",
    container: "Container",
    doubles: "Doubles",
    pup: "Single Pup",
    bobtail: "Bobtail"
  } as Record<string, string>)[type || ""] || safe(type, "Inspection");
}

function photoLabels(type?: string): string[] {
  if (type === "doubles") return [
    "Fifth wheel plate connected to Trailer 1",
    "Trailer 1 landing gear raised",
    "Pintle hook connected and closed",
    "Safety chains connected",
    "Air, brake, and electrical lines connected",
    "Trailer 1 rear door and seal secure",
    "Fifth wheel plate connected to Trailer 2",
    "Trailer 2 landing gear raised",
    "Trailer 2 rear door and seal secure"
  ];

  if (type === "53" || type === "container" || type === "pup") return [
    "Fifth wheel plate connected",
    "Landing gear raised",
    "Air, brake, and electrical lines connected",
    "Rear door and seal secure"
  ];

  return [];
}

function decodeDataUrl(dataUrl: string): { bytes: Uint8Array; mime: string } | null {
  const match = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl || "");
  if (!match) return null;

  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return { bytes, mime: match[1].toLowerCase() };
}

function wrapText(text: string, maxChars = 74): string[] {
  const words = safe(text, "").split(/\s+/).filter(Boolean);
  if (!words.length) return [""];

  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (test.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }

  if (line) lines.push(line);
  return lines;
}

function formatDateTime(value: unknown, timeZone: string): string {
  if (!value) return "Not provided";

  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return safe(value);

  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZoneName: "short"
  }).format(date);
}

async function googleDriveAccessToken(): Promise<string> {
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  const refreshToken = Deno.env.get("GOOGLE_REFRESH_TOKEN");

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Google Drive credentials are not configured.");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token"
    })
  });
  const result = await response.json();

  if (!response.ok || !result?.access_token) {
    throw new Error(result?.error_description || "Google Drive authorization failed.");
  }

  return result.access_token;
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

export async function uploadPdfToGoogleDrive(
  filename: string,
  pdfBytes: Uint8Array
): Promise<{ id: string; webViewLink: string | null }> {
  const folderId = Deno.env.get("GOOGLE_DRIVE_FOLDER_ID");
  if (!folderId) throw new Error("GOOGLE_DRIVE_FOLDER_ID is not configured.");

  const accessToken = await googleDriveAccessToken();
  const escapeQuery = (value: string) =>
    value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const query = [
    `'${escapeQuery(folderId)}' in parents`,
    `name = '${escapeQuery(filename)}'`,
    "trashed = false"
  ].join(" and ");
  const listUrl = new URL("https://www.googleapis.com/drive/v3/files");
  listUrl.searchParams.set("q", query);
  listUrl.searchParams.set("fields", "files(id)");
  listUrl.searchParams.set("pageSize", "1");

  const listResponse = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const listResult = await listResponse.json();
  if (!listResponse.ok) {
    throw new Error(listResult?.error?.message || "Unable to check Google Drive.");
  }

  const existingId = listResult?.files?.[0]?.id as string | undefined;
  const metadata = existingId
    ? { name: filename }
    : { name: filename, parents: [folderId] };
  const boundary = `fp365-${crypto.randomUUID()}`;
  const encoder = new TextEncoder();
  const body = concatBytes([
    encoder.encode(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`
    ),
    pdfBytes,
    encoder.encode(`\r\n--${boundary}--`)
  ]);
  const uploadUrl = existingId
    ? `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(existingId)}?uploadType=multipart&fields=id%2CwebViewLink`
    : "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id%2CwebViewLink";
  const uploadResponse = await fetch(uploadUrl, {
    method: existingId ? "PATCH" : "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`
    },
    body
  });
  const uploadResult = await uploadResponse.json();

  if (!uploadResponse.ok || !uploadResult?.id) {
    throw new Error(uploadResult?.error?.message || "Google Drive upload failed.");
  }

  return {
    id: uploadResult.id,
    webViewLink: uploadResult.webViewLink || null
  };
}

function reportId(body: RequestBody): string {
  if (body.report_id) return body.report_id;
  const code = safe(body.company_code, COMPANY_CODE)
    .replace(/[^A-Z0-9]/gi, "")
    .toUpperCase();

  const employeeId = safe(body.driver?.employee_id, "UNKNOWN")
    .replace(/[^A-Z0-9]/gi, "")
    .toUpperCase();

  const date = safe(
    body.shift_date,
    new Date().toISOString().slice(0, 10)
  ).replace(/-/g, "");

  const sequence = String(
    Math.max(1, Number(body.report_sequence || 1))
  ).padStart(3, "0");

  return `${code}-${employeeId}-${date}-${sequence}`;
}

export async function makePdf(
  body: RequestBody
): Promise<{ bytes: Uint8Array; reportId: string; generatedAt: string }> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const width = 612;
  const height = 792;
  const margin = 42;
  const bottom = 48;

  const companyName = safe(body.company_name, COMPANY_NAME);
  const id = reportId(body);
  const generatedAt = new Date().toISOString();
  const timeZone = body.time_zone || DEFAULT_TIME_ZONE;
  const driverName = safe(body.driver?.full_name, "Driver");
  const employeeId = safe(body.driver?.employee_id);
  const entries = body.entries || [];

  pdf.setTitle(`End-of-Shift Inspection Report ${id}`);
  pdf.setAuthor("Fleet Protect 365");
  pdf.setSubject(
    `${companyName} end-of-shift inspection report for ${driverName}, Employee ID ${employeeId}`
  );
  pdf.setCreator("Fleet Protect 365");
  pdf.setProducer("Fleet Protect 365");
  pdf.setKeywords([
    "Fleet Protect 365",
    companyName,
    safe(body.company_code, COMPANY_CODE),
    driverName,
    employeeId,
    id,
    safe(body.shift_date),
    ...entries
      .flatMap((entry) => [
        safe(entry.truck, ""),
        safe(entry.trailer1, ""),
        safe(entry.trailer2, ""),
        safe(entry.dolly, "")
      ])
      .filter(Boolean)
  ]);

  let page = pdf.addPage([width, height]);
  let y = height - margin;

  const ensure = (needed = 24) => {
    if (y - needed < bottom) {
      page = pdf.addPage([width, height]);
      y = height - margin;
    }
  };

  const section = (title: string) => {
    ensure(34);
    y -= 6;

    page.drawText(title, {
      x: margin,
      y,
      size: 13,
      font: bold,
      color: rgb(0.08, 0.18, 0.34)
    });

    y -= 7;

    page.drawLine({
      start: { x: margin, y },
      end: { x: width - margin, y },
      thickness: 1,
      color: rgb(0.72, 0.76, 0.82)
    });

    y -= 17;
  };

  const row = (label: string, value: unknown) => {
    const labelWidth = 180;
    const valueLines = wrapText(safe(value), 64);
    const rowHeight = Math.max(20, valueLines.length * 13 + 7);

    ensure(rowHeight);

    page.drawRectangle({
      x: margin,
      y: y - rowHeight + 6,
      width: labelWidth,
      height: rowHeight,
      color: rgb(0.94, 0.96, 0.98)
    });

    page.drawRectangle({
      x: margin + labelWidth,
      y: y - rowHeight + 6,
      width: width - margin * 2 - labelWidth,
      height: rowHeight,
      borderColor: rgb(0.84, 0.86, 0.89),
      borderWidth: 0.5
    });

    page.drawText(label, {
      x: margin + 8,
      y: y - 8,
      size: 10,
      font: bold
    });

    valueLines.forEach((part, index) => {
      page.drawText(part, {
        x: margin + labelWidth + 8,
        y: y - 8 - index * 13,
        size: 10,
        font: regular
      });
    });

    y -= rowHeight;
  };

  page.drawText("Fleet Protect 365", {
    x: margin,
    y,
    size: 20,
    font: bold,
    color: rgb(0.08, 0.18, 0.34)
  });

  y -= 26;

  page.drawText("End-of-Shift Inspection Report", {
    x: margin,
    y,
    size: 16,
    font: bold
  });

  y -= 24;

  section("Driver & Report Information");
  row("Company", companyName);
  row("Driver", driverName);
  row("Employee ID", employeeId);
  row("Report ID", id);
  row("Shift Date", body.shift_date || new Date().toISOString().slice(0, 10));
  row("Report Emailed To", body.driver?.email || RECIPIENT);
  row("Inspection Count", entries.length);
  row("Application Version", body.app_version || "Driver v1.7");

  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index];

    section(`Inspection ${index + 1} — ${equipmentName(entry.type)}`);

    row("Inspection ID", entry.id);
    row(
      "Submitted",
      formatDateTime(entry.submitted_at || entry.created_at, timeZone)
    );
    row("Truck", entry.truck);

    if (entry.trailer1) row("Trailer 1", entry.trailer1);
    if (entry.chassis) row("Chassis ID", entry.chassis);
    if (entry.dolly) row("Dolly", entry.dolly);
    if (entry.trailer2) row("Trailer 2", entry.trailer2);

    row("Location From", entry.from);
    row("Location To", entry.to);
    row("Notes", entry.notes);

    if (entry.bypass) {
      row(
        "RED FLAG / BYPASS",
        entry.bypass_reason || "Reason not provided"
      );
    }

    section("Compliance Audit Trail");
    row("Pre-Trip Checklist", "Completed");
    row("Pre-Trip Completed By", entry.driver_name || driverName);
    row(
      "Pre-Trip Date/Time",
      formatDateTime(entry.created_at, timeZone)
    );
    row("Inspection Submitted By", entry.driver_name || driverName);
    row(
      "Inspection Submitted Date/Time",
      formatDateTime(entry.submitted_at || entry.created_at, timeZone)
    );
    row("Driver Certification", "Certified complete and accurate");
    row("Certified By", entry.driver_name || driverName);
    row(
      "Certification Date/Time",
      formatDateTime(entry.submitted_at || entry.created_at, timeZone)
    );

    const requiredLabels = photoLabels(entry.type);
    const photos: Array<{ label: string; photo: Photo }> = [];

    Object.entries(entry.photos || {}).forEach(([key, photo]) => {
      if (photo?.data_url) {
        photos.push({
          label:
            requiredLabels[Number(key)] ||
            `Required photo ${Number(key) + 1}`,
          photo
        });
      }
    });

    (entry.extra_photos || []).forEach((photo, photoIndex) => {
      if (photo?.data_url) {
        photos.push({
          label: `Additional photo ${photoIndex + 1}`,
          photo
        });
      }
    });

    section(`Photo Documentation (${photos.length})`);

    if (!photos.length) {
      row("Photos", "No photos were available in this record.");
      continue;
    }

    for (const item of photos) {
      const decoded = decodeDataUrl(item.photo.data_url || "");

      if (!decoded) {
        row(item.label, "Photo could not be decoded.");
        continue;
      }

      try {
        const embedded = decoded.mime.includes("png")
          ? await pdf.embedPng(decoded.bytes)
          : await pdf.embedJpg(decoded.bytes);

        const maxWidth = width - margin * 2;
        const maxHeight = 300;
        const scale = Math.min(
          maxWidth / embedded.width,
          maxHeight / embedded.height,
          1
        );

        const drawWidth = embedded.width * scale;
        const drawHeight = embedded.height * scale;

        ensure(drawHeight + 38);

        page.drawText(item.label, {
          x: margin,
          y,
          size: 10,
          font: bold
        });

        y -= 14;

        page.drawImage(embedded, {
          x: margin,
          y: y - drawHeight,
          width: drawWidth,
          height: drawHeight
        });

        y -= drawHeight + 18;
      } catch {
        row(item.label, "Photo format could not be added to the PDF.");
      }
    }
  }

  section("Administrative Report Recovery");
  row("Source", "Saved submissions and centrally stored inspection photos");
  row("End-of-Shift Checklist", "Not completed or certified by this administrative send");
  row("Inspection Certification", "Driver certifications remain as recorded at each submission time");
  row("Report Generated", formatDateTime(generatedAt, timeZone));

  const pages = pdf.getPages();

  pages.forEach((pdfPage, pageIndex) => {
    pdfPage.drawLine({
      start: { x: margin, y: 37 },
      end: { x: width - margin, y: 37 },
      thickness: 0.5,
      color: rgb(0.78, 0.78, 0.78)
    });

    pdfPage.drawText(
      `Fleet Protect 365 • ${companyName} • ${id}`,
      {
        x: margin,
        y: 23,
        size: 7.5,
        font: regular,
        color: rgb(0.38, 0.38, 0.38)
      }
    );

    const pageText = `Page ${pageIndex + 1} of ${pages.length}`;
    const pageTextWidth = regular.widthOfTextAtSize(pageText, 7.5);

    pdfPage.drawText(pageText, {
      x: width - margin - pageTextWidth,
      y: 23,
      size: 7.5,
      font: regular,
      color: rgb(0.38, 0.38, 0.38)
    });
  });

  return {
    bytes: await pdf.save(),
    reportId: id,
    generatedAt
  };
}

