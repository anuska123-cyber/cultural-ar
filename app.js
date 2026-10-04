(function () {
  "use strict";

  const TAG = "[AR]";
  const TARGET_SRC = "assets/targets/peacock.mind";
  const VIDEO_TIMEOUT_MS = 12000;
  const SLOW_PERMISSION_HINT_MS = 6000;

  const LOOKING_TEXT = "Looking for poster...";
  const FOUND_TEXT = "Poster detected!";

  const sceneEl = document.getElementById("ar-scene");
  const containerEl = document.getElementById("ar-container");
  const startScreen = document.getElementById("start-screen");
  const introMsg = document.getElementById("intro-msg");
  const startBtn = document.getElementById("start-btn");
  const errorMsg = document.getElementById("error-msg");
  const statusEl = document.getElementById("status");
  const exitBtn = document.getElementById("exit-btn");
  const targetEl = document.getElementById("target");

  let starting = false;
  let running = false;
  let arErrorDetail = null; // set when MindAR emits "arError"

  /* ---------------- helpers ---------------- */

  // Error whose message is safe to show directly to the user
  function friendly(message) {
    const err = new Error(message);
    err.friendly = true;
    return err;
  }

  function getArSystem() {
    return sceneEl && sceneEl.systems && sceneEl.systems["mindar-image-system"];
  }

  function setStatus(text, found) {
    statusEl.textContent = text;
    statusEl.classList.toggle("found", !!found);
  }

  function showStartScreen(opts) {
    opts = opts || {};
    startScreen.classList.remove("hidden");
    statusEl.hidden = true;
    exitBtn.hidden = true;
    startBtn.disabled = false;
    startBtn.textContent = opts.buttonText || "Start AR";
    if (opts.intro) introMsg.textContent = opts.intro;
    if (opts.error) {
      errorMsg.textContent = opts.error;
      errorMsg.hidden = false;
    } else {
      errorMsg.hidden = true;
    }
  }

  // Stop MindAR and make sure the camera is really released
  function releaseAR() {
    const arSystem = getArSystem();
    try {
      if (arSystem) arSystem.stop();
    } catch (e) {
      console.warn(TAG, "MindAR stop() threw (usually harmless if it never fully started):", e);
    }
    containerEl.querySelectorAll("video").forEach(function (v) {
      try {
        const stream = v.srcObject;
        if (stream && stream.getTracks) {
          stream.getTracks().forEach(function (t) { t.stop(); });
        }
      } catch (e) {
        console.warn(TAG, "Could not stop a camera track:", e);
      }
    });
    running = false;
  }

  function fail(message) {
    console.error(TAG, "FAILED:", message);
    releaseAR();
    showStartScreen({ buttonText: "Try again", error: message });
  }

  /* ---------------- startup checks ---------------- */

  async function checkTargetFile() {
    let res;
    try {
      res = await fetch(TARGET_SRC, { method: "HEAD", cache: "no-store" });
    } catch (e) {
      console.error(TAG, "Network error while checking target file:", e);
      throw friendly("Network error while loading " + TARGET_SRC + ". Check your connection and try again.");
    }
    if (!res.ok) {
      console.error(TAG, "Target file check failed:", res.status, res.url);
      throw friendly(
        "Target file not found (HTTP " + res.status + "): " + TARGET_SRC +
        ". Check the folder structure and that the file name is lowercase."
      );
    }
    console.log(TAG, "Target file found:", TARGET_SRC);
  }

  function waitForScene() {
    if (sceneEl.hasLoaded) return Promise.resolve();
    return new Promise(function (resolve) {
      sceneEl.addEventListener("loaded", resolve, { once: true });
    });
  }

  // Resolves once a real camera frame is available
  function waitForVideo(timeoutMs) {
    return new Promise(function (resolve, reject) {
      const t0 = performance.now();
      (function poll() {
        const v = containerEl.querySelector("video");
        if (v && v.readyState >= 2 && v.videoWidth > 0) return resolve(v);
        if (performance.now() - t0 > timeoutMs) {
          return reject(friendly(
            "The camera feed did not appear. Allow camera access, close other apps using the camera, " +
            "and avoid in-app browsers (Instagram, Facebook, etc.). Try Chrome or Safari."
          ));
        }
        setTimeout(poll, 200);
      })();
    });
  }

  function logCameraInfo(video) {
    const stream = video.srcObject;
    const track = stream && stream.getVideoTracks && stream.getVideoTracks()[0];
    if (!track) {
      console.warn(TAG, "No video track found on the camera stream.");
      return;
    }
    const settings = track.getSettings ? track.getSettings() : {};
    console.log(TAG, "Camera in use:", track.label || "(unnamed)", settings);
    if (settings.facingMode === "user") {
      console.warn(TAG, "The FRONT camera is being used. MindAR requests the rear camera ('environment') by default; this device/browser ignored that.");
    } else if (settings.facingMode === "environment") {
      console.log(TAG, "Rear camera confirmed.");
    }
  }

  /* ---------------- start / exit ---------------- */

  async function startAR() {
    if (starting || running) return;
    starting = true;
    arErrorDetail = null;
    errorMsg.hidden = true;
    startBtn.disabled = true;
    startBtn.textContent = "Starting camera…";

    const hintTimer = setTimeout(function () {
      if (starting) startBtn.textContent = "Waiting for camera… tap Allow";
    }, SLOW_PERMISSION_HINT_MS);

    try {
      if (typeof AFRAME === "undefined") {
        throw friendly("A-Frame failed to load. Check your internet connection and the script tags in index.html.");
      }
      if (!window.isSecureContext) {
        throw friendly("Camera access requires HTTPS. Open this page via GitHub Pages (https) or localhost.");
      }
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw friendly("This browser does not support camera access. Try the latest Chrome or Safari.");
      }

      await checkTargetFile();
      await waitForScene();

      const arSystem = getArSystem();
      if (!arSystem) {
        throw friendly("MindAR failed to load. Check your internet connection and the MindAR script tag in index.html.");
      }

      console.log(TAG, "Starting MindAR…");
      await arSystem.start(); // asks for camera permission, loads the .mind file

      if (arErrorDetail) {
        throw friendly(
          "The camera could not be opened. Allow camera permission in your browser settings, " +
          "close other apps using the camera, then try again."
        );
      }

      const video = await waitForVideo(VIDEO_TIMEOUT_MS);
      logCameraInfo(video);

      running = true;
      startScreen.classList.add("hidden");
      statusEl.hidden = false;
      exitBtn.hidden = false;
      setStatus(LOOKING_TEXT, false);
      console.log(TAG, "AR running. Camera feed visible, tracking started.");
    } catch (err) {
      console.error(TAG, "AR start failed:", err, arErrorDetail || "");
      let msg;
      if (err && err.friendly) {
        msg = err.message;
      } else if (arErrorDetail) {
        msg = "The camera could not be opened. Allow camera permission and try again.";
      } else {
        msg = "Could not start AR (" + ((err && err.message) || "unknown error") + "). See the browser console for details.";
      }
      fail(msg);
    } finally {
      clearTimeout(hintTimer);
      starting = false;
    }
  }

  function exitAR() {
    console.log(TAG, "Exit AR pressed. Stopping session.");
    releaseAR();
    showStartScreen({
      buttonText: "Start AR",
      intro: "AR stopped. Tap Start AR to scan the poster again."
    });
  }

  /* ---------------- events ---------------- */

  // Image target index 0
  targetEl.addEventListener("targetFound", function () {
    console.log(TAG, "Target 0 found.");
    setStatus(FOUND_TEXT, true);
  });

  targetEl.addEventListener("targetLost", function () {
    console.log(TAG, "Target 0 lost.");
    setStatus(LOOKING_TEXT, false);
  });

  sceneEl.addEventListener("arReady", function () {
    console.log(TAG, "MindAR ready (arReady).");
  });

  // MindAR emits this for camera or model failures
  sceneEl.addEventListener("arError", function (event) {
    arErrorDetail = (event && event.detail) || { error: "unknown" };
    console.error(TAG, "MindAR arError:", arErrorDetail);
    // If this happens while running, show the error; during startup startAR() handles it.
    if (running) {
      fail("MindAR reported an error. Please try again.");
    }
  });

  startBtn.addEventListener("click", startAR);
  exitBtn.addEventListener("click", exitAR);

  window.addEventListener("unhandledrejection", function (e) {
    console.error(TAG, "Unhandled promise rejection:", e.reason);
  });

  // Release the camera when the page is hidden or closed
  window.addEventListener("pagehide", releaseAR);
})();