document.addEventListener('DOMContentLoaded', initializeApp);

function initializeApp() {
    const MAX_RECORDING_TIME = 10;

    const VIDEO_CONFIG = {
        width: { ideal: 540 },
        height: { ideal: 960 },
        frameRate: { ideal: 24 }
    };

    const MIME_TYPES = [
        'video/mp4;codecs=h264,aac',
        'video/webm;codecs=h264,opus',
        'video/webm;codecs=vp9,opus',
        'video/webm'
    ];

    const elements = {
        previewVideo: document.getElementById('previewVideo'),
        startRecordingButton: document.getElementById('startRecordingButton'),
        switchCameraButton: document.getElementById('switchCameraButton'),
        downloadButton: document.getElementById('downloadButton'),
        shareButton: document.getElementById('shareButton'),
        statusMessage: document.getElementById('statusMessage'),
        timerDisplay: document.getElementById('timerDisplay')
    };

    let ffmpeg = null;

    const state = {
        stream: null,
        mediaRecorder: null,
        recordedChunks: [],
        isRecording: false,
        currentCamera: 'user',
        recordingTimer: null,
        recordingDuration: 0,
        recordedBlob: null,
        canShare: !!(navigator.canShare && navigator.share)
    };

    const initializeFFmpeg = async () => {
        if (!ffmpeg) {
            const { createFFmpeg } = window.FFmpeg;
            ffmpeg = createFFmpeg({ log: false });
            await ffmpeg.load();
        }
    };

    const convertToMP4 = async (webmBlob) => {
        try {
            await initializeFFmpeg();
            const { fetchFile } = FFmpeg;

            ffmpeg.FS('writeFile', 'input.webm', await fetchFile(webmBlob));

            const flipFilter = state.currentCamera === 'user' ? ',hflip' : '';

            await ffmpeg.run(
                '-i', 'input.webm',
                '-vf', `scale=540:960:force_original_aspect_ratio=decrease${flipFilter}`,
                '-c:v', 'libx264',
                '-preset', 'ultrafast',
                '-crf', '28',
                '-c:a', 'aac',
                '-movflags', '+faststart',
                'output.mp4'
            );

            const mp4Data = ffmpeg.FS('readFile', 'output.mp4');
            ffmpeg.FS('unlink', 'input.webm');
            ffmpeg.FS('unlink', 'output.mp4');

            return new Blob([mp4Data.buffer], { type: 'video/mp4' });
        } catch (error) {
            throw new Error('Conversion failed');
        }
    };

    const stopTracks = (stream) => {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
        }
    };

    const timer = {
        update() {
            const minutes = Math.floor(state.recordingDuration / 60);
            const seconds = state.recordingDuration % 60;
            elements.timerDisplay.textContent =
                `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        },

        start() {
            state.recordingDuration = 0;
            this.update();
            state.recordingTimer = setInterval(() => {
                state.recordingDuration++;
                this.update();
                if (state.recordingDuration >= MAX_RECORDING_TIME) {
                    recording.stop();
                }
            }, 1000);
        },

        stop() {
            if (state.recordingTimer) {
                clearInterval(state.recordingTimer);
                state.recordingTimer = null;
            }
        }
    };

    const camera = {
        async setup() {
            try {
                await stopTracks(state.stream);
                elements.previewVideo.srcObject = null;

                const constraints = {
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true
                    },
                    video: {
                        ...VIDEO_CONFIG,
                        facingMode: state.currentCamera
                    }
                };

                state.stream = await navigator.mediaDevices.getUserMedia(constraints);
                elements.previewVideo.srcObject = state.stream;
                elements.previewVideo.style.transform = state.currentCamera === 'user' ? 'scaleX(-1)' : 'none';
                await elements.previewVideo.play();

                elements.startRecordingButton.disabled = false;
                elements.switchCameraButton.disabled = false;
            } catch (err) {
                elements.statusMessage.textContent = 'Camera error';
                elements.startRecordingButton.disabled = true;
                elements.switchCameraButton.disabled = true;
            }
        },

        async switch() {
            if (state.isRecording) return;

            await stopTracks(state.stream);
            state.currentCamera = state.currentCamera === 'user' ? 'environment' : 'user';
            await this.setup();
        }
    };

    const recording = {
        async start() {
            try {
                state.recordedChunks = [];
                state.recordedBlob = null;
                elements.downloadButton.disabled = true;
                elements.shareButton.disabled = true;

                const mimeType = MIME_TYPES.find(type => MediaRecorder.isTypeSupported(type));
                if (!mimeType) throw new Error('No supported format');

                state.mediaRecorder = new MediaRecorder(state.stream, {
                    mimeType,
                    videoBitsPerSecond: 2000000,
                    audioBitsPerSecond: 128000
                });

                state.mediaRecorder.ondataavailable = (event) => {
                    if (event.data?.size > 0) {
                        state.recordedChunks.push(event.data);
                    }
                };

                state.mediaRecorder.onstop = async () => {
                    try {
                        const webmBlob = new Blob(state.recordedChunks, { type: 'video/webm' });
                        state.recordedBlob = await convertToMP4(webmBlob);

                        elements.downloadButton.disabled = false;
                        elements.shareButton.disabled = !state.canShare;
                    } catch {
                        elements.statusMessage.textContent = 'Processing failed';
                    }
                };

                state.mediaRecorder.start(1000);
                timer.start();
                state.isRecording = true;
                elements.startRecordingButton.textContent = 'Stop Recording';
                elements.switchCameraButton.disabled = true;
                elements.statusMessage.textContent = 'Recording...';
            } catch {
                elements.statusMessage.textContent = 'Recording failed';
            }
        },

        stop() {
            if (state.mediaRecorder?.state !== 'inactive') {
                state.mediaRecorder.stop();
                timer.stop();
                state.isRecording = false;
                elements.startRecordingButton.textContent = 'Start Recording';
                elements.switchCameraButton.disabled = false;
                elements.statusMessage.textContent = 'Processing...';
            }
        }
    };

    const videoExport = {
        download() {
            if (state.recordedBlob) {
                const url = URL.createObjectURL(state.recordedBlob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `video-${Date.now()}.mp4`;
                a.click();
                URL.revokeObjectURL(url);
            }
        },

        async share() {
            if (!state.recordedBlob || !state.canShare) return;

            try {
                const file = new File([state.recordedBlob], `video-${Date.now()}.mp4`, {
                    type: 'video/mp4'
                });

                if (navigator.canShare({ files: [file] })) {
                    await navigator.share({
                        files: [file],
                        title: 'Recorded Video'
                    });
                }
            } catch (error) {
                if (error.name !== 'AbortError') {
                    elements.statusMessage.textContent = 'Share failed';
                }
            }
        }
    };

    elements.startRecordingButton.addEventListener('click', () => {
        if (state.isRecording) {
            recording.stop();
        } else {
            recording.start();
        }
    });

    elements.switchCameraButton.addEventListener('click', () => camera.switch());
    elements.downloadButton.addEventListener('click', () => videoExport.download());
    elements.shareButton.addEventListener('click', () => videoExport.share());

    elements.switchCameraButton.style.display = 'block';
    elements.shareButton.style.display = state.canShare ? 'block' : 'none';
    elements.downloadButton.disabled = true;
    elements.shareButton.disabled = true;

    (async () => {
        try {
            await initializeFFmpeg();
            await camera.setup();
        } catch {
            elements.statusMessage.textContent = 'Initialization failed';
        }
    })();
}