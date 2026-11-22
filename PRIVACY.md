# Privacy Policy

**Focus Tunes: YouTube Music + Pomodoro**
Last updated: November 22, 2026

Focus Tunes does not collect, sell, or share your personal data. The developer
runs no servers, and the extension has no accounts, analytics, or tracking.
Your settings stay in your browser. The only outside service the extension
connects to is YouTube, to play the video you choose.

## What is stored on your device

The extension saves the following in your browser's local storage so it can
work between popup openings:

- **Music:** the last link you entered, its video ID and title, your playback
  position, whether it was playing, and any playback error. Only the most
  recent video is kept, not a history.
- **Timer:** the current phase, time remaining, and number of completed focus
  sessions.
- **Settings:** session lengths, number of sessions, volume, your music and
  chime preferences, and whether the settings panel is open.

This data is not synced to other devices or sent to the developer. Entering a
new link replaces the previous one, and removing the extension deletes all of
its stored data.

## YouTube

Music plays through YouTube's official embedded player, in a hidden extension
page. Loading the player connects your browser to YouTube (Google) and tells it
which video to play and where to start. This happens when you load or play a
video. It can also happen when a timer chime reopens the hidden page while a
video is saved, even if music is not playing.

As with any embedded YouTube video, Google may receive your IP address and
browser information, may use cookies depending on your browser settings, and
may show ads. The developer does not receive this information. Google's handling
of it is covered by the [Google Privacy Policy](https://policies.google.com/privacy),
and your use of the player is covered by the
[YouTube Terms of Service](https://www.youtube.com/t/terms).

The extension also adds a `Referer` header to its own player requests, because
YouTube requires one. The header contains the extension's ID and no information
about you or the pages you visit.

## Permissions

| Permission | Why it is needed |
| --- | --- |
| `offscreen` | Keeps the hidden player open so music continues after the popup closes, and plays chimes. |
| `storage` | Saves your music, timer, and settings on your device. |
| `alarms` | Switches between focus and break sessions on time. |
| `notifications` | Tells you when a session ends. |
| `declarativeNetRequest` | Adds the `Referer` header to the extension's own YouTube player requests. |
| Access to `https://www.youtube.com/*` | Allows that header to be added. |

The extension does not read your browsing history, open tabs, or the content of
websites you visit.

## Limited use

Focus Tunes' use of information complies with the
[Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/program-policies/policies),
including the Limited Use requirements.

## Changes

Any changes to this policy will be posted on this page with a new date at the
top.

## Contact

For questions, please
[open an issue on GitHub](https://github.com/ryanch13579/YouTube-Pomodoro-Timer/issues).
