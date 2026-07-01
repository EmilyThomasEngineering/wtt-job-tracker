const statusPanel = document.getElementById("statusPanel");
const connectionStatus = document.getElementById("connectionStatus");

document.getElementById("bossButton").addEventListener("click", () => {
  statusPanel.textContent = "Boss login is the next feature. Tiny empire, sensible gatekeeping.";
});

document.getElementById("staffButton").addEventListener("click", () => {
  statusPanel.textContent = "Staff selector is coming next.";
});

if (APP_CONFIG.supabaseUrl && APP_CONFIG.supabaseAnonKey) {
  connectionStatus.textContent = "Supabase configured";
} else {
  connectionStatus.textContent = "Local setup";
}

console.log("Warrnambool Trays & Trailers Job Tracker loaded.");
