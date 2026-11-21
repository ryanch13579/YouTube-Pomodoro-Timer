// Runs in the hidden offscreen page and controls the YouTube embed.
// Extension pages can't load YouTube's iframe_api.js, so we speak its
// postMessage protocol directly. Offscreen pages have no chrome.storage, so
// all state comes from background.js via messages.

const YOUTUBE_ORIGIN = "https://www.youtube.com";

let iframe = null;
let playerReady = false;
let pendingCommands = [];
let lastProgressReport = 0;
let lastTitle = "";

const EMBED_NOT_ALLOWED =
  "The owner of this video doesn't allow it to be played outside YouTube. Try another upload of the song.";
const ERROR_MESSAGES = {
  2: "That link has an invalid video id.",
  5: "This video can't be played in the embedded player.",
  100: "This video was removed or is private.",
  101: EMBED_NOT_ALLOWED,
  150: EMBED_NOT_ALLOWED,
  153: "YouTube rejected the player (Error 153). Try reloading the extension.",
};

function postToPlayer(payload) {
  if (!iframe?.contentWindow) return;
  iframe.contentWindow.postMessage(JSON.stringify(payload), YOUTUBE_ORIGIN);
}

function command(func, args = []) {
  if (!playerReady) {
    pendingCommands.push([func, args]);
    return;
  }
  postToPlayer({ event: "command", func, args, id: 1, channel: "widget" });
}

// Repeat until the player answers; it may not be listening right after load.
function startListening() {
  const timer = setInterval(() => {
    if (playerReady) return clearInterval(timer);
    postToPlayer({ event: "listening", id: 1, channel: "widget" });
  }, 500);
}

function onPlayerReady() {
  if (playerReady) return;
  playerReady = true;
  for (const [func, args] of pendingCommands) command(func, args);
  pendingCommands = [];
}

window.addEventListener("message", (event) => {
  if (event.origin !== YOUTUBE_ORIGIN) return;

  let data;
  try {
    data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
  } catch {
    return;
  }

  onPlayerReady();

  if (data.event === "onError") {
    const code = Number(data.info);
    chrome.runtime.sendMessage({
      type: "player:error",
      error: ERROR_MESSAGES[code] || `YouTube player error (code ${code}).`,
    });
  }

  if (data.event === "infoDelivery" && data.info) {
    const { currentTime, playerState, videoData } = data.info;

    // Saved so playback can resume if Chrome closes this page.
    if (typeof currentTime === "number" && Date.now() - lastProgressReport > 3000) {
      lastProgressReport = Date.now();
      chrome.runtime.sendMessage({ type: "player:progress", currentTime });
    }

    if (videoData?.title && videoData.title !== lastTitle) {
      lastTitle = videoData.title;
      chrome.runtime.sendMessage({ type: "player:title", title: lastTitle });
    }

    // Ended (0): loop=1 usually handles this, but restart as a fallback.
    if (playerState === 0) {
      command("seekTo", [0, true]);
      command("playVideo");
    }
  }
});

function createPlayer({ videoId, startSeconds, volume, autoplay }) {
  const params = new URLSearchParams({
    enablejsapi: "1",
    autoplay: autoplay ? "1" : "0",
    loop: "1",
    playlist: videoId, // required for loop=1 on a single video
    start: String(Math.floor(startSeconds || 0)),
    controls: "0",
    playsinline: "1",
  });

  iframe = document.createElement("iframe");
  iframe.src = `${YOUTUBE_ORIGIN}/embed/${videoId}?${params}`;
  iframe.width = "640";
  iframe.height = "360";
  iframe.allow = "autoplay; encrypted-media";
  iframe.referrerPolicy = "strict-origin-when-cross-origin";
  iframe.addEventListener("load", startListening);
  document.getElementById("player-slot").appendChild(iframe);

  command("setVolume", [volume]);
  if (autoplay) command("playVideo");
}

// Rising notes for back-to-work, falling for a break, an arpeggio when done.
function playChime(phase) {
  const ctx = new AudioContext();
  ctx.resume();
  const C5 = 523.25, E5 = 659.25, G5 = 783.99, C6 = 1046.5;
  const notes = { work: [C5, G5], shortBreak: [G5, C5], done: [C5, E5, G5, C6] }[phase] || [G5, C5];
  notes.forEach((frequency, i) => {
    const start = ctx.currentTime + i * 0.35;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.25, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 1.6);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 1.7);
  });
  setTimeout(() => ctx.close(), 3500);
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.target !== "offscreen") return;

  switch (message.type) {
    case "chime":
      playChime(message.phase);
      break;
    case "play":
      command("playVideo");
      break;
    case "pause":
      command("pauseVideo");
      break;
    case "volume":
      command("setVolume", [message.volume]);
      break;
  }
});

chrome.runtime.sendMessage({ type: "player:hello" }).then((reply) => {
  const { music, volume = 60, chime } = reply?.data ?? {};
  if (chime) playChime(chime);
  if (!music?.videoId) return;
  createPlayer({
    videoId: music.videoId,
    startSeconds: music.currentTime,
    volume,
    autoplay: music.playing,
  });
});
