import { EulerCromer, VelocityVerlet } from "./engine/integrators.js";
import { World } from "./engine/world.js";
import { Camera } from "./render/camera.js";
import { HUD } from "./render/hud.js";
import { Renderer } from "./render/renderer.js";
import {
  runValidation,
  runPerformanceBenchmarks,
  runBroadPhaseBenchmarks,
  runDeterministicReplay
} from "./tests.js";
import { SCENES } from "./scenes.js";

const $ = (selector) => document.querySelector(selector);
const canvas = $("#simulation");
const camera = new Camera(1, 0, 0);
const renderer = new Renderer(canvas, camera);
const hud = new HUD($("#hud"));
const integrators = { EulerCromer, VelocityVerlet };
const fixedStep = 1 / 240;

let world;
let running = true;
let accumulator = 0;
let previousFrameTime = 0;
let frameCount = 0;
let fpsStartTime = 0;
let fps = 0;
let physicsMs = 0;
let renderMs = 0;

function resizeCanvas() {
  const pixelRatio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;

  canvas.width = Math.round(rect.width * pixelRatio);
  canvas.height = Math.round(rect.height * pixelRatio);
  renderer.ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

  const bounds = world?.view ?? { xMin: -5, xMax: 5, yMin: -4, yMax: 4 };
  const viewWidth = bounds.xMax - bounds.xMin;
  const viewHeight = bounds.yMax - bounds.yMin;
  camera.scale = Math.min(rect.width / viewWidth, rect.height / viewHeight) * 0.9;
  const centerX = (bounds.xMin + bounds.xMax) / 2;
  const centerY = (bounds.yMin + bounds.yMax) / 2;
  camera.originX = rect.width / 2 - centerX * camera.scale;
  camera.originY = rect.height / 2 + centerY * camera.scale;
}

function buildScene() {
  world = createSelectedWorld();
  world.captureBaseline();

  accumulator = 0;
  previousFrameTime = 0;
  renderer.showTrails = $("#trails").checked;
  renderer.clearTrails();
  renderer.recordTrails(world);
  $("#description").textContent = world.description;
  $("#jitter-control").hidden = $("#scene").value !== "jitter";
  resizeCanvas();
}

function createSelectedWorld() {
  const scene = SCENES[$("#scene").value];
  if (!scene) throw new Error(`Unknown scene: ${$("#scene").value}`);

  const selectedWorld = scene.make({
    restitution: Number($("#restitution").value),
    disabledGuard: $("#jitter-bug").checked
  });
  selectedWorld.integrator = new integrators[$("#integrator").value]();
  selectedWorld.restitution = Number($("#restitution").value);
  selectedWorld.jitterBugDemo = $("#scene").value === "jitter" && $("#jitter-bug").checked;
  return selectedWorld;
}

function frame(timestamp) {
  if (previousFrameTime === 0) {
    previousFrameTime = timestamp;
    fpsStartTime = timestamp;
  }
  const elapsed = Math.min((timestamp - previousFrameTime) / 1000, 0.1);
  previousFrameTime = timestamp;

  if (running) {
    accumulator += elapsed;
    let physicsTime = 0;
    while (accumulator >= fixedStep) {
      const start = performance.now();
      world.step(fixedStep);
      physicsTime += performance.now() - start;
      accumulator -= fixedStep;
    }
    physicsMs = physicsTime;
    renderer.recordTrails(world);
  } else {
    physicsMs = 0;
  }

  frameCount++;
  if (timestamp - fpsStartTime >= 500) {
    fps = frameCount * 1000 / (timestamp - fpsStartTime);
    frameCount = 0;
    fpsStartTime = timestamp;
  }

  const renderStart = performance.now();
  renderer.draw(world);
  renderMs = performance.now() - renderStart;
  hud.update(world, fps, physicsMs, renderMs);
  requestAnimationFrame(frame);
}

$("#scene").addEventListener("change", buildScene);
$("#integrator").addEventListener("change", () => {
  world.integrator = new integrators[$("#integrator").value]();
});
$("#restitution").addEventListener("input", () => {
  const value = Number($("#restitution").value);
  $("#restitution-value").value = value.toFixed(2);
  world.restitution = value;
});
$("#trails").addEventListener("change", () => {
  renderer.showTrails = $("#trails").checked;
  renderer.clearTrails();
});
$("#jitter-bug").addEventListener("change", () => {
  world.jitterBugDemo = $("#scene").value === "jitter" && $("#jitter-bug").checked;
  buildScene();
});
$("#play-pause").addEventListener("click", (event) => {
  running = !running;
  previousFrameTime = 0;
  accumulator = 0;
  event.currentTarget.textContent = running ? "Pause" : "Play";
});
$("#step").addEventListener("click", () => {
  world.step(fixedStep);
  renderer.recordTrails(world);
});
$("#reset").addEventListener("click", buildScene);
$("#run-tests").addEventListener("click", async () => {
  const output = $("#test-results");
  output.className = "test-results";
  output.textContent = "Running conservation tests and performance measurements...";
  try {
    const checks = runValidation();
    const benchmarks = await runPerformanceBenchmarks(world, renderer);
    const broadPhaseBenchmarks = runBroadPhaseBenchmarks();
    const failures = checks.filter((check) => !check.passed);
    output.textContent = [
      ...checks.map((check) => `${check.passed ? "PASS" : "FAIL"} ${check.name}: ${check.detail}`),
      "",
      "Performance sample (one-second requestAnimationFrame sample):",
      "Bodies | Physics ms/frame | Render ms/frame | Measured FPS",
      ...benchmarks.map((row) =>
        `${row.count} | ${row.physicsMs.toFixed(3)} | ${row.renderMs.toFixed(3)} | ${row.fps.toFixed(1)}`
      ),
      "",
      "Broad-phase comparison (average physics ms/step; same seeded bodies):",
      "Bodies | Brute-force ms | Grid ms | Speedup | Brute checks/step | Grid checks/step",
      ...broadPhaseBenchmarks.map((row) =>
        `${row.count} | ${row.bruteForceMs.toFixed(3)} | ${row.gridMs.toFixed(3)} | ${row.speedup.toFixed(2)}x | ${row.bruteForceChecks} | ${row.gridChecks}`
      )
    ].join("\n");
    output.classList.add(failures.length ? "failed" : "passed");
  } catch (error) {
    output.classList.add("failed");
    output.textContent = `Validation failed to run: ${error.message}`;
    throw error;
  }
});

$("#replay").addEventListener("click", () => {
  const output = $("#test-results");
  output.className = "test-results";
  output.textContent = "Replaying the selected scene twice from the same seeded initial conditions...";
  try {
    const result = runDeterministicReplay(createSelectedWorld);
    buildScene();
    output.textContent = [
      `Deterministic replay: ${result.identical ? "BIT-IDENTICAL" : "MISMATCH"}`,
      `Scene: ${$("#scene").selectedOptions[0].textContent}`,
      `Duration: ${result.duration.toFixed(1)} s (${result.steps} fixed steps at 1/240 s)`,
      `Compared ${result.valuesCompared} final state values across ${result.bodyCount} bodies.`,
      "The visible scene has been reset to the same initial conditions."
    ].join("\n");
    output.classList.add(result.identical ? "passed" : "failed");
  } catch (error) {
    output.classList.add("failed");
    output.textContent = `Replay failed: ${error.message}`;
    throw error;
  }
});

window.addEventListener("resize", resizeCanvas);
$("#restitution-value").value = Number($("#restitution").value).toFixed(2);
buildScene();
requestAnimationFrame(frame);
