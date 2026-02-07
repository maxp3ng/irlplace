'use client'

import { useEffect, useState } from "react";
import { supabase } from "@/utils/supabase";

interface Props {
  session: any;
  onCaptureScreenshot: () => void;
}

export default function Gallery({ session, onCaptureScreenshot }: Props) {
  const [gallery, setGallery] = useState<any[]>([]);

  useEffect(() => {
    const loadGallery = async () => {
      const { data } = await supabase.from('gallery')
        .select('*')
        .order('created_at', { ascending: false });
      setGallery(data || []);
    };
    loadGallery();
  }, []);

  return (
    <div className="flex flex-col gap-2">
      <button 
        onClick={onCaptureScreenshot} 
        className="px-2 py-1 rounded-full bg-blue-500 text-white text-[12px] font-bold shadow"
      >
        Capture Screenshot
      </button>

      <div className="grid grid-cols-2 gap-2 mt-2 max-h-[300px] overflow-y-auto">
        {gallery.map(img => (
          <img key={img.id} src={img.image_url} className="w-full h-20 object-cover rounded-md" />
        ))}
      </div>
    </div>
  );
}

