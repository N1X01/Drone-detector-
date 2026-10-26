# TechNinja Drone Sound Detector

An iPhone-friendly microphone monitor with sound-level alerts and optional live
headphone listening for nearby voices. No server, account, or Python installation
is needed for the browser app. Audio is processed locally and is never recorded
or uploaded.

**This measures sound level. It cannot identify a drone or distinguish one from
speech, traffic, or other sounds.** Voice boost amplifies captured sound, including
background noise; it cannot recover speech the microphone does not pick up.

## Open on iPhone

1. Publish this repository with GitHub Pages: repository **Settings → Pages →
   Deploy from a branch → main → /(root) → Save**.
2. Once GitHub reports the deployment ready, open
   <https://n1x01.github.io/Drone-detector-/> directly in **Safari**.
3. Tap **Start listening**, then **Allow** microphone access.
4. For live voices, connect headphones first, keep headphone volume low, turn on
   **Hear nearby voices**, and increase **Voice boost** as needed. Keep the phone
   near the person talking. Bluetooth headphones may introduce a delay.
5. Optionally use **Share → Add to Home Screen**.

Keep the app visible and the screen awake. Switching apps, locking the phone,
receiving a call, or another microphone interruption pauses listening and
releases the microphone. Tap Start to resume. Stop also releases the microphone.

If permission is blocked, open Safari's page menu → Website Settings → Microphone
→ Allow, then retry. Open the HTTPS website, not a GitHub source view or a local
HTML preview. The root entry is lowercase `index.html`; old `Index.html` links
redirect to it. All browser assets are local, without CDN dependencies.

## Local browser development

From the repository root:

```bash
python -m http.server 8000 --bind 127.0.0.1
```

Open <http://localhost:8000>. Browsers allow microphone access on localhost; an
iPhone connecting to a computer over plain HTTP instead needs HTTPS hosting.
The 0–100 meter is a relative microphone level, not calibrated decibels/SPL.

Run the dependency-free lifecycle and audio-routing checks with Node.js:

```bash
node --test tests/app.test.cjs
```

These use browser API doubles to test permissions, stopping, interruptions, and
voice controls. Actual iPhone microphone routing and headphone playback need a
device check.

## Desktop Python listener

The original Python script detects loud audio events on a desktop microphone.

1. Install the required dependencies:
```bash
pip install -r drone_detector/_processing/dio_processing/audio_processing/requirements.txt
```

2. Run the microphone listener:
```bash
python drone_detector/_processing/dio_processing/audio_processing/Mic_listener.py
```

The script prints a message whenever the sound level exceeds the configured threshold.
