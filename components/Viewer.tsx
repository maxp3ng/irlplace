'use client'

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { ARButton } from "three/addons/webxr/ARButton.js";

export default function Viewer() {
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!mountRef.current) return;

    let renderer: THREE.WebGLRenderer;
    let scene: THREE.Scene;
    let camera: THREE.PerspectiveCamera;
    let controller: THREE.XRTargetRaySpace;

    // Depth texture uniforms (comes from XRFrame)
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

          // write only depth (no color)
          gl_FragColor = vec4(0.0);
        }
      `,
      colorWrite: false,
    });

    // Scene
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

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.xr.enabled = true;
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);

    mountRef.current.appendChild(renderer.domElement);

    document.body.appendChild(
      ARButton.createButton(renderer, {
        requiredFeatures: ["hit-test", "depth-sensing"],
        depthSensing: {
          usagePreference: ["cpu-optimized", "gpu-optimized"],
          dataFormatPreference: ["luminance-alpha", "float32"],
        },
      })
    );

    // Cone geometry
    const geometry = new THREE.CylinderGeometry(0, 0.05, 0.2, 32).rotateX(
      Math.PI / 2
    );

    // Fullscreen quad used for occlusion
    const occlusionMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      occlusionMaterial
    );
    occlusionMesh.renderOrder = -1;
    scene.add(occlusionMesh);

    function onSelect() {
      const material = new THREE.MeshPhongMaterial({
        color: 0xffffff * Math.random(),
      });

      const mesh = new THREE.Mesh(geometry, material);
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

    renderer.setAnimationLoop((time, frame) => {
      if (frame) {
        const referenceSpace = renderer.xr.getReferenceSpace();
        const session = renderer.xr.getSession();

        const pose = frame.getViewerPose(referenceSpace!);
        if (pose && session) {
          const view = pose.views[0];

          // @ts-ignore (WebXR depth API)
          const depthData = frame.getDepthInformation(view);

          if (depthData) {
            depthUniforms.uDepthTexture.value = new THREE.DataTexture(
              depthData.data,
              depthData.width,
              depthData.height,
              THREE.RedFormat
            );

            depthUniforms.uDepthTexture.value.needsUpdate = true;
            depthUniforms.uRawValueToMeters.value =
              depthData.rawValueToMeters;
          }
        }
      }

      renderer.render(scene, camera);
    });

    return () => {
      window.removeEventListener("resize", onWindowResize);
      renderer.dispose();
    };
  }, []);

  return <div ref={mountRef} />;
}
