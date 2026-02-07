'use client'


import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { ARButton } from "three/addons/webxr/ARButton.js";

export default function Viewer() {
  const mountRef = useRef<HTMLDivElement | null>(null);

  // State for user GPS location
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) {
      setGeoError("Geolocation not supported");
      return;
    }

    // Grab user location on start
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPosition({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
        console.log("User location:", pos.coords.latitude, pos.coords.longitude);
      },
      (err) => {
        setGeoError(err.message);
        console.warn("Geolocation error:", err.message);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }, []);

  useEffect(() => {
    if (!mountRef.current) return;

    let renderer: THREE.WebGLRenderer;
    let scene: THREE.Scene;
    let camera: THREE.PerspectiveCamera;
    let controller: THREE.XRTargetRaySpace;

    // Scene + camera
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(
      70,
      window.innerWidth / window.innerHeight,
      0.01,
      20
    );

    // Lighting
    const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 3);
    light.position.set(0.5, 1, 0.25);
    scene.add(light);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.xr.enabled = true;
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    mountRef.current.appendChild(renderer.domElement);

    // AR Button
    document.body.appendChild(
      ARButton.createButton(renderer, {
        requiredFeatures: ["hit-test", "depth-sensing"],
        depthSensing: {
          usagePreference: ["cpu-optimized", "gpu-optimized"],
          dataFormatPreference: ["float32", "red"],
        },
      })
    );

    // Cone geometry
    const geometry = new THREE.CylinderGeometry(0, 0.05, 0.2, 32).rotateX(
      Math.PI / 2
    );

    function onSelect() {
      const material = new THREE.MeshPhongMaterial({
        color: 0xffffff * Math.random(),
      });

      const mesh = new THREE.Mesh(geometry, material);

      // Example: just spawn in front of controller
      mesh.position.set(0, 0, -0.3).applyMatrix4(controller.matrixWorld);
      mesh.quaternion.setFromRotationMatrix(controller.matrixWorld);

      scene.add(mesh);
    }

    controller = renderer.xr.getController(0);
    controller.addEventListener("select", onSelect);
    scene.add(controller);

    function onWindowResize() {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    }

    window.addEventListener("resize", onWindowResize);

    renderer.setAnimationLoop(() => {
      renderer.render(scene, camera);
    });

    return () => {
      window.removeEventListener("resize", onWindowResize);
      renderer.dispose();
    };
  }, [position]); // run again if position changes

  return (
    <>
      <div
        id="info"
        style={{
          position: "absolute",
          top: 10,
          width: "100%",
          textAlign: "center",
          zIndex: 1,
        }}
      >
        <br />
        {geoError && <span style={{ color: "red" }}>GPS Error: {geoError}</span>}
        {position && (
          <span>
            Your Location: {position.lat.toFixed(6)}, {position.lng.toFixed(6)}
          </span>
        )}
      </div>

      <div ref={mountRef} style={{ width: "100%", height: "100%" }} />
    </>
  );
}
