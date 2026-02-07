'use client'

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { ARButton } from "three/addons/webxr/ARButton.js";
import { supabase } from '@/utils/supabase';

interface Voxel { id: string; lon: number; alt: number; lat: number; color: string; }

export default function Viewer() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<THREE.Scene>(new THREE.Scene());
  const voxelsMap = useRef<Map<string, THREE.Mesh>>(new Map());
  
  const [voxels, setVoxels] = useState<Voxel[]>([]);
  const [position, setPosition] = useState({ lat: 0, lng: 0 });

  // 1. GPS Watcher
  useEffect(() => {
    const watchId = navigator.geolocation.watchPosition(
      (pos) => setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      null,
      { enableHighAccuracy: true }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // 2. Supabase Sync
  useEffect(() => {
    const channel = supabase.channel('realtime_voxels')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'voxels' }, () => {
        supabase.from('voxels').select('*').then(({ data }) => { if (data) setVoxels(data as Voxel[]); });
      }).subscribe();
    supabase.from('voxels').select('*').then(({ data }) => { if (data) setVoxels(data as Voxel[]); });
    return () => { supabase.removeChannel(channel); };
  }, []);

  // 3. The AR Logic
  useEffect(() => {
    if (!mountRef.current) return;

    const scene = sceneRef.current;
    const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.xr.enabled = true;
    renderer.setSize(window.innerWidth, window.innerHeight);
    mountRef.current.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xffffff, 0xbbbbff, 3));

    // IMPORTANT: Required for AR button to show up and session to start
    const button = ARButton.createButton(renderer, { 
      requiredFeatures: ["hit-test"],
      optionalFeatures: ["dom-overlay"],
      domOverlay: { root: document.body } 
    });
    document.body.appendChild(button);

    const geometry = new THREE.BoxGeometry(0.1, 0.1, 0.1);

    // Sync function to place meshes in AR space
    const syncMeshes = () => {
      if (position.lat === 0) return;

      voxels.forEach((voxel) => {
        let mesh = voxelsMap.current.get(voxel.id);
        
        // Calculate meters relative to YOUR current GPS position
        const z = -(voxel.lat - position.lat) * 111111;
        const x = (voxel.lon - position.lng) * (111111 * Math.cos(position.lat * Math.PI / 180));

        if (!mesh) {
          mesh = new THREE.Mesh(geometry, new THREE.MeshPhongMaterial({ color: voxel.color }));
          scene.add(mesh);
          voxelsMap.current.set(voxel.id, mesh);
        }
        // Update position every frame in case GPS or origin shifts
        mesh.position.set(x, voxel.alt, z);
      });
    };

    renderer.setAnimationLoop((time, frame) => {
      // Sync meshes inside the loop so AR sees them
      syncMeshes();
      renderer.render(scene, camera);
    });

    return () => {
      renderer.dispose();
      button.remove();
    };
  }, [voxels, position]); // Re-init loop if state changes significantly

  return <div ref={mountRef} className="fixed inset-0" />;
}