"use client";
import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";

/**
 * CANNON PROJECTILE MOTION SIMULATOR
 *
 * Architecture Overview:
 * 1. Three.js 3D Scene - Renders cannon, projectile, and trajectory with camera controls
 * 2. Physics Engine - Calculates projectile motion using kinematic equations
 * 3. Camera Controls - Mouse drag to rotate, scroll to zoom
 * 4. React State Management - Coordinates all components
 *
 * Key Physics Equations Used:
 * - x(t) = v₀ × cos(θ) × t
 * - y(t) = y₀ + v₀ × sin(θ) × t - (1/2) × g × t²
 * - Range = v₀ × cos(θ) × t_flight
 * - Time of flight = [v₀ × sin(θ) + √((v₀ × sin(θ))² + 2 × g × y₀)] / g
 */
const CannonSimulator = () => {
  // State management for physics and controls
  const [cannonAngle, setCannonAngle] = useState(45.0); // degrees
  const [initialVelocity, setInitialVelocity] = useState(20.0); // m/s
  const [isFiring, setIsFiring] = useState(false);
  const [cameraMode, setCameraMode] = useState("overview"); // 'overview', 'follow', 'side'
  const [showPanel, setShowPanel] = useState(false);

  const [projectileData, setProjectileData] = useState({
    range: 0,
    maxHeight: 0,
    timeOfFlight: 0,
    currentTime: 0,
    position: { x: 0, y: 0 },
  });
  // Refs for Three.js
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const cannonRef = useRef(null);
  const projectileRef = useRef(null);
  const trajectoryLineRef = useRef(null);
  const animationFrameRef = useRef(null);
  const projectileStateRef = useRef({ active: false, time: 0 });
  // Camera control refs
  const cameraControlsRef = useRef({
    isDragging: false,
    previousMousePosition: { x: 0, y: 0 },
    rotation: { x: 0.3, y: 0.8 },
    distance: 30,
    target: new THREE.Vector3(0, 5, 0),
  });
  // Constants
  const GRAVITY = 9.81; // m/s²
  const MOUNT_HEIGHT = 1.5; // meters
  const BARREL_LENGTH = 3; // meters
  /**
   * SECTION 1: THREE.JS SCENE SETUP
   * Creates the 3D environment with cannon, ground plane, and lighting
   */
  useEffect(() => {
    if (!canvasRef.current) return;
    // Initialize Three.js scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);
    sceneRef.current = scene;
    // Setup camera with good viewing angle
    const camera = new THREE.PerspectiveCamera(
      75,
      canvasRef.current.clientWidth / canvasRef.current.clientHeight,
      0.1,
      1000,
    );
    camera.position.set(15, 15, 25);
    camera.lookAt(0, 5, 0);
    cameraRef.current = camera;
    // Setup renderer
    const renderer = new THREE.WebGLRenderer({
      canvas: canvasRef.current,
      antialias: true,
    });
    renderer.setSize(
      canvasRef.current.clientWidth,
      canvasRef.current.clientHeight,
    );
    renderer.shadowMap.enabled = true;
    rendererRef.current = renderer;
    // Add lighting for better visualization
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(20, 30, 20);
    directionalLight.castShadow = true;
    directionalLight.shadow.camera.left = -50;
    directionalLight.shadow.camera.right = 50;
    directionalLight.shadow.camera.top = 50;
    directionalLight.shadow.camera.bottom = -50;
    scene.add(directionalLight);
    // Create ground plane
    const groundGeometry = new THREE.PlaneGeometry(200, 200);
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: 0x2d4a3e,
      roughness: 0.8,
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    // Add grid helper for depth perception
    const gridHelper = new THREE.GridHelper(200, 100, 0x444444, 0x222222);
    scene.add(gridHelper);
    // Add axis helper for reference
    const axisHelper = new THREE.AxesHelper(10);
    axisHelper.position.y = 0.1;
    scene.add(axisHelper);
    // Create cannon base (taller cylinder for stability)
    const baseGeometry = new THREE.CylinderGeometry(1, 1.2, 3, 32);
    const baseMaterial = new THREE.MeshStandardMaterial({ color: 0x8b4513 });
    const cannonBase = new THREE.Mesh(baseGeometry, baseMaterial);
    cannonBase.position.y = 1.5;
    cannonBase.castShadow = true;
    scene.add(cannonBase);
    // Add wheels for cannon look
    const wheelGeometry = new THREE.CylinderGeometry(0.6, 0.6, 0.3, 16);
    const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x333333 });
    const leftWheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
    leftWheel.position.set(-1.2, 0.75, 0);
    leftWheel.rotation.x = Math.PI / 2;
    leftWheel.castShadow = true;
    scene.add(leftWheel);
    const rightWheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
    rightWheel.position.set(1.2, 0.75, 0);
    rightWheel.rotation.x = Math.PI / 2;
    rightWheel.castShadow = true;
    scene.add(rightWheel);
    // Cannon mount group (pivot)
    const cannonGroup = new THREE.Group();
    cannonGroup.position.set(0, MOUNT_HEIGHT, 0);
    scene.add(cannonGroup);
    // Create cannon barrel (cylinder rotated to horizontal, attached at breech)
    const barrelGeometry = new THREE.CylinderGeometry(
      0.2,
      0.25,
      BARREL_LENGTH,
      32,
    );
    const barrelMaterial = new THREE.MeshStandardMaterial({ color: 0x4a4a4a });
    const cannonBarrel = new THREE.Mesh(barrelGeometry, barrelMaterial);
    cannonBarrel.castShadow = true;
    // Rotate geometry to lie along x-axis
    cannonBarrel.rotation.z = -Math.PI / 2;
    // Position so breech is at group origin (muzzle at +BARREL_LENGTH along x initially)
    cannonBarrel.position.set(BARREL_LENGTH / 2, 0, 0);
    cannonGroup.add(cannonBarrel);
    cannonRef.current = cannonGroup;
    // Create projectile (sphere, initially hidden)
    const projectileGeometry = new THREE.SphereGeometry(0.5, 32, 32);
    const projectileMaterial = new THREE.MeshStandardMaterial({
      color: 0xff4444,
      emissive: 0xff0000,
      emissiveIntensity: 0.3,
    });
    const projectile = new THREE.Mesh(projectileGeometry, projectileMaterial);
    projectile.castShadow = true;
    projectile.visible = false;
    projectileRef.current = projectile;
    scene.add(projectile);
    // Add a trail sphere to show cannon origin (mount)
    const originMarker = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 16, 16),
      new THREE.MeshBasicMaterial({
        color: 0x00ff00,
        transparent: true,
        opacity: 0.5,
      }),
    );

    scene.add(originMarker);
    // Create trajectory line (initially empty)
    const trajectoryGeometry = new THREE.BufferGeometry();
    const trajectoryMaterial = new THREE.LineBasicMaterial({
      color: 0x00ff00,
      transparent: true,
      opacity: 0.6,
      linewidth: 2,
    });
    const trajectoryLine = new THREE.Line(
      trajectoryGeometry,
      trajectoryMaterial,
    );
    trajectoryLineRef.current = trajectoryLine;
    scene.add(trajectoryLine);
    // Handle window resize
    const handleResize = () => {
      if (!canvasRef.current) return;
      camera.aspect =
        canvasRef.current.clientWidth / canvasRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(
        canvasRef.current.clientWidth,
        canvasRef.current.clientHeight,
      );
    };
    window.addEventListener("resize", handleResize);
    // Animation loop
    const animate = () => {
      animationFrameRef.current = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();
    // Cleanup
    return () => {
      window.removeEventListener("resize", handleResize);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      renderer.dispose();
    };
  }, []);
  /**
   * SECTION 2: CAMERA CONTROLS
   * Mouse drag to rotate, scroll to zoom
   */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const controls = cameraControlsRef.current;
    const handleMouseDown = (e) => {
      controls.isDragging = true;
      controls.previousMousePosition = { x: e.clientX, y: e.clientY };
    };
    const handleMouseMove = (e) => {
      if (!controls.isDragging) return;
      const deltaX = e.clientX - controls.previousMousePosition.x;
      const deltaY = e.clientY - controls.previousMousePosition.y;
      controls.rotation.y += deltaX * 0.005;
      controls.rotation.x += deltaY * 0.005;
      // Clamp vertical rotation
      controls.rotation.x = Math.max(
        0.1,
        Math.min(Math.PI / 2 - 0.1, controls.rotation.x),
      );
      controls.previousMousePosition = { x: e.clientX, y: e.clientY };
      updateCameraPosition();
    };
    const handleMouseUp = () => {
      controls.isDragging = false;
    };
    const handleWheel = (e) => {
      e.preventDefault();
      controls.distance += e.deltaY * 0.05;
      controls.distance = Math.max(5, Math.min(100, controls.distance));
      updateCameraPosition();
    };
    const updateCameraPosition = () => {
      if (!cameraRef.current) return;
      const camera = cameraRef.current;
      const { x, y } = controls.rotation;
      const dist = controls.distance;
      camera.position.x = controls.target.x + dist * Math.sin(y) * Math.cos(x);
      camera.position.y = controls.target.y + dist * Math.sin(x);
      camera.position.z = controls.target.z + dist * Math.cos(y) * Math.cos(x);
      camera.lookAt(controls.target);
    };
    canvas.addEventListener("mousedown", handleMouseDown);
    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseup", handleMouseUp);
    canvas.addEventListener("mouseleave", handleMouseUp);
    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      canvas.removeEventListener("mousedown", handleMouseDown);
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseup", handleMouseUp);
      canvas.removeEventListener("mouseleave", handleMouseUp);
      canvas.removeEventListener("wheel", handleWheel);
    };
  }, []);
  /**
   * SECTION 3: CAMERA PRESET MODES
   */
  const setCameraPreset = (mode) => {
    setCameraMode(mode);
    const controls = cameraControlsRef.current;
    switch (mode) {
      case "overview":
        controls.rotation = { x: 0.3, y: 0.8 };
        controls.distance = 30;
        controls.target.set(0, 5, 0);
        break;
      case "follow":
        controls.rotation = { x: 0.2, y: 0 };
        controls.distance = 15;
        controls.target.set(10, 5, 0);
        break;
      case "side":
        controls.rotation = { x: 0.3, y: Math.PI / 2 };
        controls.distance = 35;
        controls.target.set(0, 5, 0);
        break;
      case "closeup":
        controls.rotation = { x: 0.2, y: 0.5 };
        controls.distance = 8;
        controls.target.set(0, 3, 0);
        break;
    }
    // Smooth transition
    const startPos = cameraRef.current.position.clone();
    const startTime = Date.now();
    const duration = 500;
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // Ease out cubic
      const camera = cameraRef.current;
      const { x, y } = controls.rotation;
      const dist = controls.distance;
      const targetPos = new THREE.Vector3(
        controls.target.x + dist * Math.sin(y) * Math.cos(x),
        controls.target.y + dist * Math.sin(x),
        controls.target.z + dist * Math.cos(y) * Math.cos(x),
      );
      camera.position.lerpVectors(startPos, targetPos, eased);
      camera.lookAt(controls.target);
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    animate();
  };
  /**
   * SECTION 4: CANNON ANGLE CONTROL
   * Updates cannon barrel rotation
   */
  useEffect(() => {
    if (!cannonRef.current) return;
    // Update cannon visual rotation (only rotation now, position handled by group)
    const angleInRadians = (cannonAngle * Math.PI) / 180;
    cannonRef.current.rotation.z = angleInRadians;
    // Update trajectory preview
    updateTrajectoryPreview();
  }, [cannonAngle, initialVelocity]);
  /**
   * SECTION 5: PROJECTILE PHYSICS CALCULATIONS
   * Implements kinematic equations for realistic motion with y0
   */
  const calculateTrajectory = (angle, v0, time, y0 = 0) => {
    const angleRad = (angle * Math.PI) / 180;
    const vx = v0 * Math.cos(angleRad);
    const vy = v0 * Math.sin(angleRad);
    // Position at time t
    const x = vx * time;
    const y = y0 + vy * time - 0.5 * GRAVITY * time * time;
    return { x, y };
  };
  const calculateFlightTime = (angle, v0, y0 = 0) => {
    const angleRad = (angle * Math.PI) / 180;
    const vy = v0 * Math.sin(angleRad);
    const discriminant = vy * vy + 2 * GRAVITY * y0;
    if (discriminant < 0) return 0;
    return (vy + Math.sqrt(discriminant)) / GRAVITY;
  };
  const calculateRange = (angle, v0, y0 = 0) => {
    const t_flight = calculateFlightTime(angle, v0, y0);
    const angleRad = (angle * Math.PI) / 180;
    const vx = v0 * Math.cos(angleRad);
    return vx * t_flight;
  };
  const calculateMaxHeight = (angle, v0, y0 = 0) => {
    const angleRad = (angle * Math.PI) / 180;
    const vy = v0 * Math.sin(angleRad);
    return y0 + (vy * vy) / (2 * GRAVITY);
  };
  /**
   * Updates the trajectory preview line
   */
  const updateTrajectoryPreview = () => {
    if (!trajectoryLineRef.current) return;
    const points = [];
    const angleRad = (cannonAngle * Math.PI) / 180;
    const y0 = MOUNT_HEIGHT + BARREL_LENGTH * Math.sin(angleRad);
    const timeOfFlight = calculateFlightTime(cannonAngle, initialVelocity, y0);
    const steps = 100;
    const muzzleX = BARREL_LENGTH * Math.cos(angleRad);
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * timeOfFlight;
      const pos = calculateTrajectory(cannonAngle, initialVelocity, t, y0);
      if (pos.y >= 0) {
        points.push(new THREE.Vector3(muzzleX + pos.x, pos.y, 0));
      }
    }
    trajectoryLineRef.current.geometry.setFromPoints(points);
  };
  /**
   * SECTION 6: FIRE PROJECTILE
   * Initiates projectile animation
   */
  const fireProjectile = () => {
    // close the popup in mobile
    setShowPanel(false);
    if (isFiring || !projectileRef.current) return;

    setIsFiring(true);
    projectileRef.current.visible = true;
    const angleRad = (cannonAngle * Math.PI) / 180;
    const y0 = MOUNT_HEIGHT + BARREL_LENGTH * Math.sin(angleRad);
    const startX = BARREL_LENGTH * Math.cos(angleRad);
    const startY = y0;
    const timeOfFlight = calculateFlightTime(cannonAngle, initialVelocity, y0);
    const range = calculateRange(cannonAngle, initialVelocity, y0);
    const maxHeight = calculateMaxHeight(cannonAngle, initialVelocity, y0);
    setProjectileData({
      range: range.toFixed(2),
      maxHeight: maxHeight.toFixed(2),
      timeOfFlight: timeOfFlight.toFixed(2),
      currentTime: 0,
      position: { x: startX.toFixed(2), y: startY.toFixed(2) },
    });
    projectileStateRef.current = { active: true, time: 0 };
    // Animate projectile
    const startTime = Date.now();
    const animate = () => {
      if (!projectileStateRef.current.active) return;
      const elapsed = (Date.now() - startTime) / 1000;
      const pos = calculateTrajectory(
        cannonAngle,
        initialVelocity,
        elapsed,
        y0,
      );
      if (pos.y < 0 || elapsed > timeOfFlight + 0.1) {
        // Projectile landed
        projectileStateRef.current.active = false;
        projectileRef.current.visible = false;
        setIsFiring(false);
        setShowPanel(true);
        return;
      }
      const worldX = startX + pos.x;
      const worldY = pos.y;
      projectileRef.current.position.x = worldX;
      projectileRef.current.position.y = worldY;
      projectileRef.current.position.z = 0;
      // Update camera to follow projectile if in follow mode
      if (cameraMode === "follow") {
        cameraControlsRef.current.target.set(worldX, worldY, 0);
        const controls = cameraControlsRef.current;
        const camera = cameraRef.current;
        const { x, y } = controls.rotation;
        const dist = controls.distance;
        camera.position.x =
          controls.target.x + dist * Math.sin(y) * Math.cos(x);
        camera.position.y = controls.target.y + dist * Math.sin(x);
        camera.position.z =
          controls.target.z + dist * Math.cos(y) * Math.cos(x);
        camera.lookAt(controls.target);
      }
      setProjectileData((prev) => ({
        ...prev,
        currentTime: elapsed.toFixed(2),
        position: { x: worldX.toFixed(2), y: worldY.toFixed(2) },
      }));
      requestAnimationFrame(animate);
    };
    animate();
  };
  /**
   * Reset camera to overview after firing completes
   */
  useEffect(() => {
    if (!isFiring && cameraMode === "follow") {
      setTimeout(() => {
        cameraControlsRef.current.target.set(0, 5, 0);
      }, 500);
    }
  }, [isFiring, cameraMode]);
  /**
   * SECTION 7: TOGGLE SIDE PANEL (Mobile)
   */
  /**
   * SECTION 8: UI RENDERING - FULLY RESPONSIVE
   */
  return (
    <div className="w-full min-h-screen bg-gray-900 text-white flex flex-col">
      {/* Main Content */}
      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* 3D Canvas */}
        <div className="relative flex-1  max-sm:h-[50vh] max-lg:h-auto max-md:flex max-md:jsutify-center max-md:items-center">
          <canvas
            ref={canvasRef}
            className="w-full h-full cursor-grab active:cursor-grabbing touch-none"
          />
          {/* Camera Mode Buttons */}
          <div className="absolute top-2 left-2 sm:top-4 sm:left-4 flex flex-wrap gap-1 sm:gap-2 max-w-xs">
            {["overview", "follow", "side", "closeup"].map((mode) => (
              <button
                key={mode}
                onClick={() => setCameraPreset(mode)}
                className={`px-2 py-1 sm:px-3 rounded text-xs sm:text-sm transition-all ${
                  cameraMode === mode
                    ? "bg-blue-600 text-white"
                    : "bg-black/70 text-gray-300 hover:bg-black/90"
                }`}
              >
                {mode[0].toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>

          {/* Firing Indicator */}
          {isFiring && (
            <div className="absolute top-2 right-2 sm:top-4 sm:right-4 bg-red-600/90 px-2 py-1 sm:px-4 sm:py-2 rounded animate-pulse shadow-md">
              <div className="text-xs sm:text-sm font-bold">🔥 FIRING!</div>
              <div className="hidden sm:block text-xs mt-1">
                Pos: ({projectileData.position.x}, {projectileData.position.y})
              </div>
            </div>
          )}

          {/* Mobile Controls Button */}
          <button
            onClick={() => setShowPanel(!showPanel)}
            className="lg:hidden absolute bottom-4 right-4 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-full shadow-md font-semibold text-sm transition-all"
          >
            {showPanel ? "✕ Close" : "⚙️ Controls"}
          </button>
        </div>

        {/* Side Panel */}
        <aside
          className={`${
            showPanel ? "translate-y-0" : "translate-y-full"
          } lg:translate-y-0 fixed lg:relative inset-x-0 bottom-0 lg:bottom-auto lg:w-80 bg-gray-800 transition-transform duration-300 p-4 sm:p-6 overflow-y-auto z-50 lg:z-auto rounded-t-2xl lg:rounded-none shadow-2xl lg:shadow-none`}
        >
          {/* Mobile close button */}
          <button
            onClick={() => setShowPanel(false)}
            className="lg:hidden absolute top-2 right-2 text-gray-400 hover:text-white text-2xl px-2"
          >
            ✕
          </button>
          <h2 className="text-lg sm:text-xl font-bold mb-4">Physics Data</h2>
          {/* Cannon Parameters */}
          <div className="bg-gray-700 p-3 sm:p-4 rounded mb-4">
            <h3 className="font-semibold mb-3 text-blue-400 text-sm sm:text-base">
              Cannon Parameters
            </h3>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm sm:text-base mb-2">
                  <span className="text-gray-300">Angle:</span>
                  <span className="font-mono">{cannonAngle.toFixed(1)}°</span>
                </div>
                <div className="w-full bg-gray-600 rounded h-2 mb-2">
                  <div
                    className="bg-blue-500 h-2 rounded transition-all"
                    style={{ width: `${(cannonAngle / 90) * 100}%` }}
                  />
                </div>
                <input
                  type="range"
                  min="15"
                  max="90"
                  step="0.1"
                  value={cannonAngle}
                  onChange={(e) => setCannonAngle(Number(e.target.value))}
                  className="w-full"
                  disabled={isFiring}
                />
                <input
                  type="number"
                  min="15"
                  max="90"
                  step="0.1"
                  value={cannonAngle}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    if (!isNaN(val) && val >= 15 && val <= 90) {
                      setCannonAngle(val);
                    }
                  }}
                  className="w-full mt-1 p-1 bg-gray-600 border border-gray-500 rounded text-sm text-white focus:outline-none focus:border-blue-500"
                  disabled={isFiring}
                  placeholder="e.g., 25.1"
                />
              </div>
              <div>
                <div className="flex justify-between text-sm sm:text-base mb-2">
                  <span className="text-gray-300">Velocity:</span>
                  <span className="font-mono">{initialVelocity} m/s</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="100"
                  step="0.1"
                  value={initialVelocity}
                  onChange={(e) => setInitialVelocity(Number(e.target.value))}
                  className="w-full"
                  disabled={isFiring}
                />
                <input
                  type="number"
                  min="10"
                  max="100"
                  step="0.1"
                  value={initialVelocity}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    if (!isNaN(val) && val >= 10 && val <= 100) {
                      setInitialVelocity(val);
                    }
                  }}
                  className="w-full mt-1 p-1 bg-gray-600 border border-gray-500 rounded text-sm text-white focus:outline-none focus:border-blue-500"
                  disabled={isFiring}
                  placeholder="e.g., 80.1"
                />
              </div>
            </div>
          </div>{" "}
          {/* Fire Button */}
          <button
            onClick={fireProjectile}
            disabled={isFiring}
            className={`w-full py-2 sm:py-3 rounded font-bold text-base sm:text-lg mb-4 transition-all ${
              isFiring
                ? "bg-gray-600 text-gray-400 cursor-not-allowed"
                : "bg-red-600 hover:bg-red-700 text-white"
            }`}
          >
            {isFiring ? "Firing..." : "🔥 FIRE CANNON"}
          </button>
          {/* Calculated Values */}
          <div className="bg-gray-700 p-3 sm:p-4 rounded mb-4">
            <h3 className="font-semibold mb-3 text-green-400 text-sm sm:text-base">
              Calculated Values
            </h3>
            <div className="space-y-2 text-xs sm:text-sm">
              <div className="flex justify-between">
                <span className="text-gray-300">Range:</span>
                <span className="font-mono">{projectileData.range} m</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-300">Max Height:</span>
                <span className="font-mono">{projectileData.maxHeight} m</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-300">Flight Time:</span>
                <span className="font-mono">
                  {projectileData.timeOfFlight} s
                </span>
              </div>

              {isFiring && (
                <div className="border-t border-gray-600 pt-2 mt-2 space-y-1 text-yellow-400">
                  <div className="flex justify-between">
                    <span>Time:</span>
                    <span className="font-mono">
                      {projectileData.currentTime} s
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>X:</span>
                    <span className="font-mono">
                      {projectileData.position.x} m
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Y:</span>
                    <span className="font-mono">
                      {projectileData.position.y} m
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
          {/* Physics Formulas */}
          <div className="bg-gray-700 p-3 sm:p-4 rounded text-xs font-mono text-gray-300 space-y-1 sm:space-y-2">
            <h3 className="font-semibold text-purple-400 text-sm sm:text-base mb-2">
              Equations
            </h3>
            <div className="space-y-1">
              <span>Horizontal Displacement:</span>
              <ul className="list-disc list-inside space-y-1">
                <li>vₓ = v₀ cos θ (constant throughout flight)</li>
                <li>x = vₓ t = (v₀ cos θ) t</li>
                <li>R = (v₀² sin 2θ) / g (maximum range)</li>
              </ul>
            </div>
            <div className="space-y-1">
              <span>Vertical Displacement:</span>
              <ul className="list-disc list-inside space-y-1">
                <li>v_y = v₀ sin θ - g t (final vertical velocity)</li>
                <li>y = (v₀ sin θ) t - (1/2) g t²</li>
                <li>H = (v₀² sin² θ) / (2 g) (maximum height)</li>
              </ul>
            </div>
            <p className="text-gray-500 mt-2">g = {GRAVITY} m/s²</p>
          </div>{" "}
        </aside>
      </main>

      {/* Mobile Overlay */}
      {showPanel && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setShowPanel(false)}
        />
      )}
    </div>
  );
};
export default CannonSimulator;
