// Service worker: owns the music player (via an offscreen page) and the
// Pomodoro timer (via chrome.alarms). Chrome can stop the worker at any time,
// so all state lives in chrome.storage.local.

const DEFAULT_SETTINGS = {
  workMinutes: 25,
  shortBreakMinutes: 5,
  totalSessions: 4,
  pauseMusicOnBreak: true,
  chimeOnSwitch: true,
  volume: 60,
};

const DEFAULT_MUSIC = {
  url: "",
  videoId: "",
  title: "",
  playing: false,
  currentTime: 0,
  pausedByTimer: false, // a break paused it, so the next work phase resumes it
  error: "",
};

const DEFAULT_TIMER = {
  phase: "work", // "work" | "shortBreak" | "done"
  running: false,
  endTime: null,
  remainingMs: null, // time left while paused; null = full phase length
  completedWorkSessions: 0,
};

const ALARM_NAME = "pomodoro";
const OFFSCREEN_URL = "offscreen.html";
const REFERER_RULE_ID = 1;

async function getState() {
  const stored = await chrome.storage.local.get(["settings", "music", "timer"]);
  return {
    settings: { ...DEFAULT_SETTINGS, ...stored.settings },
    music: { ...DEFAULT_MUSIC, ...stored.music },
    timer: { ...DEFAULT_TIMER, ...stored.timer },
  };
}

async function updateState(key, changes) {
  const state = await getState();
  const next = { ...state[key], ...changes };
  await chrome.storage.local.set({ [key]: next });
  return next;
}

// Accepts youtube.com/watch?v=, youtu.be/, /shorts/, /embed/, /live/,
// music.youtube.com links, or a bare 11-character id.
function parseVideoId(input) {
  const text = (input || "").trim();
  const ID = /^[A-Za-z0-9_-]{11}$/;
  if (ID.test(text)) return text;

  let url;
  try {
    url = new URL(text);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\.|^m\.|^music\./, "");
  let id = null;
  if (host === "youtu.be") {
    id = url.pathname.slice(1).split("/")[0];
  } else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    id = url.searchParams.get("v");
    if (!id) {
      const match = url.pathname.match(/^\/(shorts|embed|live|v)\/([^/?]+)/);
      if (match) id = match[2];
    }
  }
  return id && ID.test(id) ? id : null;
}

// The YouTube embed refuses to load (Error 153) without a Referer, which
// extension pages don't send. Add one only to embed requests from outside
// browser tabs, so embeds on normal websites are untouched.
async function installRefererRule() {
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [REFERER_RULE_ID],
    addRules: [
      {
        id: REFERER_RULE_ID,
        priority: 1,
        action: {
          type: "modifyHeaders",
          requestHeaders: [
            {
              header: "Referer",
              operation: "set",
              value: `https://${chrome.runtime.id}.chromiumapp.org/`,
            },
          ],
        },
        condition: {
          urlFilter: "||youtube.com/embed/",
          resourceTypes: ["sub_frame"],
          tabIds: [chrome.tabs.TAB_ID_NONE],
        },
      },
    ],
  });
}

let creatingOffscreen = null;

async function hasOffscreenDocument() {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_URL)],
  });
  return contexts.length > 0;
}

async function ensureOffscreenDocument() {
  if (await hasOffscreenDocument()) return;
  if (!creatingOffscreen) {
    creatingOffscreen = (async () => {
      await installRefererRule();
      await chrome.offscreen.createDocument({
        url: OFFSCREEN_URL,
        reasons: ["AUDIO_PLAYBACK"],
        justification: "Plays the YouTube video the user chose as background music.",
      });
    })();
  }
  try {
    await creatingOffscreen;
  } finally {
    creatingOffscreen = null;
  }
}

async function closeOffscreenDocument() {
  if (await hasOffscreenDocument()) {
    await chrome.offscreen.closeDocument();
  }
}

let pendingChime = null;

// If the page is closed, "play" and "chime" open it; the new page fetches what
// to do via "player:hello". "pause" and "volume" are already saved in storage.
async function sendToPlayer(command) {
  if (await hasOffscreenDocument()) {
    try {
      await chrome.runtime.sendMessage({ target: "offscreen", ...command });
      return;
    } catch {
      // The page closed between the check and the message.
    }
  }
  if (command.type === "chime") pendingChime = command.phase;
  if (command.type === "play" || command.type === "chime") {
    await ensureOffscreenDocument();
  }
}

async function loadAndPlay(url) {
  const videoId = parseVideoId(url);
  if (!videoId) {
    await updateState("music", { url, error: "That doesn't look like a YouTube link." });
    return;
  }
  const { music } = await getState();
  const sameVideo = music.videoId === videoId;
  await updateState("music", {
    url,
    videoId,
    title: sameVideo ? music.title : "",
    playing: true,
    currentTime: sameVideo ? music.currentTime : 0,
    pausedByTimer: false,
    error: "",
  });
  if (sameVideo) {
    await sendToPlayer({ type: "play" });
  } else {
    await closeOffscreenDocument();
    await ensureOffscreenDocument();
  }
}

async function playMusic() {
  const { music } = await getState();
  if (!music.videoId) return;
  await updateState("music", { playing: true, pausedByTimer: false, error: "" });
  await sendToPlayer({ type: "play" });
}

async function pauseMusic({ byTimer = false } = {}) {
  await updateState("music", { playing: false, pausedByTimer: byTimer });
  await sendToPlayer({ type: "pause" });
}

async function setVolume(volume) {
  await updateState("settings", { volume });
  await sendToPlayer({ type: "volume", volume });
}

function phaseLengthMs(phase, settings) {
  const minutes = {
    work: settings.workMinutes,
    shortBreak: settings.shortBreakMinutes,
    done: 0,
  }[phase];
  return minutes * 60 * 1000;
}

async function startTimer() {
  let { timer, settings, music } = await getState();
  if (timer.running) return;

  if (timer.phase === "done") {
    timer = await updateState("timer", { ...DEFAULT_TIMER });
  }

  const duration = timer.remainingMs ?? phaseLengthMs(timer.phase, settings);
  const endTime = Date.now() + duration;
  await updateState("timer", { running: true, endTime, remainingMs: null });
  await chrome.alarms.create(ALARM_NAME, { when: endTime });

  if (timer.phase === "work" && music.pausedByTimer) await playMusic();
}

async function pauseTimer() {
  const { timer } = await getState();
  if (!timer.running) return;
  await chrome.alarms.clear(ALARM_NAME);
  await updateState("timer", {
    running: false,
    endTime: null,
    remainingMs: Math.max(0, timer.endTime - Date.now()),
  });
}

async function resetTimer() {
  await chrome.alarms.clear(ALARM_NAME);
  await chrome.storage.local.set({ timer: { ...DEFAULT_TIMER } });
}

async function advancePhase({ skipped = false } = {}) {
  const { timer, settings, music } = await getState();
  if (timer.phase === "done") return;
  await chrome.alarms.clear(ALARM_NAME);

  let completed = timer.completedWorkSessions;
  let nextPhase;
  if (timer.phase === "work") {
    if (!skipped) completed += 1;
    if (completed >= settings.totalSessions) {
      return finishRound(completed, settings, music);
    }
    nextPhase = "shortBreak";
  } else {
    nextPhase = "work";
  }

  const keepRunning = timer.running;
  const endTime = keepRunning ? Date.now() + phaseLengthMs(nextPhase, settings) : null;
  await updateState("timer", {
    phase: nextPhase,
    running: keepRunning,
    endTime,
    remainingMs: null,
    completedWorkSessions: completed,
  });
  if (keepRunning) await chrome.alarms.create(ALARM_NAME, { when: endTime });

  if (settings.pauseMusicOnBreak) {
    if (nextPhase !== "work" && music.playing) {
      await pauseMusic({ byTimer: true });
    } else if (nextPhase === "work" && music.pausedByTimer && keepRunning) {
      await playMusic();
    }
  }

  if (!skipped) {
    if (nextPhase === "work") {
      notify("Break's over", `Time to focus for ${settings.workMinutes} minutes.`);
    } else {
      notify("Nice work!", `Take a ${settings.shortBreakMinutes}-minute break.`);
    }
    if (settings.chimeOnSwitch) await playChime(nextPhase);
  }
}

async function finishRound(completed, settings, music) {
  await updateState("timer", {
    phase: "done",
    running: false,
    endTime: null,
    remainingMs: null,
    completedWorkSessions: completed,
  });
  if (settings.pauseMusicOnBreak && music.playing) await pauseMusic({ byTimer: true });

  notify(
    "Good work, you're done!",
    `You finished all ${completed} focus sessions. Time for a real break.`
  );
  if (settings.chimeOnSwitch) await playChime("done");
}

function playChime(phase) {
  return sendToPlayer({ type: "chime", phase });
}

function notify(title, message) {
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icons/icon128.png",
    title,
    message,
    priority: 2,
  });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) advancePhase();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target === "offscreen") return;

  const handlers = {
    "music:load": () => loadAndPlay(message.url),
    "music:play": () => playMusic(),
    "music:pause": () => pauseMusic(),
    "music:volume": () => setVolume(message.volume),
    "timer:start": () => startTimer(),
    "timer:pause": () => pauseTimer(),
    "timer:reset": () => resetTimer(),
    "timer:skip": () => advancePhase({ skipped: true }),
    // New lengths take effect when the next phase starts.
    "settings:update": () => updateState("settings", message.settings),

    "player:hello": async () => {
      const { music, settings } = await getState();
      const chime = pendingChime;
      pendingChime = null;
      return { music, volume: settings.volume, chime };
    },
    "player:progress": () => updateState("music", { currentTime: message.currentTime }),
    "player:title": () => updateState("music", { title: message.title }),
    "player:error": () => updateState("music", { playing: false, error: message.error }),
  };

  const handler = handlers[message.type];
  if (!handler) return;

  handler()
    .then((data) => sendResponse({ ok: true, data }))
    .catch((err) => {
      console.error(err);
      sendResponse({ ok: false, error: String(err) });
    });
  return true; // keep the channel open for the async sendResponse
});

chrome.runtime.onInstalled.addListener(async () => {
  // Fill in missing defaults without wiping saved values.
  const state = await getState();
  await chrome.storage.local.set(state);
});

chrome.runtime.onStartup.addListener(async () => {
  // Music stopped and any timer is stale after the browser restarts.
  await updateState("music", { playing: false, pausedByTimer: false });
  await resetTimer();
});
