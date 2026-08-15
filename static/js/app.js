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
    
    const hostIp = document.getElementById('host-ip');
    const btnCopyIp = document.getElementById('btn-copy-ip');

    // Keyboard Fallback Elements
    const btnToggleKeyboard = document.getElementById('btn-toggle-keyboard');
    const keyboardInputContainer = document.getElementById('keyboard-input-container');
    const textInputField = document.getElementById('text-input-field');
    const btnSendText = document.getElementById('btn-send-text');

    // App State
    let isRecording = false;
    let isContinuous = false;
    let recognition = null;
    let audioContext = null;
    let synth = window.speechSynthesis;
    let voices = [];
    let activeBubble = null;

    // Load Local IP info
    const urlScheme = document.getElementById('url-scheme');
    if (urlScheme) {
        urlScheme.textContent = window.location.protocol.replace(':', '');
    }
    hostIp.textContent = window.location.hostname;
    
    // Copy URL helper
    btnCopyIp.addEventListener('click', () => {
        const urlText = `${window.location.protocol}//${window.location.hostname}:5000`;
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
    btnOpenSettings.addEventListener('click', () => settingsDrawer.classList.add('open'));
    btnCloseSettings.addEventListener('click', () => settingsDrawer.classList.remove('open'));
    
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

    // Splash navigation
    btnStartApp.addEventListener('click', () => {
        // Unlock AudioContext for mobile browsers
        getAudioContext();
        splashScreen.classList.remove('active');
        translatorScreen.classList.add('active');
        loadHistory();
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
                let interimTranscript = '';
                let finalTranscript = '';

                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    if (event.results[i].isFinal) {
                        finalTranscript += event.results[i][0].transcript;
                    } else {
                        interimTranscript += event.results[i][0].transcript;
                    }
                }

                if (interimTranscript) {
                    statusMessage.textContent = interimTranscript;
                }

                if (finalTranscript) {
                    statusMessage.textContent = finalTranscript;
                    processTranslation(finalTranscript);
                }
            };
        } catch (initErr) {
            console.error('Speech recognition init error:', initErr);
            recognition = null;
        }
    }

    if (!recognition) {
        statusMessage.innerHTML = '<span style="color: var(--text-muted)">Speech API unavailable. Access via HTTPS/localhost, or use "Type" button below.</span>';
    }

    // Toggle Continuous Mode
    btnToggleContinuous.addEventListener('click', () => {
        isContinuous = !isContinuous;
        if (isContinuous) {
            continuousStatus.textContent = 'ON';
            continuousStatus.classList.add('active');
            btnToggleContinuous.classList.add('active');
        } else {
            continuousStatus.textContent = 'OFF';
            continuousStatus.classList.remove('active');
            btnToggleContinuous.classList.remove('active');
            if (isRecording) {
                stopRecording();
            }
        }
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
        // Unlock speech synthesis inside user interaction
        if (synth && synth.speaking) {
            synth.cancel();
        }

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
        
        // Clear active bubble context
        activeBubble = null;
        
        // Update language parameters dynamically from selectors
        recognition.lang = selectSrcLang.value;
        
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
        isRecording = false;
        btnMic.classList.remove('recording');
        waveVisualizer.classList.remove('active');
        if (statusMessage.textContent === 'Listening...' || statusMessage.textContent === 'Connecting to microphone...') {
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

            const result = await response.getJSON ? await response.getJSON() : await response.json();

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

    let currentAudio = null;

    // Text to Speech logic
    function speakText(text, langCode) {
        // Stop any currently playing audio
        if (currentAudio) {
            currentAudio.pause();
            currentAudio = null;
        }

        try {
            const rate = rangeRate.value;
            const pitch = rangePitch.value;
            const gender = selectGender.value;
            const audioUrl = `/api/tts?text=${encodeURIComponent(text)}&lang=${encodeURIComponent(langCode)}&rate=${rate}&pitch=${pitch}&gender=${gender}`;
            currentAudio = new Audio(audioUrl);
            currentAudio.play().catch(err => {
                console.warn("Server audio playback failed, falling back to Web Speech API", err);
                fallbackSpeakText(text, langCode);
            });
        } catch (e) {
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
        const downloadUrl = `/api/tts?text=${encodeURIComponent(text)}&lang=${encodeURIComponent(langCode)}&rate=${rate}&pitch=${pitch}&gender=${gender}`;
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
