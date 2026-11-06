document.addEventListener('DOMContentLoaded', () => {
    // UI Elements
    const btnStartApp = document.getElementById('btn-start-app');
    const splashScreen = document.getElementById('splash-screen');
    const translatorScreen = document.getElementById('translator-screen');
    
    const selectSrcLang = document.getElementById('select-src-lang');
    const selectTgtLang = document.getElementById('select-tgt-lang');
    const btnSwapLanguages = document.getElementById('btn-swap-languages');
    
    const chatContainer = document.getElementById('chat-container');
    const emptyState = document.getElementById('empty-state');
    
    const btnMic = document.getElementById('btn-mic');
    const waveVisualizer = document.getElementById('wave-visualizer');
    const statusMessage = document.getElementById('status-message');
    const btnClearChat = document.getElementById('btn-clear-chat');
    const btnToggleContinuous = document.getElementById('btn-toggle-continuous');
    const continuousStatus = document.getElementById('continuous-status');
    
    const btnOpenSettings = document.getElementById('btn-open-settings');
    const btnCloseSettings = document.getElementById('btn-close-settings');
    const settingsDrawer = document.getElementById('settings-drawer');
    
    const rangeRate = document.getElementById('range-rate');
    const rangePitch = document.getElementById('range-pitch');
    const selectGender = document.getElementById('select-gender');
    const valRate = document.getElementById('val-rate');
    const valPitch = document.getElementById('val-pitch');
    const chkAutoSpeak = document.getElementById('chk-auto-speak');
    const chkContinuous = document.getElementById('chk-continuous');
    
    const hostIp = document.getElementById('host-ip');
    const btnCopyIp = document.getElementById('btn-copy-ip');

    // Keyboard Fallback Elements
    const btnToggleKeyboard = document.getElementById('btn-toggle-keyboard');
    const keyboardInputContainer = document.getElementById('keyboard-input-container');
    const textInputField = document.getElementById('text-input-field');
    const btnSendText = document.getElementById('btn-send-text');

    // Camera Notice Scanner Elements
    const btnOpenScanner = document.getElementById('btn-open-scanner');
    const btnCloseScanner = document.getElementById('btn-close-scanner');
    const scannerDrawer = document.getElementById('scanner-drawer');
    const cameraVideoPreview = document.getElementById('camera-video-preview');
    const cameraCanvas = document.getElementById('camera-canvas');
    const btnCaptureShutter = document.getElementById('btn-capture-shutter');
    const btnChooseCameraPhoto = document.getElementById('btn-choose-camera-photo');
    const btnChooseGalleryPhoto = document.getElementById('btn-choose-gallery-photo');
    const cameraFileInput = document.getElementById('camera-file-input');
    const galleryFileInput = document.getElementById('gallery-file-input');
    const scannerProcessing = document.getElementById('scanner-processing');
    const scannerStatusText = document.getElementById('scanner-status-text');
    const scannerStatusSub = document.getElementById('scanner-status-sub');
    let cameraStream = null;

    // App State
    let isRecording = false;
    let isContinuous = false;
    let recognition = null;
    let audioContext = null;
    let synth = window.speechSynthesis;
    let voices = [];
    let activeBubble = null;

    // Continuous Mode Sentence Buffering
    let continuousBuffer = '';
    let continuousSilenceTimer = null;
    const CONTINUOUS_SILENCE_DELAY = 1400; // 1.4s silence indicates complete sentence
    let isSpeaking = false;

    // Load Local IP info
    const urlScheme = document.getElementById('url-scheme');
    if (urlScheme) {
        urlScheme.textContent = window.location.protocol.replace(':', '');
    }
    if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        hostIp.textContent = window.location.hostname;
    }

    // Set and synchronize continuous listening state across buttons and settings drawer
    function setContinuousState(enabled) {
        isContinuous = Boolean(enabled);
        if (recognition) {
            recognition.continuous = isContinuous;
        }
        if (continuousStatus) {
            continuousStatus.textContent = isContinuous ? 'ON' : 'OFF';
            continuousStatus.classList.toggle('active', isContinuous);
        }
        if (btnToggleContinuous) {
            btnToggleContinuous.classList.toggle('active', isContinuous);
        }
        if (chkContinuous) {
            chkContinuous.checked = isContinuous;
        }
        if (!isContinuous) {
            flushContinuousBuffer();
            if (isRecording) {
                stopRecording();
            }
        }
    }

    // Initialize continuous status UI to match default state (strictly OFF)
    setContinuousState(false);
    
    // Copy URL helper
    btnCopyIp.addEventListener('click', () => {
        const urlText = `${window.location.protocol}//${hostIp.textContent.trim()}:${window.location.port || '5000'}`;
        navigator.clipboard.writeText(urlText).then(() => {
            btnCopyIp.innerHTML = '<i class="fa-solid fa-check" style="color: var(--accent-green)"></i>';
            setTimeout(() => {
                btnCopyIp.innerHTML = '<i class="fa-regular fa-copy"></i>';
            }, 2000);
        });
    });


    // Load voices
    function loadVoices() {
        if (!synth) return;
        voices = synth.getVoices();
    }
    loadVoices();
    if (synth && synth.onvoiceschanged !== undefined) {
        synth.onvoiceschanged = loadVoices;
    }

    // Initialize Web Audio API for UI Tones
    function getAudioContext() {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        return audioContext;
    }

    // Play synthesized UI feedback tones
    function playBeep(type) {
        try {
            const ctx = getAudioContext();
            if (ctx.state === 'suspended') {
                ctx.resume();
            }
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);

            if (type === 'start') {
                // High-tech quick double beep (start recording)
                osc.type = 'sine';
                osc.frequency.setValueAtTime(600, ctx.currentTime);
                gain.gain.setValueAtTime(0.1, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
                osc.start();
                osc.stop(ctx.currentTime + 0.15);

                setTimeout(() => {
                    const osc2 = ctx.createOscillator();
                    const gain2 = ctx.createGain();
                    osc2.connect(gain2);
                    gain2.connect(ctx.destination);
                    osc2.type = 'sine';
                    osc2.frequency.setValueAtTime(800, ctx.currentTime);
                    gain2.gain.setValueAtTime(0.1, ctx.currentTime);
                    gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
                    osc2.start();
                    osc2.stop(ctx.currentTime + 0.15);
                }, 100);
            } else if (type === 'stop') {
                // Descending boop (stop recording)
                osc.type = 'sine';
                osc.frequency.setValueAtTime(500, ctx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.2);
                gain.gain.setValueAtTime(0.1, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
                osc.start();
                osc.stop(ctx.currentTime + 0.2);
            }
        } catch (e) {
            console.warn('Audio Context tone generation blocked or unsupported', e);
        }
    }

    // Settings drawer events
    btnOpenSettings.addEventListener('click', () => {
        settingsDrawer.classList.add('open');
        if (scannerDrawer) {
            scannerDrawer.classList.remove('open');
            stopCamera();
        }
    });
    btnCloseSettings.addEventListener('click', () => settingsDrawer.classList.remove('open'));

    // Camera Scanner drawer events
    if (btnOpenScanner && scannerDrawer) {
        btnOpenScanner.addEventListener('click', () => {
            scannerDrawer.classList.add('open');
            settingsDrawer.classList.remove('open');
            startCamera();
        });
        if (btnCloseScanner) {
            btnCloseScanner.addEventListener('click', () => {
                scannerDrawer.classList.remove('open');
                stopCamera();
            });
        }
    }
    
    rangeRate.addEventListener('input', () => {
        valRate.textContent = `${rangeRate.value}x`;
        localStorage.setItem('translator_rate', rangeRate.value);
    });
    rangePitch.addEventListener('input', () => {
        valPitch.textContent = rangePitch.value;
        localStorage.setItem('translator_pitch', rangePitch.value);
    });
    selectGender.addEventListener('change', () => {
        localStorage.setItem('translator_gender', selectGender.value);
    });
    chkAutoSpeak.addEventListener('change', () => {
        localStorage.setItem('translator_autospeak', chkAutoSpeak.checked);
    });
    if (chkContinuous) {
        chkContinuous.addEventListener('change', () => {
            setContinuousState(chkContinuous.checked);
            localStorage.setItem('translator_continuous', isContinuous);
        });
    }

    // Load settings from localStorage
    if (localStorage.getItem('translator_rate')) {
        rangeRate.value = localStorage.getItem('translator_rate');
        valRate.textContent = `${rangeRate.value}x`;
    }
    if (localStorage.getItem('translator_pitch')) {
        rangePitch.value = localStorage.getItem('translator_pitch');
        valPitch.textContent = rangePitch.value;
    }
    if (localStorage.getItem('translator_gender')) {
        selectGender.value = localStorage.getItem('translator_gender');
    }
    if (localStorage.getItem('translator_autospeak')) {
        chkAutoSpeak.checked = localStorage.getItem('translator_autospeak') === 'true';
    }
    if (localStorage.getItem('translator_continuous') !== null) {
        setContinuousState(localStorage.getItem('translator_continuous') === 'true');
    }

    // Splash navigation
    btnStartApp.addEventListener('click', () => {
        // Unlock AudioContext for mobile browsers
        getAudioContext();
        splashScreen.classList.remove('active');
        translatorScreen.classList.add('active');
        loadHistory();

        // Ensure Continuous listening mode is strictly OFF by default when opening translator
        setContinuousState(false);

        // Warm up and optimize microphone settings (enable hardware Auto Gain Control and Noise Suppression)
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            }).then(stream => {
                console.log("Audio AGC/AEC/NS initialized successfully");
                // Stop the tracks immediately after initialization to release the hardware mic
                stream.getTracks().forEach(track => track.stop());
            }).catch(err => {
                console.warn("Failed to initialize microphone audio constraints:", err);
            });
        }
    });

    // Language swapping
    btnSwapLanguages.addEventListener('click', () => {
        const srcVal = selectSrcLang.value;
        selectSrcLang.value = selectTgtLang.value;
        selectTgtLang.value = srcVal;
        
        // Save preferences
        localStorage.setItem('translator_src_lang', selectSrcLang.value);
        localStorage.setItem('translator_tgt_lang', selectTgtLang.value);
    });

    selectSrcLang.addEventListener('change', () => {
        localStorage.setItem('translator_src_lang', selectSrcLang.value);
    });
    selectTgtLang.addEventListener('change', () => {
        localStorage.setItem('translator_tgt_lang', selectTgtLang.value);
    });

    // Set saved languages
    if (localStorage.getItem('translator_src_lang')) {
        selectSrcLang.value = localStorage.getItem('translator_src_lang');
    }
    if (localStorage.getItem('translator_tgt_lang')) {
        selectTgtLang.value = localStorage.getItem('translator_tgt_lang');
    }

    // Speech Recognition Setup
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
        try {
            recognition = new SpeechRecognition();
            recognition.interimResults = true;
            recognition.maxAlternatives = 1;
            recognition.continuous = isContinuous;

            recognition.onstart = () => {
                isRecording = true;
                btnMic.classList.add('recording');
                waveVisualizer.classList.add('active');
                statusMessage.textContent = 'Listening...';
                playBeep('start');
            };

            recognition.onerror = (e) => {
                console.error('Speech recognition error:', e.error);
                if (e.error === 'not-allowed') {
                    statusMessage.innerHTML = '<span style="color: var(--accent-red)">Mic permission denied. Check browser settings!</span>';
                } else if (e.error === 'service-not-allowed') {
                    statusMessage.innerHTML = '<span style="color: var(--accent-red)">Speech service blocked by browser/network.</span>';
                } else {
                    statusMessage.innerHTML = `<span style="color: var(--accent-red)">Mic Error: ${e.error}</span>`;
                }
                stopRecording();
            };

            recognition.onend = () => {
                // If continuous is ON and we didn't manually stop it, restart recognition
                if (isContinuous && isRecording) {
                    try {
                        recognition.start();
                    } catch (err) {
                        stopRecording();
                    }
                } else {
                    stopRecording();
                }
            };

            recognition.onresult = (event) => {
                if (isSpeaking) {
                    // Avoid picking up the app's own spoken voice playback
                    return;
                }

                let interimTranscript = '';
                let newFinalSegment = '';

                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    const chunk = event.results[i][0].transcript;
                    if (event.results[i].isFinal) {
                        newFinalSegment += chunk + ' ';
                    } else {
                        interimTranscript += chunk;
                    }
                }

                if (isContinuous) {
                    if (newFinalSegment) {
                        continuousBuffer += newFinalSegment;
                    }

                    // Display full continuous accumulation and live interim speech
                    const currentSpoken = (continuousBuffer + ' ' + interimTranscript).trim();
                    if (currentSpoken) {
                        statusMessage.textContent = currentSpoken;
                    }

                    // Reset silence debounce timer
                    if (continuousSilenceTimer) {
                        clearTimeout(continuousSilenceTimer);
                    }

                    // When speech pauses for 1.4s, translate the accumulated full sentence all at once!
                    if (continuousBuffer.trim()) {
                        continuousSilenceTimer = setTimeout(() => {
                            flushContinuousBuffer();
                        }, CONTINUOUS_SILENCE_DELAY);
                    }
                } else {
                    // Single-sentence mode (Continuous OFF)
                    if (interimTranscript) {
                        statusMessage.textContent = interimTranscript;
                    }
                    if (newFinalSegment.trim()) {
                        statusMessage.textContent = newFinalSegment.trim();
                        processTranslation(newFinalSegment.trim());
                        stopRecording();
                    }
                }
            };
        } catch (initErr) {
            console.error('Speech recognition init error:', initErr);
            recognition = null;
        }
    }

    // Flush accumulated speech buffer in continuous mode for unified translation
    function flushContinuousBuffer() {
        if (continuousSilenceTimer) {
            clearTimeout(continuousSilenceTimer);
            continuousSilenceTimer = null;
        }
        const textToTranslate = continuousBuffer.trim();
        continuousBuffer = '';
        if (textToTranslate) {
            statusMessage.textContent = 'Translating: ' + textToTranslate;
            processTranslation(textToTranslate);
        }
    }

    if (!recognition) {
        statusMessage.innerHTML = '<span style="color: var(--text-muted)">Speech API unavailable. Access via HTTPS/localhost, or use "Type" button below.</span>';
    }

    // Toggle Continuous Mode
    btnToggleContinuous.addEventListener('click', () => {
        setContinuousState(!isContinuous);
        localStorage.setItem('translator_continuous', isContinuous);
    });

    // Keyboard Fallback Events
    btnToggleKeyboard.addEventListener('click', () => {
        if (keyboardInputContainer.style.display === 'none') {
            keyboardInputContainer.style.display = 'block';
            btnToggleKeyboard.classList.add('active');
            btnToggleKeyboard.innerHTML = '<i class="fa-regular fa-keyboard"></i> Voice';
            textInputField.focus();
            
            // If recording, stop it
            if (isRecording) {
                stopRecording();
            }
        } else {
            keyboardInputContainer.style.display = 'none';
            btnToggleKeyboard.classList.remove('active');
            btnToggleKeyboard.innerHTML = '<i class="fa-regular fa-keyboard"></i> Type';
        }
    });

    btnSendText.addEventListener('click', () => {
        const text = textInputField.value.trim();
        if (text) {
            processTranslation(text);
            textInputField.value = '';
        }
    });

    textInputField.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const text = textInputField.value.trim();
            if (text) {
                processTranslation(text);
                textInputField.value = '';
            }
        }
    });

    // Mic Click Event
    btnMic.addEventListener('click', () => {
        // Stop any running speech output
        stopSpeech();

        if (!recognition) {
            statusMessage.innerHTML = '<span style="color: var(--accent-red)">Voice input requires HTTPS or Localhost connection. Please use "Type" to translate.</span>';
            return;
        }

        if (isRecording) {
            stopRecording();
        } else {
            startRecording();
        }
    });

    function startRecording() {
        if (!recognition) return;
        
        // Stop any active speech
        stopSpeech();

        // Clear continuous buffer and timer
        continuousBuffer = '';
        if (continuousSilenceTimer) {
            clearTimeout(continuousSilenceTimer);
            continuousSilenceTimer = null;
        }

        // Clear active bubble context
        activeBubble = null;
        
        // Update language parameters dynamically from selectors
        recognition.lang = selectSrcLang.value;
        recognition.continuous = isContinuous;
        
        try {
            statusMessage.textContent = 'Connecting to microphone...';
            btnMic.classList.add('recording');
            recognition.start();
        } catch (e) {
            console.error('Failed to start recognition:', e);
            statusMessage.innerHTML = `<span style="color: var(--accent-red)">Start failed: ${e.message || e}</span>`;
            stopRecording();
        }
    }

    function stopRecording() {
        if (continuousSilenceTimer) {
            clearTimeout(continuousSilenceTimer);
            continuousSilenceTimer = null;
        }
        // If there is pending speech in the buffer, translate it immediately
        if (continuousBuffer.trim()) {
            const pending = continuousBuffer.trim();
            continuousBuffer = '';
            processTranslation(pending);
        }

        isRecording = false;
        btnMic.classList.remove('recording');
        waveVisualizer.classList.remove('active');
        if (statusMessage.textContent === 'Listening...' || statusMessage.textContent.startsWith('Connecting') || statusMessage.textContent.startsWith('Translating')) {
            statusMessage.textContent = 'Ready to translate';
        }
        playBeep('stop');
        try {
            recognition.stop();
        } catch (e) {
            // already stopped
        }
    }


    // Process translation via backend API
    async function processTranslation(text) {
        const sourceLang = selectSrcLang.value;
        const targetLang = selectTgtLang.value;

        // Hide empty state if visible
        emptyState.style.display = 'none';

        // 1. Create bubble group container
        const bubbleGroup = document.createElement('div');
        bubbleGroup.className = 'chat-bubble-group';

        // 2. Create source speech bubble
        const sourceBubble = document.createElement('div');
        sourceBubble.className = 'chat-bubble source';
        
        const sourceLangName = selectSrcLang.options[selectSrcLang.selectedIndex].text.split(' ')[0];
        sourceBubble.innerHTML = `<span class="bubble-lang">${sourceLangName}</span>${escapeHtml(text)}`;
        bubbleGroup.appendChild(sourceBubble);

        // 3. Create target translation bubble (skeleton loader initially)
        const targetBubble = document.createElement('div');
        targetBubble.className = 'chat-bubble target';
        targetBubble.innerHTML = `<span class="bubble-lang">Translating...</span><i class="fa-solid fa-circle-notch fa-spin"></i>`;
        bubbleGroup.appendChild(targetBubble);

        chatContainer.appendChild(bubbleGroup);
        scrollToBottom();

        try {
            const response = await fetch('/api/translate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    text: text,
                    source_lang: sourceLang,
                    target_lang: targetLang
                })
            });

            const result = await response.json();

            if (response.ok && result.translated_text) {
                const targetLangName = selectTgtLang.options[selectTgtLang.selectedIndex].text.split(' ')[0];
                targetBubble.innerHTML = `
                    <span class="bubble-lang">${targetLangName}</span>
                    <span class="translated-content">${escapeHtml(result.translated_text)}</span>
                    <div class="bubble-actions">
                        <button class="play-bubble-voice" title="Speak translation">
                            <i class="fa-solid fa-volume-high"></i>
                        </button>
                        <button class="download-bubble-voice" title="Download translation audio">
                            <i class="fa-solid fa-download"></i>
                        </button>
                    </div>
                `;

                // Add play voice event listener
                const playBtn = targetBubble.querySelector('.play-bubble-voice');
                playBtn.addEventListener('click', () => {
                    speakText(result.translated_text, targetLang);
                });

                // Add download voice event listener
                const downloadBtn = targetBubble.querySelector('.download-bubble-voice');
                downloadBtn.addEventListener('click', () => {
                    downloadAudio(result.translated_text, targetLang);
                });

                // Auto speak if checked
                if (chkAutoSpeak.checked) {
                    speakText(result.translated_text, targetLang);
                }

                // Save to local history
                saveToHistory(text, result.translated_text, sourceLang, targetLang);
            } else {
                targetBubble.innerHTML = `<span class="bubble-lang" style="color: var(--accent-red)">Error</span>Translation failed.`;
            }
        } catch (err) {
            console.error(err);
            targetBubble.innerHTML = `<span class="bubble-lang" style="color: var(--accent-red)">Error</span>Network error.`;
        }
        scrollToBottom();
    }

    // ==========================================
    // Camera Notice Scanner & OCR Logic
    // ==========================================
    async function startCamera() {
        if (!cameraVideoPreview) return;
        if (scannerProcessing) scannerProcessing.style.display = 'none';

        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            try {
                cameraStream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        facingMode: { ideal: 'environment' },
                        width: { ideal: 1280 },
                        height: { ideal: 720 }
                    },
                    audio: false
                });
                cameraVideoPreview.srcObject = cameraStream;
                cameraVideoPreview.play().catch(e => console.warn('Camera preview play error:', e));
                return;
            } catch (err) {
                console.warn('Live camera stream not accessible:', err);
            }
        }
        console.log('WebRTC camera unavailable; phone camera file input ready');
    }

    function stopCamera() {
        if (cameraStream) {
            cameraStream.getTracks().forEach(track => {
                try { track.stop(); } catch (e) {}
            });
            cameraStream = null;
        }
        if (cameraVideoPreview) {
            cameraVideoPreview.srcObject = null;
        }
        if (scannerProcessing) {
            scannerProcessing.style.display = 'none';
        }
    }

    if (btnCaptureShutter) {
        btnCaptureShutter.addEventListener('click', () => {
            if (cameraVideoPreview && cameraVideoPreview.videoWidth > 0 && cameraStream) {
                cameraCanvas.width = cameraVideoPreview.videoWidth;
                cameraCanvas.height = cameraVideoPreview.videoHeight;
                const ctx = cameraCanvas.getContext('2d');
                ctx.drawImage(cameraVideoPreview, 0, 0, cameraCanvas.width, cameraCanvas.height);
                const dataUrl = cameraCanvas.toDataURL('image/jpeg', 0.85);
                processOcrImage(dataUrl);
            } else if (cameraFileInput) {
                cameraFileInput.click();
            }
        });
    }

    if (btnChooseCameraPhoto && cameraFileInput) {
        btnChooseCameraPhoto.addEventListener('click', () => {
            cameraFileInput.click();
        });
    }

    if (btnChooseGalleryPhoto && galleryFileInput) {
        btnChooseGalleryPhoto.addEventListener('click', () => {
            galleryFileInput.click();
        });
    }

    function handleOcrFileInput(e) {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (loadEvt) => {
            processOcrImage(loadEvt.target.result);
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    }

    if (cameraFileInput) {
        cameraFileInput.addEventListener('change', handleOcrFileInput);
    }
    if (galleryFileInput) {
        galleryFileInput.addEventListener('change', handleOcrFileInput);
    }

    async function processOcrImage(imageDataUrl) {
        stopSpeech();
        if (isRecording) {
            stopRecording();
        }

        if (scannerProcessing) {
            scannerProcessing.style.display = 'flex';
            if (scannerStatusText) scannerStatusText.textContent = 'Scanning Notice...';
            if (scannerStatusSub) scannerStatusSub.textContent = 'Extracting notice text & detecting language...';
        }

        const sourceLang = selectSrcLang.value;
        const targetLang = selectTgtLang.value;
        const targetLangName = selectTgtLang.options[selectTgtLang.selectedIndex].text.split(' ')[0];

        try {
            const response = await fetch('/api/ocr', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    image: imageDataUrl,
                    source_lang: sourceLang,
                    target_lang: targetLang
                })
            });

            const result = await response.json();

            if (response.ok && result.translated_text && result.original_text) {
                stopCamera();
                if (scannerDrawer) scannerDrawer.classList.remove('open');
                emptyState.style.display = 'none';

                renderOcrBubbles(imageDataUrl, result.original_text, result.translated_text, targetLang, targetLangName);

                // Text to Speech: speak the translated notice in target language out loud immediately!
                speakText(result.translated_text, targetLang);

                // Save to history
                saveToHistory('[📸 Notice] ' + result.original_text, result.translated_text, sourceLang, targetLang);
                return;
            } else if (window.Tesseract && typeof window.Tesseract.recognize === 'function') {
                // Client-side Tesseract.js fallback
                if (scannerStatusText) scannerStatusText.textContent = 'Running Client OCR...';
                if (scannerStatusSub) scannerStatusSub.textContent = 'Local recognition engine processing...';

                const ocrResult = await Tesseract.recognize(imageDataUrl, 'eng');
                const detectedText = ocrResult?.data?.text?.trim();

                if (detectedText) {
                    const transResponse = await fetch('/api/translate', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            text: detectedText,
                            source_lang: sourceLang,
                            target_lang: targetLang
                        })
                    });
                    const transResult = await transResponse.json();
                    if (transResponse.ok && transResult.translated_text) {
                        stopCamera();
                        if (scannerDrawer) scannerDrawer.classList.remove('open');
                        emptyState.style.display = 'none';

                        renderOcrBubbles(imageDataUrl, detectedText, transResult.translated_text, targetLang, targetLangName);
                        speakText(transResult.translated_text, targetLang);
                        saveToHistory('[📸 Notice] ' + detectedText, transResult.translated_text, sourceLang, targetLang);
                        return;
                    }
                }
            }

            // Incomplete or unreadable notice
            if (scannerStatusText) scannerStatusText.textContent = 'Notice Scan Incomplete';
            if (scannerStatusSub) scannerStatusSub.textContent = result.error || 'No readable text detected. Please ensure notice is well-lit and held steady.';
            setTimeout(() => {
                if (scannerProcessing) scannerProcessing.style.display = 'none';
            }, 3000);

        } catch (err) {
            console.error('OCR Processing error:', err);
            if (scannerStatusText) scannerStatusText.textContent = 'Scan Error';
            if (scannerStatusSub) scannerStatusSub.textContent = 'Could not process notice image. Please try again.';
            setTimeout(() => {
                if (scannerProcessing) scannerProcessing.style.display = 'none';
            }, 3000);
        }
    }

    function renderOcrBubbles(imageSrc, originalText, translatedText, targetLang, targetLangName) {
        const bubbleGroup = document.createElement('div');
        bubbleGroup.className = 'chat-bubble-group';

        // 1. Source bubble with notice thumbnail and transcript
        const sourceBubble = document.createElement('div');
        sourceBubble.className = 'chat-bubble source ocr-bubble';
        sourceBubble.innerHTML = `
            <span class="bubble-lang"><i class="fa-solid fa-camera"></i> Scanned Notice</span>
            <div class="ocr-image-preview">
                <img src="${imageSrc}" alt="Notice thumbnail">
            </div>
            <span class="ocr-extracted-text">${escapeHtml(originalText)}</span>
        `;
        bubbleGroup.appendChild(sourceBubble);

        // 2. Target translation bubble with TTS buttons
        const targetBubble = document.createElement('div');
        targetBubble.className = 'chat-bubble target';
        targetBubble.innerHTML = `
            <span class="bubble-lang">${targetLangName}</span>
            <span class="translated-content">${escapeHtml(translatedText)}</span>
            <div class="bubble-actions">
                <button class="play-bubble-voice" title="Speak translation">
                    <i class="fa-solid fa-volume-high"></i>
                </button>
                <button class="download-bubble-voice" title="Download translation audio">
                    <i class="fa-solid fa-download"></i>
                </button>
            </div>
        `;

        const playBtn = targetBubble.querySelector('.play-bubble-voice');
        playBtn.addEventListener('click', () => {
            speakText(translatedText, targetLang);
        });

        const downloadBtn = targetBubble.querySelector('.download-bubble-voice');
        downloadBtn.addEventListener('click', () => {
            downloadAudio(translatedText, targetLang);
        });

        bubbleGroup.appendChild(targetBubble);
        chatContainer.appendChild(bubbleGroup);
        scrollToBottom();
    }

    let currentAudio = null;

    function stopSpeech() {
        isSpeaking = false;
        if (window.AndroidBridge && typeof window.AndroidBridge.stop === 'function') {
            try { window.AndroidBridge.stop(); } catch (e) {}
        }
        if (currentAudio) {
            try { currentAudio.pause(); } catch (e) {}
            currentAudio = null;
        }
        if (synth && synth.speaking) {
            try { synth.cancel(); } catch (e) {}
        }
    }

    // Text to Speech logic
    function speakText(text, langCode) {
        stopSpeech();

        const rate = parseFloat(rangeRate.value) || 1.0;
        const pitch = parseFloat(rangePitch.value) || 1.0;
        const gender = selectGender.value || 'Female';

        isSpeaking = true;

        // 1. Android Native TTS Bridge (Zero latency, runs directly on phone TTS engine)
        if (window.AndroidBridge && typeof window.AndroidBridge.isAvailable === 'function' && window.AndroidBridge.isAvailable()) {
            try {
                const spoken = window.AndroidBridge.speak(text, langCode, rate, pitch);
                if (spoken) {
                    const durationMs = Math.max(1200, Math.min(12000, (text.length * 65) / rate));
                    setTimeout(() => { isSpeaking = false; }, durationMs);
                    return;
                }
            } catch (err) {
                console.warn("Android native TTS bridge failed, falling back to server audio...", err);
            }
        }

        // 2. Server-side Audio Stream (/api/tts with multi-tier Google Translate TTS fallback)
        try {
            const audioUrl = `/api/tts?text=${encodeURIComponent(text)}&lang=${encodeURIComponent(langCode)}&rate=${rate}&pitch=${pitch}&gender=${gender}`;
            currentAudio = new Audio(audioUrl);
            currentAudio.onended = () => { isSpeaking = false; };
            currentAudio.onerror = () => {
                isSpeaking = false;
                console.warn("Server audio playback failed, falling back to Web Speech API");
                fallbackSpeakText(text, langCode);
            };
            currentAudio.play().catch(err => {
                isSpeaking = false;
                console.warn("Audio play() rejected, falling back to Web Speech API", err);
                fallbackSpeakText(text, langCode);
            });
        } catch (e) {
            isSpeaking = false;
            console.warn("Failed to initiate audio play, falling back", e);
            fallbackSpeakText(text, langCode);
        }
    }

    // Fallback using client-side Web Speech Synthesis API
    function fallbackSpeakText(text, langCode) {
        if (!synth) return;
        
        if (synth.speaking) {
            synth.cancel();
        }

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = parseFloat(rangeRate.value);
        utterance.pitch = parseFloat(rangePitch.value);
        
        // Find best voice match for target language
        let matchedVoice = null;
        matchedVoice = voices.find(v => v.lang.toLowerCase() === langCode.toLowerCase());
        
        if (!matchedVoice) {
            const baseLang = langCode.split('-')[0].toLowerCase();
            matchedVoice = voices.find(v => v.lang.toLowerCase().startsWith(baseLang));
        }

        if (!matchedVoice && langCode.toLowerCase().startsWith('en')) {
            matchedVoice = voices.find(v => v.lang.toLowerCase().startsWith('en'));
        }

        if (matchedVoice) {
            utterance.voice = matchedVoice;
        } else {
            utterance.lang = langCode;
        }

        synth.speak(utterance);
    }

    // Download TTS Audio logic
    function downloadAudio(text, langCode) {
        const rate = rangeRate.value;
        const pitch = rangePitch.value;
        const gender = selectGender.value;
        const downloadUrl = `/api/tts?text=${encodeURIComponent(text)}&lang=${encodeURIComponent(langCode)}&rate=${rate}&pitch=${pitch}&gender=${gender}&download=1`;
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `translation_${langCode.split('-')[0]}.mp3`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    // History and local storage helpers
    function saveToHistory(srcText, tgtText, srcLang, tgtLang) {
        let history = JSON.parse(localStorage.getItem('translator_history') || '[]');
        history.push({ srcText, tgtText, srcLang, tgtLang, timestamp: Date.now() });
        // Keep max 50 items
        if (history.length > 50) history.shift();
        localStorage.setItem('translator_history', JSON.stringify(history));
    }

    function loadHistory() {
        const history = JSON.parse(localStorage.getItem('translator_history') || '[]');
        if (history.length > 0) {
            emptyState.style.display = 'none';
            chatContainer.innerHTML = '';
            
            history.forEach(item => {
                const bubbleGroup = document.createElement('div');
                bubbleGroup.className = 'chat-bubble-group';

                const srcOption = [...selectSrcLang.options].find(o => o.value === item.srcLang);
                const tgtOption = [...selectTgtLang.options].find(o => o.value === item.tgtLang);
                
                const srcLangName = srcOption ? srcOption.text.split(' ')[0] : item.srcLang;
                const tgtLangName = tgtOption ? tgtOption.text.split(' ')[0] : item.tgtLang;

                const sourceBubble = document.createElement('div');
                sourceBubble.className = 'chat-bubble source';
                sourceBubble.innerHTML = `<span class="bubble-lang">${srcLangName}</span>${escapeHtml(item.srcText)}`;
                bubbleGroup.appendChild(sourceBubble);

                const targetBubble = document.createElement('div');
                targetBubble.className = 'chat-bubble target';
                targetBubble.innerHTML = `
                    <span class="bubble-lang">${tgtLangName}</span>
                    <span class="translated-content">${escapeHtml(item.tgtText)}</span>
                    <div class="bubble-actions">
                        <button class="play-bubble-voice" title="Speak translation">
                            <i class="fa-solid fa-volume-high"></i>
                        </button>
                        <button class="download-bubble-voice" title="Download translation audio">
                            <i class="fa-solid fa-download"></i>
                        </button>
                    </div>
                `;

                const playBtn = targetBubble.querySelector('.play-bubble-voice');
                playBtn.addEventListener('click', () => {
                    speakText(item.tgtText, item.tgtLang);
                });

                const downloadBtn = targetBubble.querySelector('.download-bubble-voice');
                downloadBtn.addEventListener('click', () => {
                    downloadAudio(item.tgtText, item.tgtLang);
                });

                bubbleGroup.appendChild(targetBubble);
                chatContainer.appendChild(bubbleGroup);
            });
            scrollToBottom();
        }
    }

    btnClearChat.addEventListener('click', () => {
        if (confirm('Clear chat history?')) {
            localStorage.removeItem('translator_history');
            chatContainer.innerHTML = '';
            emptyState.style.display = 'flex';
            if (synth) synth.cancel();
        }
    });

    // Helper functions
    function scrollToBottom() {
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    function escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
});
