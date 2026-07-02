import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

function minutesBetween(start, end) {
  if (!start) return 0;
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  return Math.max(0, Math.round((e - s) / 60000));
}

function formatMinutes(total) {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

function timeOnly(iso) {
  if (!iso) return "-";
  return new Date(iso).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" });
}

async function buildSummary({ businessId, staffId, workDate }) {
  const { data: business, error: businessError } = await supabase
    .from("businesses").select("*").eq("id", businessId).single();
  if (businessError) throw businessError;

  const { data: staff, error: staffError } = await supabase
    .from("staff").select("*").eq("id", staffId).single();
  if (staffError) throw staffError;

  const { data: shift, error: shiftError } = await supabase
    .from("shifts").select("*")
    .eq("business_id", businessId).eq("staff_id", staffId).eq("work_date", workDate)
    .maybeSingle();
  if (shiftError) throw shiftError;

  const { data: jobs, error: jobsError } = await supabase
    .from("planned_jobs").select("*")
    .eq("business_id", businessId).eq("staff_id", staffId).eq("work_date", workDate)
    .order("job_number", { ascending: true });
  if (jobsError) throw jobsError;

  const { data: breaks, error: breaksError } = await supabase
    .from("breaks").select("*")
    .eq("business_id", businessId).eq("staff_id", staffId).eq("work_date", workDate);
  if (breaksError) throw breaksError;

  const breakTotal = (breaks || []).reduce((sum, b) => sum + minutesBetween(b.started_at, b.ended_at), 0);

  const jobIds = jobs.map(j => j.id);
  let segments = [];
  if (jobIds.length) {
    const { data, error } = await supabase
      .from("job_time_segments").select("*").in("planned_job_id", jobIds);
    if (error) throw error;
    segments = data || [];
  }

  const jobLines = jobs.map(job => {
    const mins = segments
      .filter(s => s.planned_job_id === job.id)
      .reduce((sum, seg) => sum + minutesBetween(seg.started_at, seg.ended_at), 0);

    return [
      `#${job.job_number} ${job.name}`,
      `Status: ${job.status}`,
      `Start: ${timeOnly(job.actual_start)}`,
      `Finish: ${timeOnly(job.actual_end)}`,
      `Time: ${formatMinutes(mins)}`,
      job.specific_instructions ? `Instructions: ${job.specific_instructions}` : "",
      job.staff_notes ? `Notes: ${job.staff_notes}` : ""
    ].filter(Boolean).join("\\n");
  });

  const subject = `Job Tracker submission - ${staff.name} - ${workDate}`;
  const text = [
    business.name,
    "",
    `Staff: ${staff.name}`,
    `Date: ${workDate}`,
    `Clock in: ${timeOnly(shift?.clock_in)}`,
    `Clock out: ${timeOnly(shift?.clock_out)}`,
    `Break total: ${formatMinutes(breakTotal)}`,
    "",
    "Jobs",
    "----",
    jobLines.length ? jobLines.join("\\n\\n") : "No jobs recorded."
  ].join("\\n");

  return { business, staff, subject, text, recipient: business.notification_email };
}

export default async (request) => {
  try {
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

    const { businessId, staffId, workDate } = await request.json();
    if (!businessId || !staffId || !workDate) {
      return new Response("Missing businessId, staffId or workDate", { status: 400 });
    }

    const summary = await buildSummary({ businessId, staffId, workDate });

    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL,
      to: summary.recipient,
      subject: summary.subject,
      text: summary.text
    });

    await supabase.from("email_logs").insert({
      business_id: businessId,
      work_date: workDate,
      staff_id: staffId,
      email_type: "manual_submission",
      recipient: summary.recipient,
      subject: summary.subject
    });

    return Response.json({ ok: true });
  } catch (error) {
    console.error(error);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
};
