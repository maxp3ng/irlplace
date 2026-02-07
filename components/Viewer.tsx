'use client'

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { ARButton } from "three/addons/webxr/ARButton.js";
import { supabase } from '@/utils/supabase';

interface Voxel { id: string; lon: number; alt: number; lat: number; color: string; }

export default function Viewer({ selectedColor }: { selectedColor: { hex: string } }) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef(new THREE.Scene());
  const voxelsMap = useRef<Map<string, THREE.Mesh>>(new Map());
  
  // FIXED ORIGIN: This prevents the "sliding" effect
  const originGps = useRef<{lat: number, lng: number} | null>(null);
  const latestPos = useRef({ lat: 0, lng: 0 });

  const [voxels, setVoxels] = useState<Voxel[]>([]);
  const [position, setPosition] = useState({ lat: 0, lng: 0 });

  // 1. GPS WATCHER
  useEffect(() => {
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setPosition(coords);
        latestPos.current = coords;
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

  // 3. ENGINE SETUP
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

    // COMPASS ALIGNMENT: Attempt to align 3D Z-axis with North
    window.addEventListener('deviceorientationabsolute', (event) => {
      if (event.alpha !== null && !scene.userData.aligned) {
        scene.rotation.y = THREE.MathUtils.degToRad(event.alpha);
        scene.userData.aligned = true;
      }
    }, { once: true });

    const controller = renderer.xr.getController(0);
    controller.addEventListener('select', async () => {
      if (!originGps.current) return;

      tempMatrix.identity().extractRotation(controller.matrixWorld);
      raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
      raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

      const intersects = raycaster.intersectObjects(Array.from(voxelsMap.current.values()));

      if (intersects.length > 0) {
        const hitId = intersects[0].object.userData.dbId;
        await supabase.from('voxels').delete().eq('id', hitId);
      } else {
        const worldPos = new THREE.Vector3(0, 0, -0.3).applyMatrix4(controller.matrixWorld);
        const latScale = 111111;
        const lonScale = 111111 * Math.cos(originGps.current.lat * Math.PI / 180);
        
        // Calculate GPS based on distance from the FIXED origin
        const newLat = originGps.current.lat - (worldPos.z / latScale);
        const newLon = originGps.current.lng + (worldPos.x / lonScale);

        await supabase.from('voxels').insert([{
          lat: newLat, lon: newLon, alt: worldPos.y,
          color: "#"+selectedColor
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
    return () => { renderer.dispose(); button.remove(); };
  }, []);

  // 4. VOXEL SYNC (STABLE POSITIONING)
  useEffect(() => {
    const scene = sceneRef.current;
    if (position.lat === 0) return;

    // First valid GPS becomes the anchor for this session
    if (!originGps.current) {
      originGps.current = { ...position };
    }

    const geometry = new THREE.BoxGeometry(0.1, 0.1, 0.1);

    voxels.forEach((voxel) => {
      let mesh = voxelsMap.current.get(voxel.id);
      
      if (!mesh) {
        // Calculate position ONCE relative to the ORIGIN
        const z = -(voxel.lat - originGps.current!.lat) * 111111;
        const x = (voxel.lon - originGps.current!.lng) * (111111 * Math.cos(originGps.current!.lat * Math.PI / 180));

        mesh = new THREE.Mesh(geometry, new THREE.MeshPhongMaterial({ color: voxel.color }));
        mesh.userData.dbId = voxel.id;
        mesh.position.set(x, voxel.alt, z);
        
        scene.add(mesh);
        voxelsMap.current.set(voxel.id, mesh);
      }
    });

    const currentIds = new Set(voxels.map(v => v.id));
    voxelsMap.current.forEach((mesh, id) => {
      if (!currentIds.has(id)) {
        scene.remove(mesh);
        voxelsMap.current.delete(id);
          }
    });
  }, [voxels, position]);

  const handleRecenter = () => {
    // Reset origin to current GPS to fix drift
    originGps.current = { ...latestPos.current };
    // Clear and re-sync all meshes
    voxelsMap.current.forEach((mesh) => sceneRef.current.remove(mesh));
    voxelsMap.current.clear();
  };

  return (
    <>
      <div className="fixed top-4 left-4 z-50 flex flex-col gap-2">
        <div className="bg-black/60 p-2 text-white text-[10px] rounded backdrop-blur-md border border-white/10">
          GPS: {position.lat.toFixed(6)}, {position.lng.toFixed(6)}
        </div>
        <button 
          onClick={handleRecenter}
          className="bg-white text-black text-[10px] font-bold px-3 py-2 rounded-full shadow-lg active:scale-95 transition-transform"
        >
          RECENTER WORLD
        </button>
      </div>
      <div ref={mountRef} className="fixed inset-0" />
    </>
  );
}