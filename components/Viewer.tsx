'use client'

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { ARButton } from "three/addons/webxr/ARButton.js";
import { supabase } from '@/utils/supabase';

const GRID_SIZE = 0.001; 
const METERS_PER_DEGREE = 111111;
const VOXEL_SNAP = 0.1; // 10cm snapping
const GOOGLE_CLIENT_ID = "793044353905-r0ahk1kn0ps2mu5vqgf7m47t6dm43eb3.apps.googleusercontent.com";

export default function GlobalARViewer() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef(new THREE.Scene());
  const voxelsMap = useRef<Map<string, THREE.Mesh>>(new Map());
  const ghostRef = useRef<THREE.Mesh | null>(null);

  const [session, setSession] = useState<any>(null);
  const [authReady, setAuthReady] = useState(false);
  
  const [position, setPosition] = useState({ lat: 0, lng: 0, alt: 0 });
  const latestPos = useRef({ lat: 0, lng: 0, alt: 0 });

  const getGlobalOrigin = (lat: number, lng: number) => ({
    lat: Math.floor(lat / GRID_SIZE) * GRID_SIZE,
    lng: Math.floor(lng / GRID_SIZE) * GRID_SIZE,
  });

  // ---------------- GOOGLE AUTH (PRODUCTION SAFE) ----------------
  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);

    const wait = setInterval(() => {
      // @ts-ignore
      if (window.google?.accounts?.id) {
        clearInterval(wait);

        // @ts-ignore
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: async (response: any) => {
            const { data, error } = await supabase.auth.signInWithIdToken({
              provider: "google",
              token: response.credential,
            });
            if (!error) setSession(data.session);
          },
          auto_select: false,
          cancel_on_tap_outside: true,
          use_fedcm_for_prompt: true,
        });

        // @ts-ignore
        window.google.accounts.id.renderButton(
          document.getElementById("googleButton"),
          { theme: "outline", size: "large", text: "signin_with" }
        );

        setAuthReady(true);
      }
    }, 100);

    return () => clearInterval(wait);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  // ---------------- GEOLOCATION ----------------
  useEffect(() => {
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude, alt: pos.coords.altitude || 0 };
        setPosition(coords);
        latestPos.current = coords;
      },
      null,
      { enableHighAccuracy: true }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // ---------------- THREE / AR SETUP ----------------
  useEffect(() => {
    if (!mountRef.current || !session) return;

    const scene = sceneRef.current;
    const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.xr.enabled = true;
    renderer.setSize(window.innerWidth, window.innerHeight);
    mountRef.current.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xffffff, 0xbbbbff, 3));

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

    window.addEventListener('deviceorientationabsolute', (event: any) => {
      if (event.alpha !== null && !scene.userData.aligned) {
        scene.rotation.y = THREE.MathUtils.degToRad(event.alpha);
        scene.userData.aligned = true;
      }
    }, { once: true });

    const controller = renderer.xr.getController(0);
    controller.addEventListener('select', async () => {
      if (!session) return;
      if (latestPos.current.lat === 0 || !ghostRef.current) return;

      const worldPos = ghostRef.current.position;
      const origin = getGlobalOrigin(latestPos.current.lat, latestPos.current.lng);
      const lonScale = METERS_PER_DEGREE * Math.cos(origin.lat * Math.PI / 180);

      const newLat = origin.lat - (worldPos.z / METERS_PER_DEGREE);
      const newLon = origin.lng + (worldPos.x / lonScale);

      await supabase.from('voxels').insert([{
        lat: newLat,
        lon: newLon,
        alt: worldPos.y,
        color: "#" + new THREE.Color(Math.random() * 0xffffff).getHexString(),
        user_id: session.user.id
      }]);
    });
    scene.add(controller);

    const Z_OFFSET = 1.5;

    renderer.setAnimationLoop(() => {
      if (renderer.xr.isPresenting && ghostRef.current) {
        const targetPos = new THREE.Vector3(0, 0, Z_OFFSET).applyMatrix4(camera.matrixWorld);
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
  }, [session]);

  // ---------------- VOXEL SYNC ----------------
  useEffect(() => {
    if (position.lat === 0 || !session) return;
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
  }, [position.lat, session]);

  if (!session) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-black text-white">
        <div>
          <div id="googleButton" />
          {!authReady && <p className="mt-2 text-sm opacity-70">Loading Google Sign‑In…</p>}
        </div>
      </div>
    );
  }

  return <div ref={mountRef} className="fixed inset-0" />;
}
