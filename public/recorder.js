document.addEventListener("DOMContentLoaded", initializeApp);

function initializeApp() {
    // Constants
    const MAX_RECORDING_TIME = 10; // Maximum recording time in seconds
    const VIDEO_CONFIG = {
        MOBILE: { width: { ideal: 720 }, height: { ideal: 1280 }, frameRate: { ideal: 30 } },
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
        statusMessage: document.getElementById("statusMessage")
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
        isProcessing: false
    };

    // FFmpeg Instance
    let ffmpeg = null;

    // Initialize FFmpeg
    const initializeFFmpeg = async () => {
        if (!ffmpeg) {
            const { createFFmpeg } = FFmpeg;
            ffmpeg = createFFmpeg({ log: false });
            await ffmpeg.load();
        }
    };

    // Convert WebM to MP4 with timeout
    const convertToMP4 = async (webmBlob) => {
        const { fetchFile } = FFmpeg;
        try {
            const conversionWithTimeout = Promise.race([
                (async () => {
                    ffmpeg.FS("writeFile", "input.webm", await fetchFile(webmBlob));

                    await ffmpeg.run(
                        "-i", "input.webm",
                        "-c:v", "libx264",
                        "-preset", "ultrafast",
                        "-crf", "28",
                        "-c:a", "aac",
                        "-b:a", "128k",
                        "output.mp4"
                    );

                    const mp4Data = ffmpeg.FS("readFile", "output.mp4");
                    return new Blob([mp4Data.buffer], { type: "video/mp4" });
                })(),
                new Promise((_, reject) => setTimeout(() => {
                    reject(new Error('Video processing timeout after 10 seconds'));
                }, 10000))
            ]);

            return await conversionWithTimeout;
        } catch (error) {
            console.error("Error converting video:", error);
            throw error;
        } finally {
            try {
                ffmpeg.FS("unlink", "input.webm");
                ffmpeg.FS("unlink", "output.mp4");
            } catch (e) {
                // Ignore cleanup errors
            }
        }
    };

    // Update Status Message
    const updateStatus = (message) => {
        if (elements.statusMessage) {
            elements.statusMessage.textContent = message;
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
            elements.previewVideo.style.transform =
                state.currentCamera === "user" ? "scale(-1, 1)" : "scale(1, 1)";
            await elements.previewVideo.play();
            updateStatus("Camera ready");
        } catch (error) {
            console.error("Camera setup error:", error);
            updateStatus("Camera setup failed");
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

            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

            if (state.currentCamera === "user") {
                this.ctx.save();
                this.ctx.scale(-1, 1);
                this.ctx.translate(-this.canvas.width, 0);
            }

            this.ctx.drawImage(
                elements.previewVideo,
                0,
                0,
                this.canvas.width,
                this.canvas.height
            );

            if (state.currentCamera === "user") {
                this.ctx.restore();
            }
        },

        async start() {
            try {
                this.setupCanvas();

                this.canvasStream = this.canvas.captureStream(30);
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
                    try {
                        state.isProcessing = true;
                        updateStatus("Processing video...");
                        elements.startRecordingButton.disabled = true;
                        updateUIState();

                        const webmBlob = new Blob(state.recordedChunks, { type: "video/webm" });
                        state.recordedBlob = await convertToMP4(webmBlob);
                        state.hasDownloaded = false;
                        updateStatus("Video ready");
                    } catch (error) {
                        updateStatus("Video processing failed");
                        alert("Video processing failed. Please try recording a shorter video.");
                        state.recordedBlob = null;
                        state.recordedChunks = [];
                    } finally {
                        state.isProcessing = false;
                        elements.startRecordingButton.disabled = false;
                        updateUIState();
                    }
                };

                state.mediaRecorder.start(1000);
                timer.start();
                state.isRecording = true;
                updateStatus("Recording...");
                updateUIState();

                const drawLoop = () => {
                    if (state.isRecording) {
                        this.processFrame();
                        requestAnimationFrame(drawLoop);
                    }
                };
                drawLoop();
            } catch (error) {
                console.error("Recording start error:", error);
                updateStatus("Failed to start recording");
            }
        },

        stop() {
            if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
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
        elements.startRecordingButton.disabled = state.isProcessing;
        elements.switchCameraButton.disabled = state.isRecording || !state.isMobile || state.isProcessing;
        elements.downloadButton.disabled = !state.recordedBlob || state.hasDownloaded || state.isProcessing;
        elements.shareButton.disabled = !state.recordedBlob || !state.canShare || state.isProcessing;
    };

    // Export Functions
    const exportVideo = {
        download() {
            if (state.recordedBlob) {
                const url = URL.createObjectURL(state.recordedBlob);
                const link = document.createElement("a");
                link.href = url;
                link.download = `video-${Date.now()}.mp4`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
                state.hasDownloaded = true;
                updateUIState();
            }
        },

        async share() {
            if (state.canShare && state.recordedBlob) {
                try {
                    const file = new File([state.recordedBlob], `video-${Date.now()}.mp4`, {
                        type: "video/mp4",
                    });
                    await navigator.share({ files: [file], title: "Recorded Video" });
                    updateStatus("Video shared successfully");
                } catch (error) {
                    if (error.name !== 'AbortError') {
                        console.error("Share failed:", error);
                        updateStatus("Failed to share video");
                    }
                }
            }
        },
    };

    // Event Listeners with Debounce
    let lastClickTime = 0;
    const CLICK_DELAY = 500;

    const handleClick = (handler) => {
        return () => {
            const now = Date.now();
            if (now - lastClickTime >= CLICK_DELAY) {
                lastClickTime = now;
                handler();
            }
        };
    };

    elements.startRecordingButton.addEventListener("click", handleClick(() => {
        if (state.isRecording) recording.stop();
        else recording.start();
    }));

    elements.switchCameraButton.addEventListener("click", handleClick(async () => {
        if (!state.isRecording && !state.isProcessing) {
            state.currentCamera = state.currentCamera === "user" ? "environment" : "user";
            await setupCamera();
        }
    }));

    elements.downloadButton.addEventListener("click", handleClick(exportVideo.download));
    elements.shareButton.addEventListener("click", handleClick(exportVideo.share));

    // Initialize App
    (async () => {
        try {
            updateStatus("Initializing...");
            await initializeFFmpeg();
            await setupCamera();
            if (!state.isMobile) {
                elements.switchCameraButton.style.display = "none";
            }
            updateUIState();
            updateStatus("Ready");
        } catch (error) {
            console.error("Initialization error:", error);
            updateStatus("Failed to initialize app");
        }
    })();
}