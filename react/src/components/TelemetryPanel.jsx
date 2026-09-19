import React, { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import WebcamTelemetry from './WebcamTelemetry';

const TelemetryPanel = forwardRef(({
  active = true,
  voiceTelemetry = null,
  onTelemetryChange = null,
  onReady = null,
  onError = null
}, ref) => {
  const [telemetry, setTelemetry] = useState(null);
  const [nowTimestamp, setNowTimestamp] = useState(Date.now());
  const webcamRef = useRef(null);
  const lastUIUpdateRef = useRef(0);

  useImperativeHandle(ref, () => ({
    stop: () => webcamRef.current?.stop()
  }));

  useEffect(() => {
    const timer = setInterval(() => {
      setNowTimestamp(Date.now());
    }, 500);
    return () => clearInterval(timer);
  }, []);

  const handleTelemetryUpdate = useCallback((data) => {
    const now = Date.now();

    if (onTelemetryChange) {
      onTelemetryChange(data);
    }

    if (now - lastUIUpdateRef.current >= 100) {
      lastUIUpdateRef.current = now;
      setTelemetry(data);
    }
  }, [onTelemetryChange]);

  const isFaceDetected = Boolean(
    telemetry && telemetry.timestamp && (nowTimestamp - telemetry.timestamp < 1500)
  );

  const expressionText = isFaceDetected && telemetry.expression ? telemetry.expression : 'Menunggu wajah...';
  
  const confidencePercent = isFaceDetected && typeof telemetry.confidence === 'number'
    ? `${Math.round(telemetry.confidence * 100)}%`
    : '-';

  const tensionPercent = isFaceDetected && typeof telemetry.facialTension === 'number'
    ? `${Math.round(telemetry.facialTension * 100)}%`
    : '0%';

  const gazeText = isFaceDetected && telemetry.gaze ? telemetry.gaze : 'Tidak Terdeteksi';

  return (
    <div className="w-full flex flex-col space-y-3">
      <div className="relative w-full aspect-video bg-black rounded-2xl overflow-hidden shadow-sm border border-gray-200">
        <WebcamTelemetry
          ref={webcamRef}
          active={active}
          onTelemetryUpdate={handleTelemetryUpdate}
          onReady={onReady}
          onError={onError}
        />
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <div className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-gray-400 tracking-wider uppercase">
              EKSPRESI WAJAH
            </span>
            <span className={`w-2 h-2 rounded-full ${isFaceDetected ? 'bg-emerald-500 animate-pulse' : 'bg-gray-300'}`} />
          </div>
          <div className="my-1.5">
            <p className="text-xs font-bold text-gray-800 truncate" title={expressionText}>
              {expressionText}
            </p>
          </div>
          <p className="text-[10px] text-gray-500 font-medium">
            Confidence: <span className="font-semibold text-gray-700">{confidencePercent}</span>
          </p>
        </div>

        <div className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-gray-400 tracking-wider uppercase">
              KETEGANGAN WAJAH
            </span>
            <span className="text-[10px] text-gray-400">Otot</span>
          </div>
          <div className="my-1 flex items-baseline space-x-1">
            <span className="text-xl font-extrabold text-gray-900">
              {tensionPercent}
            </span>
          </div>
          <p className="text-[10px] text-gray-500 font-medium">
            Facial Tension
          </p>
        </div>

        <div className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-gray-400 tracking-wider uppercase">
              PANDANGAN
            </span>
            <span className="text-[10px] text-gray-400">Gaze</span>
          </div>
          <div className="my-1.5">
            <p className="text-xs font-bold text-gray-800 truncate">
              {gazeText}
            </p>
          </div>
          <p className="text-[10px] text-gray-500 font-medium">
            Arah Mata
          </p>
        </div>

        <div className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-gray-400 tracking-wider uppercase">
              NADA SUARA
            </span>
            <span className="text-[10px] text-gray-400">Audio</span>
          </div>
          <div className="my-1.5">
            <p className="text-xs font-bold text-gray-800 truncate">
              {voiceTelemetry?.volumeLabel || 'Normal / Stabil'}
            </p>
          </div>
          <p className="text-[10px] text-gray-500 font-medium truncate">
            {voiceTelemetry?.energy ? `Energi: ${voiceTelemetry.energy}%` : 'Voice Telemetry'}
          </p>
        </div>
      </div>
    </div>
  );
});

export default TelemetryPanel;
