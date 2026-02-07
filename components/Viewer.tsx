'use client'

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { ARButton } from "three/addons/webxr/ARButton.js";
import { supabase } from '@/utils/supabase';

const GRID_SIZE = 0.001; 
const METERS_PER_DEGREE = 111111;
const VOXEL_SNAP = 0.1; 
const Z_OFFSET = -1.2;

export default function GlobalARViewer() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef(new THREE.Scene());
  const voxelsMap = useRef<Map<string, THREE.Mesh>>(new Map());
  const ghostRef = useRef<THREE.Mesh | null>(null);
  const isAligned = useRef(false);
  
  const [position, setPosition] = useState({ lat: 0, lng: 0, alt: 0 });
  const latestPos = useRef({ lat: 0, lng: 0, alt: 0 });

  // 1. HELPERS
  const getGlobalOrigin = (lat: number, lng: number) => ({
    lat: Math.floor(lat / GRID_SIZE) * GRID_SIZE,
    lng: Math.floor(lng / GRID_SIZE) * GRID_SIZE,
  });

  const addVoxelLocally = (voxel: any) => {
    if (voxelsMap.current.has(voxel.id)) return;
    const origin = getGlobalOrigin(latestPos.current.lat, latestPos.current.lng);
    const lonScale = METERS_PER_DEGREE * Math.cos(origin.lat * Math.PI / 180);

    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.1, 0.1),
      new THREE.MeshPhongMaterial({ color: voxel.color })
    );

    // Coordinate Math: Shared Global Grid
    mesh.position.set(
      (voxel.lon - origin.lng) * lonScale,
      voxel.alt,
      -(voxel.lat - origin.lat) * METERS_PER_DEGREE
    );
    
    sceneRef.current.add(mesh);
    voxelsMap.current.set(voxel.id, mesh);
  };

  // 2. COMPASS PERMISSION & ALIGNMENT
  const requestCompass = async () => {
    if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
      try {
        const permission = await (DeviceOrientationEvent as any).requestPermission();
        if (permission === 'granted') {
          window.addEventListener('deviceorientationabsolute', handleOrientation, true);
        }
      } catch (err) {
        console.error("Compass permission denied");
      }
    } else {
      window.addEventListener('deviceorientationabsolute', handleOrientation, true);
    }
  };

  const handleOrientation = (event: DeviceOrientationEvent) => {
    // webkitCompassHeading is iOS specific, alpha is Android
    const heading = (event as any).webkitCompassHeading || (360 - (event.alpha || 0));
    
    if (heading !== undefined && !isAligned.current) {
      // Rotate the scene so internal -Z points to Magnetic North
      const radians = THREE.MathUtils.degToRad(heading);
      sceneRef.current.rotation.y = -radians; 
      isAligned.current = true;
      console.log("📍 Scene aligned to North at:", heading, "degrees");
    }
  };

  // 3. GPS WATCHER
  useEffect(() => {
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        latestPos.current = { lat: pos.coords.latitude, lng: pos.coords.longitude, alt: pos.coords.altitude || 0 };
        setPosition(latestPos.current);
      },
      null, { enableHighAccuracy: true }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // 4. ENGINE SETUP
  useEffect(() => {
    if (!mountRef.current) return;

    const scene = sceneRef.current;
    const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.xr.enabled = true;
    renderer.setSize(window.innerWidth, window.innerHeight);
    mountRef.current.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xffffff, 0xbbbbff, 3));

    // Ghost Cube
    const ghost = new THREE.Mesh(
      new THREE.BoxGeometry(0.101, 0.101, 0.101),
      new THREE.MeshPhongMaterial({ color: 0x00ff00, transparent: true, opacity: 0.4 })
    );
    scene.add(ghost);
    ghostRef.current = ghost;

    // Controller (Placement)
    const controller = renderer.xr.getController(0);
    controller.addEventListener('select', async () => {
      if (!ghostRef.current || latestPos.current.lat === 0) return;

      const worldPos = new THREE.Vector3();
      ghostRef.current.getWorldPosition(worldPos);

      const origin = getGlobalOrigin(latestPos.current.lat, latestPos.current.lng);
      const lonScale = METERS_PER_DEGREE * Math.cos(origin.lat * Math.PI / 180);

      const newVoxel = {
        id: Math.random().toString(),
        lat: origin.lat - (worldPos.z / METERS_PER_DEGREE),
        lon: origin.lng + (worldPos.x / lonScale),
        alt: worldPos.y,
        color: Math.random()*0xffffff
      };

      addVoxelLocally(newVoxel);
      await supabase.from('voxels').insert([{
        lat: newVoxel.lat, lon: newVoxel.lon, alt: newVoxel.alt, color: newVoxel.color
      }]);
    });
    scene.add(controller);

    // Animation Loop
    renderer.setAnimationLoop(() => {
      if (renderer.xr.isPresenting) {
        camera.updateMatrixWorld();
        const targetPos = new THREE.Vector3(0, 0, Z_OFFSET).applyMatrix4(camera.matrixWorld);
        
        // Snapping relative to the North-aligned world
        ghostRef.current?.position.set(
          Math.round(targetPos.x / VOXEL_SNAP) * VOXEL_SNAP,
          Math.round(targetPos.y / VOXEL_SNAP) * VOXEL_SNAP,
          Math.round(targetPos.z / VOXEL_SNAP) * VOXEL_SNAP
        );
      }
      renderer.render(scene, camera);
    });

    document.body.appendChild(ARButton.createButton(renderer));
  }, []);

  // 5. REALTIME SYNC
  useEffect(() => {
    if (position.lat === 0) return;
    const fetchInitial = async () => {
      const { data } = await supabase.from('voxels').select('*');
      data?.forEach(addVoxelLocally);
    };
    const channel = supabase.channel('voxels_realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'voxels' }, 
      (payload) => addVoxelLocally(payload.new))
      .subscribe();
    fetchInitial();
    return () => { supabase.removeChannel(channel); };
  }, [position.lat]);

  return (
    <>
      <div className="fixed top-4 left-4 z-50 flex flex-col gap-2">
        <button 
          onClick={requestCompass}
          className="bg-white/90 text-black text-[10px] font-bold px-3 py-2 rounded shadow-lg pointer-events-auto"
        >
          {isAligned.current ? "✅ COMPASS ALIGNED" : "🧭 ALIGN TO NORTH"}
        </button>
      </div>
      <div ref={mountRef} className="fixed inset-0" />
    </>
  );
}