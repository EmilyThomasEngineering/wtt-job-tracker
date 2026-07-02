let state = appState;
let selectedStaffId = localStorage.getItem("wtt-selected-staff") || "";
let realtimeChannel = null;

const staffDate = document.getElementById("staffDate");

async function initStaff() {
  staffDate.value = todayISO();

  staffDate.addEventListener("change", safeReloadAndRender);

  document.getElementById("changeStaffButton").addEventListener("click", () => {
    selectedStaffId = "";
    localStorage.removeItem("wtt-selected-staff");
    renderStaffSelect();
  });

  document.getElementById("clockInButton").addEventListener("click", async () => {
    await clockInRecord(staffDate.value, selectedStaffId);
    renderStaffWork();
  });

  document.getElementById("clockOutButton").addEventListener("click", async () => {
    await clockOutRecord(staffDate.value, selectedStaffId);
    renderStaffWork();
  });

  document.getElementById("startBreakButton").addEventListener("click", async () => {
    await startBreakRecord(staffDate.value, selectedStaffId);
    renderStaffWork();
  });

  document.getElementById("endBreakButton").addEventListener("click", async () => {
    await endBreakRecord(staffDate.value, selectedStaffId);
    renderStaffWork();
  });

  document.getElementById("submitDayButton").addEventListener("click", submitDay);

  try {
    await loadAppData([staffDate.value]);
    state = appState;

    if (selectedStaffId && state.staff.some(s => s.id === selectedStaffId && s.active)) showWork();
    else renderStaffSelect();

    if (!realtimeChannel) {
      realtimeChannel = createRealtimeChannel(() => [staffDate.value], async () => {
        state = appState;
        if (selectedStaffId) renderStaffWork();
        else renderStaffSelect();
      });
    }
  } catch (error) {
    showError("staffButtons", error);
  }
}

async function safeReloadAndRender() {
  try {
    await refreshStateForDates([staffDate.value]);
    state = appState;
    if (selectedStaffId) renderStaffWork();
    else renderStaffSelect();
  } catch (error) {
    showError("staffJobList", error);
  }
}

function renderStaffSelect() {
  state = appState;
  document.getElementById("staffSelectPanel").classList.remove("hidden");
  document.getElementById("staffWorkPanel").classList.add("hidden");
  document.getElementById("changeStaffButton").classList.add("hidden");

  document.getElementById("staffButtons").innerHTML = activeStaff(state).map(s => `
    <button class="staff-select-button" onclick="selectStaff('${s.id}')">${escapeHtml(s.name)}</button>
  `).join("");
}

async function selectStaff(id) {
  selectedStaffId = id;
  localStorage.setItem("wtt-selected-staff", id);
  await refreshStateForDates([staffDate.value]);
  showWork();
}

function showWork() {
  document.getElementById("staffSelectPanel").classList.add("hidden");
  document.getElementById("staffWorkPanel").classList.remove("hidden");
  document.getElementById("changeStaffButton").classList.remove("hidden");
  renderStaffWork();
}

function renderStaffWork() {
  state = appState;
  const staff = state.staff.find(s => s.id === selectedStaffId);
  if (!staff) return renderStaffSelect();

  const date = staffDate.value;
  const shift = getShift(state, date, selectedStaffId);
  const current = activeJob(state, date, selectedStaffId);
  const banner = document.getElementById("staffStatusBanner");
  const onBreak = shift?.onBreak;

  document.getElementById("selectedStaffName").textContent = staff.name;

  let statusText = "CLOCKED OUT";
  banner.className = "status-banner clockedout";

  if (onBreak) {
    statusText = "ON BREAK";
    banner.className = "status-banner break";
  } else if (current) {
    statusText = current.name.toUpperCase();
    banner.className = "status-banner running";
  } else if (shift?.clockIn && !shift?.clockOut) {
    statusText = "CLOCKED IN";
    banner.className = "status-banner";
  }

  banner.textContent = statusText;

  const isClockedIn = Boolean(shift?.clockIn && !shift?.clockOut);
  document.getElementById("clockInButton").disabled = isClockedIn;
  document.getElementById("clockOutButton").disabled = !isClockedIn;
  document.getElementById("startBreakButton").disabled = !isClockedIn || onBreak;
  document.getElementById("endBreakButton").disabled = !onBreak;

  const jobs = jobsFor(state, date, selectedStaffId);
  document.getElementById("staffJobList").innerHTML = jobs.length ? jobs.map(jobCard).join("") : `
    <div class="card"><p>No jobs planned for this date.</p></div>
  `;
}

function jobCard(job) {
  const running = job.status === "running";
  const finished = job.status === "finished";

  return `
    <div class="staff-job-card ${running ? "running" : ""} ${finished ? "finished" : ""}">
      <h3>#${escapeHtml(job.jobNumber)} ${escapeHtml(job.name)} <span class="badge">${labelStatus(job.status)}</span></h3>
      ${job.instructions ? `<p><strong>Instructions:</strong> ${escapeHtml(job.instructions)}</p>` : ""}
      <p>Time: ${formatMinutes(jobMinutes(job))} · Start: ${timeOnly(job.actualStart) || "-"} · Finish: ${timeOnly(job.actualEnd) || "-"}</p>
      <div class="button-row wrap">
        <button class="primary-button" onclick="staffStartJob('${job.id}')" ${finished ? "disabled" : ""}>Start</button>
        <button class="secondary-button" onclick="staffPauseJob('${job.id}')" ${!running ? "disabled" : ""}>Pause</button>
        <button class="secondary-button" onclick="staffFinishJob('${job.id}')" ${finished ? "disabled" : ""}>Finish</button>
      </div>
      <label>Notes
        <textarea rows="3" onchange="updateStaffNotes('${job.id}', this.value)">${escapeHtml(job.staffNotes || "")}</textarea>
      </label>
    </div>
  `;
}

async function staffStartJob(jobId) {
  await startJobRecord(jobId);
  renderStaffWork();
}

async function staffPauseJob(jobId) {
  await pauseJobRecord(jobId);
  renderStaffWork();
}

async function staffFinishJob(jobId) {
  await finishJobRecord(jobId);
  renderStaffWork();
}

async function updateStaffNotes(jobId, value) {
  await updateJobRecord(jobId, { staffNotes: value });
  renderStaffWork();
}

async function submitDay() {
  const date = staffDate.value;
  const staff = state.staff.find(s => s.id === selectedStaffId);
  if (!staff) return;

  const message = document.getElementById("submitMessage");
  const button = document.getElementById("submitDayButton");
  button.disabled = true;
  message.textContent = "Submitting and sending email...";

  try {
    await submitDayRecord(date, selectedStaffId);
    await sendSubmissionEmailRecord(date, selectedStaffId);
    message.textContent = "Submitted successfully. Email sent.";
    renderStaffWork();
  } catch (error) {
    message.textContent = error.message || "Submission failed.";
  } finally {
    button.disabled = false;
  }
}

initStaff();
