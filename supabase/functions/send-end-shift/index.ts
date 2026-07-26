import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const RECIPIENT = "steven@fleetprotect365.com";
const COMPANY_NAME = "Wade Freight Systems";
const COMPANY_CODE = "WFS";
const DEFAULT_TIME_ZONE = "America/Chicago";

type Photo = { name?: string; type?: string; data_url?: string };
type Entry = {
  id?: string; employee_id?: string; driver_name?: string; type?: string;
  submitted_at?: string; created_at?: string; truck?: string; trailer1?: string;
  trailer2?: string; dolly?: string; from?: string; to?: string; notes?: string;
  bypass?: boolean; bypass_reason?: string; photos?: Record<string, Photo>;
  extra_photos?: Photo[];
};
type RequestBody = {
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
    "Fifth wheel plate connected to Trailer 2",
    "Trailer 2 landing gear raised"
  ];

  if (type === "53" || type === "pup") return [
    "Fifth wheel plate connected",
    "Landing gear raised",
    "Air, brake, and electrical lines connected"
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

function reportId(body: RequestBody): string {
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

async function makePdf(
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
    const valueLines = wrapText(safe(value), 64);
    const rowHeight = Math.max(20, valueLines.length * 13 + 7);

    ensure(rowHeight);

    page.drawRectangle({
      x: margin,
      y: y - rowHeight + 6,
      width: 150,
      height: rowHeight,
      color: rgb(0.94, 0.96, 0.98)
    });

    page.drawRectangle({
      x: margin + 150,
      y: y - rowHeight + 6,
      width: width - margin * 2 - 150,
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
        x: margin + 158,
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

  section("End-of-Shift Completion");
  row("End-of-Shift Checklist", "Completed");
  row("Completed By", driverName);
  row("Employee ID", employeeId);
  row(
    "Completion Date/Time",
    formatDateTime(
      body.end_shift_completed_at || generatedAt,
      timeZone
    )
  );

  section("Driver Certification");

  row(
    "Certification Statement",
    "I certify that this inspection report and all submitted photographs are true and accurate to the best of my knowledge."
  );
  row("Certified By", driverName);
  row("Employee ID", employeeId);
  row(
    "Certification Date/Time",
    formatDateTime(
      body.end_shift_completed_at || generatedAt,
      timeZone
    )
  );

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        {
          status: 405,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
          }
        }
      );
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const fromEmail =
      Deno.env.get("REPORT_FROM_EMAIL") ||
      "Fleet Protect 365 <reports@fleetprotect365.com>";

    if (!resendApiKey) {
      throw new Error("RESEND_API_KEY is not configured.");
    }

    const body = await req.json() as RequestBody;
    const entries = Array.isArray(body.entries) ? body.entries : [];

    if (!entries.length) {
      return new Response(
        JSON.stringify({
          error: "No inspections were supplied for this shift."
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
          }
        }
      );
    }

    const result = await makePdf({ ...body, entries });
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const authHeader = req.headers.get("Authorization") || "";
    if (!supabaseUrl || !serviceRoleKey || !authHeader.startsWith("Bearer ")) {
      throw new Error("The central report archive is not configured.");
    }
    const serviceClient = createClient(supabaseUrl, serviceRoleKey);
    const token = authHeader.slice(7);
    const { data: authData, error: authError } = await serviceClient.auth.getUser(token);
    if (authError || !authData.user) throw authError || new Error("Driver session is unavailable.");
    const { data: profile, error: profileError } = await serviceClient
      .from("employee_profiles").select("company_id").eq("id", authData.user.id).single();
    if (profileError) throw profileError;

    const { data: existingReport, error: existingReportError } = await serviceClient
      .from("end_shift_reports")
      .select("report_id, storage_path, email_status")
      .eq("report_id", result.reportId)
      .maybeSingle();
    if (existingReportError) throw existingReportError;
    if (existingReport?.email_status === "sent" && existingReport.storage_path) {
      return new Response(
        JSON.stringify({
          ok: true,
          already_completed: true,
          inspection_count: entries.length,
          report_id: result.reportId,
          generated_at: result.generatedAt
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
          }
        }
      );
    }

    let binary = "";
    const chunkSize = 0x8000;

    for (let i = 0; i < result.bytes.length; i += chunkSize) {
      binary += String.fromCharCode(
        ...result.bytes.subarray(i, i + chunkSize)
      );
    }

    const pdfBase64 = btoa(binary);
    const driverName = safe(body.driver?.full_name, "Driver");
    const employeeId = safe(body.driver?.employee_id);
    const shiftDate =
      body.shift_date || new Date().toISOString().slice(0, 10);
    const filename = `${result.reportId}_End_of_Shift.pdf`;
    const driverEmail = String(body.driver?.email || "").trim().toLowerCase();
    const recipients = [...new Set(
      [RECIPIENT, driverEmail].filter((email) =>
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      )
    )];

    const resendResponse = await fetch(
      "https://api.resend.com/emails",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: fromEmail,
          to: recipients,
          subject:
            `${result.reportId} — End-of-Shift Report — ${driverName}`,
          html: `
            <h2>Fleet Protect 365 End-of-Shift Report</h2>
            <p><strong>Company:</strong> ${safe(body.company_name, COMPANY_NAME)}</p>
            <p><strong>Driver:</strong> ${driverName}</p>
            <p><strong>Employee ID:</strong> ${employeeId}</p>
            <p><strong>Report ID:</strong> ${result.reportId}</p>
            <p><strong>Shift date:</strong> ${shiftDate}</p>
            <p><strong>Inspections:</strong> ${entries.length}</p>
            <p>The printable PDF report is attached.</p>
          `,
          attachments: [
            {
              filename,
              content: pdfBase64
            }
          ]
        })
      }
    );

    const resendResult = await resendResponse.json();

    if (!resendResponse.ok) {
      throw new Error(
        resendResult?.message || "Resend rejected the email."
      );
    }

    const storagePath = `${profile.company_id}/${authData.user.id}/${filename}`;
    const { error: uploadError } = await serviceClient.storage
      .from("end-shift-reports")
      .upload(storagePath, result.bytes, { contentType: "application/pdf", upsert: true });
    if (uploadError) throw uploadError;
    const inspectionIds = entries
      .map((entry) => entry.id)
      .filter((id): id is string => Boolean(id));
    const { error: reportError } = await serviceClient.from("end_shift_reports").upsert({
      company_id: profile.company_id,
      driver_id: authData.user.id,
      report_id: result.reportId,
      report_date: shiftDate,
      pdf_file_name: filename,
      storage_path: storagePath,
      inspection_ids: inspectionIds,
      email_recipients: recipients,
      email_status: "sent",
      drive_status: "stored",
      emailed_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      error_message: null
    }, { onConflict: "report_id" });
    if (reportError) throw reportError;

    return new Response(
      JSON.stringify({
        ok: true,
        recipients,
        inspection_count: entries.length,
        report_id: result.reportId,
        generated_at: result.generatedAt,
        email_id: resendResult?.id || null,
        filename
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      }
    );
  } catch (error) {
    console.error(error);

    return new Response(
      JSON.stringify({
        error:
          error instanceof Error
            ? error.message
            : String(error)
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      }
    );
  }
});
