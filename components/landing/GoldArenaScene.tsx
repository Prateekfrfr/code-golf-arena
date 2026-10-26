"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

export function GoldArenaScene() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [webglSupported, setWebglSupported] = useState(true);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Check WebGL availability
    try {
      const testCanvas = document.createElement("canvas");
      const gl =
        testCanvas.getContext("webgl") ||
        testCanvas.getContext("experimental-webgl");
      if (!gl) {
        setWebglSupported(false);
        return;
      }
    } catch {
      setWebglSupported(false);
      return;
    }

    let isVisible = true;
    let animationFrameId: number;

    // Scene setup
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      42,
      container.clientWidth / container.clientHeight,
      0.1,
      100,
    );
    camera.position.z = 4.8;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    container.appendChild(renderer.domElement);

    // Group for mouse interaction
    const mainGroup = new THREE.Group();
    scene.add(mainGroup);

    // 1. Core Gold Icosahedron (PBR Metallic)
    const coreGeometry = new THREE.IcosahedronGeometry(1.25, 0);
    const coreMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#d4af37"),
      metalness: 0.94,
      roughness: 0.22,
      wireframe: false,
    });
    const coreMesh = new THREE.Mesh(coreGeometry, coreMaterial);
    mainGroup.add(coreMesh);

    // 2. Outer Wireframe Cage (Champagne Brass)
    const wireframeGeometry = new THREE.WireframeGeometry(
      new THREE.IcosahedronGeometry(1.68, 1),
    );
    const wireframeMaterial = new THREE.LineBasicMaterial({
      color: new THREE.Color("#f7db7d"),
      transparent: true,
      opacity: 0.38,
      linewidth: 1,
    });
    const wireframeCage = new THREE.LineSegments(
      wireframeGeometry,
      wireframeMaterial,
    );
    mainGroup.add(wireframeCage);

    // 3. Orbital Ring with Byte Particles
    const particleCount = 72;
    const particlePositions = new Float32Array(particleCount * 3);
    const ringRadius = 2.25;

    for (let i = 0; i < particleCount; i++) {
      const angle = (i / particleCount) * Math.PI * 2;
      const radiusVariation = ringRadius + (Math.random() - 0.5) * 0.25;
      const x = Math.cos(angle) * radiusVariation;
      const y = (Math.random() - 0.5) * 0.35;
      const z = Math.sin(angle) * radiusVariation;

      particlePositions[i * 3] = x;
      particlePositions[i * 3 + 1] = y;
      particlePositions[i * 3 + 2] = z;
    }

    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(particlePositions, 3),
    );

    const particleMaterial = new THREE.PointsMaterial({
      color: new THREE.Color("#e8c35a"),
      size: 0.045,
      transparent: true,
      opacity: 0.75,
    });

    const particles = new THREE.Points(particleGeometry, particleMaterial);
    mainGroup.add(particles);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xfff6d9, 0.45);
    scene.add(ambientLight);

    const mainKeyLight = new THREE.DirectionalLight(0xffdf80, 2.6);
    mainKeyLight.position.set(4, 5, 4);
    scene.add(mainKeyLight);

    const fillLight = new THREE.DirectionalLight(0x9a7b26, 1.2);
    fillLight.position.set(-4, -2, -2);
    scene.add(fillLight);

    const rimLight = new THREE.PointLight(0xffea9f, 2.2, 10);
    rimLight.position.set(0, 3, -2.5);
    scene.add(rimLight);

    // Mouse Tracking with smooth inertia
    let targetRotationX = 0;
    let targetRotationY = 0;
    let mouseX = 0;
    let mouseY = 0;

    const handlePointerMove = (event: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      mouseX = x;
      mouseY = y;
      targetRotationY = x * 1.35;
      targetRotationX = y * 0.95;
    };

    window.addEventListener("pointermove", handlePointerMove);

    // Resize Handler
    const handleResize = () => {
      if (!container) return;
      const width = container.clientWidth;
      const height = container.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    // Visibility Observer to pause loop when off-screen
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      isVisible = entry.isIntersecting;
    });
    intersectionObserver.observe(container);

    // Check reduced motion
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    // Animation Loop
    let clock = new THREE.Clock();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      if (!isVisible) return;

      const delta = clock.getDelta();
      const elapsedTime = clock.getElapsedTime();

      if (!prefersReducedMotion) {
        // Continuous organic rotation
        coreMesh.rotation.y += delta * 0.32;
        coreMesh.rotation.x += delta * 0.18;

        wireframeCage.rotation.y -= delta * 0.22;
        wireframeCage.rotation.z += delta * 0.14;

        particles.rotation.y += delta * 0.15;

        // Subtle floating breathing pulse
        mainGroup.position.y = Math.sin(elapsedTime * 1.2) * 0.08;
      }

      // Smooth inertia towards mouse
      mainGroup.rotation.y += (targetRotationY - mainGroup.rotation.y) * 0.06;
      mainGroup.rotation.x += (targetRotationX - mainGroup.rotation.x) * 0.06;

      renderer.render(scene, camera);
    };

    animate();

    // Cleanup
    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("pointermove", handlePointerMove);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();

      if (container && renderer.domElement) {
        container.removeChild(renderer.domElement);
      }

      coreGeometry.dispose();
      coreMaterial.dispose();
      wireframeGeometry.dispose();
      wireframeMaterial.dispose();
      particleGeometry.dispose();
      particleMaterial.dispose();
      renderer.dispose();
    };
  }, []);

  if (!webglSupported) {
    return (
      <div
        className="gold-scene-fallback"
        aria-label="Gold geometric code sculpture"
      >
        <svg
          viewBox="0 0 100 100"
          className="gold-fallback-svg"
          fill="none"
          stroke="#d4af37"
          strokeWidth="1.5"
        >
          <polygon points="50,10 90,35 90,65 50,90 10,65 10,35" />
          <polygon points="50,22 80,40 80,60 50,78 20,60 20,40" opacity="0.6" />
          <line x1="50" y1="10" x2="50" y2="90" opacity="0.4" />
          <line x1="10" y1="35" x2="90" y2="65" opacity="0.4" />
          <line x1="10" y1="65" x2="90" y2="35" opacity="0.4" />
        </svg>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="gold-scene-container"
      role="img"
      aria-label="Interactive 3D kinetic gold sculpture representing code golf compaction"
    />
  );
}
