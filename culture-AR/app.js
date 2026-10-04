(function () {
  "use strict";

  const sceneEl = document.querySelector("a-scene");
  const startScreen = document.getElementById("start-screen");
  const startBtn = document.getElementById("start-btn");
  const errorMsg = document.getElementById("error-msg");
  const statusEl = document.getElementById("status");
  const targetEl = document.getElementById("target");

  let started = false;

  function showError(message) {
    errorMsg.textContent = message;
    errorMsg.hidden = false;
    startScreen.classList.remove("hidden");
    statusEl.hidden = true;
    startBtn.disabled = false;
    startBtn.textContent = "Try again";
    started = false;
  }

  function setStatus(text, found) {
    statusEl.textContent = text;
    statusEl.classList.toggle("found", !!found);
  }

  async function startAR() {
    if (started) return;
    started = true;
    errorMsg.hidden = true;
    startBtn.disabled = true;
    startBtn.textContent = "Starting…";

    // Camera access needs HTTPS (GitHub Pages is HTTPS) or localhost.
    if (!window.isSecureContext) {
      showError("Camera access requires HTTPS. Open this page via GitHub Pages or localhost.");
      return;
    }

    try {
      const arSystem = sceneEl.systems["mindar-image-system"];
      await arSystem.start(); // asks for camera permission, loads the .mind file
      startScreen.classList.add("hidden");
      statusEl.hidden = false;
      setStatus("Looking for the poster…", false);
    } catch (err) {
      console.error("AR start failed:", err);
      showError(
        "Could not start AR. Check that camera permission is allowed and that targets.mind exists next to index.html."
      );
    }
  }

  // Tracking events from MindAR
  targetEl.addEventListener("targetFound", function () {
    setStatus("Poster found!", true);
  });

  targetEl.addEventListener("targetLost", function () {
    setStatus("Looking for the poster…", false);
  });

  // MindAR reports camera/model problems here
  sceneEl.addEventListener("arError", function () {
    showError("Camera error. Please allow camera access and try again.");
  });

  startBtn.addEventListener("click", function () {
    // Wait for A-Frame to be ready if the user taps very early
    if (sceneEl.hasLoaded) {
      startAR();
    } else {
      sceneEl.addEventListener("loaded", startAR, { once: true });
    }
  });

  // Release the camera when the page is hidden or closed
  window.addEventListener("pagehide", function () {
    try {
      sceneEl.systems["mindar-image-system"].stop();
    } catch (e) {
      /* ignore */
    }
  });
})();