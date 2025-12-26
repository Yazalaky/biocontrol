import React, { useRef, useEffect, useState } from 'react';

interface Props {
  onEnd: (dataUrl: string | null) => void;
}

const SignaturePad: React.FC<Props> = ({ onEnd }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.width = canvas.parentElement?.clientWidth || 400;
      canvas.height = 160;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#000';
      }
    }
  }, []);

  const getPos = (e: any) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX || e.touches[0].clientX) - rect.left;
    const y = (e.clientY || e.touches[0].clientY) - rect.top;
    return { x, y };
  };

  const startDrawing = (e: any) => {
    e.preventDefault(); // Prevent scrolling on touch
    setIsDrawing(true);
    const { x, y } = getPos(e);
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) {
      ctx.beginPath();
      ctx.moveTo(x, y);
    }
  };

  const draw = (e: any) => {
    e.preventDefault();
    if (!isDrawing) return;
    const { x, y } = getPos(e);
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) {
      ctx.lineTo(x, y);
      ctx.stroke();
      if (!hasSignature) setHasSignature(true);
    }
  };

  const endDrawing = () => {
    if (isDrawing) {
      setIsDrawing(false);
      if (canvasRef.current) {
        onEnd(canvasRef.current.toDataURL());
      }
    }
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setHasSignature(false);
      onEnd(null);
    }
  };

  return (
    <div className="force-light border border-gray-300 rounded bg-white relative">
      <canvas
        ref={canvasRef}
        className="block touch-none cursor-crosshair"
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={endDrawing}
        onMouseLeave={endDrawing}
        onTouchStart={startDrawing}
        onTouchMove={draw}
        onTouchEnd={endDrawing}
      />
      <div className="absolute top-2 right-2">
        <button 
            type="button"
            onClick={clear}
            className="text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 px-2 py-1 rounded"
        >
            Borrar
        </button>
      </div>
      <div className="absolute bottom-1 left-2 pointer-events-none">
        <span className="text-[10px] text-gray-400">Firme aquí (Dedito o Mouse)</span>
      </div>
    </div>
  );
};

export default SignaturePad;
