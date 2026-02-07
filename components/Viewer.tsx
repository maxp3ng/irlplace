'use client'

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { ARButton } from "three/addons/webxr/ARButton.js";
import { supabase } from '@/utils/supabase';

interface Voxel { id: string; lon: number; alt: number; lat: number; color: string; }

export default function Viewer() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const voxelsMap = useRef<Map<string, THREE.Mesh>>(new Map()); // Tracks meshes by ID
  
  const [voxels, setVoxels] = useState<Voxel[]>([]);
  const [position, setPosition] = useState({ lat: 0, lng: 0 });
  const [geoError, setGeoError] = useState<string | null>(null);

  // --- 1. Continuous GPS update ---
  useEffect(() => {
    const watchId = navigator.geolocation.watchPosition(
      (pos) => setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => setGeoError(err.message),
      { enableHighAccuracy: true }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // --- 2. Realtime Supabase Sync ---
  useEffect(() => {
    const channel = supabase
      .channel('realtime_voxels')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'voxels' }, (p) => {
        setVoxels((prev) => [...prev, p.new as Voxel]);
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'voxels' }, (p) => {
        setVoxels((prev) => prev.filter(v => v.id !== p.old.id));
      })
      .subscribe();

    supabase.from('voxels').select('*').then(({ data }) => { if (data) setVoxels(data as Voxel[]); });
    return () => { supabase.removeChannel(channel); };
  }, []);

  // --- 3. Scene Sync (The "Always Render" Logic) ---
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || position.lat === 0) return;

    const geometry = new THREE.BoxGeometry(0.1, 0.1, 0.1);

    // Add or Update Voxels
    voxels.forEach((voxel) => {
      if (!voxelsMap.current.has(voxel.id)) {
        const material = new THREE.MeshPhongMaterial({ color: voxel.color || "#FFFFFF" });
        const mesh = new THREE.Mesh(geometry, material);
        
        // Convert Lat/Lon to meters relative to current position
        const z = -(voxel.lat - position.lat) * 111111;
        const x = (voxel.lon - position.lng) * (111111 * Math.cos(position.lat * Math.PI / 180));
        
        mesh.position.set(x, voxel.alt || 0, z);
        scene.add(mesh);
        voxelsMap.current.set(voxel.id, mesh);
      }
    });

    // Cleanup deleted voxels
    const voxelIds = new Set(voxels.map(v => v.id));
    voxelsMap.current.forEach((mesh, id) => {
      if (!voxelIds.has(id)) {
        scene.remove(mesh);
        voxelsMap.current.delete(id);
      }
    });
  }, [voxels, position]); // Re-runs whenever data or your location changes

  // --- 4. Initial Three.js Setup ---
  useEffect(() => {
    if (!mountRef.current) return;

    const scene = new THREE.Scene();
    sceneRef.current = scene;
    const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.xr.enabled = true;
    renderer.setSize(window.innerWidth, window.innerHeight);
    mountRef.current.appendChild(renderer.domElement);

    const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 3);
    scene.add(light);

    document.body.appendChild(ARButton.createButton(renderer, { requiredFeatures: ["hit-test"] }));

    const controller = renderer.xr.getController(0);
    controller.addEventListener("select", async () => {
      // Calculate local placement (meters from phone)
      const worldPos = new THREE.Vector3(0, 0, -0.3).applyMatrix4(controller.matrixWorld);
      
      // Convert local meters back to global GPS
      const latScale = 111111;
      const lonScale = 111111 * Math.cos(position.lat * Math.PI / 180);
      
      const newLat = position.lat - (worldPos.z / latScale);
      const newLon = position.lng + (worldPos.x / lonScale);

      await supabase.from('voxels').insert([{ 
        lat: newLat, 
        lon: newLon, 
        alt: worldPos.y, 
        color: "#" + new THREE.Color(Math.random() * 0xffffff).getHexString() 
      }]);
    });
    scene.add(controller);

    renderer.setAnimationLoop(() => renderer.render(scene, camera));

    return () => renderer.dispose();
  }, []); // Only run once

  return (
    <>
      <div style={{ position: "absolute", top: 10, left: 10, color: "white", zIndex: 10, background: 'rgba(0,0,0,0.5)', padding: '5px' }}>
        {geoError ? `Error: ${geoError}` : `Lat: ${position.lat.toFixed(6)} Lon: ${position.lng.toFixed(6)}`}
        <br />Voxels: {voxels.length}
      </div>
      <div ref={mountRef} style={{ width: "100vw", height: "100vh" }} />
    </>
  );
}