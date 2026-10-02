import React, { useEffect, useRef, forwardRef, useImperativeHandle, useState } from 'react';
import { FilesetResolver, FaceLandmarker } from '@mediapipe/tasks-vision';

/**
 * 1. FEATURE EXTRACTION
 * Mengambil fitur gabungan dari blendshapes spesifik MediaPipe.
 */
function extractRawFeatures(bs) {
  return {
    smile: ((bs['mouthSmileLeft'] || 0) + (bs['mouthSmileRight'] || 0)) / 2,
    frown: ((bs['mouthFrownLeft'] || 0) + (bs['mouthFrownRight'] || 0)) / 2,
    browTension: ((bs['browDownLeft'] || 0) + (bs['browDownRight'] || 0)) / 2,
    browRaise: ((bs['browInnerUp'] || 0) + (bs['browOuterUpLeft'] || 0) + (bs['browOuterUpRight'] || 0)) / 3,
    eyeWide: ((bs['eyeWideLeft'] || 0) + (bs['eyeWideRight'] || 0)) / 2,
    eyeSquint: ((bs['eyeSquintLeft'] || 0) + (bs['eyeSquintRight'] || 0)) / 2,
    jawOpen: bs['jawOpen'] || 0,
    disgust: ((bs['noseSneerLeft'] || 0) + (bs['noseSneerRight'] || 0)) / 2,
  };
}

/**
 * 2. GAZE ESTIMATION
 * Estimasi arah pandangan mata menggunakan blendshapes pandangan mata MediaPipe.
 */
function estimateGaze(bs) {
  const lookLeft = ((bs['eyeLookOutLeft'] || 0) + (bs['eyeLookInRight'] || 0)) / 2;
  const lookRight = ((bs['eyeLookInLeft'] || 0) + (bs['eyeLookOutRight'] || 0)) / 2;
  const lookUp = ((bs['eyeLookUpLeft'] || 0) + (bs['eyeLookUpRight'] || 0)) / 2;
  const lookDown = ((bs['eyeLookDownLeft'] || 0) + (bs['eyeLookDownRight'] || 0)) / 2;

  if (lookLeft > 0.35) return 'Kiri';
  if (lookRight > 0.35) return 'Kanan';
  if (lookUp > 0.35) return 'Atas';
  if (lookDown > 0.35) return 'Bawah';
  return 'Depan';
}

/**
 * 3. TEMPORAL SMOOTHING (Exponential Moving Average)
 */
function applyEMA(current, previous, alpha = 0.25) {
  if (!previous) return { ...current };
  const smoothed = {};
  for (const key in current) {
    smoothed[key] = alpha * current[key] + (1 - alpha) * (previous[key] || 0);
  }
  return smoothed;
}

/**
 * 4. EXPRESSION SCORING & HYSTERESIS
 */
function classifyExpression(features, activeStateRef) {
  // Hitung kandidat skor ekspresi berdasarkan kombinasi fitur
  const candidates = {
    'Senyum / Senang 😀': features.smile * 0.7 + features.eyeSquint * 0.3 - features.frown * 0.4,
    'Antusias / Terkejut 😮': features.jawOpen * 0.4 + features.browRaise * 0.4 + features.eyeWide * 0.2,
    'Tegang / Marah 😠': features.browTension * 0.6 + features.frown * 0.2 + features.eyeSquint * 0.2,
    'Cemas / Sedih 😢': features.frown * 0.5 + features.browTension * 0.3 - features.smile * 0.3,
    'Kurang Nyaman 🤢': features.disgust * 0.7 + features.browTension * 0.3,
  };

  let topExpression = 'Netral / Tidak jelas 😐';
  let topScore = 0.35; // Baseline score untuk netral

  for (const [expr, score] of Object.entries(candidates)) {
    if (score > topScore) {
      topScore = score;
      topExpression = expr;
    }
  }

  // Terapkan Hysteresis
  const ENTRY_THRESHOLD = 0.50;
  const EXIT_THRESHOLD = 0.38;

  const currentExpr = activeStateRef.current.expression;
  const currentScore = candidates[currentExpr] || 0;

  let finalExpression = 'Netral / Tidak jelas 😐';
  let confidence = Math.min(1.0, Math.max(0.3, topScore));

  if (currentExpr !== 'Netral / Tidak jelas 😐' && currentScore >= EXIT_THRESHOLD) {
    // Pertahankan ekspresi sebelumnya jika belum turun di bawah exit threshold
    finalExpression = currentExpr;
    confidence = Math.min(1.0, Math.max(0.3, currentScore));
  } else if (topScore >= ENTRY_THRESHOLD) {
    // Masuk ke ekspresi baru jika melewati entry threshold
    finalExpression = topExpression;
  } else {
    // Default fallback
    finalExpression = 'Netral / Tidak jelas 😐';
    confidence = Math.max(0.4, 1.0 - (features.browTension + features.smile + features.jawOpen));
  }

  activeStateRef.current.expression = finalExpression;

  // Indikator Ketegangan Otot Wajah (Facial Tension), BUKAN stress psikologis
  const facialTension = Math.min(
    1.0,
    Math.max(0.0, features.browTension * 0.45 + features.frown * 0.35 + features.disgust * 0.2)
  );

  return {
    expression: finalExpression,
    confidence: Number(confidence.toFixed(2)),
    facialTension: Number(facialTension.toFixed(2)),
  };
}

const WebcamTelemetry = forwardRef(({ active, onTelemetryUpdate, onReady, onError }, ref) => {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const landmarkerRef = useRef(null);
  const animFrameRef = useRef(null);

  const [isLoaded, setIsLoaded] = useState(false);

  // References untuk menghindari Re-render berlebihan & menjaga state internal
  const lastInferenceTimeRef = useRef(0);
  const smoothedFeaturesRef = useRef(null);
  const activeStateRef = useRef({ expression: 'Netral / Tidak jelas 😐' });
  const baselineRef = useRef({ frames: [], data: null });

  useImperativeHandle(ref, () => ({
    stop: () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    },
  }));

  useEffect(() => {
    let isMounted = true;

    async function initFaceLandmarker() {
      try {
        const filesetResolver = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
        );

        const landmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
            delegate: 'GPU',
          },
          outputFaceBlendshapes: true,
          runningMode: 'VIDEO',
          numFaces: 1,
        });

        if (isMounted) {
          landmarkerRef.current = landmarker;
          setIsLoaded(true);
          startCamera();
        }
      } catch (err) {
        console.error('Gagal memuat MediaPipe Face Landmarker:', err);
        if (onError) onError(err);
      }
    }

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, frameRate: { ideal: 30 } },
          audio: false,
        });

        if (videoRef.current && isMounted) {
          videoRef.current.srcObject = stream;
          streamRef.current = stream;
          videoRef.current.onloadedmetadata = () => {
            videoRef.current.play();
            if (onReady) onReady();
            detectLoop();
          };
        }
      } catch (err) {
        console.error('Kamera tidak diizinkan atau tidak ditemukan:', err);
        if (onError) onError(err);
      }
    }

    if (active) {
      initFaceLandmarker();
    }

    return () => {
      isMounted = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, [active]);

  function detectLoop(time) {
    if (videoRef.current && landmarkerRef.current && videoRef.current.readyState >= 2) {
      // Throttle Inference (~30 FPS / 33ms Interval)
      if (time - lastInferenceTimeRef.current >= 33) {
        lastInferenceTimeRef.current = time;

        const results = landmarkerRef.current.detectForVideo(videoRef.current, performance.now());

        if (results.faceBlendshapes && results.faceBlendshapes.length > 0) {
          const bsArray = results.faceBlendshapes[0].categories;
          const bsMap = {};
          bsArray.forEach((item) => {
            bsMap[item.categoryName] = item.score;
          });

          // 1. Feature Extraction
          const rawFeatures = extractRawFeatures(bsMap);

          // 2. Baseline Calibration (12 Frame Pertama)
          if (baselineRef.current.frames.length < 12) {
            baselineRef.current.frames.push(rawFeatures);
            if (baselineRef.current.frames.length === 12) {
              const avgBaseline = {};
              for (const key in rawFeatures) {
                const sum = baselineRef.current.frames.reduce((acc, f) => acc + f[key], 0);
                avgBaseline[key] = sum / 12;
              }
              baselineRef.current.data = avgBaseline;
            }
          }

          // Zero-center adjustment terhadap baseline
          const normalizedFeatures = { ...rawFeatures };
          if (baselineRef.current.data) {
            for (const key in normalizedFeatures) {
              normalizedFeatures[key] = Math.max(0, normalizedFeatures[key] - baselineRef.current.data[key]);
            }
          }

          // 3. Temporal Smoothing (EMA)
          const smoothed = applyEMA(normalizedFeatures, smoothedFeaturesRef.current, 0.25);
          smoothedFeaturesRef.current = smoothed;

          // 4. Expression & Tension Analysis
          const classification = classifyExpression(smoothed, activeStateRef);
          const gazeDirection = estimateGaze(bsMap);

          // 5. Pembulatan Fitur untuk Output Telemetri
          const formattedFeatures = {};
          for (const key in smoothed) {
            formattedFeatures[key] = Number(smoothed[key].toFixed(2));
          }

          // 6. Callback Telemetri tanpa memicu Re-render React yang tidak perlu
          if (onTelemetryUpdate) {
            onTelemetryUpdate({
              expression: classification.expression,
              confidence: classification.confidence,
              facialTension: classification.facialTension,
              features: formattedFeatures,
              gaze: gazeDirection,
              timestamp: Date.now(),
            });
          }
        }
      }
    }
    animFrameRef.current = requestAnimationFrame(detectLoop);
  }

  return (
    <div className="relative w-full aspect-video bg-black rounded-2xl overflow-hidden shadow-inner border border-gray-300 flex items-center justify-center">
      <video
        ref={videoRef}
        className="w-full h-full object-cover transform -scale-x-100"
        playsInline
        muted
      />
      {!isLoaded && (
        <div className="absolute inset-0 bg-gray-900/80 flex flex-col items-center justify-center text-white space-y-2">
          <div className="w-8 h-8 border-4 border-maroon-500 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-xs font-semibold">Memuat Tracker Wajah & Telemetri Ekspresi...</span>
        </div>
      )}
    </div>
  );
});

export default WebcamTelemetry;
