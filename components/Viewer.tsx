'use client'

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { ARButton } from "three/addons/webxr/ARButton.js";
import { supabase } from '@/utils/supabase';

interface Voxel { id: string; lon: number; alt: number; lat: number; color: string; }

export default function Viewer() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef(new THREE.Scene());
  const voxelsMap = useRef<Map<string, THREE.Mesh>>(new Map());
  
  // Ref to track latest GPS for the controller listener
  const latestPos = useRef({ lat: 0, lng: 0 });
  const [voxels, setVoxels] = useState<Voxel[]>([]);
  const [position, setPosition] = useState({ lat: 0, lng: 0 });

  // 1. GPS WATCHER
  useEffect(() => {
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setPosition(coords);
        latestPos.current = coords; // Update ref so controller can see it
      },
      null, { enableHighAccuracy: true }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // 2. SUPABASE SYNC
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

  // 3. ENGINE & INTERACTION SETUP
  useEffect(() => {
    if (!mountRef.current) return;

    const scene = sceneRef.current;
    const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.xr.enabled = true;
    renderer.setSize(window.innerWidth, window.innerHeight);
    mountRef.current.appendChild(renderer.domElement);

    const raycaster = new THREE.Raycaster();
    const tempMatrix = new THREE.Matrix4();
    scene.add(new THREE.HemisphereLight(0xffffff, 0xbbbbff, 3));

    // --- CONTROLLER LOGIC (Add/Remove) ---
    const controller = renderer.xr.getController(0);
    controller.addEventListener('select', async () => {
      if (latestPos.current.lat === 0) return;

      // Check if we hit an existing voxel to REMOVE
      tempMatrix.identity().extractRotation(controller.matrixWorld);
      raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
      raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

      const intersects = raycaster.intersectObjects(Array.from(voxelsMap.current.values()));

      if (intersects.length > 0) {
        // HIT: Remove it
        const hitId = intersects[0].object.userData.dbId;
        await supabase.from('voxels').delete().eq('id', hitId);
      } else {
        // MISS: Add a new one
        const worldPos = new THREE.Vector3(0, 0, -0.3).applyMatrix4(controller.matrixWorld);
        
        // Convert local meters to GPS
        const latScale = 111111;
        const lonScale = 111111 * Math.cos(latestPos.current.lat * Math.PI / 180);
        
        const newLat = latestPos.current.lat - (worldPos.z / latScale);
        const newLon = latestPos.current.lng + (worldPos.x / lonScale);

        await supabase.from('voxels').insert([{
          lat: newLat,
          lon: newLon,
          alt: worldPos.y,
          color: "#" + new THREE.Color(Math.random() * 0xffffff).getHexString()
        }]);
      }
    });
    scene.add(controller);

    const button = ARButton.createButton(renderer, { 
      requiredFeatures: ["hit-test"], 
      optionalFeatures: ["dom-overlay"],
      domOverlay: { root: document.body } 
    });
    document.body.appendChild(button);

    renderer.setAnimationLoop(() => renderer.render(scene, camera));

    return () => {
      renderer.dispose();
      button.remove();
    };
  }, []);

  // 4. SYNC VOXELS TO SCENE
  useEffect(() => {
    const scene = sceneRef.current;
    if (position.lat === 0) return;

    const geometry = new THREE.BoxGeometry(0.1, 0.1, 0.1);

    voxels.forEach((voxel) => {
      let mesh = voxelsMap.current.get(voxel.id);
      
      const z = -(voxel.lat - position.lat) * 111111;
      const x = (voxel.lon - position.lng) * (111111 * Math.cos(position.lat * Math.PI / 180));

      if (!mesh) {
        mesh = new THREE.Mesh(geometry, new THREE.MeshPhongMaterial({ color: voxel.color }));
        mesh.userData.dbId = voxel.id; // Store ID for removal
        scene.add(mesh);
        voxelsMap.current.set(voxel.id, mesh);
      }
      mesh.position.set(x, voxel.alt, z);
    });

    // Cleanup
    const currentIds = new Set(voxels.map(v => v.id));
    voxelsMap.current.forEach((mesh, id) => {
      if (!currentIds.has(id)) {
        scene.remove(mesh);
        voxelsMap.current.delete(id);
      }
    });
  }, [voxels, position]);

  return <div ref={mountRef} className="fixed inset-0" />;
}