import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

const MEDIAPIPE_SCRIPTS = [
  'https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js',
  'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js',
];

let scriptsLoadingPromise = null;

function loadMediaPipeScripts() {
  if (window.FaceMesh && window.Camera) return Promise.resolve();
  if (scriptsLoadingPromise) return scriptsLoadingPromise;

  scriptsLoadingPromise = Promise.all(
    MEDIAPIPE_SCRIPTS.map(
      (src) =>
        new Promise((resolve, reject) => {
          if (document.querySelector(`script[src="${src}"]`)) return resolve();
          const script = document.createElement('script');
          script.src = src;
          script.crossOrigin = 'anonymous';
          script.onload = resolve;
          script.onerror = () => reject(new Error(`Gagal memuat ${src}`));
          document.head.appendChild(script);
        })
    )
  );
  return scriptsLoadingPromise;
}

function distance(p1, p2) {
  return Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);
}

/**
 * Kamera + deteksi wajah real-time (MediaPipe FaceMesh), menggantikan
 * setupFaceMesh()/analyzeLandmarks() di index.html lama.
 *
 * Props:
 * - active: boolean, mulai kamera saat true
 * - onTelemetryUpdate: ({ stress, gaze, expression }) => void
 * - onFaceDetectedChange: (boolean) => void
 * - onReady / onError: callback saat kamera siap / gagal
 */
const WebcamTelemetry = forwardRef(function WebcamTelemetry(
  { active, onTelemetryUpdate, onFaceDetectedChange, onReady, onError },
  ref
) {
  const videoRef = useRef(null);
  const faceMeshRef = useRef(null);
  const cameraRef = useRef(null);
  const [faceDetected, setFaceDetected] = useState(false);

  useImperativeHandle(ref, () => ({
    stop() {
      cameraRef.current?.stop?.();
    },
  }));

  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    async function setup() {
      try {
        await loadMediaPipeScripts();
        if (cancelled) return;

        const videoElement = videoRef.current;
        if (!videoElement) throw new Error('Elemen video tidak ditemukan');

        const faceMesh = new window.FaceMesh({
          locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
        });
        faceMesh.setOptions({
          maxNumFaces: 1,
          refineLandmarks: true,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });

        faceMesh.onResults((results) => {
          if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
            setFaceDetected(true);
            onFaceDetectedChange?.(true);
            analyzeLandmarks(results.multiFaceLandmarks[0]);
          } else {
            setFaceDetected(false);
            onFaceDetectedChange?.(false);
            onTelemetryUpdate?.({ stress: 0, gaze: 'Depan', expression: 'Neutral / Santai' });
          }
        });

        faceMeshRef.current = faceMesh;

        const camera = new window.Camera(videoElement, {
          onFrame: async () => {
            if (videoElement && videoElement.readyState >= 2) {
              await faceMesh.send({ image: videoElement });
            }
          },
          width: 640,
          height: 480,
        });

        cameraRef.current = camera;
        await camera.start();
        if (!cancelled) onReady?.();
      } catch (err) {
        if (!cancelled) onError?.(err);
      }
    }

    function analyzeLandmarks(lm) {
      const leftEyeOuter = lm[33];
      const rightEyeOuter = lm[263];
      const eyeDist = distance(leftEyeOuter, rightEyeOuter);
      if (!eyeDist) return;

      const mouthWidthRatio = distance(lm[61], lm[291]) / eyeDist;

      let stress = 15;
      let expression = 'Neutral / Santai';
      if (mouthWidthRatio > 0.7) {
        expression = 'Tegang / Meringis';
        stress = 65;
      } else if (mouthWidthRatio > 0.6) {
        expression = 'Ceria / Senang';
        stress = 10;
      }

      onTelemetryUpdate?.({ stress, gaze: 'Depan', expression });
    }

    setup();

    return () => {
      cancelled = true;
      cameraRef.current?.stop?.();
      cameraRef.current = null;
      faceMeshRef.current?.close?.();
      faceMeshRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return (
    <div className="relative bg-[#212121] rounded-2xl overflow-hidden border border-gray-200 shadow-md flex-1 min-h-0 flex items-center justify-center">
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className="w-full h-full object-cover transform scale-x-[-1]"
      />
      <div className="absolute top-4 left-4 bg-black/60 px-3 py-1.5 rounded-full flex items-center space-x-2 border border-white/10">
        <div className={`w-2 h-2 rounded-full ${faceDetected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
        <span className="text-[11px] font-medium text-white">
          {faceDetected ? 'Wajah Terdeteksi' : 'Mencari Wajah...'}
        </span>
      </div>
    </div>
  );
});

export default WebcamTelemetry;
