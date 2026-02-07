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
  
  const originGps = useRef<{lat: number, lng: number, alt: number} | null>(null);
  const latestPos = useRef({ lat: 0, lng: 0, alt: 0 });

  const [voxels, setVoxels] = useState<Voxel[]>([]);
  const [position, setPosition] = useState({ lat: 0, lng: 0, alt: 0 });

  // 1. GPS WATCHER
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

  // 3. ENGINE & HIT-TEST SETUP
  useEffect(() => {
    if (!mountRef.current) return;

    const scene = sceneRef.current;
    const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.xr.enabled = true;
    renderer.setSize(window.innerWidth, window.innerHeight);
    mountRef.current.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xffffff, 0xbbbbff, 3));

    // --- HIT TEST & RETICLE ASSETS ---
    const reticleGeometry = new THREE.RingGeometry(0.04, 0.05, 32).rotateX(-Math.PI / 2);
    const reticle = new THREE.Mesh(reticleGeometry, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    reticle.matrixAutoUpdate = false;
    reticle.visible = false;
    scene.add(reticle);

    let hitTestSource: XRHitTestSource | null = null;
    let hitTestSourceRequested = false;

    // Compass Alignment
    window.addEventListener('deviceorientationabsolute', (event) => {
      if (event.alpha !== null && !scene.userData.aligned) {
        scene.rotation.y = THREE.MathUtils.degToRad(event.alpha);
        scene.userData.aligned = true;
      }
    }, { once: true });

    // --- INTERACTION ---
    const controller = renderer.xr.getController(0);
    controller.addEventListener('select', async () => {
      if (!reticle.visible || !originGps.current) return;

      // Use the Reticle's actual floor position
      const worldPos = new THREE.Vector3().setFromMatrixPosition(reticle.matrix);
      
      const latScale = 111111;
      const lonScale = 111111 * Math.cos(originGps.current.lat * Math.PI / 180);
      
      const newLat = originGps.current.lat - (worldPos.z / latScale);
      const newLon = originGps.current.lng + (worldPos.x / lonScale);
      const newAlt = originGps.current.alt + worldPos.y;

      await supabase.from('voxels').insert([{
        lat: newLat, lon: newLon, alt: newAlt,
        color: "#" + new THREE.Color(Math.random() * 0xffffff).getHexString()
      }]);
    });
    scene.add(controller);

    // --- ANIMATION LOOP ---
    renderer.setAnimationLoop((time, frame) => {
      if (frame) {
        const session = renderer.xr.getSession();
        if (session && !hitTestSourceRequested) {
          session.requestReferenceSpace('viewer').then((refSpace) => {
            session.requestHitTestSource?.({ space: refSpace })?.then((source) => {
              hitTestSource = source;
            });
          });
          hitTestSourceRequested = true;
        }

        if (hitTestSource) {
          const referenceSpace = renderer.xr.getReferenceSpace();
          const hitTestResults = frame.getHitTestResults(hitTestSource);
          if (hitTestResults.length > 0 && referenceSpace) {
            const hit = hitTestResults[0];
            const pose = hit.getPose(referenceSpace);
            if (pose) {
              reticle.visible = true;
              reticle.matrix.fromArray(pose.transform.matrix);
            }
          } else {
            reticle.visible = false;
          }
        }
      }
      renderer.render(scene, camera);
    });

    const button = ARButton.createButton(renderer, { 
      requiredFeatures: ["hit-test"], 
      optionalFeatures: ["dom-overlay"],
      domOverlay: { root: document.body } 
    });
    document.body.appendChild(button);

    return () => { renderer.dispose(); button.remove(); };
  }, []);

  // 4. VOXEL SYNC
  useEffect(() => {
    const scene = sceneRef.current;
    if (position.lat === 0) return;
    if (!originGps.current) originGps.current = { ...position };

    const geometry = new THREE.BoxGeometry(0.1, 0.1, 0.1);

    voxels.forEach((voxel) => {
      let mesh = voxelsMap.current.get(voxel.id);
      if (!mesh) {
        const z = -(voxel.lat - originGps.current!.lat) * 111111;
        const x = (voxel.lon - originGps.current!.lng) * (111111 * Math.cos(originGps.current!.lat * Math.PI / 180));
        const y = voxel.alt - originGps.current!.alt;

        mesh = new THREE.Mesh(geometry, new THREE.MeshPhongMaterial({ color: voxel.color }));
        mesh.userData.dbId = voxel.id;
        mesh.position.set(x, y + 0.05, z); // Offset by 0.05 so box sits ON the floor, not in it
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

  return (
    <>
      <div className="fixed top-4 left-4 z-50 flex flex-col gap-2 pointer-events-none">
        <div className="bg-black/60 p-2 text-white text-[10px] rounded backdrop-blur-md border border-white/10">
          GPS: {position.lat.toFixed(6)}, {position.lng.toFixed(6)} | Alt: {position.alt.toFixed(1)}m
        </div>
        <button 
          onClick={() => {
            originGps.current = { ...latestPos.current };
            voxelsMap.current.forEach(m => sceneRef.current.remove(m));
            voxelsMap.current.clear();
          }}
          className="bg-white text-black text-[10px] font-bold px-3 py-2 rounded-full shadow-lg pointer-events-auto active:scale-95"
        >
          RECENTER WORLD
        </button>
      </div>
      <div ref={mountRef} className="fixed inset-0" />
    </>
  );
}