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

    let renderer: THREE.WebGLRenderer;
    let scene: THREE.Scene;
    let camera: THREE.PerspectiveCamera;
    let controller: THREE.XRTargetRaySpace;

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
          vec4 depth = texture2D(uDepthTexture, vUv);
          if(depth.r <= 0.0) discard;
          gl_FragColor = vec4(0.0);
        }
      `,
      colorWrite: false,
    });

    // --- Scene & camera ---
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(
      70,
      window.innerWidth / window.innerHeight,
      0.01,
      20
    );

    const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 3);
    light.position.set(0.5, 1, 0.25);
    scene.add(light);

    // --- Renderer ---
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.xr.enabled = true;
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    mountRef.current.appendChild(renderer.domElement);

    // --- AR Button ---
    document.body.appendChild(
      ARButton.createButton(renderer, {
        requiredFeatures: ["hit-test", "depth-sensing"],
        depthSensing: {
          usagePreference: ["cpu-optimized", "gpu-optimized"],
          dataFormatPreference: ["float32", "red"],
        },
      })
    );

    // --- Geometry & occlusion ---
    const geometry = new THREE.CylinderGeometry(0, 0.05, 0.2, 32).rotateX(Math.PI / 2);

    const occlusionMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), occlusionMaterial);
    occlusionMesh.renderOrder = -1;
    scene.add(occlusionMesh);

    // --- Spawn cones ---
    function onSelect() {
      const material = new THREE.MeshPhongMaterial({ color: 0xffffff * Math.random() });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(0, 0, -0.3).applyMatrix4(controller.matrixWorld);
      mesh.quaternion.setFromRotationMatrix(controller.matrixWorld);

      // Attach GPS data if available
      (mesh as any).gps = position;

      scene.add(mesh);
    }

    controller = renderer.xr.getController(0);
    controller.addEventListener("select", onSelect);
    scene.add(controller);

    // --- Resize handler ---
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
        const session = renderer.xr.getSession();

        const pose = frame.getViewerPose(referenceSpace!);
        if (pose && session) {
          const view = pose.views[0];
          // @ts-ignore
          const depthData = frame.getDepthInformation(view);
          if (depthData) {
            let array: Uint16Array | Float32Array;
            let type: THREE.TextureDataType;

            // Detect type
            if (depthData.data instanceof Float32Array) {
              array = depthData.data;
              type = THREE.FloatType;
            } else if (depthData.data instanceof Uint16Array) {
              array = depthData.data;
              type = THREE.UnsignedShortType;
            } else {
              console.warn("Unknown depthData.data type:", depthData.data);
              return;
            }

            depthUniforms.uDepthTexture.value = new THREE.DataTexture(
                                                array,
                                                depthData.width,
                                                depthData.height,
                                                THREE.RedFormat,
                                                type
            );

            depthUniforms.uDepthTexture.value.needsUpdate = true;
            depthUniforms.uRawValueToMeters.value = depthData.rawValueToMeters;
            }
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
