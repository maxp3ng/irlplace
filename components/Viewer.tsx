'use client'

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { ARButton } from "three/addons/webxr/ARButton.js";
import { supabase } from '@/utils/supabase';

const GRID_SIZE = 0.001;
const METERS_PER_DEGREE = 111111;
const VOXEL_SNAP = 0.1;
const Z_OFFSET = -1.2;
const GOOGLE_CLIENT_ID = "793044353905-r0ahk1kn0ps2mu5vqgf7m47t6dm43eb3.apps.googleusercontent.com";

export default function GlobalARViewer() {

  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef(new THREE.Scene());
  const voxelsMap = useRef<Map<string, THREE.Mesh>>(new Map());
  const ghostRef = useRef<THREE.Mesh | null>(null);
  const isAligned = useRef(false);

  const [session, setSession] = useState<any>(null);
  const [authReady, setAuthReady] = useState(false);

  const [position, setPosition] = useState({ lat: 0, lng: 0, alt: 0 });
  const latestPos = useRef({ lat: 0, lng: 0, alt: 0 });

  // ---------------- HELPERS ----------------
  const getGlobalOrigin = (lat:number,lng:number)=>({
    lat: Math.floor(lat / GRID_SIZE) * GRID_SIZE,
    lng: Math.floor(lng / GRID_SIZE) * GRID_SIZE,
  });

  const addVoxelLocally = (voxel:any) => {
    if (voxelsMap.current.has(voxel.id)) return;

    const origin = getGlobalOrigin(latestPos.current.lat, latestPos.current.lng);
    const lonScale = METERS_PER_DEGREE * Math.cos(origin.lat * Math.PI/180);

    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.1,0.1,0.1),
      new THREE.MeshPhongMaterial({ color: voxel.color })
    );

    mesh.position.set(
      (voxel.lon - origin.lng) * lonScale,
      voxel.alt,
      -(voxel.lat - origin.lat) * METERS_PER_DEGREE
    );

    sceneRef.current.add(mesh);
    voxelsMap.current.set(voxel.id, mesh);
  };

  // ---------------- GOOGLE AUTH ----------------
  useEffect(()=>{
    const script=document.createElement("script");
    script.src="https://accounts.google.com/gsi/client";
    script.async=true;
    document.body.appendChild(script);

    const wait=setInterval(()=>{
      //@ts-ignore
      if(window.google?.accounts?.id){
        clearInterval(wait);

        //@ts-ignore
        window.google.accounts.id.initialize({
          client_id:GOOGLE_CLIENT_ID,
          callback:async(res:any)=>{
            const {data,error}=await supabase.auth.signInWithIdToken({
              provider:"google",
              token:res.credential
            });
            if(!error) setSession(data.session);
          },
          use_fedcm_for_prompt:true,
        });

        //@ts-ignore
        window.google.accounts.id.renderButton(
          document.getElementById("googleButton"),
          { theme:"outline", size:"large", text:"signin_with" }
        );

        setAuthReady(true);
      }
    },100);

    supabase.auth.getSession().then(({data})=>setSession(data.session));

    const {data:listener}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s));

    return ()=>{
      clearInterval(wait);
      listener.subscription.unsubscribe();
    }
  },[]);

  // ---------------- GEOLOCATION ----------------
  useEffect(()=>{
    const watchId=navigator.geolocation.watchPosition(pos=>{
      const coords={
        lat:pos.coords.latitude,
        lng:pos.coords.longitude,
        alt:pos.coords.altitude||0
      };
      latestPos.current=coords;
      setPosition(coords);
    },null,{enableHighAccuracy:true});

    return ()=>navigator.geolocation.clearWatch(watchId);
  },[]);

  // ---------------- COMPASS ----------------
  const requestCompass = async ()=>{
    const handleOrientation=(event:DeviceOrientationEvent)=>{
      const heading=(event as any).webkitCompassHeading||(360-(event.alpha||0));
      if(heading!==undefined&&!isAligned.current){
        sceneRef.current.rotation.y=-THREE.MathUtils.degToRad(heading);
        isAligned.current=true;
      }
    };

    if(typeof (DeviceOrientationEvent as any).requestPermission==="function"){
      const perm=await (DeviceOrientationEvent as any).requestPermission();
      if(perm==="granted"){
        window.addEventListener('deviceorientationabsolute',handleOrientation,true);
      }
    }else{
      window.addEventListener('deviceorientationabsolute',handleOrientation,true);
    }
  };

  // ---------------- THREE / AR ENGINE ----------------
  useEffect(()=>{
    if(!mountRef.current || !session) return;

    const scene=sceneRef.current;
    const camera=new THREE.PerspectiveCamera(70,window.innerWidth/window.innerHeight,0.01,1000);

    const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});
    renderer.xr.enabled=true;
    renderer.setSize(window.innerWidth,window.innerHeight);
    mountRef.current.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xffffff,0xbbbbff,3));

    // Ghost cube
    const ghost=new THREE.Mesh(
      new THREE.BoxGeometry(0.101,0.101,0.101),
      new THREE.MeshPhongMaterial({color:0x00ff00,transparent:true,opacity:0.4})
    );
    scene.add(ghost);
    ghostRef.current=ghost;

    // Controller placement
    const controller=renderer.xr.getController(0);
    controller.addEventListener('select',async()=>{
      if(!ghostRef.current) return;

      const worldPos=new THREE.Vector3();
      ghostRef.current.getWorldPosition(worldPos);

      const origin=getGlobalOrigin(latestPos.current.lat,latestPos.current.lng);
      const lonScale=METERS_PER_DEGREE*Math.cos(origin.lat*Math.PI/180);

      await supabase.from('voxels').insert([{
        lat: origin.lat-(worldPos.z/METERS_PER_DEGREE),
        lon: origin.lng+(worldPos.x/lonScale),
        alt: worldPos.y,
        color:"#"+new THREE.Color(Math.random()*0xffffff).getHexString(),
        user_id:session.user.id
      }]);
    });
    scene.add(controller);

    renderer.setAnimationLoop(()=>{
      if(renderer.xr.isPresenting && ghostRef.current){
        camera.updateMatrixWorld();
        const target=new THREE.Vector3(0,0,Z_OFFSET).applyMatrix4(camera.matrixWorld);

        ghostRef.current.position.set(
          Math.round(target.x/VOXEL_SNAP)*VOXEL_SNAP,
          Math.round(target.y/VOXEL_SNAP)*VOXEL_SNAP,
          Math.round(target.z/VOXEL_SNAP)*VOXEL_SNAP
        );
      }
      renderer.render(scene,camera);
    });

    const btn=ARButton.createButton(renderer);
    document.body.appendChild(btn);

    return ()=>{
      renderer.dispose();
      btn.remove();
    }

  },[session]);

  // ---------------- REALTIME SYNC ----------------
  useEffect(()=>{
    if(position.lat===0 || !session) return;

    const fetchInitial=async()=>{
      const {data}=await supabase.from('voxels').select('*');
      data?.forEach(addVoxelLocally);
    };

    const channel=supabase.channel('voxels_realtime')
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'voxels'},
      payload=>addVoxelLocally(payload.new))
      .subscribe();

    fetchInitial();
    return ()=>supabase.removeChannel(channel);
  },[position.lat,session]);

  // ---------------- LOGIN UI ----------------
  if(!session){
    return(
      <div className="fixed inset-0 flex items-center justify-center bg-black text-white">
        <div>
          <div id="googleButton"/>
          {!authReady && <p className="mt-2 text-sm opacity-70">Loading Google Sign-In…</p>}
        </div>
      </div>
    );
  }

  // ---------------- MAIN UI ----------------
  return(
    <>
      <div className="fixed top-4 left-4 z-50">
        <button
          onClick={requestCompass}
          className="bg-white/90 text-black text-[10px] font-bold px-3 py-2 rounded shadow-lg"
        >
          {isAligned.current ? "✅ COMPASS ALIGNED" : "🧭 ALIGN TO NORTH"}
        </button>
      </div>
      <div ref={mountRef} className="fixed inset-0"/>
    </>
  );
}
