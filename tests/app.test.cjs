const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const vm = require("node:vm");
const script = readFileSync(join(__dirname, "../app.js"), "utf8");

// Browser API doubles exercise permission races and microphone cleanup without
// accessing a real microphone. Hardware playback still requires an iPhone check.
function setup({ secure = true, supported = true } = {}) {
  const events = {};
  const elements = {};
  for (const id of ["start", "status", "help", "threshold", "monitor", "boost", "level", "level-bar", "threshold-value", "threshold-mark", "boost-value", "meter"]) {
    elements[id] = {
      value: id === "threshold" ? "50" : "1", checked: false,
      textContent: "", style: {}, dataset: {}, attributes: {},
      listeners: {},
      setAttribute(key, value) { this.attributes[key] = String(value); },
      addEventListener(name, fn) { this.listeners[name] = fn; },
      dispatch(name) { return this.listeners[name](); }
    };
  }
  const contexts = [], streams = [], frames = new Map(), order = [];
  let nextFrame = 1;
  const state = { amplitude: 0.1, getMedia: async () => makeStream() };
  function makeStream() {
    const track = { stopped: false, stop() { this.stopped = true; } };
    const stream = { getTracks: () => [track], getAudioTracks: () => [track], track };
    streams.push(stream);
    return stream;
  }
  function param(value = 0) {
    return { value, setTargetAtTime(next) { this.value = next; } };
  }
  class Context {
    constructor() {
      this.state = "suspended"; this.currentTime = 0; this.nodes = [];
      this.destination = { kind: "destination" }; contexts.push(this);
    }
    resume() { order.push("resume"); this.state = "running"; return Promise.resolve(); }
    close() { this.state = "closed"; return Promise.resolve(); }
    node(kind) {
      const node = { kind, connections: [], connect(target) { this.connections.push(target); return target; } };
      this.nodes.push(node); return node;
    }
    createMediaStreamSource() { return this.node("source"); }
    createAnalyser() {
      return Object.assign(this.node("analyser"), {
        getFloatTimeDomainData(samples) {
          for (let i = 0; i < samples.length; i++) samples[i] = state.amplitude * Math.sin(i * Math.PI / 16);
        }
      });
    }
    createBiquadFilter() { return Object.assign(this.node("filter"), { frequency: param() }); }
    createGain() { return Object.assign(this.node("gain"), { gain: param(1) }); }
    createDynamicsCompressor() {
      return Object.assign(this.node("compressor"), { threshold: param(), ratio: param() });
    }
  }
  const document = {
    hidden: false, body: { dataset: {} },
    getElementById: (id) => elements[id], querySelector: () => elements.meter,
    addEventListener(name, fn) { events[name] = fn; }
  };
  const window = {
    isSecureContext: secure, AudioContext: Context,
    addEventListener(name, fn) { events[name] = fn; }
  };
  const navigator = { mediaDevices: supported ? {
    getUserMedia(options) { order.push("microphone"); state.constraints = options; return state.getMedia(); }
  } : undefined };
  vm.runInNewContext(script, {
    window, document, navigator, Float32Array,
    requestAnimationFrame(fn) { const id = nextFrame++; frames.set(id, fn); return id; },
    cancelAnimationFrame(id) { frames.delete(id); }
  });
  return { elements, contexts, streams, frames, order, state, document, events, makeStream,
    click: () => elements.start.dispatch("click"),
    frame() { const queued = [...frames.values()]; frames.clear(); queued.forEach((fn) => fn()); }
  };
}

test("starts audio during the tap, measures sound, and routes voice output muted by default", async () => {
  const f = setup();
  await f.click();
  assert.deepEqual(f.order, ["resume", "microphone"]);
  assert.equal(f.state.constraints.video, false);
  assert.equal(f.state.constraints.audio.echoCancellation, false);
  assert.equal(f.contexts.length, 1);
  assert.equal(f.elements.start.textContent, "Stop listening");
  assert.equal(f.elements.status.textContent, "Loud sound detected");
  assert.ok(Number(f.elements.level.textContent) >= 61 && Number(f.elements.level.textContent) <= 63);
  const nodes = f.contexts[0].nodes;
  assert.deepEqual(nodes[0].connections.map((node) => node.kind), ["analyser", "filter"]);
  const gains = nodes.filter((node) => node.kind === "gain");
  assert.equal(gains[1].gain.value, 0);
  assert.equal(gains[1].connections[0].kind, "destination");
  assert.equal(f.elements.boost.disabled, true);
  f.elements.threshold.value = "100";
  f.elements.threshold.dispatch("input");
  f.frame();
  assert.equal(f.elements.status.textContent, "Listening");
  f.state.amplitude = 0;
  f.frame();
  assert.equal(f.elements.level.textContent, 0);
});

test("live voice switch and boost control the separate headphone audio path", async () => {
  const f = setup();
  f.elements.monitor.checked = true;
  f.elements.monitor.dispatch("change");
  f.elements.boost.value = "3.5";
  f.elements.boost.dispatch("input");
  await f.click();
  const gains = f.contexts[0].nodes.filter((node) => node.kind === "gain");
  assert.equal(gains[0].gain.value, 3.5);
  assert.equal(gains[1].gain.value, 1);
  assert.equal(f.elements.boost.disabled, false);
  f.elements.monitor.checked = false;
  f.elements.monitor.dispatch("change");
  assert.equal(gains[1].gain.value, 0);
  assert.equal(f.elements.boost.disabled, true);
});

test("Stop releases every microphone track, closes audio, cancels rendering, and allows restart", async () => {
  const f = setup();
  await f.click();
  await f.click();
  assert.equal(f.streams[0].track.stopped, true);
  assert.equal(f.contexts[0].state, "closed");
  assert.equal(f.frames.size, 0);
  assert.equal(f.elements.start.textContent, "Start listening");
  await f.click();
  assert.equal(f.contexts.length, 2);
  assert.equal(f.streams[1].track.stopped, false);
});

test("cancelling a pending permission request releases any stream that arrives later", async () => {
  const f = setup();
  let grant;
  f.state.getMedia = () => new Promise((resolve) => { grant = resolve; });
  const starting = f.click();
  assert.equal(f.elements.start.textContent, "Cancel");
  await f.click();
  const stream = f.makeStream();
  grant(stream);
  await starting;
  assert.equal(stream.track.stopped, true);
  assert.equal(f.contexts[0].state, "closed");
  assert.equal(f.elements.status.textContent, "Stopped");
});

test("a stale permission result cannot change a newer listening session", async () => {
  const f = setup();
  let grant;
  f.state.getMedia = () => new Promise((resolve) => { grant = resolve; });
  const oldStart = f.click();
  await f.click();
  f.state.getMedia = async () => f.makeStream();
  await f.click();
  const stale = f.makeStream();
  grant(stale);
  await oldStart;
  assert.equal(stale.track.stopped, true);
  assert.equal(f.streams[0].track.stopped, false);
  assert.equal(f.contexts[1].state, "running");
  assert.equal(f.elements.start.textContent, "Stop listening");
});

for (const event of ["visibilitychange", "pagehide", "context-interrupted", "track-ended", "track-muted"]) {
  test(`${event} releases microphone and audio`, async () => {
    const f = setup();
    await f.click();
    if (event === "visibilitychange") { f.document.hidden = true; f.events[event](); }
    else if (event === "pagehide") f.events[event]();
    else if (event === "context-interrupted") { f.contexts[0].state = "interrupted"; f.contexts[0].onstatechange(); }
    else f.streams[0].track[event === "track-ended" ? "onended" : "onmute"]();
    assert.equal(f.streams[0].track.stopped, true);
    assert.equal(f.contexts[0].state, "closed");
    assert.equal(f.frames.size, 0);
    assert.equal(f.elements.start.textContent, "Start listening");
  });
}

for (const [name, help] of [["NotAllowedError", /Microphone blocked/], ["NotReadableError", /microphone is busy/], ["NotFoundError", /No microphone found/], ["Error", /Open this site directly in Safari/]]) {
  test(`${name} gives recovery steps and cleans up the audio context`, async () => {
    const f = setup();
    f.state.getMedia = async () => { const error = new Error("failure"); error.name = name; throw error; };
    await f.click();
    assert.match(f.elements.help.textContent, help);
    assert.equal(f.contexts[0].state, "closed");
    assert.equal(f.elements.start.textContent, "Start listening");
  });
}

test("unsupported or insecure pages do not request microphone access", async () => {
  for (const options of [{ secure: false }, { supported: false }]) {
    const f = setup(options);
    await f.click();
    assert.equal(f.contexts.length, 0);
    assert.equal(f.streams.length, 0);
    assert.match(f.elements.help.textContent, /Safari/);
  }
});
