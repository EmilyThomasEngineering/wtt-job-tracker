let state = getState();

const loginPanel = document.getElementById("loginPanel");
const adminPanel = document.getElementById("adminPanel");
const loginError = document.getElementById("loginError");
const passwordInput = document.getElementById("bossPasswordInput");
const logoutButton = document.getElementById("logoutButton");

const planDate = document.getElementById("planDate");
const liveDate = document.getElementById("liveDate");
const summaryDate = document.getElementById("summaryDate");

function initAdmin() {
  const defaultDate = todayISO();
  planDate.value = defaultDate;
  liveDate.value = defaultDate;
  summaryDate.value = defaultDate;

  document.getElementById("bossLoginButton").addEventListener("click", login);
  passwordInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") login();
  });

  logoutButton.addEventListener("click", logout);

  document.querySelectorAll(".tab-button").forEach((button) => {
    button.addEventListener("click", () => showTab(button.dataset.tab));
  });

  document.getElementById("addStaffButton").addEventListener("click", addStaff);
  document.getElementById("addTemplateButton").addEventListener("click", addTemplate);
  document.getElementById("addJobButton").addEventListener("click", addJob);
  document.getElementById("exportCsvButton").addEventListener("click", exportCsv);

  [planDate, liveDate, summaryDate].forEach((input) => {
    input.addEventListener("change", renderAll);
  });

  if (sessionStorage.getItem("bossLoggedIn") === "true") showAdmin();
}

function login() {
  const entered = passwordInput.value.trim();
  const expected = (APP_CONFIG.bossPassword || "").trim();

  if (entered === expected) {
    sessionStorage.setItem("bossLoggedIn", "true");
    loginError.textContent = "";
    showAdmin();
  } else {
    loginError.textContent = "Wrong password.";
  }
}

function logout() {
  sessionStorage.removeItem("bossLoggedIn");
  passwordInput.value = "";
  loginPanel.classList.remove("hidden");
  adminPanel.classList.add("hidden");
  logoutButton.classList.add("hidden");
}

function showAdmin() {
  loginPanel.classList.add("hidden");
  adminPanel.classList.remove("hidden");
  logoutButton.classList.remove("hidden");
  renderAll();
}

function showTab(tab) {
  document.querySelectorAll(".tab-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === tab);
  });
  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === `tab-${tab}`);
  });
  renderAll();
}

function renderAll() {
  state = getState();
  renderTemplateControls();
  renderPlan();
  renderLive();
  renderSummary();
}

function renderTemplateControls() {
  document.getElementById("planStaff").innerHTML = activeStaff(state).map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join("");
  document.getElementById("jobTemplateList").innerHTML = activeTemplates(state).map(t => `<option value="${escapeHtml(t.name)}"></option>`).join("");
  document.getElementById("staffList").innerHTML = activeStaff(state).map(s => `<div class="list-item"><strong>${escapeHtml(s.name)}</strong><button class="danger-button" onclick="removeStaff('${s.id}')">Remove</button></div>`).join("");
  document.getElementById("templateList").innerHTML = activeTemplates(state).map(t => `<div class="list-item"><strong>${escapeHtml(t.name)}</strong><button class="danger-button" onclick="removeTemplate('${t.id}')">Remove</button></div>`).join("");
}

function addStaff() {
  const input = document.getElementById("newStaffName");
  const name = input.value.trim();
  if (!name) return;
  state.staff.push({ id: uid("staff"), name, active: true });
  saveState(state);
  input.value = "";
  renderAll();
}

function removeStaff(id) {
  state.staff = state.staff.map(s => s.id === id ? { ...s, active: false } : s);
  saveState(state);
  renderAll();
}

function addTemplate() {
  const input = document.getElementById("newTemplateName");
  const name = input.value.trim();
  if (!name) return;
  state.templates.push({ id: uid("template"), name, active: true });
  saveState(state);
  input.value = "";
  renderAll();
}

function removeTemplate(id) {
  state.templates = state.templates.map(t => t.id === id ? { ...t, active: false } : t);
  saveState(state);
  renderAll();
}

function addJob() {
  const staffId = document.getElementById("planStaff").value;
  const jobNumber = document.getElementById("planJobNumber").value || "1";
  const name = document.getElementById("planJobName").value.trim();
  const instructions = document.getElementById("planInstructions").value.trim();
  if (!staffId || !name) return;
  state.jobs.push({ id: uid("job"), date: planDate.value, staffId, jobNumber, name, instructions, staffNotes: "", status: "not_started", actualStart: "", actualEnd: "", submittedAt: "", segments: [] });
  saveState(state);
  document.getElementById("planJobNumber").value = Number(jobNumber) + 1;
  document.getElementById("planJobName").value = "";
  document.getElementById("planInstructions").value = "";
  renderAll();
}

function renderPlan() {
  const date = planDate.value;
  document.getElementById("planTable").innerHTML = activeStaff(state).map(s => {
    const rows = jobsFor(state, date, s.id);
    return `<div class="staff-group card"><h3>${escapeHtml(s.name)}</h3>${rows.length ? rows.map(planJobRow).join("") : `<p class="muted">No jobs planned.</p>`}</div>`;
  }).join("");
}

function planJobRow(job) {
  return `<div class="job-row ${job.status === "running" ? "running" : ""} ${job.status === "finished" ? "finished" : ""}"><input value="${escapeHtml(job.jobNumber)}" onchange="updateJob('${job.id}', 'jobNumber', this.value)" /><input value="${escapeHtml(job.name)}" onchange="updateJob('${job.id}', 'name', this.value)" /><input value="${escapeHtml(job.instructions)}" placeholder="Specific instructions" onchange="updateJob('${job.id}', 'instructions', this.value)" /><span class="badge">${labelStatus(job.status)}</span><button class="danger-button" onclick="deleteJob('${job.id}')">Delete</button></div>`;
}

function updateJob(id, field, value) {
  const job = state.jobs.find(j => j.id === id);
  if (!job) return;
  job[field] = value;
  saveState(state);
  renderAll();
}

function deleteJob(id) {
  state.jobs = state.jobs.filter(j => j.id !== id);
  saveState(state);
  renderAll();
}

function renderLive() {
  const date = liveDate.value;
  const staffList = activeStaff(state);
  const totalJobs = state.jobs.filter(j => j.date === date).length;
  const finishedJobs = state.jobs.filter(j => j.date === date && j.status === "finished").length;
  const clockedIn = staffList.filter(s => { const sh = getShift(state, date, s.id); return sh?.clockIn && !sh?.clockOut; }).length;
  const onBreak = staffList.filter(s => getShift(state, date, s.id)?.onBreak).length;
  document.getElementById("liveStats").innerHTML = `<div class="stat-card"><span>Staff clocked in</span><strong>${clockedIn}/${staffList.length}</strong></div><div class="stat-card"><span>On break</span><strong>${onBreak}</strong></div><div class="stat-card"><span>Jobs finished</span><strong>${finishedJobs}/${totalJobs}</strong></div><div class="stat-card"><span>Date</span><strong>${date}</strong></div>`;
  document.getElementById("liveCards").innerHTML = staffList.map(s => liveStaffCard(s, date)).join("");
}

function liveStaffCard(staff, date) {
  const shift = getShift(state, date, staff.id);
  const current = activeJob(state, date, staff.id);
  const jobs = jobsFor(state, date, staff.id);
  const status = shift?.onBreak ? "ON BREAK" : current ? current.name : shift?.clockIn && !shift?.clockOut ? "CLOCKED IN" : "CLOCKED OUT";
  return `<div class="staff-live-card"><h3>${escapeHtml(staff.name)} <span class="badge">${escapeHtml(status)}</span></h3><p>Clock in: ${timeOnly(shift?.clockIn) || "-"} &nbsp; Clock out: ${timeOnly(shift?.clockOut) || "-"} &nbsp; Breaks: ${formatMinutes(breakMinutes(state, date, staff.id))}</p><div class="button-row wrap"><button class="primary-button" onclick="bossClockIn('${staff.id}')">Clock in</button><button class="secondary-button" onclick="bossClockOut('${staff.id}')">Clock out</button><button class="warning-button" onclick="bossStartBreak('${staff.id}')">Start break</button><button class="secondary-button" onclick="bossEndBreak('${staff.id}')">End break</button></div>${current ? `<div class="current-job"><p class="section-label">Current job</p><h3>${escapeHtml(current.name)}</h3><p>Started: ${timeOnly(current.actualStart)} · Elapsed: ${formatMinutes(jobMinutes(current))}</p><button class="secondary-button" onclick="bossFinishJob('${current.id}')">Finish current job</button></div>` : ""}<div class="stack">${jobs.length ? jobs.map(liveJobRow).join("") : `<p class="muted">No jobs planned.</p>`}</div></div>`;
}

function liveJobRow(job) {
  const startValue = job.actualStart ? new Date(job.actualStart).toTimeString().slice(0,5) : "";
  const endValue = job.actualEnd ? new Date(job.actualEnd).toTimeString().slice(0,5) : "";
  return `<div class="job-row ${job.status === "running" ? "running" : ""}"><span>#${escapeHtml(job.jobNumber)}</span><div class="job-title"><strong>${escapeHtml(job.name)}</strong><small>${escapeHtml(job.instructions || "No specific instructions")}</small><small>Notes: ${escapeHtml(job.staffNotes || "-")}</small></div><span>${formatMinutes(jobMinutes(job))}</span><div class="form-row"><input type="time" value="${startValue}" onchange="overrideTime('${job.id}', 'actualStart', this.value)" /><input type="time" value="${endValue}" onchange="overrideTime('${job.id}', 'actualEnd', this.value)" /></div><div class="button-row"><button class="primary-button" onclick="bossStartJob('${job.id}')">Start</button><button class="secondary-button" onclick="bossFinishJob('${job.id}')">Finish</button></div></div>`;
}

function bossClockIn(staffId) { clockIn(state, liveDate.value, staffId); saveState(state); renderAll(); }
function bossClockOut(staffId) { clockOut(state, liveDate.value, staffId); saveState(state); renderAll(); }
function bossStartBreak(staffId) { startBreak(state, liveDate.value, staffId); saveState(state); renderAll(); }
function bossEndBreak(staffId) { endBreak(state, liveDate.value, staffId); saveState(state); renderAll(); }
function bossStartJob(jobId) { startJob(state, jobId); saveState(state); renderAll(); }
function bossFinishJob(jobId) { finishJob(state, jobId); saveState(state); renderAll(); }
function overrideTime(jobId, field, value) { const job = state.jobs.find(j => j.id === jobId); if (!job) return; setJobTime(job, field, job.date, value); saveState(state); renderAll(); }

function renderSummary() {
  const rows = state.jobs.filter(j => j.date === summaryDate.value);
  if (!rows.length) { document.getElementById("summaryTable").innerHTML = "<p>No jobs for this date.</p>"; return; }
  document.getElementById("summaryTable").innerHTML = `<div class="table-wrap"><table><thead><tr><th>Staff</th><th>#</th><th>Job</th><th>Status</th><th>Start</th><th>Finish</th><th>Time</th><th>Notes</th></tr></thead><tbody>${rows.map(j => `<tr><td>${escapeHtml(staffName(state, j.staffId))}</td><td>${escapeHtml(j.jobNumber)}</td><td>${escapeHtml(j.name)}</td><td>${labelStatus(j.status)}</td><td>${timeOnly(j.actualStart) || "-"}</td><td>${timeOnly(j.actualEnd) || "-"}</td><td>${formatMinutes(jobMinutes(j))}</td><td>${escapeHtml(j.staffNotes || "")}</td></tr>`).join("")}</tbody></table></div>`;
}

function exportCsv() {
  const lines = [["type","date","staff","job_number","job","status","start","finish","minutes","instructions","staff_notes","submitted_at"]];
  state.jobs.forEach(j => lines.push(["job", j.date, staffName(state, j.staffId), j.jobNumber, j.name, j.status, j.actualStart, j.actualEnd, jobMinutes(j), j.instructions || "", j.staffNotes || "", j.submittedAt || ""]));
  state.shifts.forEach(s => lines.push(["shift", s.date, staffName(state, s.staffId), "", "", "", s.clockIn, s.clockOut, "", "", "", s.submittedAt || ""]));
  const csv = lines.map(row => row.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `wtt-job-tracker-backup-${new Date().toISOString().slice(0,10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function labelStatus(status) { return { not_started: "Not started", running: "Running", paused: "Paused", finished: "Finished" }[status] || status; }

initAdmin();
