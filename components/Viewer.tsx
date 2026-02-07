'use client'

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { ARButton } from "three/addons/webxr/ARButton.js";
import { supabase } from '@/utils/supabase';

const GRID_SIZE = 0.001; 
const METERS_PER_DEGREE = 111111;
const VOXEL_SNAP = 0.1; // 10cm snapping

export default function GlobalARViewer() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef(new THREE.Scene());
  const voxelsMap = useRef<Map<string, THREE.Mesh>>(new Map());
  const ghostRef = useRef<THREE.Mesh | null>(null);
  
  const [position, setPosition] = useState({ lat: 0, lng: 0, alt: 0 });
  const latestPos = useRef({ lat: 0, lng: 0, alt: 0 });

  const getGlobalOrigin = (lat: number, lng: number) => ({
    lat: Math.floor(lat / GRID_SIZE) * GRID_SIZE,
    lng: Math.floor(lng / GRID_SIZE) * GRID_SIZE,
  });

  useEffect(() => {
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude, alt: pos.coords.altitude || 0 };
        setPosition(coords);
        latestPos.current = coords;
      },
      null, { enableHighAccuracy: true }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  useEffect(() => {
    if (!mountRef.current) return;

    const scene = sceneRef.current;
    const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.xr.enabled = true;
    renderer.setSize(window.innerWidth, window.innerHeight);
    mountRef.current.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xffffff, 0xbbbbff, 3));

    // --- GHOST CUBE (The Snapping Guide) ---
    const ghostGeo = new THREE.BoxGeometry(0.1, 0.1, 0.1);
    const ghostMat = new THREE.MeshPhongMaterial({ 
      color: 0xffffff, 
      transparent: true, 
      opacity: 0.5,
      wireframe: true 
    });
    const ghost = new THREE.Mesh(ghostGeo, ghostMat);
    scene.add(ghost);
    ghostRef.current = ghost;

    // Compass Alignment
    window.addEventListener('deviceorientationabsolute', (event) => {
      if (event.alpha !== null && !scene.userData.aligned) {
        scene.rotation.y = THREE.MathUtils.degToRad(event.alpha);
        scene.userData.aligned = true;
      }
    }, { once: true });

    // --- PLACEMENT LOGIC ---
    const controller = renderer.xr.getController(0);
    controller.addEventListener('select', async () => {
      if (latestPos.current.lat === 0 || !ghostRef.current) return;

      const worldPos = ghostRef.current.position; // Use the snapped position
      const origin = getGlobalOrigin(latestPos.current.lat, latestPos.current.lng);
      const lonScale = METERS_PER_DEGREE * Math.cos(origin.lat * Math.PI / 180);

      const newLat = origin.lat - (worldPos.z / METERS_PER_DEGREE);
      const newLon = origin.lng + (worldPos.x / lonScale);

      await supabase.from('voxels').insert([{
        lat: newLat, 
        lon: newLon, 
        alt: worldPos.y,
        color: "#" + new THREE.Color(Math.random() * 0xffffff).getHexString()
      }]);
    });
    scene.add(controller);
    const Z_OFFSET = -1.5;
    // --- ANIMATION LOOP ---
    renderer.setAnimationLoop(() => {
      if (renderer.xr.isPresenting && ghostRef.current) {
        // Target is 0.5m in front of the camera
        const targetPos = new THREE.Vector3(0, 0, Z_OFFSET).applyMatrix4(camera.matrixWorld);
        
        // SNAP LOGIC: Round the target position to the nearest 0.1m
        ghostRef.current.position.set(
          Math.round(targetPos.x / VOXEL_SNAP) * VOXEL_SNAP,
          Math.round(targetPos.y / VOXEL_SNAP) * VOXEL_SNAP,
          Math.round(targetPos.z / VOXEL_SNAP) * VOXEL_SNAP
        );
      }
      renderer.render(scene, camera);
    });

    const button = ARButton.createButton(renderer);
    document.body.appendChild(button);

    return () => {
      renderer.dispose();
      button.remove();
    };
  }, []);

  // --- VOXEL SYNC ---
  useEffect(() => {
    if (position.lat === 0) return;
    const origin = getGlobalOrigin(position.lat, position.lng);
    const lonScale = METERS_PER_DEGREE * Math.cos(origin.lat * Math.PI / 180);

    const syncVoxels = async () => {
      const { data } = await supabase.from('voxels').select('*');
      if (!data) return;

      data.forEach((voxel) => {
        if (!voxelsMap.current.has(voxel.id)) {
          const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(0.1, 0.1, 0.1),
            new THREE.MeshPhongMaterial({ color: voxel.color })
          );
          mesh.position.set(
            (voxel.lon - origin.lng) * lonScale,
            voxel.alt,
            -(voxel.lat - origin.lat) * METERS_PER_DEGREE
          );
          sceneRef.current.add(mesh);
          voxelsMap.current.set(voxel.id, mesh);
        }
      });
    };

    const channel = supabase.channel('global_voxels')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'voxels' }, syncVoxels)
      .subscribe();

    syncVoxels();
    return () => { supabase.removeChannel(channel); };
  }, [position.lat]);

  return <div ref={mountRef} className="fixed inset-0" />;
}