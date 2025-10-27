import { useState, useRef, useEffect } from "react";
import { Window } from "@/components/Window";
import { MenuBar } from "@/components/MenuBar";
import { Toolbar } from "@/components/Toolbar";
import { ControlPanel } from "@/components/ControlPanel";
import { PreviewPanel } from "@/components/PreviewPanel";
import { StatusBar } from "@/components/StatusBar";
import { PaletteEditor } from "@/components/PaletteEditor";
import { AboutDialog } from "@/components/AboutDialog";
import { ShortcutsDialog } from "@/components/ShortcutsDialog";
import { PresetManager } from "@/components/PresetManager";
import { applyDithering, adjustImage, applyPixelScale, applyBlur, applySharpness, applyNoise, setCustomPalette, DitheringAlgorithm, ColorPalette } from "@/utils/dithering";
import { toast } from "sonner";

const Index = () => {
  const [algorithm, setAlgorithm] = useState<DitheringAlgorithm>("Floyd-Steinberg");
  const [palette, setPalette] = useState<ColorPalette>("Grayscale");
  const [intensity, setIntensity] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [brightness, setBrightness] = useState(100);
  const [saturation, setSaturation] = useState(100);
  const [pixelSize, setPixelSize] = useState(1);
  const [blur, setBlur] = useState(0);
  const [sharpness, setSharpness] = useState(0);
  const [noise, setNoise] = useState(0);
  const [status, setStatus] = useState("Ready");
  const [imageSize, setImageSize] = useState<string>();
  const [originalImage, setOriginalImage] = useState<HTMLImageElement | null>(null);
  const [processedImage, setProcessedImage] = useState<HTMLImageElement | null>(null);
  const [showOriginal, setShowOriginal] = useState(true);
  const [showPaletteEditor, setShowPaletteEditor] = useState(false);
  const [customColors, setCustomColors] = useState<string[]>(["#000000", "#FFFFFF"]);
  const [showAbout, setShowAbout] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showPresetManager, setShowPresetManager] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-apply filter when any parameter changes
  useEffect(() => {
    if (originalImage) {
      handleApplyFilter();
    }
  }, [algorithm, palette, intensity, contrast, brightness, saturation, pixelSize, blur, sharpness, noise]);

  

  const handleOpenFile = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        setOriginalImage(img);
        setProcessedImage(null);
        setImageSize(`${img.width}×${img.height}`);
        setStatus("Image loaded");
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleApplyFilter = () => {
    if (!originalImage) {
      toast.error("Please load an image first!");
      return;
    }

    setStatus("Processing...");
    
    setTimeout(() => {
      try {
        // Create canvas for processing
        const canvas = document.createElement('canvas');
        canvas.width = originalImage.width;
        canvas.height = originalImage.height;
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
          toast.error("Failed to create canvas context");
          return;
        }

        // Draw original image
        ctx.drawImage(originalImage, 0, 0);
        
        // Get image data
        let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        
        // Apply blur
        if (blur > 0) {
          imageData = applyBlur(imageData, blur);
        }
        
        // Apply adjustments
        imageData = adjustImage(imageData, contrast, brightness, saturation);
        
        // Apply sharpness
        if (sharpness > 0) {
          imageData = applySharpness(imageData, sharpness);
        }
        
        // Apply noise
        if (noise > 0) {
          imageData = applyNoise(imageData, noise);
        }
        
        // Apply pixel scale
        if (pixelSize > 1) {
          imageData = applyPixelScale(imageData, pixelSize);
          canvas.width = imageData.width;
          canvas.height = imageData.height;
        }
        
        // Apply dithering
        imageData = applyDithering(imageData, algorithm, palette, intensity);
        
        // Put processed data back
        ctx.putImageData(imageData, 0, 0);
        
        // Create processed image
        const processedImg = new Image();
        processedImg.onload = () => {
          setProcessedImage(processedImg);
          setShowOriginal(false);
          setStatus("Ready");
        };
        processedImg.src = canvas.toDataURL();
      } catch (error) {
        console.error("Error applying filter:", error);
        toast.error("Failed to apply filter");
        setStatus("Error");
      }
    }, 100);
  };

  const handleReset = () => {
    setProcessedImage(null);
    setShowOriginal(true);
    setIntensity(100);
    setContrast(100);
    setBrightness(100);
    setSaturation(100);
    setPixelSize(1);
    setBlur(0);
    setSharpness(0);
    setNoise(0);
    setStatus("Ready");
  };

  const handleSave = () => {
    const imageToSave = processedImage || originalImage;
    if (!imageToSave) {
      toast.error("No image to save!");
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = imageToSave.width;
    canvas.height = imageToSave.height;
    const ctx = canvas.getContext('2d');
    
    if (ctx) {
      ctx.drawImage(imageToSave, 0, 0);
      canvas.toBlob((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `dithered_${Date.now()}.png`;
          a.click();
          URL.revokeObjectURL(url);
        }
      });
    }
  };

  const handleExport = handleSave;

  const handleLoadPreset = (preset: any) => {
    setAlgorithm(preset.settings.algorithm);
    setPalette(preset.settings.palette);
    setIntensity(preset.settings.intensity);
    setContrast(preset.settings.contrast);
    setBrightness(preset.settings.brightness);
    setSaturation(preset.settings.saturation);
    setPixelSize(preset.settings.pixelSize);
    setBlur(preset.settings.blur);
    setSharpness(preset.settings.sharpness);
    setNoise(preset.settings.noise);
  };

  const handleSavePalette = (colors: string[]) => {
    setCustomColors(colors);
    setCustomPalette(colors);
    setPalette("Custom");
    setShowPaletteEditor(false);
  };

  // Global keyboard shortcuts (Photoshop-like)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toLowerCase().includes("mac");
      const mod = isMac ? e.metaKey : e.ctrlKey;
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || (e.target as HTMLElement)?.isContentEditable) return;

      if (mod && (e.key === 'o' || e.key === 'O')) {
        e.preventDefault();
        handleOpenFile();
      } else if (mod && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        handleSave();
      } else if (mod && (e.key === 'e' || e.key === 'E')) {
        e.preventDefault();
        handleExport();
      } else if (mod && (e.key === 'r' || e.key === 'R')) {
        e.preventDefault();
        handleReset();
      } else if (mod && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        setShowPaletteEditor(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleSave, handleExport]);

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <MenuBar 
          onOpenFile={handleOpenFile}
          onSaveImage={handleSave}
          onExport={handleExport}
          onReset={handleReset}
          onShowAbout={() => setShowAbout(true)}
          onShowShortcuts={() => setShowShortcuts(true)}
          onSavePreset={() => setShowPresetManager(true)}
          onLoadPreset={() => setShowPresetManager(true)}
          onManagePresets={() => setShowPresetManager(true)}
        />
        <Toolbar
          onOpenFile={handleOpenFile}
          onSaveImage={handleSave}
          onExport={handleExport}
        />
        
        <div className="flex gap-2 p-2 flex-1 overflow-hidden">
          {/* Left Panel - Controls */}
          <div className="w-64 flex-shrink-0 overflow-y-auto">
            <ControlPanel
              algorithm={algorithm}
              setAlgorithm={setAlgorithm as (value: string) => void}
              palette={palette}
              setPalette={setPalette as (value: string) => void}
              intensity={intensity}
              setIntensity={setIntensity}
              contrast={contrast}
              setContrast={setContrast}
              brightness={brightness}
              setBrightness={setBrightness}
              saturation={saturation}
              setSaturation={setSaturation}
              pixelSize={pixelSize}
              setPixelSize={setPixelSize}
              blur={blur}
              setBlur={setBlur}
              sharpness={sharpness}
              setSharpness={setSharpness}
              noise={noise}
              setNoise={setNoise}
              onReset={handleReset}
              onEditPalette={() => setShowPaletteEditor(true)}
            />
          </div>

          {/* Right Panel - Preview */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <PreviewPanel
              originalImage={originalImage}
              processedImage={processedImage}
              showOriginal={showOriginal}
              setShowOriginal={setShowOriginal}
            />
          </div>
        </div>

        <StatusBar status={status} imageSize={imageSize} />
      </div>
      
      {showPaletteEditor && (
        <PaletteEditor
          initialColors={customColors}
          onSave={handleSavePalette}
          onClose={() => setShowPaletteEditor(false)}
        />
      )}
      
      {showAbout && <AboutDialog onClose={() => setShowAbout(false)} />}
      
      {showShortcuts && <ShortcutsDialog onClose={() => setShowShortcuts(false)} />}
      
      {showPresetManager && (
        <PresetManager
          currentSettings={{
            algorithm,
            palette,
            intensity,
            contrast,
            brightness,
            saturation,
            pixelSize,
            blur,
            sharpness,
            noise,
          }}
          onClose={() => setShowPresetManager(false)}
          onLoadPreset={handleLoadPreset}
        />
      )}
    </div>
  );
};

export default Index;
