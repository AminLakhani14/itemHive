type FaceApi = typeof import('@vladmandic/face-api');

const MODEL_URL = `${import.meta.env.BASE_URL}models/face-api`;
/** Faces smaller than this share of the frame are too far away to recognize reliably. */
const MIN_FACE_WIDTH_RATIO = 0.18;

let faceApiPromise: Promise<FaceApi> | null = null;

/** Loads face-api (~1.5 MB) and its models (~7 MB) on first use so other screens never pay for them. */
export const loadFaceApi = () => {
    if (!faceApiPromise) {
        faceApiPromise = (async () => {
            const faceapi = await import('@vladmandic/face-api');
            await Promise.all([
                faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
                faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
                faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
            ]);
            return faceapi;
        })().catch((error: unknown) => {
            faceApiPromise = null;
            throw error;
        });
    }
    return faceApiPromise;
};

export interface FaceBox {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface DetectedFace {
    descriptor: number[];
    score: number;
    box: FaceBox;
    /** Whether the face is large enough in the frame to be trusted for matching. */
    isCloseEnough: boolean;
}

/** All faces in the current frame, largest first. */
export const detectFaces = async (video: HTMLVideoElement): Promise<DetectedFace[]> => {
    const faceapi = await loadFaceApi();
    const results = await faceapi
        .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.5 }))
        .withFaceLandmarks()
        .withFaceDescriptors();

    return results
        .map((result) => {
            const { x, y, width, height } = result.detection.box;
            return {
                // Five decimals is far below the matching threshold and keeps request bodies small.
                descriptor: Array.from(result.descriptor, (value) => Math.round(value * 100000) / 100000),
                score: result.detection.score,
                box: { x, y, width, height },
                isCloseEnough: width / video.videoWidth >= MIN_FACE_WIDTH_RATIO,
            };
        })
        .sort((a, b) => b.box.width * b.box.height - a.box.width * a.box.height);
};

/** A square JPEG crop around the face, used for profile photos and attendance audit snapshots. */
export const captureFaceSnapshot = (video: HTMLVideoElement, box: FaceBox, size = 160, quality = 0.7) => {
    const padding = box.width * 0.45;
    const side = Math.min(Math.max(box.width, box.height) + padding * 2, video.videoWidth, video.videoHeight);
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    const sx = Math.min(Math.max(0, centerX - side / 2), video.videoWidth - side);
    const sy = Math.min(Math.max(0, centerY - side / 2), video.videoHeight - side);

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) return '';
    context.drawImage(video, sx, sy, side, side, 0, 0, size, size);
    return canvas.toDataURL('image/jpeg', quality);
};

export const describeCameraError = (error: unknown) => {
    if (!window.isSecureContext) {
        return 'The camera only works over HTTPS or on localhost. Open Ozor from a secure address to use face attendance.';
    }
    const name = (error as { name?: string })?.name;
    if (name === 'NotAllowedError' || name === 'SecurityError') {
        return 'Camera access was blocked. Allow camera access for this site in the browser settings, then try again.';
    }
    if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        return 'No camera was found. Connect a webcam and try again.';
    }
    if (name === 'NotReadableError') {
        return 'The camera is being used by another application. Close it and try again.';
    }
    return 'Unable to start the camera. Please check the webcam and try again.';
};
