import os
import socket
import io
import requests
from flask import Flask, request, jsonify, render_template, send_file

try:
    from deep_translator import GoogleTranslator
    import edge_tts
except ImportError:
    # Auto-install dependencies if deep-translator or edge-tts is not present
    import subprocess
    import sys
    subprocess.check_call([sys.executable, "-m", "pip", "install", "deep-translator", "flask", "edge-tts>=7.3.1", "requests", "pyopenssl"])
    from deep_translator import GoogleTranslator
    import edge_tts

app = Flask(__name__, template_folder='templates', static_folder='static')
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0

@app.after_request
def add_header(response):
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

def get_local_ip():
    """Gets the local IP address of the machine running the server."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        # doesn't even have to be reachable
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
    except Exception:
        ip = '127.0.0.1'
    finally:
        s.close()
    return ip

def perform_translation(text, source_lang='auto', target_lang='en'):
    """Performs translation using a robust multi-tier fallback strategy for 100% uptime."""
    import urllib.parse

    def get_code(lang):
        if not lang or lang == 'auto':
            return 'auto'
        if '-' in lang and lang not in ['zh-CN', 'zh-TW']:
            return lang.split('-')[0]
        return lang

    src = get_code(source_lang)
    tgt = get_code(target_lang)

    # Tier 1: Google Translate Chrome Extension Client (dict-chrome-ex) - High speed, 0 rate limit on datacenter IPs
    try:
        url = 'https://clients5.google.com/translate_a/single'
        params = {'client': 'dict-chrome-ex', 'sl': src, 'tl': tgt, 'dt': 't', 'q': text}
        headers = {'User-Agent': 'Mozilla/5.0 (Android 12; Mobile)'}
        r = requests.get(url, params=params, headers=headers, timeout=6)
        if r.status_code == 200:
            data = r.json()
            if data and data[0]:
                parts = [item[0] for item in data[0] if item and item[0]]
                res = ''.join(parts)
                if res.strip():
                    return res
    except Exception as e:
        print(f"Tier 1 translation error: {e}")

    # Tier 2: Google Translate Android Native Client (client=at)
    try:
        url = 'https://translate.googleapis.com/translate_a/single'
        params = {'client': 'at', 'sl': src, 'tl': tgt, 'dt': 't', 'q': text}
        headers = {'User-Agent': 'GoogleTranslate/6.28.0.05.351341070 (Linux; U; Android 11; Pixel 5)'}
        r = requests.get(url, params=params, headers=headers, timeout=6)
        if r.status_code == 200:
            data = r.json()
            if data and data[0]:
                parts = [item[0] for item in data[0] if item and item[0]]
                res = ''.join(parts)
                if res.strip():
                    return res
    except Exception as e:
        print(f"Tier 2 translation error: {e}")

    # Tier 3: Google Translate Mobile App Client (client=gtx)
    try:
        url = 'https://translate.googleapis.com/translate_a/single'
        params = {'client': 'gtx', 'sl': src, 'tl': tgt, 'dt': 't', 'q': text}
        headers = {'User-Agent': 'AndroidTranslate/5.3.0.RC02.130440794'}
        r = requests.get(url, params=params, headers=headers, timeout=6)
        if r.status_code == 200:
            data = r.json()
            if data and data[0]:
                parts = [item[0] for item in data[0] if item and item[0]]
                res = ''.join(parts)
                if res.strip():
                    return res
    except Exception as e:
        print(f"Tier 3 translation error: {e}")

    # Tier 4: GoogleTranslator from deep-translator
    try:
        translator = GoogleTranslator(source=src, target=tgt)
        translated = translator.translate(text)
        if translated and translated.strip():
            return translated
    except Exception as e:
        print(f"Tier 4 translation error: {e}")

    # Tier 5: MyMemory Free Translation API Fallback
    try:
        url = f"https://api.mymemory.translated.net/get?q={urllib.parse.quote(text)}&langpair={src}|{tgt}"
        r = requests.get(url, timeout=6)
        if r.status_code == 200:
            res_data = r.json()
            translated_text = res_data.get('responseData', {}).get('translatedText', '')
            if translated_text and translated_text.strip() and not translated_text.startswith('QUERY LENGTH LIMIT EXCEEDED'):
                return translated_text
    except Exception as e:
        print(f"Tier 5 translation error: {e}")

    raise Exception("All translation services were temporarily unavailable. Please try again.")


@app.route('/')
def index():
    return render_template('index.html', local_ip=get_local_ip())

@app.route('/api/translate', methods=['POST'])
def translate():
    data = request.get_json() or {}
    text = data.get('text', '')
    source_lang = data.get('source_lang', 'auto')
    target_lang = data.get('target_lang', 'en')

    if not text.strip():
        return jsonify({'error': 'No text provided'}), 400

    try:
        translated_text = perform_translation(text, source_lang, target_lang)

        return jsonify({
            'original_text': text,
            'translated_text': translated_text,
            'source_lang': source_lang,
            'target_lang': target_lang
        })
    except Exception as e:
        print(f"Translation error: {e}")
        return jsonify({'error': str(e)}), 500


OCR_LANGUAGE_MAP = {
    'te': 'tel', 'te-in': 'tel',
    'hi': 'hin', 'hi-in': 'hin',
    'ta': 'tam', 'ta-in': 'tam',
    'kn': 'kan', 'kn-in': 'kan',
    'ml': 'mal', 'ml-in': 'mal',
    'bn': 'ben', 'bn-in': 'ben',
    'mr': 'mar', 'mr-in': 'mar',
    'gu': 'guj', 'gu-in': 'guj',
    'pa': 'pan', 'pa-in': 'pan',
    'or': 'ori', 'or-in': 'ori',
    'ur': 'urd', 'ur-in': 'urd',
    'es': 'spa', 'es-es': 'spa',
    'fr': 'fre', 'fr-fr': 'fre',
    'de': 'ger', 'de-de': 'ger',
    'ja': 'jpn', 'ja-jp': 'jpn',
    'en': 'eng', 'en-in': 'eng',
}

SCRIPT_UNICODE_RANGES = {
    'te': (0x0C00, 0x0C7F),  # Telugu
    'hi': (0x0900, 0x097F),  # Devanagari (Hindi)
    'mr': (0x0900, 0x097F),  # Marathi
    'ta': (0x0B80, 0x0BFF),  # Tamil
    'kn': (0x0C80, 0x0CFF),  # Kannada
    'ml': (0x0D00, 0x0D7F),  # Malayalam
    'bn': (0x0980, 0x09FF),  # Bengali
    'gu': (0x0A80, 0x0AFF),  # Gujarati
    'pa': (0x0A00, 0x0A7F),  # Gurmukhi (Punjabi)
    'or': (0x0B00, 0x0B7F),  # Odia
    'ur': (0x0600, 0x06FF),  # Urdu/Arabic
    'ja': (0x3040, 0x30FF),  # Japanese
}

def verify_script_match(text, lang_code):
    """Verifies that extracted text is not hallucinated Latin gibberish when an Indic/non-Latin script was requested."""
    if not text or not lang_code:
        return True
    clean_code = lang_code.lower().split('-')[0]
    if clean_code in ['en', 'es', 'fr', 'de', 'auto']:
        return True
    char_range = SCRIPT_UNICODE_RANGES.get(clean_code)
    if not char_range:
        return True
    start, end = char_range
    count = sum(1 for c in text if start <= ord(c) <= end)
    # If the text has 0 matching script characters and is fairly long, it's hallucinated
    if len(text.strip()) > 10 and count == 0:
        return False
    return True


def clean_ocr_text(text, lang_code=''):
    """Cleans up OCR noise artifacts, isolated Latin noise characters, and stray symbols from scanned text."""
    if not text:
        return ""
    import re
    cleaned = re.sub(r'[\r\n]+', ' ', text)
    # Remove OCR noise symbols like currency signs, repeated pipes, broken brackets, operators
    cleaned = re.sub(r'[£€$¥¢©®™§|\\~`<>«»=+_]+', ' ', cleaned)
    cleaned = re.sub(r'[:;]{2,}', ' ', cleaned)
    cleaned = re.sub(r'\(\s*\)', ' ', cleaned)
    cleaned = re.sub(r'\[\s*\]', ' ', cleaned)
    cleaned = re.sub(r'\{\s*\}', ' ', cleaned)

    clean_code = (lang_code or '').lower().split('-')[0]
    is_indic = clean_code in ['te', 'hi', 'ta', 'kn', 'ml', 'bn', 'mr', 'gu', 'pa', 'or', 'ur']
    if is_indic:
        # Strip isolated short Latin noise words (e.g. 'wen', 'WH', 'Been', 'Le', 'DEF', 'mw', 'Por')
        cleaned = re.sub(r'(?<=[^\w]|^)[a-zA-Z]{1,4}(?=[^\w]|$)', ' ', cleaned)

    cleaned = re.sub(r'\s{2,}', ' ', cleaned).strip()
    return cleaned


def extract_text_from_image(image_bytes=None, base64_str=None, source_lang='auto'):
    """Multi-tier OCR extractor: OCR.space Engine 3/2/1 with language routing and script verification -> local pytesseract fallback."""
    import base64
    import requests

    ocr_api_key = os.environ.get('OCR_SPACE_API_KEY', 'helloworld')
    url = 'https://api.ocr.space/parse/image'

    # Prepare base64 image data uri if we have raw bytes
    if not base64_str and image_bytes:
        encoded = base64.b64encode(image_bytes).decode('utf-8')
        base64_str = f"data:image/jpeg;base64,{encoded}"

    clean_lang = (source_lang or 'auto').lower().split('-')[0]
    ocr_lang = OCR_LANGUAGE_MAP.get(source_lang.lower() if source_lang else 'auto', OCR_LANGUAGE_MAP.get(clean_lang, 'auto'))
    is_indic = clean_lang in ['te', 'hi', 'ta', 'kn', 'ml', 'bn', 'mr', 'gu', 'pa', 'or', 'ur']

    # For Indic scripts, prioritize exact language code to avoid Latin hallucination
    if is_indic:
        engine_sequence = [
            {'engine': '3', 'lang': ocr_lang},
            {'engine': '3', 'lang': 'auto'},
        ]
    else:
        engine_sequence = [
            {'engine': '2', 'lang': ocr_lang if ocr_lang != 'eng' else ''},
            {'engine': '1', 'lang': ocr_lang},
            {'engine': '3', 'lang': 'auto'}
        ]

    for attempt in engine_sequence:
        try:
            payload = {
                'apikey': ocr_api_key,
                'base64Image': base64_str,
                'OCREngine': attempt['engine'],
                'scale': 'true',
                'detectOrientation': 'true',
                'isOverlayRequired': 'false'
            }
            if attempt.get('lang') and attempt['lang'] != 'auto':
                payload['language'] = attempt['lang']
            headers = {'User-Agent': 'VoiceTranslatorApp/2.3'}
            r = requests.post(url, data=payload, headers=headers, timeout=18)
            if r.status_code == 200:
                res_json = r.json()
                parsed_results = res_json.get('ParsedResults', [])
                if parsed_results and parsed_results[0].get('ParsedText'):
                    text = parsed_results[0]['ParsedText'].strip()
                    if text and verify_script_match(text, source_lang):
                        return clean_ocr_text(text, source_lang)
                    elif text:
                        print(f"OCR.space text rejected due to script mismatch for {source_lang}: {text[:60]}")
        except Exception as e:
            print(f"OCR.space attempt {attempt} failed: {e}")

    # Local pytesseract fallback if installed
    try:
        import pytesseract
        from PIL import Image
        if image_bytes:
            img = Image.open(io.BytesIO(image_bytes))
        else:
            raw_b64 = base64_str.split(',', 1)[-1]
            img = Image.open(io.BytesIO(base64.b64decode(raw_b64)))
        tess_lang = ocr_lang if ocr_lang != 'auto' else 'eng'
        text = pytesseract.image_to_string(img, lang=tess_lang).strip()
        if text and verify_script_match(text, source_lang):
            return clean_ocr_text(text, source_lang)
    except Exception as e:
        print(f"Local pytesseract fallback not available: {e}")

    return ""


@app.route('/api/ocr', methods=['POST'])
def scan_and_translate_ocr():
    target_lang = 'en'
    source_lang = 'auto'
    image_bytes = None
    base64_str = None

    if request.is_json:
        data = request.get_json() or {}
        base64_str = data.get('image', '')
        target_lang = data.get('target_lang', 'en')
        source_lang = data.get('source_lang', 'auto')
    else:
        if 'image' in request.files:
            file = request.files['image']
            image_bytes = file.read()
        elif 'image' in request.form:
            base64_str = request.form.get('image')
        target_lang = request.form.get('target_lang', 'en')
        source_lang = request.form.get('source_lang', 'auto')

    if not image_bytes and not base64_str:
        return jsonify({'error': 'No image provided for scanning'}), 400

    try:
        extracted_text = extract_text_from_image(image_bytes=image_bytes, base64_str=base64_str, source_lang=source_lang)
        if not extracted_text:
            return jsonify({
                'error': f'Could not accurately read {source_lang} notice on server.',
                'fallback_client': True
            }), 422

        # Translate extracted text
        translated_text = perform_translation(extracted_text, source_lang=source_lang, target_lang=target_lang)

        return jsonify({
            'original_text': extracted_text,
            'translated_text': translated_text,
            'source_lang': source_lang,
            'target_lang': target_lang
        })
    except Exception as e:
        print(f"OCR / Translation error: {e}")
        return jsonify({'error': f'Scan processing failed: {str(e)}'}), 500
    except Exception as e:
        print(f"OCR / Translation error: {e}")
        return jsonify({'error': f'Scan processing failed: {str(e)}'}), 500

VOICE_MAPPING = {
    'hi-in': {'Female': 'hi-IN-SwaraNeural', 'Male': 'hi-IN-MadhurNeural'},
    'en-in': {'Female': 'en-IN-NeerjaNeural', 'Male': 'en-IN-PrabhatNeural'},
    'or-in': {'Female': 'hi-IN-SwaraNeural', 'Male': 'hi-IN-MadhurNeural'},
    'ta-in': {'Female': 'ta-IN-PallaviNeural', 'Male': 'ta-IN-ValluvarNeural'},
    'te-in': {'Female': 'te-IN-ShrutiNeural', 'Male': 'te-IN-MohanNeural'},
    'kn-in': {'Female': 'kn-IN-SapnaNeural', 'Male': 'kn-IN-GaganNeural'},
    'ml-in': {'Female': 'ml-IN-SobhanaNeural', 'Male': 'ml-IN-MidhunNeural'},
    'bn-in': {'Female': 'bn-IN-TanishaNeural', 'Male': 'bn-IN-PradeepNeural'},
    'mr-in': {'Female': 'mr-IN-AarohiNeural', 'Male': 'mr-IN-ManoharNeural'},
    'gu-in': {'Female': 'gu-IN-DhwaniNeural', 'Male': 'gu-IN-NiranjanNeural'},
    'pa-in': {'Female': 'pa-IN-OjasNeural', 'Male': 'pa-IN-GurpreetNeural'},
    'ur-in': {'Female': 'ur-IN-YasminNeural', 'Male': 'ur-IN-SalmanNeural'},
    'es-es': {'Female': 'es-ES-ElviraNeural', 'Male': 'es-ES-AlvaroNeural'},
    'fr-fr': {'Female': 'fr-FR-DeniseNeural', 'Male': 'fr-FR-HenriNeural'},
    'de-de': {'Female': 'de-DE-KatjaNeural', 'Male': 'de-DE-ConradNeural'},
    'ja-jp': {'Female': 'ja-JP-NanamiNeural', 'Male': 'ja-JP-KeitaNeural'},
}

def get_voice(lang, gender):
    lang_lower = lang.lower()
    # 1. Try exact match (e.g. 'hi-in')
    if lang_lower in VOICE_MAPPING:
        return VOICE_MAPPING[lang_lower].get(gender, VOICE_MAPPING[lang_lower]['Female'])
        
    # 2. Try prefix match (e.g. 'hi')
    prefix = lang_lower.split('-')[0]
    for key, val in VOICE_MAPPING.items():
        if key.startswith(prefix):
            return val.get(gender, val['Female'])
            
    # 3. Dynamic search fallback using edge_tts.list_voices()
    try:
        import asyncio
        import edge_tts
        async def find_voice():
            voices = await edge_tts.list_voices()
            matched = [v['Name'] for v in voices if v['Locale'].lower().startswith(prefix) and v['Gender'] == gender]
            if matched:
                return matched[0]
            matched_locale = [v['Name'] for v in voices if v['Locale'].lower().startswith(prefix)]
            if matched_locale:
                return matched_locale[0]
            return None
        dynamic_voice = asyncio.run(find_voice())
        if dynamic_voice:
            return dynamic_voice
    except Exception as ex:
        print(f"Error fetching dynamic voice: {ex}")
        
    return 'en-US-AriaNeural'

def generate_google_translate_tts(text, lang='en'):
    """Fallback TTS using Google Translate TTS service with zero authentication and 100% uptime."""
    tl = lang.split('-')[0].lower() if lang else 'en'
    if tl == 'or':
        tl = 'hi'  # Fallback Odia pronunciation to Hindi on Google Translate TTS

    words = text.split()
    chunks = []
    curr = ""
    for w in words:
        if len(curr) + len(w) + 1 <= 140:
            curr = (curr + " " + w).strip()
        else:
            if curr:
                chunks.append(curr)
            curr = w
    if curr:
        chunks.append(curr)

    final_chunks = []
    for c in chunks:
        while len(c) > 140:
            final_chunks.append(c[:140])
            c = c[140:]
        if c:
            final_chunks.append(c)
    if not final_chunks:
        final_chunks = [text[:140]]

    fp = io.BytesIO()
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
    for chunk in final_chunks:
        url = 'https://translate.google.com/translate_tts'
        params = {'ie': 'UTF-8', 'tl': tl, 'client': 'tw-ob', 'q': chunk}
        r = requests.get(url, params=params, headers=headers, timeout=6)
        if r.status_code == 200:
            fp.write(r.content)
        else:
            raise Exception(f'Google TTS HTTP status {r.status_code}')
    fp.seek(0)
    return fp

def synthesize_speech(text, lang, rate, pitch, gender):
    """Multi-tier TTS synthesizer: attempts Edge-TTS first, then Google Translate TTS."""
    # Tier 1: Edge TTS
    try:
        import asyncio
        import edge_tts

        try:
            rate_val = float(rate)
            rate_percent = int((rate_val - 1.0) * 100)
            rate_str = f"{rate_percent:+d}%"
        except Exception:
            rate_str = "+0%"

        try:
            pitch_val = float(pitch)
            pitch_hz = int((pitch_val - 1.0) * 100)
            pitch_str = f"{pitch_hz:+d}Hz"
        except Exception:
            pitch_str = "+0Hz"

        voice = get_voice(lang, gender)

        async def generate_speech():
            communicate = edge_tts.Communicate(text, voice, rate=rate_str, pitch=pitch_str)
            fp = io.BytesIO()
            has_data = False
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    fp.write(chunk["data"])
                    has_data = True
            if not has_data:
                raise Exception("Empty audio stream from Edge TTS")
            fp.seek(0)
            return fp

        return asyncio.run(generate_speech())
    except Exception as e:
        print(f"Edge TTS failed ({e}), falling back to Google Translate TTS...")

    # Tier 2: Google Translate TTS (Reliable 100% uptime fallback)
    try:
        return generate_google_translate_tts(text, lang)
    except Exception as e:
        print(f"Google Translate TTS fallback error: {e}")

    raise Exception("All Text-to-Speech services were temporarily unavailable. Please try again.")

@app.route('/api/tts', methods=['GET'])
def text_to_speech():
    text = request.args.get('text', '')
    lang = request.args.get('lang', 'en')
    rate = request.args.get('rate', '1.0')
    pitch = request.args.get('pitch', '1.0')
    gender = request.args.get('gender', 'Female')
    is_download = request.args.get('download', '0') == '1'

    if not text.strip():
        return jsonify({'error': 'No text provided'}), 400

    try:
        fp = synthesize_speech(text, lang, rate, pitch, gender)

        response = send_file(
            fp,
            mimetype='audio/mpeg',
            as_attachment=is_download,
            download_name=f'translated_{gender.lower()}.mp3'
        )
        response.headers['Accept-Ranges'] = 'bytes'
        response.headers['Cache-Control'] = 'no-cache'
        return response
    except Exception as e:
        print(f"TTS Generation Error: {e}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    import threading
    from werkzeug.serving import make_server

    local_ip = get_local_ip()
    http_port = 5000
    https_port = 5001
    
    print("\n" + "="*65)
    print(" AARKAY'S VOICE TRANSLATOR SERVER IS RUNNING!")
    print(f" * Local HTTP (Instant Access): http://localhost:{http_port}")
    print(f" * Local HTTPS (Secure Mode):   https://localhost:{https_port}")
    print(f" * Mobile Wi-Fi (HTTP):         http://{local_ip}:{http_port}")
    print(f" * Mobile Wi-Fi (HTTPS):        https://{local_ip}:{https_port}")
    print(" TIP: Open http://localhost:5000 directly in your browser.")
    print(" Microphone works natively on localhost without SSL warnings!")
    print("="*65 + "\n")
    
    srv_http = make_server('0.0.0.0', http_port, app, threaded=True)
    srv_https = make_server('0.0.0.0', https_port, app, ssl_context='adhoc', threaded=True)

    t_https = threading.Thread(target=srv_https.serve_forever, daemon=True)
    t_https.start()

    try:
        srv_http.serve_forever()
    except KeyboardInterrupt:
        srv_http.shutdown()
        srv_https.shutdown()



