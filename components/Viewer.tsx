'use client'

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { ARButton } from "three/addons/webxr/ARButton.js";
import { supabase } from "@/utils/supabase"; // Adjust path as needed

export default function Viewer() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const boxesMap = useRef<Map<string, THREE.Mesh>>(new Map());

  useEffect(() => {
    if (!mountRef.current) return;

    // --- Scene Setup ---
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.xr.enabled = true;
    renderer.setSize(window.innerWidth, window.innerHeight);
    mountRef.current.appendChild(renderer.domElement);

    const geometry = new THREE.BoxGeometry(0.1, 0.1, 0.1);
    const raycaster = new THREE.Raycaster();
    const tempMatrix = new THREE.Matrix4();

    // --- Helpers ---
    const addBoxToScene = (data: any) => {
      if (boxesMap.current.has(data.id)) return;
      const material = new THREE.MeshPhongMaterial({ color: data.color });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.fromArray(data.position);
      mesh.quaternion.fromArray(data.rotation);
      mesh.userData.id = data.id; // Store ID for raycasting/deletion
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

    // --- Supabase Sync ---
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

    // --- Interaction ---
    const controller = renderer.xr.getController(0);
    scene.add(controller);

    controller.addEventListener("select", async () => {
      // 1. Check if we hit an existing box to delete it
      tempMatrix.identity().extractRotation(controller.matrixWorld);
      raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
      raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

      const intersects = raycaster.intersectObjects(Array.from(boxesMap.current.values()));

      if (intersects.length > 0) {
        const hitId = intersects[0].object.userData.id;
        await supabase.from("boxes").delete().eq("id", hitId);
      } else {
        // 2. Otherwise, add a new box
        const pos = new THREE.Vector3(0, 0, -0.3).applyMatrix4(controller.matrixWorld);
        const quat = new THREE.Quaternion().setFromRotationMatrix(controller.matrixWorld);
        
        await supabase.from("boxes").insert({
          position: pos.toArray(),
          rotation: quat.toArray(),
          color: `#${new THREE.Color(Math.random() * 0xffffff).getHexString()}`
        });
      }
    });

    // --- Animation Loop ---
    // (Keep your existing Depth Sensing logic here as well)
    renderer.setAnimationLoop((time, frame) => {
      renderer.render(scene, camera);
    });

    return () => {
      renderer.dispose();
      supabase.removeAllChannels();
    };
  }, []);

  return <div ref={mountRef} />;
}