document.addEventListener("DOMContentLoaded", initializeApp);

function initializeApp() {
    // Constants
    const MAX_RECORDING_TIME = 10; // Maximum recording time in seconds
    const VIDEO_CONFIG = {
        MOBILE: { width: { ideal: 540 }, height: { ideal: 960 }, frameRate: { ideal: 30 } },
        DESKTOP: { width: { ideal: 720 }, height: { ideal: 1280 }, frameRate: { ideal: 30 } },
    };
    const MIME_TYPES = {
        PRIORITY: [
            "video/mp4;codecs=h264,aac",
            "video/mp4;codecs=avc1,mp4a.40.2",
            "video/mp4",
            "video/webm;codecs=vp9,opus",
            "video/webm;codecs=vp8,opus",
            "video/webm",
        ],
    };

    // DOM Elements
    const elements = {
        previewVideo: document.getElementById("previewVideo"),
        startRecordingButton: document.getElementById("startRecordingButton"),
        switchCameraButton: document.getElementById("switchCameraButton"),
        downloadButton: document.getElementById("downloadButton"),
        shareButton: document.getElementById("shareButton"),
        timerDisplay: document.getElementById("timerDisplay"),
    };

    // State
    const state = {
        stream: null,
        mediaRecorder: null,
        recordedChunks: [],
        isRecording: false,
        currentCamera: "user",
        recordedBlob: null,
        hasDownloaded: false,
        isMobile: /Android|iPhone|iPad|iPod/i.test(navigator.userAgent),
        canShare: !!(navigator.canShare && navigator.share),
    };

    // FFmpeg Instance
    let ffmpeg = null;

    // Initialize FFmpeg
    const initializeFFmpeg = async () => {
        if (!ffmpeg) {
            const { createFFmpeg, fetchFile } = FFmpeg;
            ffmpeg = createFFmpeg({ log: true });
            await ffmpeg.load();
        }
    };

    // Convert WebM to MP4
    const convertToMP4 = async (webmBlob) => {
        const { fetchFile } = FFmpeg;
        try {
            //await initializeFFmpeg();

            // Write WebM to FFmpeg FS
            ffmpeg.FS("writeFile", "input.webm", await fetchFile(webmBlob));

            // Conversion command
            await ffmpeg.run(
                "-i",
                "input.webm",
                "-c:v",
                "libx264",
                "-preset",
                "ultrafast",
                "-crf",
                "28",
                "-c:a",
                "aac",
                "-b:a",
                "128k",
                "-movflags",
                "+faststart",
                "output.mp4"
            );

            // Read the output MP4
            const mp4Data = ffmpeg.FS("readFile", "output.mp4");
            return new Blob([mp4Data.buffer], { type: "video/mp4" });
        } catch (error) {
            console.error("Error converting video:", error);
            throw error;
        } finally {
            // Clean up FS
            ffmpeg.FS("unlink", "input.webm");
            ffmpeg.FS("unlink", "output.mp4");
        }
    };

    // Timer Utility
    const timer = {
        interval: null,
        seconds: 0,
        start() {
            this.seconds = 0;
            elements.timerDisplay.textContent = `${this.seconds}s`;
            this.interval = setInterval(() => {
                this.seconds++;
                elements.timerDisplay.textContent = `${this.seconds}s`;
                if (this.seconds >= MAX_RECORDING_TIME) recording.stop();
            }, 1000);
        },
        stop() {
            clearInterval(this.interval);
            elements.timerDisplay.textContent = "0s";
        },
    };

    // Camera Setup
    const setupCamera = async () => {
        const config = state.isMobile ? VIDEO_CONFIG.MOBILE : VIDEO_CONFIG.DESKTOP;
        const constraints = {
            video: { ...config, facingMode: state.currentCamera },
            audio: { echoCancellation: true, noiseSuppression: true },
        };
        try {
            if (state.stream) {
                state.stream.getTracks().forEach((track) => track.stop());
            }
            state.stream = await navigator.mediaDevices.getUserMedia(constraints);
            elements.previewVideo.srcObject = state.stream;

            // Remove mirror effect for front camera
            elements.previewVideo.style.transform =
                state.currentCamera === "user" ? "scale(-1, 1)" : "scale(1, 1)";

            elements.previewVideo.play();
        } catch (error) {
            console.error("Camera setup error:", error);
        }
    };

    const recording = {
        canvas: null,
        ctx: null,
        canvasStream: null,

        setupCanvas() {
            if (!this.canvas) {
                this.canvas = document.createElement("canvas");
                this.ctx = this.canvas.getContext("2d");

                this.canvas.width = elements.previewVideo.videoWidth;
                this.canvas.height = elements.previewVideo.videoHeight;
            }
        },

        processFrame() {
            if (!this.ctx || !state.stream) return;

            // Clear canvas
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

            // Flip the frame for front camera
            if (state.currentCamera === "user") {
                this.ctx.save();
                this.ctx.scale(-1, 1); // Flip horizontally
                this.ctx.translate(-this.canvas.width, 0);
            }

            // Draw the video frame
            this.ctx.drawImage(
                elements.previewVideo,
                0,
                0,
                this.canvas.width,
                this.canvas.height
            );

            // Restore context if flipped
            if (state.currentCamera === "user") {
                this.ctx.restore();
            }
        },

        async start() {
            this.setupCanvas();

            // Create canvas stream for recording
            this.canvasStream = this.canvas.captureStream(30); // 30 FPS
            const combinedStream = new MediaStream([
                ...this.canvasStream.getVideoTracks(),
                ...state.stream.getAudioTracks(),
            ]);

            state.recordedChunks = [];
            const mimeType = MIME_TYPES.PRIORITY.find((type) =>
                MediaRecorder.isTypeSupported(type)
            );
            if (!mimeType) throw new Error("No supported format found");

            state.mediaRecorder = new MediaRecorder(combinedStream, { mimeType });
            state.mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) state.recordedChunks.push(e.data);
            };

            state.mediaRecorder.onstop = async () => {
                const webmBlob = new Blob(state.recordedChunks, { type: "video/webm" });
                state.recordedBlob = await convertToMP4(webmBlob);
                state.hasDownloaded = false;
                updateUIState();
            };

            // Start recording and drawing frames
            state.mediaRecorder.start(1000);
            timer.start();
            state.isRecording = true;
            updateUIState();

            const drawLoop = () => {
                if (state.isRecording) {
                    this.processFrame();
                    requestAnimationFrame(drawLoop);
                }
            };
            drawLoop();
        },

        stop() {
            if (state.mediaRecorder) {
                state.mediaRecorder.stop();
            }
            if (this.canvasStream) {
                this.canvasStream.getTracks().forEach((track) => track.stop());
            }
            timer.stop();
            state.isRecording = false;
            updateUIState();
        },
    };


    // Update UI State
    const updateUIState = () => {
        elements.startRecordingButton.textContent = state.isRecording ? "Stop" : "Start Recording";
        elements.switchCameraButton.disabled = state.isRecording || !state.isMobile;
        elements.downloadButton.disabled = !state.recordedBlob || state.hasDownloaded;
        elements.shareButton.disabled = !state.recordedBlob || !state.canShare;
    };

    const updateUIAfterRecording = () => {
        updateUIState();
        elements.timerDisplay.textContent = "Recording Stopped";
    };

    // Export Functions
    const exportVideo = {
        download() {
            if (state.recordedBlob) {
                const url = URL.createObjectURL(state.recordedBlob);
                const link = document.createElement("a");
                link.href = url;
                link.download = `video-${Date.now()}.mp4`;
                link.click();
                URL.revokeObjectURL(url);

                state.hasDownloaded = true; // Mark as downloaded
                updateUIState(); // Update button state
            }
        },
        async share() {
            if (state.canShare && state.recordedBlob) {
                const file = new File([state.recordedBlob], `video.mp4`, {
                    type: "video/mp4",
                });
                await navigator.share({ files: [file], title: "Recorded Video" });
            }
        },
    };

    // Event Listeners
    elements.startRecordingButton.addEventListener("click", () => {
        if (state.isRecording) recording.stop();
        else recording.start();
    });
    elements.switchCameraButton.addEventListener("click", async () => {
        state.currentCamera = state.currentCamera === "user" ? "environment" : "user";
        await setupCamera();
    });
    elements.downloadButton.addEventListener("click", exportVideo.download);
    elements.shareButton.addEventListener("click", exportVideo.share);

    // Initialize App
    (async () => {
        await initializeFFmpeg();
        await setupCamera();
        if (!state.isMobile) elements.switchCameraButton.style.display = "none"; // Hide switch camera button on PC
        updateUIState();
    })();
}
