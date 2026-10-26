"use strict";

(() => {
  const start = document.getElementById("start");
  const status = document.getElementById("status");
  const help = document.getElementById("help");
  const threshold = document.getElementById("threshold");
  const monitor = document.getElementById("monitor");
  const boost = document.getElementById("boost");
  const meter = document.querySelector('[role="meter"]');
  let session = null;
  let generation = 0;

  function showStatus(message, detail) {
    if (status.textContent !== message) status.textContent = message;
    if (detail !== undefined) help.textContent = detail;
  }

  function showLevel(level) {
    document.getElementById("level").textContent = level;
    document.getElementById("level-bar").style.width = `${level}%`;
    meter.setAttribute("aria-valuenow", level);
    document.body.dataset.alert = String(level >= Number(threshold.value));
  }

  function release(current) {
    if (!current) return;
    cancelAnimationFrame(current.frame);
    if (current.stream) {
      current.stream.getTracks().forEach((track) => {
        track.onended = null;
        track.onmute = null;
        track.stop();
      });
    }
    current.ctx.onstatechange = null;
    if (current.ctx.state !== "closed") current.ctx.close().catch(() => {});
  }

  function stop(message = "Stopped", detail = "Tap Start to listen again.") {
    generation += 1;
    const previous = session;
    session = null;
    release(previous);
    start.textContent = "Start listening";
    start.dataset.active = "false";
    showLevel(0);
    showStatus(message, detail);
  }

  function updateMonitor() {
    boost.disabled = !monitor.checked;
    document.getElementById("boost-value").textContent = `${Number(boost.value)}×`;
    if (session && session.output) {
      session.output.gain.setTargetAtTime(monitor.checked ? 1 : 0, session.ctx.currentTime, 0.02);
      session.voice.gain.setTargetAtTime(Number(boost.value), session.ctx.currentTime, 0.02);
    }
  }

  function describeError(error) {
    switch (error.name) {
      case "NotAllowedError": case "PermissionDeniedError":
        return "Microphone blocked. In Safari’s page menu, open Website Settings → Microphone → Allow, then try again.";
      case "NotFoundError": case "DevicesNotFoundError":
        return "No microphone found. Connect or enable a microphone, then try again.";
      case "NotReadableError": case "TrackStartError":
        return "The microphone is busy. Finish any call or other recording, then try again.";
      default:
        return "Audio could not start. Open this site directly in Safari and tap Start again.";
    }
  }

  async function begin() {
    if (session) { stop(); return; }
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!window.isSecureContext) {
      showStatus("Secure connection needed", "Open the HTTPS website in Safari. Local file previews cannot access the microphone.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || !AudioContext) {
      showStatus("Microphone unavailable", "Open this site directly in Safari rather than inside another app’s preview.");
      return;
    }

    const token = ++generation;
    let current;
    try {
      // Create AND resume during the tap, before waiting for microphone permission.
      const ctx = new AudioContext();
      current = { ctx, stream: null, frame: 0, ready: false };
      session = current;
      const resumed = ctx.resume();
      resumed.catch(() => {});
      start.textContent = "Cancel";
      start.dataset.active = "true";
      showStatus("Starting microphone…", "Choose Allow if Safari asks for microphone access.");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        video: false
      });
      if (token !== generation) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      current.stream = stream;
      await resumed;
      if (token !== generation) return;
      if (ctx.state !== "running") throw new Error("Audio context did not start");

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);

      // A separate, muted-by-default monitoring branch also keeps the graph active.
      // Headphones avoid feeding this output back into the microphone.
      const highpass = ctx.createBiquadFilter();
      highpass.type = "highpass";
      highpass.frequency.value = 120;
      current.voice = ctx.createGain();
      current.voice.gain.value = Number(boost.value);
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -12;
      compressor.ratio.value = 12;
      current.output = ctx.createGain();
      current.output.gain.value = monitor.checked ? 1 : 0;
      source.connect(highpass).connect(current.voice).connect(compressor).connect(current.output).connect(ctx.destination);

      const pause = () => {
        if (session === current) stop("Audio paused", "Audio was interrupted. Tap Start to resume listening.");
      };
      stream.getAudioTracks().forEach((track) => {
        track.onended = pause;
        track.onmute = pause;
      });
      ctx.onstatechange = () => {
        if (current.ready && ctx.state !== "running") pause();
      };
      current.ready = true;
      start.textContent = "Stop listening";
      showStatus("Listening", "Keep the app open and the screen awake. Tap Stop to release the microphone.");
      const samples = new Float32Array(analyser.fftSize);

      function update() {
        if (session !== current) return;
        analyser.getFloatTimeDomainData(samples);
        let energy = 0;
        for (const sample of samples) energy += sample * sample;
        const rms = Math.sqrt(energy / samples.length);
        // Relative level: -60 dBFS maps to 0, 0 dBFS to 100. Not calibrated SPL.
        const level = Math.round(Math.max(0, Math.min(100, (20 * Math.log10(Math.max(rms, 0.001)) + 60) / 60 * 100)));
        showLevel(level);
        showStatus(level >= Number(threshold.value) ? "Loud sound detected" : "Listening");
        current.frame = requestAnimationFrame(update);
      }
      update();
    } catch (error) {
      if (token !== generation) return;
      stop("Unable to listen", describeError(error));
    }
  }

  threshold.addEventListener("input", () => {
    document.getElementById("threshold-value").textContent = threshold.value;
    document.getElementById("threshold-mark").style.left = `${Math.min(99.5, Number(threshold.value))}%`;
  });
  monitor.addEventListener("change", updateMonitor);
  boost.addEventListener("input", updateMonitor);
  start.addEventListener("click", begin);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && session) stop("Listening paused", "Tap Start to resume. Keep this app open and the screen awake.");
  });
  window.addEventListener("pagehide", () => stop());
  updateMonitor();
})();
