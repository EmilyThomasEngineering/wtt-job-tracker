/* WTT Job Tracker - Supabase data layer */

const BUSINESS_SLUG = "warrnambool-trays-trailers";

let db = null;
let appState = {
  business: null,
  staff: [],
  templates: [],
  jobs: [],
  shifts: [],
  breaks: [],
  segments: [],
  submissions: []
};

function hasSupabaseConfig() {
  return Boolean(
    window.APP_CONFIG &&
    APP_CONFIG.supabaseUrl &&
    APP_CONFIG.supabaseAnonKey &&
    window.supabase
  );
}

function initDbClient() {
  if (!hasSupabaseConfig()) {
    throw new Error("Supabase is not configured. Check js/config.js and the Supabase script tag.");
  }

  if (!db) {
    db = window.supabase.createClient(APP_CONFIG.supabaseUrl, APP_CONFIG.supabaseAnonKey);
  }

  return db;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function nowISO() {
  return new Date().toISOString();
}

function escapeHtml(str) {
  return String(str || "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[c]));
}

function timeOnly(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function localTimeInputValue(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function minutesBetween(start, end) {
  if (!start) return 0;
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  return Math.max(0, Math.round((e - s) / 60000));
}

function formatMinutes(total) {
  const safe = Math.max(0, Number(total || 0));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

function dateTimeFromLocalTime(date, value) {
  if (!value) return null;
  return new Date(`${date}T${value}:00`).toISOString();
}

function showError(target, error) {
  console.error(error);
  const message = error?.message || String(error || "Unknown error");
  const el = typeof target === "string" ? document.getElementById(target) : target;
  if (el) {
    el.innerHTML = `<div class="card error-card"><h3>Something went wrong</h3><p>${escapeHtml(message)}</p></div>`;
  } else {
    alert(message);
  }
}

function labelStatus(status) {
  return {
    not_started: "Not started",
    running: "Running",
    paused: "Paused",
    finished: "Finished"
  }[status] || status || "Not started";
}

function normaliseJob(row) {
  return {
    id: row.id,
    businessId: row.business_id,
    date: row.work_date,
    staffId: row.staff_id,
    jobNumber: row.job_number,
    name: row.name,
    instructions: row.specific_instructions || "",
    staffNotes: row.staff_notes || "",
    status: row.status || "not_started",
    actualStart: row.actual_start || "",
    actualEnd: row.actual_end || "",
    submittedAt: row.submitted_at || "",
    segments: []
  };
}

function normaliseShift(row) {
  return {
    id: row.id,
    businessId: row.business_id,
    date: row.work_date,
    staffId: row.staff_id,
    clockIn: row.clock_in || "",
    clockOut: row.clock_out || "",
    onBreak: Boolean(row.on_break),
    breakStartedAt: row.break_started_at || "",
    submittedAt: row.submitted_at || ""
  };
}

function activeStaff(state = appState) {
  return [...state.staff].filter(s => s.active).sort((a, b) => {
    const order = Number(a.displayOrder || 0) - Number(b.displayOrder || 0);
    return order || a.name.localeCompare(b.name);
  });
}

function activeTemplates(state = appState) {
  return [...state.templates].filter(t => t.active).sort((a, b) => {
    const order = Number(a.displayOrder || 0) - Number(b.displayOrder || 0);
    return order || a.name.localeCompare(b.name);
  });
}

function staffName(state, id) {
  return state.staff.find(s => s.id === id)?.name || "Unknown";
}

function jobsFor(state, date, staffId = null) {
  return state.jobs
    .filter(j => j.date === date && (!staffId || j.staffId === staffId))
    .sort((a, b) => Number(a.jobNumber) - Number(b.jobNumber));
}

function getShift(state, date, staffId) {
  return state.shifts.find(s => s.date === date && s.staffId === staffId);
}

function activeJob(state, date, staffId) {
  return state.jobs.find(j => j.date === date && j.staffId === staffId && j.status === "running");
}

function jobMinutes(job) {
  return (job.segments || []).reduce((sum, seg) => sum + minutesBetween(seg.startedAt, seg.endedAt), 0);
}

function breakMinutes(state, date, staffId) {
  let total = state.breaks
    .filter(b => b.date === date && b.staffId === staffId)
    .reduce((sum, b) => sum + minutesBetween(b.startedAt, b.endedAt), 0);

  const shift = getShift(state, date, staffId);
  if (shift?.onBreak && shift.breakStartedAt) total += minutesBetween(shift.breakStartedAt, "");

  return total;
}

async function requireBusiness() {
  const client = initDbClient();

  const { data, error } = await client
    .from("businesses")
    .select("*")
    .eq("slug", BUSINESS_SLUG)
    .eq("active", true)
    .single();

  if (error) throw error;

  appState.business = {
    id: data.id,
    name: data.name,
    slug: data.slug,
    bossPassword: data.boss_password,
    notificationEmail: data.notification_email,
    logoPath: data.logo_path,
    primaryColour: data.primary_colour,
    autoSubmitTime: data.auto_submit_time || "17:00",
    ownerResetCode: data.owner_reset_code || ""
  };

  return appState.business;
}

async function updateBusinessSettings(updates) {
  const client = initDbClient();
  const business = appState.business || await requireBusiness();

  const payload = {};
  if ("bossPassword" in updates) payload.boss_password = updates.bossPassword;
  if ("notificationEmail" in updates) payload.notification_email = updates.notificationEmail;
  if ("autoSubmitTime" in updates) payload.auto_submit_time = updates.autoSubmitTime;

  const { error } = await client.from("businesses").update(payload).eq("id", business.id);
  if (error) throw error;
  await requireBusiness();
}

async function loadReferenceData() {
  const client = initDbClient();
  const business = appState.business || await requireBusiness();

  const [staffRes, templateRes] = await Promise.all([
    client.from("staff").select("*").eq("business_id", business.id).eq("active", true).order("display_order").order("name"),
    client.from("job_templates").select("*").eq("business_id", business.id).eq("active", true).order("display_order").order("name")
  ]);

  if (staffRes.error) throw staffRes.error;
  if (templateRes.error) throw templateRes.error;

  appState.staff = staffRes.data.map(row => ({
    id: row.id,
    businessId: row.business_id,
    name: row.name,
    displayOrder: row.display_order,
    active: row.active
  }));

  appState.templates = templateRes.data.map(row => ({
    id: row.id,
    businessId: row.business_id,
    name: row.name,
    displayOrder: row.display_order,
    active: row.active
  }));

  return appState;
}

async function loadDayData(date) {
  const client = initDbClient();
  const business = appState.business || await requireBusiness();

  const [jobsRes, shiftsRes, breaksRes, submissionsRes] = await Promise.all([
    client.from("planned_jobs").select("*").eq("business_id", business.id).eq("work_date", date).order("job_number"),
    client.from("shifts").select("*").eq("business_id", business.id).eq("work_date", date),
    client.from("breaks").select("*").eq("business_id", business.id).eq("work_date", date),
    client.from("submissions").select("*").eq("business_id", business.id).eq("work_date", date)
  ]);

  if (jobsRes.error) throw jobsRes.error;
  if (shiftsRes.error) throw shiftsRes.error;
  if (breaksRes.error) throw breaksRes.error;
  if (submissionsRes.error) throw submissionsRes.error;

  const jobs = jobsRes.data.map(normaliseJob);
  const jobIds = jobs.map(j => j.id);

  let segments = [];
  if (jobIds.length) {
    const segmentsRes = await client
      .from("job_time_segments")
      .select("*")
      .in("planned_job_id", jobIds)
      .order("started_at");

    if (segmentsRes.error) throw segmentsRes.error;

    segments = segmentsRes.data.map(row => ({
      id: row.id,
      businessId: row.business_id,
      plannedJobId: row.planned_job_id,
      startedAt: row.started_at,
      endedAt: row.ended_at
    }));
  }

  jobs.forEach(job => {
    job.segments = segments.filter(seg => seg.plannedJobId === job.id);
  });

  appState.jobs = [...appState.jobs.filter(j => j.date !== date), ...jobs];
  appState.shifts = [...appState.shifts.filter(s => s.date !== date), ...shiftsRes.data.map(normaliseShift)];
  appState.breaks = [
    ...appState.breaks.filter(b => b.date !== date),
    ...breaksRes.data.map(row => ({
      id: row.id,
      businessId: row.business_id,
      date: row.work_date,
      staffId: row.staff_id,
      startedAt: row.started_at,
      endedAt: row.ended_at || ""
    }))
  ];
  appState.submissions = [
    ...appState.submissions.filter(s => s.date !== date),
    ...submissionsRes.data.map(row => ({
      id: row.id,
      businessId: row.business_id,
      date: row.work_date,
      staffId: row.staff_id,
      submittedAt: row.submitted_at
    }))
  ];
  appState.segments = [...appState.segments.filter(s => !jobIds.includes(s.plannedJobId)), ...segments];

  return appState;
}

async function loadAppData(dates = [todayISO()]) {
  await requireBusiness();
  await loadReferenceData();
  for (const date of [...new Set(dates.filter(Boolean))]) {
    await loadDayData(date);
  }
  return appState;
}

async function refreshStateForDates(dates) {
  return loadAppData(dates);
}

async function addStaffRecord(name) {
  const client = initDbClient();
  const business = appState.business || await requireBusiness();
  const maxOrder = appState.staff.reduce((max, staff) => Math.max(max, Number(staff.displayOrder || 0)), 0);

  const { error } = await client.from("staff").insert({
    business_id: business.id,
    name,
    display_order: maxOrder + 1,
    active: true
  });

  if (error) throw error;
  await loadReferenceData();
}

async function updateStaffRecord(id, updates) {
  const client = initDbClient();
  const payload = {};
  if ("name" in updates) payload.name = updates.name;
  if ("active" in updates) payload.active = updates.active;
  if ("displayOrder" in updates) payload.display_order = updates.displayOrder;

  const { error } = await client.from("staff").update(payload).eq("id", id);
  if (error) throw error;
  await loadReferenceData();
}

async function addTemplateRecord(name) {
  const client = initDbClient();
  const business = appState.business || await requireBusiness();
  const maxOrder = appState.templates.reduce((max, item) => Math.max(max, Number(item.displayOrder || 0)), 0);

  const { error } = await client.from("job_templates").insert({
    business_id: business.id,
    name,
    display_order: maxOrder + 1,
    active: true
  });

  if (error) throw error;
  await loadReferenceData();
}

async function updateTemplateRecord(id, updates) {
  const client = initDbClient();
  const payload = {};
  if ("name" in updates) payload.name = updates.name;
  if ("active" in updates) payload.active = updates.active;
  if ("displayOrder" in updates) payload.display_order = updates.displayOrder;

  const { error } = await client.from("job_templates").update(payload).eq("id", id);
  if (error) throw error;
  await loadReferenceData();
}

async function addJobRecord({ date, staffId, jobNumber, name, instructions }) {
  const client = initDbClient();
  const business = appState.business || await requireBusiness();

  const { error } = await client.from("planned_jobs").insert({
    business_id: business.id,
    work_date: date,
    staff_id: staffId,
    job_number: Number(jobNumber || 1),
    name,
    specific_instructions: instructions || "",
    status: "not_started"
  });

  if (error) throw error;
  await loadDayData(date);
}

async function updateJobRecord(id, updates) {
  const client = initDbClient();
  const job = appState.jobs.find(j => j.id === id);
  if (!job) return;

  const payload = { updated_at: nowISO() };
  if ("jobNumber" in updates) payload.job_number = Number(updates.jobNumber || 1);
  if ("name" in updates) payload.name = updates.name;
  if ("instructions" in updates) payload.specific_instructions = updates.instructions;
  if ("staffNotes" in updates) payload.staff_notes = updates.staffNotes;
  if ("status" in updates) payload.status = updates.status;
  if ("actualStart" in updates) payload.actual_start = updates.actualStart || null;
  if ("actualEnd" in updates) payload.actual_end = updates.actualEnd || null;
  if ("submittedAt" in updates) payload.submitted_at = updates.submittedAt || null;

  const { error } = await client.from("planned_jobs").update(payload).eq("id", id);
  if (error) throw error;
  await loadDayData(job.date);
}

async function deleteJobRecord(id) {
  const client = initDbClient();
  const job = appState.jobs.find(j => j.id === id);
  const { error } = await client.from("planned_jobs").delete().eq("id", id);
  if (error) throw error;
  if (job) await loadDayData(job.date);
}

async function ensureShiftRecord(date, staffId) {
  const client = initDbClient();
  const business = appState.business || await requireBusiness();

  let shift = getShift(appState, date, staffId);
  if (shift) return shift;

  const { data, error } = await client
    .from("shifts")
    .insert({ business_id: business.id, work_date: date, staff_id: staffId })
    .select("*")
    .single();

  if (error) throw error;
  shift = normaliseShift(data);
  appState.shifts.push(shift);
  return shift;
}

async function updateShiftRecord(date, staffId, updates) {
  const client = initDbClient();
  const business = appState.business || await requireBusiness();
  await ensureShiftRecord(date, staffId);

  const payload = { updated_at: nowISO() };
  if ("clockIn" in updates) payload.clock_in = updates.clockIn || null;
  if ("clockOut" in updates) payload.clock_out = updates.clockOut || null;
  if ("onBreak" in updates) payload.on_break = Boolean(updates.onBreak);
  if ("breakStartedAt" in updates) payload.break_started_at = updates.breakStartedAt || null;
  if ("submittedAt" in updates) payload.submitted_at = updates.submittedAt || null;

  const { error } = await client
    .from("shifts")
    .update(payload)
    .eq("business_id", business.id)
    .eq("work_date", date)
    .eq("staff_id", staffId);

  if (error) throw error;
  await loadDayData(date);
}

async function clockInRecord(date, staffId) {
  const shift = await ensureShiftRecord(date, staffId);
  if (!shift.clockIn) await updateShiftRecord(date, staffId, { clockIn: nowISO(), clockOut: "", submittedAt: "" });
  else if (shift.clockOut) await updateShiftRecord(date, staffId, { clockOut: "", submittedAt: "" });
}

async function clockOutRecord(date, staffId) {
  const shift = await ensureShiftRecord(date, staffId);
  if (shift.onBreak) await endBreakRecord(date, staffId);
  const running = activeJob(appState, date, staffId);
  if (running) await pauseJobRecord(running.id);
  await updateShiftRecord(date, staffId, { clockOut: nowISO() });
}

async function startBreakRecord(date, staffId) {
  const shift = await ensureShiftRecord(date, staffId);
  if (!shift.clockIn) await clockInRecord(date, staffId);
  const running = activeJob(appState, date, staffId);
  if (running) await pauseJobRecord(running.id);
  await updateShiftRecord(date, staffId, { onBreak: true, breakStartedAt: nowISO() });
}

async function endBreakRecord(date, staffId) {
  const client = initDbClient();
  const business = appState.business || await requireBusiness();
  const shift = getShift(appState, date, staffId);
  if (!shift?.onBreak || !shift.breakStartedAt) return;

  const { error } = await client.from("breaks").insert({
    business_id: business.id,
    work_date: date,
    staff_id: staffId,
    started_at: shift.breakStartedAt,
    ended_at: nowISO()
  });
  if (error) throw error;

  await updateShiftRecord(date, staffId, { onBreak: false, breakStartedAt: "" });
  await loadDayData(date);
}

async function startJobRecord(jobId) {
  const client = initDbClient();
  const business = appState.business || await requireBusiness();
  const job = appState.jobs.find(j => j.id === jobId);
  if (!job) return;

  await clockInRecord(job.date, job.staffId);
  const shift = getShift(appState, job.date, job.staffId);
  if (shift?.onBreak) await endBreakRecord(job.date, job.staffId);

  const running = activeJob(appState, job.date, job.staffId);
  if (running && running.id !== job.id) await pauseJobRecord(running.id);

  const startTime = nowISO();
  const jobPayload = { status: "running", actual_end: null, updated_at: nowISO() };
  if (!job.actualStart) jobPayload.actual_start = startTime;

  const jobRes = await client.from("planned_jobs").update(jobPayload).eq("id", job.id);
  if (jobRes.error) throw jobRes.error;

  const segRes = await client.from("job_time_segments").insert({
    business_id: business.id,
    planned_job_id: job.id,
    started_at: startTime
  });
  if (segRes.error) throw segRes.error;

  await loadDayData(job.date);
}

async function pauseJobRecord(jobId) {
  const client = initDbClient();
  const job = appState.jobs.find(j => j.id === jobId);
  if (!job || job.status !== "running") return;

  const openSegment = job.segments.find(seg => !seg.endedAt);
  if (openSegment) {
    const segRes = await client.from("job_time_segments").update({ ended_at: nowISO() }).eq("id", openSegment.id);
    if (segRes.error) throw segRes.error;
  }

  const jobRes = await client.from("planned_jobs").update({ status: "paused", updated_at: nowISO() }).eq("id", job.id);
  if (jobRes.error) throw jobRes.error;
  await loadDayData(job.date);
}

async function finishJobRecord(jobId) {
  const client = initDbClient();
  const job = appState.jobs.find(j => j.id === jobId);
  if (!job) return;

  const finishTime = nowISO();
  const openSegment = job.segments.find(seg => !seg.endedAt);
  if (openSegment) {
    const segRes = await client.from("job_time_segments").update({ ended_at: finishTime }).eq("id", openSegment.id);
    if (segRes.error) throw segRes.error;
  }

  const jobRes = await client.from("planned_jobs").update({
    status: "finished",
    actual_start: job.actualStart || finishTime,
    actual_end: finishTime,
    updated_at: nowISO()
  }).eq("id", job.id);

  if (jobRes.error) throw jobRes.error;
  await loadDayData(job.date);
}

async function overrideJobTimeRecord(jobId, field, timeValue) {
  const job = appState.jobs.find(j => j.id === jobId);
  if (!job) return;
  const value = dateTimeFromLocalTime(job.date, timeValue);
  if (field === "actualStart") await updateJobRecord(jobId, { actualStart: value });
  if (field === "actualEnd") await updateJobRecord(jobId, { actualEnd: value });
}

async function submitDayRecord(date, staffId) {
  const client = initDbClient();
  const business = appState.business || await requireBusiness();
  const submittedAt = nowISO();

  await ensureShiftRecord(date, staffId);
  await updateShiftRecord(date, staffId, { submittedAt });

  const jobs = jobsFor(appState, date, staffId);
  for (const job of jobs) await updateJobRecord(job.id, { submittedAt });

  const { error } = await client.from("submissions").insert({
    business_id: business.id,
    work_date: date,
    staff_id: staffId,
    submitted_at: submittedAt
  });
  if (error) throw error;

  await loadDayData(date);
}

async function sendSubmissionEmailRecord(date, staffId) {
  const business = appState.business || await requireBusiness();

  const response = await fetch("/.netlify/functions/send-submission-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      businessId: business.id,
      staffId,
      workDate: date
    })
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.ok === false) {
    throw new Error(result.error || "Email failed to send.");
  }

  return result;
}

function createRealtimeChannel(dates, onChange) {
  const client = initDbClient();
  const businessId = appState.business?.id;
  if (!businessId) return null;

  const channel = client
    .channel(`wtt-job-tracker-${businessId}`)
    .on("postgres_changes", { event: "*", schema: "public" }, async () => {
      try {
        await refreshStateForDates(dates());
        await onChange();
      } catch (error) {
        console.error("Realtime refresh failed", error);
      }
    })
    .subscribe();

  return channel;
}

function exportCsvFromState(state) {
  const lines = [["type","date","staff","job_number","job","status","start","finish","minutes","instructions","staff_notes","submitted_at"]];
  state.jobs.forEach(job => {
    lines.push(["job", job.date, staffName(state, job.staffId), job.jobNumber, job.name, job.status, job.actualStart, job.actualEnd, jobMinutes(job), job.instructions || "", job.staffNotes || "", job.submittedAt || ""]);
  });
  state.shifts.forEach(shift => {
    lines.push(["shift", shift.date, staffName(state, shift.staffId), "", "", "", shift.clockIn, shift.clockOut, "", "", "", shift.submittedAt || ""]);
  });
  return lines.map(row => row.map(value => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")).join("\\n");
}
