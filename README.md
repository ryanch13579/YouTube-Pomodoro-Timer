# Focus Tunes: YouTube Music + Pomodoro

A Chrome extension that plays a YouTube video as background music and runs a
Pomodoro timer, all from one popup.

## Load it in Chrome

1. Download and unzip `youtube-pomodoro.zip` (or use this folder as is).
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** (top-right switch).
4. Click **Load unpacked** and pick the `youtube-pomodoro` folder (the one with
   `manifest.json` in it).
5. Click the puzzle-piece icon in the toolbar and pin **Focus Tunes**.

After you edit any file, click the circular reload arrow on the extension's
card in `chrome://extensions`, then reopen the popup.

## Using it

- **Music:** paste a YouTube link, click **Load**. It starts playing and loops.
  Close the popup and it keeps playing. Use Play/Pause and the volume slider.
- **Timer:** click **Start**. Focus sessions (25 min) alternate with breaks
  (5 min). After the last focus session (4 by default) the timer stops and you
  get a "Good work, you're done!" notification. **Start again** begins a new
  round. You get a notification at each switch. Change lengths under **Settings**.
- **Pause music during breaks** (on by default): music stops when a break
  starts and comes back when focus starts again.
- **Chime when a session ends** (on by default): two soft notes play at each
  switch. They go down going into a break and up going back to focus. A
  longer rising chime plays when the whole round is done.

## How the code is organised

| File | What it does |
| --- | --- |
| `manifest.json` | Tells Chrome what the extension is and which permissions it needs. |
| `background.js` | The brain. Runs the timer with `chrome.alarms`, stores all state in `chrome.storage`, and opens the hidden player page. |
| `offscreen.html` / `offscreen.js` | A hidden page that holds the official YouTube embedded player, so music survives the popup closing. Controlled with `postMessage`. |
| `popup.html` / `popup.css` / `popup.js` | The popup you see. It reads state from storage and sends button clicks to the background. |
| `icons/` | Toolbar and notification icons. |

The popup and the background talk with `chrome.runtime.sendMessage`, a bit
like a frontend calling an API in a Node/React app. Each message has a `type`
such as `"timer:start"` or `"music:load"`; see the `handlers` object in
`background.js`.

## Known limitations

- **Some videos won't play.** Many official label music videos block
  embedding (the popup shows a message when that happens). Try a lyric video
  or another upload of the same song.
- **Error 153 workaround.** YouTube's embedded player needs a Referer header
  that extension pages don't send. `background.js` adds one (see
  `installRefererRule`), only for requests made by this extension's hidden
  page. If YouTube changes how embeds work, this is the part likely to need a fix.
- **Long pauses.** Chrome closes the hidden player after about 30 seconds of
  silence. The extension saves your spot, so Play resumes where you left off.
- **Ads** can play, as in any embedded YouTube player.

## Debugging

- Background: `chrome://extensions` → Focus Tunes → **service worker** link opens DevTools.
- Hidden player: `chrome://extensions` → Focus Tunes → **offscreen.html** link (shown while music is loaded).
- Popup: right-click the popup → **Inspect**.
