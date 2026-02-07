'use client'

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { ARButton } from "three/addons/webxr/ARButton.js";
import { supabase } from '@/utils/supabase';

interface Voxel { id: string; lon: number|null; alt: number|null; lat: number|null; color: string; }

export default function Viewer() {
  const mountRef = useRef<HTMLDivElement | null>(null);

  const [step, setStep] = useState<'welcome' | 'permissions' | 'main'>('welcome');
  const [voxels, setVoxels] = useState<Voxel[]>([]);

  // --- GPS state ---
  const [position, setPosition] = useState({ lat: 0, lng: 0 });
  const [geoError, setGeoError] = useState<string | null>(null);

  // --- Continuous GPS update ---
  useEffect(() => {
    if (!navigator.geolocation) {
      setGeoError("Geolocation not supported");
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => setGeoError(err.message),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  const confirmPlacement = async () => {
    if (!position) return;
    const newVoxel = { lon: position.lng, alt: 0, lat: position.lat, color: "FFFFFF" };
    await supabase.from('voxels').insert([newVoxel]);
  };

  const removeVoxel = async (id: string) => {
    await supabase.from('voxels').delete().eq('id', id);
  };

  useEffect(() => {
    if (step !== 'main') return;

    const channel = supabase
      .channel('realtime_voxels')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'voxels' }, (p) => {
        setVoxels((prev) => [...prev, p.new as Voxel]);
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'voxels' }, (p) => {
        setVoxels((prev) => prev.filter(v => v.id !== p.old.id));
      })
      .subscribe();

    supabase.from('voxels').select('*').then(({ data }) => {
      if (data) setVoxels(data);
    });

    return () => { supabase.removeChannel(channel); };
  }, [step]);

  useEffect(() => {
    if (!mountRef.current) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.xr.enabled = true;
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    mountRef.current.appendChild(renderer.domElement);

    const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 3);
    light.position.set(0.5, 1, 0.25);
    scene.add(light);

    document.body.appendChild(
      ARButton.createButton(renderer, { requiredFeatures: ["hit-test"] })
    );

    const geometry = new THREE.BoxGeometry(0.1, 0.1, 0.1);

    const controller = renderer.xr.getController(0);
    controller.addEventListener("select", () => {
      const material = new THREE.MeshPhongMaterial({ color: 0xffffff * Math.random() });
      const mesh = new THREE.Mesh(geometry, material);

      mesh.position.set(0, 0, -0.3).applyMatrix4(controller.matrixWorld);

      mesh.position.x = Math.round(mesh.position.x);
      mesh.position.y = Math.round(mesh.position.y);
      mesh.position.z = Math.round(mesh.position.z);

      mesh.up.set(0, 1, 0);
      mesh.rotation.set(-Math.PI / 2, 0, 0);

      (mesh as any).gps = { ...position };

      confirmPlacement();

      scene.add(mesh);
    });
    scene.add(controller);

    function onWindowResize() {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    }
    window.addEventListener("resize", onWindowResize);

    // --- Animation loop ---
    renderer.setAnimationLoop(() => {

      renderer.render(scene, camera);
    });

    return () => {
      window.removeEventListener("resize", onWindowResize);
      renderer.dispose();
    };
  }, [position]);

  return (
    <>
      {geoError && <div style={{ color: "red" }}>{geoError}</div>}
      {position && (
        <div style={{ position: "absolute", top: 10, left: 10, color: "white", zIndex: 10 }}>
          Latitude: {position.lat.toFixed(6)}, Longitude: {position.lng.toFixed(6)}
        </div>
      )}
      <div ref={mountRef} style={{ width: "100%", height: "100%" }} />
    </>
  );
}
