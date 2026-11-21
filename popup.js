// Draws the popup from chrome.storage and sends user actions to background.js.

const $ = (id) => document.getElementById(id);

// Mirrors the defaults in background.js; used only for the first draw.
let state = {
  settings: {
    workMinutes: 25,
    shortBreakMinutes: 5,
    totalSessions: 4,
    pauseMusicOnBreak: true,
    chimeOnSwitch: true,
    volume: 60,
  },
  music: { url: "", videoId: "", title: "", playing: false, error: "" },
  timer: { phase: "work", running: false, endTime: null, remainingMs: null, completedWorkSessions: 0 },
};

const PHASE_LABELS = { work: "Focus", shortBreak: "Break", done: "Done. Good work!" };

const NUMBER_SETTINGS = {
  "work-minutes": "workMinutes",
  "short-minutes": "shortBreakMinutes",
  "total-sessions": "totalSessions",
};
const CHECKBOX_SETTINGS = {
  "pause-on-break": "pauseMusicOnBreak",
  chime: "chimeOnSwitch",
};

function send(type, extra = {}) {
  return chrome.runtime.sendMessage({ type, ...extra });
}

function phaseLengthMs() {
  const { timer, settings } = state;
  const minutes = {
    work: settings.workMinutes,
    shortBreak: settings.shortBreakMinutes,
    done: 0,
  }[timer.phase];
  return minutes * 60 * 1000;
}

function timeLeftMs() {
  const { timer } = state;
  if (timer.running && timer.endTime) return Math.max(0, timer.endTime - Date.now());
  if (timer.remainingMs != null) return timer.remainingMs;
  return phaseLengthMs();
}

function formatTime(ms) {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function drawClock() {
  const left = timeLeftMs();
  $("clock").textContent = formatTime(left);
  const total = phaseLengthMs();
  const done = total > 0 ? 1 - left / total : 1;
  $("progress-fill").style.width = `${Math.min(100, Math.max(0, done * 100))}%`;
}

function drawDots() {
  const { timer, settings } = state;
  const total = settings.totalSessions;
  const filled = Math.min(timer.completedWorkSessions, total);
  $("session-dots").replaceChildren(
    ...Array.from({ length: total }, (_, i) => {
      const dot = document.createElement("span");
      dot.className = i < filled ? "dot done" : "dot";
      return dot;
    })
  );
}

function draw() {
  const { timer, music, settings } = state;

  $("phase-label").textContent = PHASE_LABELS[timer.phase];
  $("timer-card").classList.toggle("on-break", timer.phase !== "work");
  $("timer-toggle").textContent = timer.running ? "Pause" : timer.phase === "done" ? "Start again" : "Start";
  drawDots();
  drawClock();

  // Skip inputs that have focus so we don't overwrite what the user is typing.
  if (document.activeElement !== $("url-input")) $("url-input").value = music.url;
  $("now-playing").hidden = !music.videoId;
  const title = music.title || "Loading…";
  // Only update on change, or the marquee animation restarts.
  if ($("title-a").textContent !== title) {
    $("title-a").textContent = title;
    $("title-b").textContent = title;
    $("now-playing").title = title;
  }
  $("music-toggle").classList.toggle("playing", music.playing);
  $("music-toggle").title = music.playing ? "Pause" : "Play";
  $("music-error").hidden = !music.error;
  $("music-error").textContent = music.error;
  if (document.activeElement !== $("volume")) $("volume").value = settings.volume;

  for (const [id, key] of Object.entries(NUMBER_SETTINGS)) {
    if (document.activeElement !== $(id)) $(id).value = settings[key];
  }
  for (const [id, key] of Object.entries(CHECKBOX_SETTINGS)) {
    $(id).checked = settings[key];
  }
}

async function loadState() {
  const stored = await chrome.storage.local.get(["settings", "music", "timer"]);
  state = {
    settings: { ...state.settings, ...stored.settings },
    music: { ...state.music, ...stored.music },
    timer: { ...state.timer, ...stored.timer },
  };
  draw();
}

chrome.storage.onChanged.addListener(loadState);
setInterval(drawClock, 250);

$("timer-toggle").addEventListener("click", () => {
  send(state.timer.running ? "timer:pause" : "timer:start");
});
$("timer-skip").addEventListener("click", () => send("timer:skip"));
$("timer-reset").addEventListener("click", () => send("timer:reset"));

$("music-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const url = $("url-input").value.trim();
  if (url) send("music:load", { url });
});

$("music-toggle").addEventListener("click", () => {
  const typedUrl = $("url-input").value.trim();
  if (state.music.playing) {
    send("music:pause");
  } else if (typedUrl && typedUrl !== state.music.url) {
    send("music:load", { url: typedUrl });
  } else if (state.music.videoId) {
    send("music:play");
  } else {
    $("url-input").focus();
  }
});

$("volume").addEventListener("input", (event) => {
  send("music:volume", { volume: Number(event.target.value) });
});

for (const [id, key] of Object.entries(NUMBER_SETTINGS)) {
  $(id).addEventListener("change", (event) => {
    const value = Math.round(Number(event.target.value));
    if (value >= 1) send("settings:update", { settings: { [key]: value } });
    else draw(); // restore the previous value
  });
}

for (const [id, key] of Object.entries(CHECKBOX_SETTINGS)) {
  $(id).addEventListener("change", (event) => {
    send("settings:update", { settings: { [key]: event.target.checked } });
  });
}

const settingsPanel = document.querySelector(".settings-panel");
settingsPanel.open = localStorage.getItem("settingsOpen") === "true";
settingsPanel.addEventListener("toggle", () => {
  localStorage.setItem("settingsOpen", String(settingsPanel.open));
});

loadState();
