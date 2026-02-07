'use client'

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { ARButton } from "three/addons/webxr/ARButton.js";
import { supabase } from "@/utils/supabase";

export default function Viewer() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const voxelsMap = useRef<Map<string, THREE.Mesh>>(new Map());
  const origin = useRef<{ lat: number; lon: number } | null>(null);

  useEffect(() => {
    if (!mountRef.current) return;

    // --- Conversion Utilities ---
    const latLonToMeters = (lat: number, lon: number, alt: number) => {
      if (!origin.current) return new THREE.Vector3(0, 0, 0);

      const deltaLat = lat - origin.current.lat;
      const deltaLon = lon - origin.current.lon;

      // Basic equirectangular approximation
      const y = alt; // Altitude maps to Y (up/down)
      const z = -(deltaLat * 111111); // Latitude maps to Z (North/South)
      const x = deltaLon * (111111 * Math.cos(origin.current.lat * (Math.PI / 180))); // Longitude maps to X (East/West)

      return new THREE.Vector3(x, y, z);
    };

    // --- Scene Setup ---
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.xr.enabled = true;
    renderer.setSize(window.innerWidth, window.innerHeight);
    mountRef.current.appendChild(renderer.domElement);

    const geometry = new THREE.BoxGeometry(0.1, 0.1, 0.1);

    // --- Helpers ---
    const addVoxelToScene = (data: any) => {
      if (voxelsMap.current.has(data.id)) return;
      
      const pos = latLonToMeters(data.lat, data.lon, data.alt);
      const material = new THREE.MeshPhongMaterial({ color: data.color });
      const mesh = new THREE.Mesh(geometry, material);
      
      mesh.position.copy(pos);
      mesh.userData.id = data.id;
      scene.add(mesh);
      voxelsMap.current.set(data.id, mesh);
    };

    // --- Get Current Location & Sync ---
    navigator.geolocation.getCurrentPosition((pos) => {
      origin.current = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      
      // Fetch and Subscribe
      const syncVoxels = async () => {
        const { data } = await supabase.from("voxels").select("*");
        data?.forEach(addVoxelToScene);

        supabase
          .channel("voxel-sync")
          .on("postgres_changes", { event: "INSERT", schema: "public", table: "voxels" }, 
            payload => addVoxelToScene(payload.new)
          )
          .on("postgres_changes", { event: "DELETE", schema: "public", table: "voxels" }, 
            payload => {
              const mesh = voxelsMap.current.get(payload.old.id);
              if (mesh) {
                scene.remove(mesh);
                voxelsMap.current.delete(payload.old.id);
              }
            }
          )
          .subscribe();
      };
      syncVoxels();
    });

    // --- Interaction ---
    const controller = renderer.xr.getController(0);
    scene.add(controller);

    controller.addEventListener("select", async () => {
      if (!origin.current) return;

      // Get position in Three.js world space
      const worldPos = new THREE.Vector3(0, 0, -0.3).applyMatrix4(controller.matrixWorld);

      // Inverse conversion: Meters back to Lat/Lon
      const latScale = 111111;
      const lonScale = 111111 * Math.cos(origin.current.lat * (Math.PI / 180));

      const newLat = origin.current.lat - (worldPos.z / latScale);
      const newLon = origin.current.lon + (worldPos.x / lonScale);
      const newAlt = worldPos.y;

      await supabase.from("voxels").insert({
        lat: newLat,
        lon: newLon,
        alt: newAlt,
        color: `#${new THREE.Color(Math.random() * 0xffffff).getHexString()}`,
        // user_id: (handle auth if needed)
      });
    });

    renderer.setAnimationLoop(() => renderer.render(scene, camera));

    return () => {
      renderer.dispose();
      supabase.removeAllChannels();
    };
  }, []);

  return <div ref={mountRef} />;
}