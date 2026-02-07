'use client'

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { ARButton } from "three/addons/webxr/ARButton.js";
import { supabase } from '@/utils/supabase';

interface Voxel { id: string; lon: number; alt: number; lat: number; color: string; }

export default function Viewer() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  
  // These refs hold our 3D objects so they persist across renders
  const sceneRef = useRef(new THREE.Scene());
  const voxelsMap = useRef<Map<string, THREE.Mesh>>(new Map());
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);

  const [voxels, setVoxels] = useState<Voxel[]>([]);
  const [position, setPosition] = useState({ lat: 0, lng: 0 });

  // 1. INITIAL ENGINE SETUP (Run Only Once)
  useEffect(() => {
    if (!mountRef.current) return;

    const scene = sceneRef.current;
    const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.xr.enabled = true;
    renderer.setSize(window.innerWidth, window.innerHeight);
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    scene.add(new THREE.HemisphereLight(0xffffff, 0xbbbbff, 3));

    const button = ARButton.createButton(renderer, { 
      requiredFeatures: ["hit-test"],
      optionalFeatures: ["dom-overlay"],
      domOverlay: { root: document.body } 
    });
    document.body.appendChild(button);

    // One single animation loop for the lifetime of the component
    renderer.setAnimationLoop(() => {
      renderer.render(scene, camera);
    });

    return () => {
      renderer.dispose();
      button.remove();
    };
  }, []); // Empty dependency array = Runs once. No more crashes.

  // 2. GPS WATCHER
  useEffect(() => {
    const watchId = navigator.geolocation.watchPosition(
      (pos) => setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      null,
      { enableHighAccuracy: true }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // 3. SUPABASE SYNC
  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase.from('voxels').select('*');
      if (data) setVoxels(data as Voxel[]);
    };

    const channel = supabase.channel('voxels_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'voxels' }, fetch)
      .subscribe();

    fetch();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // 4. THE VOXEL UPDATER (The "Sync" Logic)
  useEffect(() => {
    const scene = sceneRef.current;
    if (position.lat === 0) return;

    const geometry = new THREE.BoxGeometry(0.1, 0.1, 0.1);

    // Update existing or add new
    voxels.forEach((voxel) => {
      let mesh = voxelsMap.current.get(voxel.id);
      
      const z = -(voxel.lat - position.lat) * 111111;
      const x = (voxel.lon - position.lng) * (111111 * Math.cos(position.lat * Math.PI / 180));

      if (!mesh) {
        mesh = new THREE.Mesh(geometry, new THREE.MeshPhongMaterial({ color: voxel.color }));
        scene.add(mesh);
        voxelsMap.current.set(voxel.id, mesh);
      }
      
      mesh.position.set(x, voxel.alt, z);
    });

    // Cleanup deleted
    const currentIds = new Set(voxels.map(v => v.id));
    voxelsMap.current.forEach((mesh, id) => {
      if (!currentIds.has(id)) {
        scene.remove(mesh);
        voxelsMap.current.delete(id);
      }
    });
  }, [voxels, position]); // This ONLY updates positions, doesn't restart the engine.

  return <div ref={mountRef} className="fixed inset-0" />;
}