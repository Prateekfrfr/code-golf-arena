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

/**
 * Builds a golf ball mesh: a smooth sphere with geodesic hexagonal/pentagonal
 * dimples — the dual graph of the subdivided icosahedron.
 *
 * Strategy:
 *  1. Build an IcosahedronGeometry at subdivision level 3 (320 triangular faces).
 *  2. Collect ALL unique triangle face centroids — these become dimple centers.
 *  3. On a higher-resolution sphere (IcosahedronGeometry level 6), for each
 *     vertex, find the nearest face-centroid from step 2. If within the dimple
 *     radius, displace the vertex inward along its normal using a smooth cosine
 *     profile. This produces the correct hexagonal/pentagonal dimple pattern.
 */
function buildGolfBallGeometry(radius: number): THREE.BufferGeometry {
  // --- Step 1: Collect dimple centres from a coarse subdivision ---
  const coarse = new THREE.IcosahedronGeometry(1, 3); // subdivision 3 → 320 faces
  const cPos = coarse.attributes.position;
  const dimpleCenters: THREE.Vector3[] = [];

  // Each face = 3 consecutive vertices in non-indexed geometry
  for (let f = 0; f < cPos.count; f += 3) {
    const a = new THREE.Vector3().fromBufferAttribute(cPos, f);
    const b = new THREE.Vector3().fromBufferAttribute(cPos, f + 1);
    const c = new THREE.Vector3().fromBufferAttribute(cPos, f + 2);
    const centroid = new THREE.Vector3()
      .addVectors(a, b)
      .add(c)
      .divideScalar(3)
      .normalize(); // project to unit sphere
    dimpleCenters.push(centroid);
  }
  coarse.dispose();

  // --- Step 2: Build the high-resolution sphere that will receive dimples ---
  const fine = new THREE.IcosahedronGeometry(radius, 6); // subdivision 6 → 40960 faces
  const fPos = fine.attributes.position;

  const vertex = new THREE.Vector3();
  const unitV = new THREE.Vector3();

  // Dimple parameters (tuned for realistic golf ball look)
  const dimpleAngularRadius = 0.19; // angular radius in radians (about 11°)
  const dimpleDepth = radius * 0.055; // indentation depth

  for (let i = 0; i < fPos.count; i++) {
    vertex.fromBufferAttribute(fPos, i);
    unitV.copy(vertex).normalize();

    // Find nearest dimple center (sorted Y scan for minor speedup)
    let minDist = Infinity;
    for (let j = 0; j < dimpleCenters.length; j++) {
      const d = unitV.distanceTo(dimpleCenters[j]);
      if (d < minDist) minDist = d;
      // Angular distance approximation: if center.y is too far, skip
      if (Math.abs(dimpleCenters[j].y - unitV.y) > dimpleAngularRadius * 1.5)
        continue;
    }

    if (minDist < dimpleAngularRadius) {
      // Smooth cosine profile: deepest at centre, zero at rim
      const t = minDist / dimpleAngularRadius; // 0 at center, 1 at rim
      const depression = dimpleDepth * (0.5 + 0.5 * Math.cos(t * Math.PI));
      // Displace inward along the surface normal (unit vector)
      vertex.addScaledVector(unitV, -depression);
      fPos.setXYZ(i, vertex.x, vertex.y, vertex.z);
    }
  }

  fine.computeVertexNormals();
  return fine;
}

export function GolfBallScene() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [webglSupported] = useState(detectWebGL);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !webglSupported) return;

    // --- WebGL check ---
    try {
      const test = document.createElement("canvas");
      const gl =
        test.getContext("webgl") || test.getContext("experimental-webgl");
      if (!gl) {
        setWebglSupported(false);
        return;
      }
    } catch {
      setWebglSupported(false);
      return;
    }

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    let animId: number;
    let isVisible = true;

    // --- Renderer ---
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.3;
    container.appendChild(renderer.domElement);

    // --- Scene / Camera ---
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      36,
      container.clientWidth / container.clientHeight,
      0.1,
      50,
    );
    camera.position.set(0, 0, 5.5);

    // --- Environment map (3 softboxes → PMREMGenerator) ---
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    const addBox = (
      color: number,
      x: number,
      y: number,
      z: number,
      w: number,
      h: number,
    ) => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ color, side: THREE.FrontSide }),
      );
      m.position.set(x, y, z);
      m.lookAt(0, 0, 0);
      envScene.add(m);
      return m;
    };
    const sb1 = addBox(0xfffad0, 6, 5, 4, 8, 8); // warm top-right key
    const sb2 = addBox(0xd0ead8, -6, -2, -4, 6, 6); // green-tinted fill
    const sb3 = addBox(0xffe8a0, 0, 6, -2, 5, 5); // overhead bounce
    const envTexture = pmrem.fromScene(envScene).texture;
    scene.environment = envTexture;

    // --- Golf Ball Mesh ---
    const ballRadius = 1.5;
    const ballGeo = buildGolfBallGeometry(ballRadius);
    const ballMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#d4a843"),
      metalness: 1.0,
      roughness: 0.28,
      envMapIntensity: 1.3,
    });
    const ball = new THREE.Mesh(ballGeo, ballMat);
    scene.add(ball);

    // --- Lights ---
    scene.add(new THREE.AmbientLight(0x1a3820, 0.7));

    const keyLight = new THREE.DirectionalLight(0xfff5c0, 3.2);
    keyLight.position.set(5, 6, 5);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xffd070, 1.4);
    rimLight.position.set(-4, 3, -3);
    scene.add(rimLight);

    // Pointer warm point light
    const ptrLight = new THREE.PointLight(0xffecb0, 2.5, 12);
    ptrLight.position.set(0, 0, 4);
    scene.add(ptrLight);

    // --- Spring drop-in ---
    let dropY = prefersReducedMotion ? 0 : 4.0;
    let dropV = 0;

    // --- Pointer tilt ---
    let tiltX = 0,
      tiltY = 0;

    const onPointerMove = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      const nx = (e.clientX - rect.left) / rect.width - 0.5;
      const ny = (e.clientY - rect.top) / rect.height - 0.5;
      tiltY = nx * 1.1;
      tiltX = ny * 0.8;
      ptrLight.position.x = nx * 5;
      ptrLight.position.y = -ny * 5;
    };
    window.addEventListener("pointermove", onPointerMove);

    // --- Resize ---
    const onResize = () => {
      if (!container) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    const resizeObs = new ResizeObserver(onResize);
    resizeObs.observe(container);

    // --- Visibility ---
    const visObs = new IntersectionObserver(([e]) => {
      isVisible = e.isIntersecting;
    });
    visObs.observe(container);

    // --- Hidden tab pause ---
    const onVisChange = () => {
      isVisible = !document.hidden;
    };
    document.addEventListener("visibilitychange", onVisChange);

    const clock = new THREE.Clock();

    const animate = () => {
      animId = requestAnimationFrame(animate);
      if (!isVisible) return;
      const dt = clock.getDelta();

      // Spring drop
      if (!prefersReducedMotion && Math.abs(dropY) > 0.001) {
        dropV = (dropV - 0.048 * dropY) * 0.8;
        dropY += dropV;
      } else {
        dropY = 0;
      }

      ball.position.y = dropY;

      // Slow auto-rotation
      if (!prefersReducedMotion) ball.rotation.y += dt * 0.22;

      // Pointer tilt with damping
      ball.rotation.x += (tiltX - ball.rotation.x) * 0.07;
      ball.rotation.z += (-tiltY * 0.4 - ball.rotation.z) * 0.07;

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("visibilitychange", onVisChange);
      resizeObs.disconnect();
      visObs.disconnect();
      if (container.contains(renderer.domElement))
        container.removeChild(renderer.domElement);
      ballGeo.dispose();
      ballMat.dispose();
      [sb1, sb2, sb3].forEach((m) => {
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      });
      envTexture.dispose();
      pmrem.dispose();
      renderer.dispose();
    };
  }, [webglSupported]);

  if (!webglSupported) {
    return (
      <div className="golf-ball-fallback" aria-label="Gold golf ball">
        <div className="flat-gold-ball" />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="gold-scene-container"
      role="img"
      aria-label="Interactive 3D gold golf ball with hexagonal dimples"
    />
  );
}
