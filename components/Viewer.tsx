'use client'

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { ARButton } from "three/addons/webxr/ARButton.js";
import { supabase } from "@/utils/supabase"; // Adjust path as needed

export default function Viewer() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const boxesMap = useRef<Map<string, THREE.Mesh>>(new Map());

  // --- GPS state ---
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);

  // --- Get user location on start ---
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

  // --- Three.js + AR + Supabase setup ---
  useEffect(() => {
    if (!mountRef.current) return;

    // --- Scene & Camera ---
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      70,
      window.innerWidth / window.innerHeight,
      0.01,
      20
    );

    // --- Renderer ---
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.xr.enabled = true;
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

    // --- Lighting ---
    const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 3);
    light.position.set(0.5, 1, 0.25);
    scene.add(light);

    // --- Geometry & Raycasting ---
    const geometry = new THREE.BoxGeometry(0.1, 0.1, 0.1);
    const raycaster = new THREE.Raycaster();
    const tempMatrix = new THREE.Matrix4();

    // --- Add/Remove boxes helpers ---
    const addBoxToScene = (data: any) => {
      if (boxesMap.current.has(data.id)) return;
      const material = new THREE.MeshPhongMaterial({ color: data.color });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.fromArray(data.position);
      mesh.quaternion.fromArray(data.rotation);
      mesh.userData.id = data.id;
      scene.add(mesh);
      boxesMap.current.set(data.id, mesh);
    };

    const removeBoxFromScene = (id: string) => {
      const mesh = boxesMap.current.get(id);
      if (mesh) {
        scene.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
        boxesMap.current.delete(id);
      }
    };

    // --- Supabase real-time sync ---
    const fetchAndSubscribe = async () => {
      const { data } = await supabase.from("boxes").select("*");
      data?.forEach(addBoxToScene);

      supabase
        .channel("schema-db-changes")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "boxes" }, 
          (payload) => addBoxToScene(payload.new)
        )
        .on("postgres_changes", { event: "DELETE", schema: "public", table: "boxes" }, 
          (payload) => removeBoxFromScene(payload.old.id)
        )
        .subscribe();
    };

    fetchAndSubscribe();

    // --- Controller / Interaction ---
    const controller = renderer.xr.getController(0);
    scene.add(controller);

    controller.addEventListener("select", async () => {
      // Raycast to detect existing boxes
      tempMatrix.identity().extractRotation(controller.matrixWorld);
      raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
      raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

      const intersects = raycaster.intersectObjects(Array.from(boxesMap.current.values()));

      if (intersects.length > 0) {
        // Delete the first hit
        const hitId = intersects[0].object.userData.id;
        await supabase.from("boxes").delete().eq("id", hitId);
      } else {
        // Otherwise add new box in front of controller
        const pos = new THREE.Vector3(0, 0, -0.3).applyMatrix4(controller.matrixWorld);
        const quat = new THREE.Quaternion().setFromRotationMatrix(controller.matrixWorld);

        await supabase.from("boxes").insert({
          position: pos.toArray(),
          rotation: quat.toArray(),
          color: `#${new THREE.Color(Math.random() * 0xffffff).getHexString()}`
        });
      }
    });

    // --- Window Resize ---
    const onWindowResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("resize", onWindowResize);

    // --- Animation Loop ---
    renderer.setAnimationLoop(() => {
      renderer.render(scene, camera);
    });

    // --- Cleanup ---
    return () => {
      window.removeEventListener("resize", onWindowResize);
      renderer.dispose();
      supabase.removeAllChannels();
    };
  }, [position]);

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
