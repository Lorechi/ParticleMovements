"""A durable, desktop version of the interactive particle field.

Run directly with ``python particle_field.py`` or import and call
``run_particle_field()`` from another application.
"""

from __future__ import annotations

import math
import time
from typing import Optional


def run_particle_field(
    particle_count: int = 12_000,
    camera_index: Optional[int] = 0,
    width: int = 1280,
    height: int = 720,
    max_seconds: Optional[float] = None,
) -> None:
    """Run the particle installation until the window is closed.

    The stream enters at the left and exits at the right.  If a camera is
    available, movement against the learned camera background becomes an
    obstacle field which pushes the stream around a person or object.  The
    simulation owns fixed-size NumPy buffers and is therefore suitable for
    long-running use.  Set ``camera_index=None`` for an ambient-only stream;
    ``max_seconds`` is useful for smoke tests.
    """
    try:
        import cv2  # type: ignore[import-not-found]
        import numpy as np
        import pygame
    except ImportError as error:
        raise RuntimeError(
            "Install the desktop dependencies first: pip install -r requirements.txt"
        ) from error

    if particle_count < 1 or width < 1 or height < 1:
        raise ValueError("particle_count, width, and height must be positive")

    field_w, field_h = 80, 45
    density_w, density_h = 64, 36
    rng = np.random.default_rng()
    pos = rng.random((particle_count, 2), dtype=np.float32)
    velocity = np.zeros((particle_count, 2), dtype=np.float32)
    spawn_y = rng.random(particle_count, dtype=np.float32)
    density = np.zeros((density_h, density_w), dtype=np.float32)
    density_tmp = np.zeros_like(density)
    background = np.zeros((field_h, field_w), dtype=np.float32)
    smooth = np.zeros_like(background)
    background_ready = False

    capture = None
    if camera_index is not None:
        capture = cv2.VideoCapture(camera_index)
        if not capture.isOpened():
            capture.release()
            capture = None
            print("Camera unavailable; continuing with the ambient particle stream.")

    pygame.init()
    screen = pygame.display.set_mode((width, height), pygame.RESIZABLE)
    pygame.display.set_caption("Interactive Particle Field")
    clock = pygame.time.Clock()
    started = time.monotonic()
    last_camera = 0.0
    last_frame = started
    running = True

    try:
        while running:
            now = time.monotonic()
            dt = min(now - last_frame, 1 / 30)
            last_frame = now
            if max_seconds is not None and now - started >= max_seconds:
                break

            for event in pygame.event.get():
                if event.type == pygame.QUIT or (event.type == pygame.KEYDOWN and event.key == pygame.K_ESCAPE):
                    running = False
                elif event.type == pygame.VIDEORESIZE:
                    width, height = event.size
                    screen = pygame.display.set_mode((width, height), pygame.RESIZABLE)
                elif event.type == pygame.KEYDOWN and event.key == pygame.K_r:
                    background_ready = False

            # Sampling the camera at 15 Hz is enough for this low-resolution
            # force field, and leaves the render/simulation loop responsive.
            if capture is not None and now - last_camera >= 1 / 15:
                ok, frame = capture.read()
                if ok:
                    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                    gray = cv2.resize(gray, (field_w, field_h), interpolation=cv2.INTER_AREA).astype(np.float32) / 255.0
                    if not background_ready:
                        background[:] = gray
                        background_ready = True
                    else:
                        np.multiply(background, 0.98, out=background)
                        background += gray * 0.02
                        np.subtract(gray, background, out=smooth)
                        np.abs(smooth, out=smooth)
                        np.subtract(smooth, 0.12, out=smooth)
                        np.maximum(smooth, 0, out=smooth)
                        cv2.blur(smooth, (5, 5), dst=smooth)
                last_camera = now

            density.fill(0)
            cell_x = np.clip((pos[:, 0] * density_w).astype(np.int32), 0, density_w - 1)
            cell_y = np.clip((pos[:, 1] * density_h).astype(np.int32), 0, density_h - 1)
            np.add.at(density, (cell_y, cell_x), 1)
            cv2.blur(density, (3, 3), dst=density_tmp)
            density[:] = density_tmp

            x, y = pos[:, 0], pos[:, 1]
            wave = np.sin(y * 10 + now * 0.35) + 0.55 * np.sin(x * 15 - now * 0.22)
            target_x = 0.11 * (1.1 + 0.12 * np.cos(wave * 1.5))
            target_y = 0.11 * 0.18 * np.sin(wave * 1.5 + x * 5)
            expected = particle_count / (density_w * density_h)
            ix = np.clip((x * density_w).astype(np.int32), 1, density_w - 2)
            iy = np.clip((y * density_h).astype(np.int32), 1, density_h - 2)
            excess = np.maximum(density - expected, 0) / expected
            target_x -= np.clip(excess[iy, ix + 1] - excess[iy, ix - 1], -3, 3) * 0.1
            target_y -= np.clip(excess[iy + 1, ix] - excess[iy - 1, ix], -3, 3) * 0.1

            if background_ready:
                fx = np.clip((x * field_w).astype(np.int32), 1, field_w - 2)
                fy = np.clip((y * field_h).astype(np.int32), 1, field_h - 2)
                occupied = smooth[fy, fx]
                gx = smooth[fy, fx + 1] - smooth[fy, fx - 1]
                gy = smooth[fy + 1, fx] - smooth[fy - 1, fx]
                length = np.hypot(gx, gy) + 0.0001
                influence = occupied * 2.5
                target_x -= gx / length * influence
                target_y -= gy / length * influence

            recovery = 1 - math.pow(0.968, dt * 60)
            velocity[:, 0] += (target_x - velocity[:, 0]) * recovery
            velocity[:, 1] += (target_y - velocity[:, 1]) * recovery
            pos += velocity * dt
            reset = (pos[:, 0] > 1) | (pos[:, 0] < -0.05)
            pos[reset, 0] = 0
            pos[reset, 1] = spawn_y[reset]
            velocity[reset, 0] = 0.11
            velocity[reset, 1] = 0
            spawn_y[reset] = (spawn_y[reset] + 0.61803398875) % 1
            pos[:, 1] %= 1

            screen.fill((0, 0, 0))
            pixels = (pos * (width - 1, height - 1)).astype(np.int32)
            # Pygame's batched point draw keeps the per-frame Python work small.
            pygame.draw.points(screen, (245, 245, 245), pixels.tolist())
            pygame.display.flip()
            clock.tick(60)
    finally:
        if capture is not None:
            capture.release()
        pygame.quit()


if __name__ == "__main__":
    run_particle_field()
