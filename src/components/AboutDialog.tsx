import { X } from "lucide-react";

interface AboutDialogProps {
  onClose: () => void;
}

export const AboutDialog = ({ onClose }: AboutDialogProps) => {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="win95-window w-full max-w-md max-h-[80vh] flex flex-col">
        <div className="win95-titlebar">
          <span className="text-sm font-bold">About Dither Yuki</span>
          <button 
            onClick={onClose}
            className="bg-card px-2 text-xs border border-win95-light hover:bg-muted"
          >
            <X size={12} />
          </button>
        </div>
        <div className="p-6 space-y-4 flex-1 overflow-y-auto">
          <div className="text-center space-y-2">
            <img src="/dithered_1761731869443.png" alt="Dithertone Yuki" className="w-24 h-24 mx-auto" />
            <h2 className="text-2xl font-bold">Dither Yuki</h2>
            <p className="text-sm text-muted-foreground">Version 1.0.0</p>
            <p className="text-xs text-muted-foreground">Developer: L'eco di Bergamo¹</p>
          </div>
          
          <div className="space-y-2 text-sm">
            <p>Professional dithering and image processing tool with retro aesthetics.</p>
            
            <div className="pt-4 border-t-2 border-win95-dark">
              <p className="font-bold mb-2">Features:</p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li>Multiple dithering algorithms</li>
                <li>Custom palette editor</li>
                <li>Real-time preview</li>
                <li>Advanced image adjustments</li>
                <li>Preset management</li>
              </ul>
            </div>

            <div className="pt-4 border-t-2 border-win95-dark">
              <p className="font-bold mb-2">License (FCL 1.0):</p>
              <div className="text-xs text-muted-foreground space-y-2 p-2 bg-win95-light">
                <p>Copyright (c) 2025 Dither Yuki</p>
                <p>1. <span className="font-semibold">Permission</span><br/>
                This software is provided free of charge for artists, designers, illustrators, indie developers, non-profit organizations, and small businesses (with fewer than 50 employees or annual revenue under €1,000,000).
                These users are granted permission to use, copy, modify, and distribute this software, including for commercial purposes, under the following conditions.</p>
                
                <p>2. <span className="font-semibold">Corporate Restriction</span><br/>
                Large corporations, defined as entities with more than 50 employees or annual revenue exceeding €1,000,000, are not permitted to use, modify, integrate, or distribute this software without the explicit written consent of the author.</p>
                
                <p>3. <span className="font-semibold">Attribution</span><br/>
                All copies or substantial portions of the software must include this copyright notice and a link to the original project.</p>
                
                <p>4. <span className="font-semibold">Warranty Disclaimer</span><br/>
                THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
                IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY CLAIM, DAMAGES, OR OTHER LIABILITY ARISING FROM THE USE OR DISTRIBUTION OF THE SOFTWARE.</p>
              </div>
            </div>
          </div>
          
          <div className="pt-4">
            <button onClick={onClose} className="win95-button w-full">
              OK
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
