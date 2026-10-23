"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { DecalGeometry } from "three/addons/geometries/DecalGeometry.js";

const GOLD = "#d4af37";
const DIMPLE_COUNT = 332;
const DIMPLE_DEPTH = 0.022;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

function detectWebGL() {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

/**
 * Builds a unit golf ball with real, indented dimples. Dimple centres sit on
 * a Fibonacci lattice (sorted by y), so each vertex only has to check the
 * handful of centres whose latitude is within one dimple radius.
 */
function buildGolfBallGeometry(detail: number) {
  const base = new THREE.IcosahedronGeometry(1, detail);
  base.deleteAttribute("normal");
  base.deleteAttribute("uv");
  const geometry = mergeVertices(base);
  base.dispose();

  const centres = new Float32Array(DIMPLE_COUNT * 3);
  for (let i = 0; i < DIMPLE_COUNT; i++) {
    const y = 1 - ((i + 0.5) * 2) / DIMPLE_COUNT;
    const ring = Math.sqrt(1 - y * y);
    const theta = i * GOLDEN_ANGLE;
    centres[i * 3] = Math.cos(theta) * ring;
    centres[i * 3 + 1] = y;
    centres[i * 3 + 2] = Math.sin(theta) * ring;
  }

  // Hexagonal packing distance on a sphere, shrunk to leave a land between dimples.
  const spacing = Math.sqrt((8 * Math.PI) / (Math.sqrt(3) * DIMPLE_COUNT));
  const radius = spacing * 0.44;

  const position = geometry.getAttribute("position") as THREE.BufferAttribute;
  const p = new THREE.Vector3();

  for (let v = 0; v < position.count; v++) {
    p.fromBufferAttribute(position, v).normalize();

    const first = Math.max(
      0,
      Math.floor(((1 - (p.y + radius)) * DIMPLE_COUNT) / 2 - 1),
    );
    const last = Math.min(
      DIMPLE_COUNT - 1,
      Math.ceil(((1 - (p.y - radius)) * DIMPLE_COUNT) / 2),
    );

    let nearest = Infinity;
    for (let i = first; i <= last; i++) {
      const dx = p.x - centres[i * 3];
      const dy = p.y - centres[i * 3 + 1];
      const dz = p.z - centres[i * 3 + 2];
      const distance = dx * dx + dy * dy + dz * dz;
      if (distance < nearest) nearest = distance;
    }

    const s = Math.sqrt(nearest) / radius;
    const depth = s < 1 ? DIMPLE_DEPTH * (1 - s * s) : 0;
    p.multiplyScalar(1 - depth);
    position.setXYZ(v, p.x, p.y, p.z);
  }

  geometry.computeVertexNormals();
  return geometry;
}

function createPrintTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = GOLD;
  ctx.font = "italic 400 230px Georgia, 'Times New Roman', serif";
  ctx.fillText("Arena", 512, 210);
  ctx.font = "700 64px ui-monospace, 'SFMono-Regular', Consolas, monospace";
  ctx.fillText("C O D E   G O L F", 512, 390);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/**
 * Flat equirectangular "studio": warm softboxes over a green floor. Metal is
 * only as good as what it reflects, so this is what gives the gold its shape.
 */
function createStudioTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = "#0c1a12";
  ctx.fillRect(0, 0, 1024, 512);
  ctx.fillStyle = "#1d4a2e";
  ctx.fillRect(0, 300, 1024, 212);
  ctx.fillStyle = "#fff4dc";
  ctx.fillRect(120, 70, 250, 150);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(640, 40, 40, 280);
  ctx.fillStyle = "#b98324";
  ctx.fillRect(820, 150, 130, 60);
  ctx.fillStyle = "#3d5a3a";
  ctx.fillRect(430, 110, 120, 40);

  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createShadowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  gradient.addColorStop(0, "rgba(0, 0, 0, 0.7)");
  gradient.addColorStop(0.45, "rgba(0, 0, 0, 0.32)");
  gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(canvas);
}

export function GolfBallScene() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [webglSupported] = useState(detectWebGL);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !webglSupported) return;

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const compact = container.clientWidth < 560;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      34,
      container.clientWidth / container.clientHeight,
      0.1,
      50,
    );
    // Pull the camera back on narrow screens so the orbit ring stays in frame.
    const fitCamera = () => {
      const halfFov = THREE.MathUtils.degToRad(camera.fov / 2);
      const distance = Math.max(5.1, 1.85 / (Math.tan(halfFov) * camera.aspect));
      camera.position.set(0, 0.4, distance);
      camera.lookAt(0, -0.1, 0);
      camera.updateProjectionMatrix();
    };
    fitCamera();

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight, false);
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.05;
    container.appendChild(renderer.domElement);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const studioTexture = createStudioTexture();
    const environment = studioTexture
      ? pmrem.fromEquirectangular(studioTexture).texture
      : null;
    studioTexture?.dispose();
    scene.environment = environment;
    scene.environmentIntensity = 0.45;

    const stage = new THREE.Group();
    scene.add(stage);

    // Ball
    const ballGeometry = buildGolfBallGeometry(compact ? 72 : 110);
    const ballMaterial = new THREE.MeshPhysicalMaterial({
      color: "#f3efe6",
      roughness: 0.42,
      clearcoat: 1,
      clearcoatRoughness: 0.14,
    });
    const ball = new THREE.Mesh(ballGeometry, ballMaterial);
    stage.add(ball);

    // Gold print, projected onto the dimpled surface so it follows the indents.
    const printTexture = createPrintTexture();
    const printMaterial = new THREE.MeshStandardMaterial({
      map: printTexture,
      transparent: true,
      metalness: 0.85,
      roughness: 0.3,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
    });
    ball.updateMatrixWorld();
    const printGeometry = new DecalGeometry(
      ball,
      new THREE.Vector3(0, 0, 1),
      new THREE.Euler(0, 0, 0),
      new THREE.Vector3(1.05, 0.525, 0.6),
    );
    const print = new THREE.Mesh(printGeometry, printMaterial);
    ball.add(print);

    // Orbit ring with a single travelling bead
    const orbit = new THREE.Group();
    orbit.rotation.set(-1.32, 0, -0.22);
    stage.add(orbit);

    const ringGeometry = new THREE.TorusGeometry(1.7, 0.0055, 8, 240);
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: GOLD,
      transparent: true,
      opacity: 0.55,
    });
    orbit.add(new THREE.Mesh(ringGeometry, ringMaterial));

    const beadGeometry = new THREE.SphereGeometry(0.045, 24, 16);
    const beadMaterial = new THREE.MeshStandardMaterial({
      color: GOLD,
      metalness: 1,
      roughness: 0.25,
      emissive: new THREE.Color("#8c7326"),
      emissiveIntensity: 0.6,
    });
    const bead = new THREE.Mesh(beadGeometry, beadMaterial);
    orbit.add(bead);

    // Contact shadow
    const shadowTexture = createShadowTexture();
    const shadowMaterial = new THREE.MeshBasicMaterial({
      map: shadowTexture,
      transparent: true,
      depthWrite: false,
    });
    const shadowGeometry = new THREE.PlaneGeometry(2.6, 2.6);
    const shadow = new THREE.Mesh(shadowGeometry, shadowMaterial);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -1.3;
    scene.add(shadow);

    // Lighting: a low, warm key rakes across the dimples; a pale rim outlines the ball.
    scene.add(new THREE.HemisphereLight(0xfff4dc, 0x0c1a12, 0.4));

    const keyBase = new THREE.Vector3(-3.5, 3.2, 2.6);
    const keyLight = new THREE.DirectionalLight(0xffe4b0, 2.2);
    keyLight.position.copy(keyBase);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xfff0d0, 2.4);
    rimLight.position.set(3.2, 1.6, -3.8);
    scene.add(rimLight);

    const fillLight = new THREE.DirectionalLight(0x8a7a5c, 0.5);
    fillLight.position.set(2.5, -1.5, 3);
    scene.add(fillLight);

    // Drag to spin, with inertia that settles back into a slow idle roll.
    const idleSpin = prefersReducedMotion ? 0 : 0.28;
    const velocity = new THREE.Vector2(0, idleSpin);
    const lastPointer = new THREE.Vector2();
    let dragging = false;
    const canvas = renderer.domElement;

    const handlePointerDown = (event: PointerEvent) => {
      dragging = true;
      lastPointer.set(event.clientX, event.clientY);
      canvas.setPointerCapture(event.pointerId);
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!dragging) return;
      const dx = event.clientX - lastPointer.x;
      const dy = event.clientY - lastPointer.y;
      lastPointer.set(event.clientX, event.clientY);
      velocity.set(dy * 0.35, dx * 0.35);
    };

    const handlePointerUp = (event: PointerEvent) => {
      dragging = false;
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
    };

    // The key light leans towards the pointer anywhere on the page.
    const pointer = new THREE.Vector2();
    const pointerEased = new THREE.Vector2();
    const handleWindowPointer = (event: PointerEvent) => {
      pointer.set(
        (event.clientX / window.innerWidth) * 2 - 1,
        (event.clientY / window.innerHeight) * 2 - 1,
      );
    };
    window.addEventListener("pointermove", handleWindowPointer);

    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerup", handlePointerUp);
    canvas.addEventListener("pointercancel", handlePointerUp);

    const handleResize = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (!width || !height) return;
      camera.aspect = width / height;
      fitCamera();
      renderer.setSize(width, height, false);
    };
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    let isVisible = true;
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      isVisible = entry.isIntersecting;
    });
    intersectionObserver.observe(container);

    // Start with the print turned slightly towards the key light.
    ball.rotation.set(-0.18, -0.5, 0.08);

    const timer = new THREE.Timer();
    const xAxis = new THREE.Vector3(1, 0, 0);
    const yAxis = new THREE.Vector3(0, 1, 0);
    const spin = new THREE.Quaternion();
    let animationFrameId = 0;

    // Drop in from above on a spring so the ball lands with some weight.
    let drop = prefersReducedMotion ? 0 : 3.4;
    let dropVelocity = 0;

    const animate = (time: number) => {
      animationFrameId = requestAnimationFrame(animate);
      timer.update(time);
      if (!isVisible || document.hidden) return;

      const delta = Math.min(timer.getDelta(), 0.05);
      const elapsed = timer.getElapsed();

      if (!dragging) {
        const ease = 1 - Math.exp(-delta * 1.8);
        velocity.x += (0 - velocity.x) * ease;
        velocity.y += (idleSpin - velocity.y) * ease;
      }

      spin.setFromAxisAngle(yAxis, velocity.y * delta);
      ball.quaternion.premultiply(spin);
      spin.setFromAxisAngle(xAxis, velocity.x * delta);
      ball.quaternion.premultiply(spin);

      pointerEased.lerp(pointer, 1 - Math.exp(-delta * 3));
      keyLight.position.set(
        keyBase.x + pointerEased.x * 4.5,
        keyBase.y - pointerEased.y * 3,
        keyBase.z,
      );

      if (!prefersReducedMotion) {
        dropVelocity += (0 - drop) * 38 * delta;
        dropVelocity *= Math.exp(-delta * 5.5);
        drop += dropVelocity * delta;

        const lift = Math.sin(elapsed * 1.1) * 0.07;
        stage.position.y = lift + drop;
        const height = lift + Math.max(drop, 0);
        shadow.scale.setScalar(1 + height * 1.4);
        shadowMaterial.opacity = Math.max(0, 0.9 - height * 2.5);

        const angle = elapsed * 0.55;
        bead.position.set(Math.cos(angle) * 1.7, Math.sin(angle) * 1.7, 0);
        orbit.rotation.z = -0.22 + Math.sin(elapsed * 0.2) * 0.06;
      } else {
        bead.position.set(1.7 * Math.cos(-2.2), 1.7 * Math.sin(-2.2), 0);
      }

      renderer.render(scene, camera);
    };
    animationFrameId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("pointermove", handleWindowPointer);
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerup", handlePointerUp);
      canvas.removeEventListener("pointercancel", handlePointerUp);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      container.removeChild(canvas);

      ballGeometry.dispose();
      ballMaterial.dispose();
      printGeometry.dispose();
      printMaterial.dispose();
      printTexture?.dispose();
      ringGeometry.dispose();
      ringMaterial.dispose();
      beadGeometry.dispose();
      beadMaterial.dispose();
      shadowGeometry.dispose();
      shadowMaterial.dispose();
      shadowTexture?.dispose();
      timer.dispose();
      environment?.dispose();
      pmrem.dispose();
      renderer.dispose();
    };
  }, [webglSupported]);

  if (!webglSupported) {
    return (
      <div className="gold-scene-fallback" role="img" aria-label="Golf ball">
        <div className="golf-ball-flat" />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="gold-scene-container"
      role="img"
      aria-label="Interactive 3D golf ball. Drag to spin it."
    />
  );
}
