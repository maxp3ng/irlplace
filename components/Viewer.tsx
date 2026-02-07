'use client'

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { ARButton } from "three/addons/webxr/ARButton.js";

export default function Viewer() {
  const mountRef = useRef<HTMLDivElement | null>(null);

  // --- GPS state ---
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);

  // --- Get GPS location on start ---
  useEffect(() => {
    if (!navigator.geolocation) {
      setGeoError("Geolocation not supported");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => setGeoError(err.message),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }, []);

  useEffect(() => {
    if (!mountRef.current) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      70,
      window.innerWidth / window.innerHeight,
      0.01,
      20
    );

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.xr.enabled = true;
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    mountRef.current.appendChild(renderer.domElement);

    // --- Light ---
    const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 3);
    light.position.set(0.5, 1, 0.25);
    scene.add(light);

    // --- AR Button ---
    document.body.appendChild(
      ARButton.createButton(renderer, {
        requiredFeatures: ["hit-test", "depth-sensing"],
        depthSensing: {
          usagePreference: ["cpu-optimized", "gpu-optimized"],
          dataFormatPreference: ["float32", "luminance-alpha"], // prioritize float32 first
        },
      })
    );

    // --- Cone geometry ---
    const geometry = new THREE.CylinderGeometry(0, 0.05, 0.2, 32).rotateX(Math.PI / 2);

    // --- Depth occlusion shader ---
    const depthUniforms = {
      uDepthTexture: { value: null as THREE.Texture | null },
      uRawValueToMeters: { value: 0 },
    };

    const occlusionMaterial = new THREE.ShaderMaterial({
      uniforms: depthUniforms,
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        uniform sampler2D uDepthTexture;
        uniform float uRawValueToMeters;

        void main() {
          if(uDepthTexture == null) discard;
          vec4 depth = texture2D(uDepthTexture, vUv);
          if(depth.r <= 0.0) discard;
          gl_FragColor = vec4(0.0);
        }
      `,
      colorWrite: false,
    });

    const occlusionMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), occlusionMaterial);
    occlusionMesh.renderOrder = -1;
    scene.add(occlusionMesh);

    // --- Controller ---
    const controller = renderer.xr.getController(0);
    controller.addEventListener("select", () => {
      const material = new THREE.MeshPhongMaterial({ color: 0xffffff * Math.random() });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(0, 0, -0.3).applyMatrix4(controller.matrixWorld);
      mesh.quaternion.setFromRotationMatrix(controller.matrixWorld);

      // Attach GPS data if available
      (mesh as any).gps = position;

      scene.add(mesh);
    });
    scene.add(controller);

    // --- Resize ---
    function onWindowResize() {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    }
    window.addEventListener("resize", onWindowResize);

    // --- Animation loop ---
    renderer.setAnimationLoop((time, frame) => {
      if (frame) {
        const referenceSpace = renderer.xr.getReferenceSpace();
        const pose = frame.getViewerPose(referenceSpace!);

        if (pose) {
          const view = pose.views[0];

          // Try WebXR GPU depth texture first
          const session = renderer.xr.getSession();
          let depthTexture: THREE.Texture | null = null;

          if ((session as any).getDepthUsage) {
            // Some devices may support XRWebGLBinding
            try {
              const binding = new (window as any).XRWebGLBinding(session, renderer.getContext());
              const gpuDepth = binding.getDepthTexture(view);
              if (gpuDepth) {
                depthTexture = gpuDepth;
              }
            } catch {}
          }

          // If GPU texture not available, fall back to CPU depth
          if (!depthTexture) {
            // @ts-ignore
            const depthData = frame.getDepthInformation?.(view);
            if (depthData && depthData.data) {
              let type: THREE.TextureDataType;
              if (depthData.data instanceof Uint16Array) type = THREE.UnsignedShortType;
              else if (depthData.data instanceof Float32Array) type = THREE.FloatType;
              else type = THREE.FloatType; // fallback

              depthTexture = new THREE.DataTexture(
                depthData.data,
                depthData.width,
                depthData.height,
                THREE.RedFormat,
                type
              );
              depthTexture.needsUpdate = true;
              depthUniforms.uRawValueToMeters.value = depthData.rawValueToMeters;
            }
          }

          depthUniforms.uDepthTexture.value = depthTexture;
          occlusionMesh.visible = depthTexture !== null;
        }
      }

      renderer.render(scene, camera);
    });

    return () => {
      window.removeEventListener("resize", onWindowResize);
      renderer.dispose();
    };
  }, [position]);

  return (
    <>
      {geoError && <div style={{ color: "red" }}>{geoError}</div>}
      {position && (
        <div style={{ position: "absolute", top: 10, left: 10, color: "white", zIndex: 10 }}>
          Latitude: {position.lat.toFixed(6)}, Longitude: {position.lng.toFixed(6)}
        </div>
      )}
      <div ref={mountRef} style={{ width: "100%", height: "100%" }} />
    </>
  );
}
