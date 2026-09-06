# Interactive Particle Field

A lightweight projection-oriented particle installation prototype. It turns a webcam into one low-resolution foreground/obstacle field, so any moving silhouette can influence the same particles without person tracking or ML.

## Run

Serve this folder over localhost (camera permission requires a secure context):

```sh
npx serve .
```

Open the shown localhost URL, allow camera access, then stay still briefly or press `R` to relearn the background.

Controls are hidden by default; hover over the top-left corner to reveal the Settings button, or press `H`. `D` toggles the annotated camera/force-field preview, `F` fullscreen, `R` relearns the background, and `I` inverts the display. The debug preview shows cropped/mirrored camera input, detected foreground in red, and cyan arrows indicating the force that is applied toward empty space. Background adaptation defaults to a few seconds: a stopped silhouette naturally fades out of the obstacle field while the current keeps flowing.

## Long-running use

The runtime uses fixed typed arrays and reuses its camera buffers, so normal animation does not steadily allocate memory. Camera-processing errors degrade gracefully to an uninterrupted ambient particle stream. WebGL context loss is handled and the renderer is rebuilt when the browser restores it. For an installation, use a dedicated Chromium/Chrome profile, keep the machine awake, disable system sleep/screen lock, grant camera permission for the local URL once, and serve over `localhost` or HTTPS. A browser kiosk/fullscreen launch is preferable to a file URL because camera access is restricted outside secure contexts.

## Architecture

`cameraField.js` captures and crops/flips the webcam into an 80×45 canvas, compares luminance against a slowly adapting background, blurs the mask, and exposes its gradient as an obstacle force. `particles.js` uses typed arrays for CPU simulation and WebGL point rendering. It is a source/sink stream: particles enter from the left and leave at the right, while their velocity continuously recovers toward the base flow after interaction. A fixed 64×36 density field supplies gentle anti-clumping pressure, returning crowded regions to the initial spread without expensive particle-to-particle checks. This keeps the first version simple while avoiding per-particle DOM work.

Future extensions:

- Replace camera luminance with depth occupancy in `CameraField`.
- Replace `sample()`'s normalized mapping with a four-corner homography for projector/camera alignment.
- Move the position/velocity arrays into ping-pong WebGL textures for GPU simulation.
- Add velocity advection, curl noise, and a persistent density field for more fluid-like motion.
- Add a small OSC/WebSocket bridge or control adapter for TouchDesigner and installation systems.
