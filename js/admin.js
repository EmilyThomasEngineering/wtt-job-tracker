let state = appState;
let realtimeChannel = null;

const loginPanel = document.getElementById("loginPanel");
const adminPanel = document.getElementById("adminPanel");
const loginError = document.getElementById("loginError");
const passwordInput = document.getElementById("bossPasswordInput");
const logoutButton = document.getElementById("logoutButton");

const planDate = document.getElementById("planDate");
const liveDate = document.getElementById("liveDate");
const summaryDate = document.getElementById("summaryDate");

async function initAdmin() {
  const defaultDate = todayISO();
  planDate.value = defaultDate;
  liveDate.value = defaultDate;
  summaryDate.value = defaultDate;

  document.getElementById("bossLoginButton").addEventListener("click", login);
  passwordInput.addEventListener("keydown", (event) => { if (event.key === "Enter") login(); });
  logoutButton.addEventListener("click", logout);

  document.querySelectorAll(".tab-button").forEach((button) => {
    button.addEventListener("click", () => showTab(button.dataset.tab));
  });

  document.getElementById("addStaffButton").addEventListener("click", addStaff);
  document.getElementById("addTemplateButton").addEventListener("click", addTemplate);
  document.getElementById("addJobButton").addEventListener("click", addJob);
  document.getElementById("exportCsvButton").addEventListener("click", exportCsv);
  document.getElementById("saveSettingsButton").addEventListener("click", saveSettings);
  document.getElementById("changePasswordButton").addEventListener("click", changePassword);

  [planDate, liveDate, summaryDate].forEach((input) => input.addEventListener("change", safeReloadAndRender));

  try {
    await loadAppData(currentDates());
    state = appState;
    if (sessionStorage.getItem("bossLoggedIn") === "true") showAdmin();
  } catch (error) {
    showError(loginPanel, error);
  }
}

function currentDates() {
  return [planDate.value, liveDate.value, summaryDate.value].filter(Boolean);
}

async function login() {
  const entered = passwordInput.value.trim();
  const expected = (appState.business?.bossPassword || APP_CONFIG.bossPassword || "").trim();

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
  if (realtimeChannel) {
    db.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
}

function showAdmin() {
  loginPanel.classList.add("hidden");
  adminPanel.classList.remove("hidden");
  logoutButton.classList.remove("hidden");
  renderAll();

  if (!realtimeChannel) realtimeChannel = createRealtimeChannel(currentDates, renderAll);
}

function showTab(tab) {
  document.querySelectorAll(".tab-button").forEach((button) => button.classList.toggle("active", button.dataset.tab === tab));
  document.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.toggle("active", panel.id === `tab-${tab}`));
  renderAll();
}

async function safeReloadAndRender() {
  try {
    await refreshStateForDates(currentDates());
    state = appState;
    renderAll();
  } catch (error) {
    showError("planTable", error);
  }
}

function renderAll() {
  state = appState;
  renderTemplateControls();
  renderPlan();
  renderLive();
  renderSummary();
  renderSettings();
}

function renderSettings() {
  if (!state.business) return;
  const auto = document.getElementById("autoSubmitTime");
  const email = document.getElementById("notificationEmail");
  if (auto && document.activeElement !== auto) auto.value = String(state.business.autoSubmitTime || "17:00").slice(0,5);
  if (email && document.activeElement !== email) email.value = state.business.notificationEmail || "";
}

async function saveSettings() {
  const message = document.getElementById("settingsMessage");
  try {
    await updateBusinessSettings({
      autoSubmitTime: document.getElementById("autoSubmitTime").value,
      notificationEmail: document.getElementById("notificationEmail").value.trim()
    });
    message.textContent = "Settings saved.";
    renderAll();
  } catch (error) {
    message.textContent = error.message || "Settings failed to save.";
  }
}

async function changePassword() {
  const message = document.getElementById("passwordMessage");
  const oldPassword = document.getElementById("oldBossPassword").value.trim();
  const newPassword = document.getElementById("newBossPassword").value.trim();
  const confirmPassword = document.getElementById("confirmBossPassword").value.trim();

  if (oldPassword !== (state.business?.bossPassword || "")) {
    message.textContent = "Current password is wrong.";
    return;
  }
  if (!newPassword || newPassword.length < 6) {
    message.textContent = "New password must be at least 6 characters.";
    return;
  }
  if (newPassword !== confirmPassword) {
    message.textContent = "New passwords do not match.";
    return;
  }

  try {
    await updateBusinessSettings({ bossPassword: newPassword });
    document.getElementById("oldBossPassword").value = "";
    document.getElementById("newBossPassword").value = "";
    document.getElementById("confirmBossPassword").value = "";
    message.textContent = "Password changed.";
    renderAll();
  } catch (error) {
    message.textContent = error.message || "Password failed to change.";
  }
}

function renderTemplateControls() {
  document.getElementById("planStaff").innerHTML = activeStaff(state).map((staff) => `<option value="${staff.id}">${escapeHtml(staff.name)}</option>`).join("");
  document.getElementById("jobTemplateList").innerHTML = activeTemplates(state).map((template) => `<option value="${escapeHtml(template.name)}"></option>`).join("");
  document.getElementById("staffList").innerHTML = activeStaff(state).map((staff) => `
    <div class="list-item">
      <input value="${escapeHtml(staff.name)}" onchange="renameStaff('${staff.id}', this.value)" />
      <button class="danger-button" onclick="removeStaff('${staff.id}')">Remove</button>
    </div>
  `).join("");
  document.getElementById("templateList").innerHTML = activeTemplates(state).map((template) => `
    <div class="list-item">
      <input value="${escapeHtml(template.name)}" onchange="renameTemplate('${template.id}', this.value)" />
      <button class="danger-button" onclick="removeTemplate('${template.id}')">Remove</button>
    </div>
  `).join("");
}

async function addStaff() {
  const input = document.getElementById("newStaffName");
  const name = input.value.trim();
  if (!name) return;
  try {
    await addStaffRecord(name);
    input.value = "";
    renderAll();
  } catch (error) { showError("staffList", error); }
}

async function renameStaff(id, value) {
  const name = value.trim();
  if (!name) return;
  await updateStaffRecord(id, { name });
  renderAll();
}

async function removeStaff(id) {
  await updateStaffRecord(id, { active: false });
  renderAll();
}

async function addTemplate() {
  const input = document.getElementById("newTemplateName");
  const name = input.value.trim();
  if (!name) return;
  try {
    await addTemplateRecord(name);
    input.value = "";
    renderAll();
  } catch (error) { showError("templateList", error); }
}

async function renameTemplate(id, value) {
  const name = value.trim();
  if (!name) return;
  await updateTemplateRecord(id, { name });
  renderAll();
}

async function removeTemplate(id) {
  await updateTemplateRecord(id, { active: false });
  renderAll();
}

async function addJob() {
  const staffId = document.getElementById("planStaff").value;
  const jobNumber = document.getElementById("planJobNumber").value || "1";
  const name = document.getElementById("planJobName").value.trim();
  const instructions = document.getElementById("planInstructions").value.trim();
  if (!staffId || !name) return;

  try {
    await addJobRecord({ date: planDate.value, staffId, jobNumber, name, instructions });
    document.getElementById("planJobNumber").value = Number(jobNumber) + 1;
    document.getElementById("planJobName").value = "";
    document.getElementById("planInstructions").value = "";
    renderAll();
  } catch (error) { showError("planTable", error); }
}

function renderPlan() {
  const date = planDate.value;
  document.getElementById("planTable").innerHTML = activeStaff(state).map((staff) => {
    const staffJobs = jobsFor(state, date, staff.id);
    return `<div class="staff-group card"><h3>${escapeHtml(staff.name)}</h3>${staffJobs.length ? staffJobs.map(planJobRow).join("") : `<p class="muted">No jobs planned.</p>`}</div>`;
  }).join("");
}

function planJobRow(job) {
  return `<div class="job-row ${job.status === "running" ? "running" : ""} ${job.status === "finished" ? "finished" : ""}">
    <input value="${escapeHtml(job.jobNumber)}" onchange="updateJob('${job.id}', 'jobNumber', this.value)" />
    <input value="${escapeHtml(job.name)}" onchange="updateJob('${job.id}', 'name', this.value)" />
    <input value="${escapeHtml(job.instructions)}" placeholder="Specific instructions" onchange="updateJob('${job.id}', 'instructions', this.value)" />
    <span class="badge">${labelStatus(job.status)}</span>
    <button class="danger-button" onclick="deleteJob('${job.id}')">Delete</button>
  </div>`;
}

async function updateJob(id, field, value) {
  const payload = {};
  payload[field] = value;
  await updateJobRecord(id, payload);
  renderAll();
}

async function deleteJob(id) {
  await deleteJobRecord(id);
  renderAll();
}

function renderLive() {
  const date = liveDate.value;
  const staffList = activeStaff(state);
  const totalJobs = state.jobs.filter((job) => job.date === date).length;
  const finishedJobs = state.jobs.filter((job) => job.date === date && job.status === "finished").length;
  const clockedIn = staffList.filter((staff) => {
    const shift = getShift(state, date, staff.id);
    return shift?.clockIn && !shift?.clockOut;
  }).length;
  const onBreak = staffList.filter((staff) => getShift(state, date, staff.id)?.onBreak).length;

  document.getElementById("liveStats").innerHTML = `
    <div class="stat-card"><span>Staff clocked in</span><strong>${clockedIn}/${staffList.length}</strong></div>
    <div class="stat-card"><span>On break</span><strong>${onBreak}</strong></div>
    <div class="stat-card"><span>Jobs finished</span><strong>${finishedJobs}/${totalJobs}</strong></div>
    <div class="stat-card"><span>Date</span><strong>${date}</strong></div>
  `;
  document.getElementById("liveCards").innerHTML = staffList.map((staff) => liveStaffCard(staff, date)).join("");
}

function liveStaffCard(staff, date) {
  const shift = getShift(state, date, staff.id);
  const staffJobs = jobsFor(state, date, staff.id);
  const current = activeJob(state, date, staff.id);
  const onBreak = shift?.onBreak;
  const statusClass = onBreak ? "status-break" : current ? "status-running" : shift?.clockIn && !shift?.clockOut ? "status-idle" : "status-out";
  const status = onBreak ? "ON BREAK" : current ? current.name : shift?.clockIn && !shift?.clockOut ? "CLOCKED IN" : "CLOCKED OUT";

  return `<div class="staff-live-card">
    <h3>${escapeHtml(staff.name)} <span class="badge ${statusClass}">${escapeHtml(status)}</span></h3>
    <p>Clock in: ${timeOnly(shift?.clockIn) || "-"} &nbsp; Clock out: ${timeOnly(shift?.clockOut) || "-"} &nbsp; Breaks: ${formatMinutes(breakMinutes(state, date, staff.id))}</p>
    <div class="button-row wrap">
      <button class="primary-button" onclick="bossClockIn('${staff.id}')">Clock in</button>
      <button class="secondary-button" onclick="bossClockOut('${staff.id}')">Clock out</button>
      <button class="warning-button" onclick="bossStartBreak('${staff.id}')">Start break</button>
      <button class="secondary-button" onclick="bossEndBreak('${staff.id}')">End break</button>
    </div>
    ${current ? `<div class="current-job"><p class="section-label">Current job</p><h3>${escapeHtml(current.name)}</h3><p>Started: ${timeOnly(current.actualStart)} · Elapsed: ${formatMinutes(jobMinutes(current))}</p><button class="secondary-button" onclick="bossFinishJob('${current.id}')">Finish current job</button></div>` : ""}
    <div class="stack">${staffJobs.length ? staffJobs.map(liveJobRow).join("") : `<p class="muted">No jobs planned.</p>`}</div>
  </div>`;
}

function liveJobRow(job) {
  return `<div class="job-row ${job.status === "running" ? "running" : ""}">
    <span>#${escapeHtml(job.jobNumber)}</span>
    <div class="job-title"><strong>${escapeHtml(job.name)}</strong><small>${escapeHtml(job.instructions || "No specific instructions")}</small><small>Notes: ${escapeHtml(job.staffNotes || "-")}</small></div>
    <span>${formatMinutes(jobMinutes(job))}</span>
    <div class="form-row">
      <input type="time" value="${localTimeInputValue(job.actualStart)}" onchange="overrideTime('${job.id}', 'actualStart', this.value)" />
      <input type="time" value="${localTimeInputValue(job.actualEnd)}" onchange="overrideTime('${job.id}', 'actualEnd', this.value)" />
    </div>
    <div class="button-row">
      <button class="primary-button" onclick="bossStartJob('${job.id}')">Start</button>
      <button class="secondary-button" onclick="bossFinishJob('${job.id}')">Finish</button>
    </div>
  </div>`;
}

async function bossClockIn(staffId) { await clockInRecord(liveDate.value, staffId); renderAll(); }
async function bossClockOut(staffId) { await clockOutRecord(liveDate.value, staffId); renderAll(); }
async function bossStartBreak(staffId) { await startBreakRecord(liveDate.value, staffId); renderAll(); }
async function bossEndBreak(staffId) { await endBreakRecord(liveDate.value, staffId); renderAll(); }
async function bossStartJob(jobId) { await startJobRecord(jobId); renderAll(); }
async function bossFinishJob(jobId) { await finishJobRecord(jobId); renderAll(); }
async function overrideTime(jobId, field, value) { await overrideJobTimeRecord(jobId, field, value); renderAll(); }

function renderSummary() {
  const date = summaryDate.value;
  const rows = state.jobs.filter((job) => job.date === date);
  if (!rows.length) {
    document.getElementById("summaryTable").innerHTML = "<p>No jobs for this date.</p>";
    return;
  }
  document.getElementById("summaryTable").innerHTML = `<div class="table-wrap"><table><thead><tr><th>Staff</th><th>#</th><th>Job</th><th>Status</th><th>Start</th><th>Finish</th><th>Time</th><th>Notes</th></tr></thead><tbody>${rows.map((job) => `<tr><td>${escapeHtml(staffName(state, job.staffId))}</td><td>${escapeHtml(job.jobNumber)}</td><td>${escapeHtml(job.name)}</td><td>${labelStatus(job.status)}</td><td>${timeOnly(job.actualStart) || "-"}</td><td>${timeOnly(job.actualEnd) || "-"}</td><td>${formatMinutes(jobMinutes(job))}</td><td>${escapeHtml(job.staffNotes || "")}</td></tr>`).join("")}</tbody></table></div>`;
}

function exportCsv() {
  const csv = exportCsvFromState(state);
  const blob = new Blob([csv], { type: "text/csv" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `wtt-job-tracker-backup-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

initAdmin();
