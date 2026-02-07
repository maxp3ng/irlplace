"use client";

import React, { useState, useEffect, Suspense } from 'react';
import { Canvas } from "@react-three/fiber";
import { supabase } from '@/utils/supabase';
import { Box, OrbitControls, Grid } from "@react-three/drei";

interface Voxel {
  id: string;
  lon: number;
  alt: number;
  lat: number;
  color: string;
}

interface VoxelWorldProps {
  voxels: Voxel[];
  isPlacing: boolean;
  pixelPos: { x: number; y: number; z: number };
  selectedColor: { name: string; hex: string };
  onRemoveVoxel: (id: string) => void;
}

export function VoxelWorld({ voxels, isPlacing, pixelPos, selectedColor, onRemoveVoxel }: VoxelWorldProps) {
  return (
    <Canvas 
      camera={{ position: [10, 10, 10], fov: 45 }}
      onCreated={({ gl }) => gl.setClearColor('#050505')}
    >
      <Suspense fallback={null}>
        <ambientLight intensity={0.8} />
        <pointLight position={[10, 10, 10]} intensity={1} />
        
        {/* Voxel Rendering */}
        {voxels.map((v) => (
          <Box 
            key={v.id} 
            position={[v.lon, v.alt, v.lat]}
            onClick={(e) => {
              e.stopPropagation();
              onRemoveVoxel(v.id);
            }}
          >
            <meshStandardMaterial color={v.color} />
          </Box>
        ))}

        {/* Ghost Preview */}
        {isPlacing && (
          <Box position={[pixelPos.x, pixelPos.y, pixelPos.z]}>
            <meshStandardMaterial 
              color={selectedColor.hex} 
              transparent 
              opacity={0.6} 
              emissive={selectedColor.hex}
              emissiveIntensity={0.5}
            />
          </Box>
        )}

        {/* Grid System */}
        <Grid 
          infiniteGrid 
          fadeDistance={50} 
          cellColor="#333" 
          sectionColor="#555" 
          sectionSize={5} 
          cellSize={1}
        />

        <OrbitControls makeDefault rotateSpeed={0.5} zoomSpeed={0.5} />
      </Suspense>
      </Canvas>
  );
}