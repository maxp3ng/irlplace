'use client'

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { ARButton } from "three/addons/webxr/ARButton.js";
import { supabase } from '@/utils/supabase';

// 1. GLOBAL CONSTANTS
const GRID_SIZE = 0.001; // ~111 meters.
const METERS_PER_DEGREE = 111111;

export default function GlobalARViewer() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef(new THREE.Scene());
  const voxelsMap = useRef<Map<string, THREE.Mesh>>(new Map());
  
  // Track location and compass
  const [position, setPosition] = useState({ lat: 0, lng: 0, alt: 0 });
  const latestPos = useRef({ lat: 0, lng: 0, alt: 0 });

  // 2. SHARED GRID LOGIC
  const getGlobalOrigin = (lat: number, lng: number) => ({
    lat: Math.floor(lat / GRID_SIZE) * GRID_SIZE,
    lng: Math.floor(lng / GRID_SIZE) * GRID_SIZE,
  });

  // 3. GPS WATCHER
  useEffect(() => {
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const coords = { 
          lat: pos.coords.latitude, 
          lng: pos.coords.longitude, 
          alt: pos.coords.altitude || 0 
        };
        setPosition(coords);
        latestPos.current = coords;
      },
      null, { enableHighAccuracy: true }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // 4. MAIN ENGINE SETUP
  useEffect(() => {
    if (!mountRef.current) return;

    const scene = sceneRef.current;
    const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.xr.enabled = true;
    renderer.setSize(window.innerWidth, window.innerHeight);
    mountRef.current.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xffffff, 0xbbbbff, 3));

    // --- COMPASS ALIGNMENT ---
    // Rotates the whole world so Z-axis is North
    window.addEventListener('deviceorientationabsolute', (event) => {
      if (event.alpha !== null && !scene.userData.aligned) {
        scene.rotation.y = THREE.MathUtils.degToRad(event.alpha);
        scene.userData.aligned = true;
      }
    }, { once: true });

    // --- HIT TEST ASSETS ---
    const reticle = new THREE.Mesh(
      new THREE.RingGeometry(0.04, 0.05, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    reticle.matrixAutoUpdate = false;
    reticle.visible = false;
    scene.add(reticle);

    let hitTestSource: XRHitTestSource | null = null;
    let hitTestSourceRequested = false;

    // --- PLACEMENT LOGIC ---
    const controller = renderer.xr.getController(0);
    controller.addEventListener('select', async () => {
      if (!reticle.visible || latestPos.current.lat === 0) return;

      const worldPos = new THREE.Vector3().setFromMatrixPosition(reticle.matrix);
      const origin = getGlobalOrigin(latestPos.current.lat, latestPos.current.lng);
      const lonScale = METERS_PER_DEGREE * Math.cos(origin.lat * Math.PI / 180);

      // Convert local offset to global GPS coordinate
      const newLat = origin.lat - (worldPos.z / METERS_PER_DEGREE);
      const newLon = origin.lng + (worldPos.x / lonScale);

      await supabase.from('voxels').insert([{
        lat: newLat, 
        lon: newLon, 
        alt: worldPos.y, // Relative to start floor height
        color: "#" + new THREE.Color(Math.random() * 0xffffff).getHexString()
      }]);
    });
    scene.add(controller);

    // --- ANIMATION LOOP ---
    renderer.setAnimationLoop((time, frame) => {
      if (frame) {
        const session = renderer.xr.getSession();
        
        if (session && !hitTestSourceRequested) {
          session.requestReferenceSpace('viewer').then((vSpace) => {
            // @ts-ignore
            session.requestHitTestSource?.({ space: vSpace })?.then((source) => {
              hitTestSource = source;
            });
          });
          hitTestSourceRequested = true;
        }

        const localSpace = renderer.xr.getReferenceSpace();
        if (hitTestSource && localSpace) {
          const hitResults = frame.getHitTestResults(hitTestSource);
          if (hitResults.length > 0) {
            const pose = hitResults[0].getPose(localSpace);
            if (pose) {
              reticle.visible = true;
              reticle.matrix.fromArray(pose.transform.matrix as unknown as number[]);
            }
          } else {
            reticle.visible = false;
          }
        }
      }
      renderer.render(scene, camera);
    });

    const button = ARButton.createButton(renderer, { 
      requiredFeatures: ['hit-test'],
      optionalFeatures: ['dom-overlay'],
      domOverlay: { root: document.body }
    });
    document.body.appendChild(button);

    return () => {
      renderer.dispose();
      button.remove();
    };
  }, []);

  // 5. VOXEL SYNC & REALTIME
  useEffect(() => {
    if (position.lat === 0) return;

    const origin = getGlobalOrigin(position.lat, position.lng);
    const lonScale = METERS_PER_DEGREE * Math.cos(origin.lat * Math.PI / 180);
    const geometry = new THREE.BoxGeometry(0.1, 0.1, 0.1);

    const syncVoxels = async () => {
      const { data } = await supabase.from('voxels').select('*');
      if (!data) return;

      // Add new ones
      data.forEach((voxel) => {
        if (!voxelsMap.current.has(voxel.id)) {
          const mesh = new THREE.Mesh(
            geometry,
            new THREE.MeshPhongMaterial({ color: voxel.color })
          );
          
          const z = -(voxel.lat - origin.lat) * METERS_PER_DEGREE;
          const x = (voxel.lon - origin.lng) * lonScale;
          
          mesh.position.set(x, voxel.alt + 0.05, z); // 0.05 offset to sit on floor
          mesh.userData.dbId = voxel.id;
          sceneRef.current.add(mesh);
          voxelsMap.current.set(voxel.id, mesh);
        }
      });

      // Cleanup deleted ones
      const currentIds = new Set(data.map(v => v.id));
      voxelsMap.current.forEach((mesh, id) => {
        if (!currentIds.has(id)) {
          sceneRef.current.remove(mesh);
          voxelsMap.current.delete(id);
        }
      });
    };

    const channel = supabase.channel('global_voxels')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'voxels' }, syncVoxels)
      .subscribe();

    syncVoxels();
    return () => { supabase.removeChannel(channel); };
  }, [position.lat]); // Re-sync if we cross into a new 111m grid tile

  return (
    <>
      <div className="fixed top-4 left-4 z-50 pointer-events-none">
        <div className="bg-black/60 p-2 text-white text-[10px] rounded backdrop-blur-md border border-white/10 font-mono">
          GRID ORIGIN: {getGlobalOrigin(position.lat, position.lng).lat.toFixed(3)}, {getGlobalOrigin(position.lat, position.lng).lng.toFixed(3)}<br/>
          GPS PRECISION: ± HIGH
        </div>
      </div>
      <div ref={mountRef} className="fixed inset-0" />
    </>
  );
}