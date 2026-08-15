import os
import socket
import io
from flask import Flask, request, jsonify, render_template, send_file

try:
    from deep_translator import GoogleTranslator
    import edge_tts
except ImportError:
    # Auto-install dependencies if deep-translator or edge-tts is not present
    import subprocess
    import sys
    subprocess.check_call([sys.executable, "-m", "pip", "install", "deep-translator", "flask", "edge-tts"])
    from deep_translator import GoogleTranslator
    import edge_tts

app = Flask(__name__, template_folder='templates', static_folder='static')

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

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/translate', methods=['POST'])
def translate():
    data = request.get_json() or {}
    text = data.get('text', '')
    source_lang = data.get('source_lang', 'auto')
    target_lang = data.get('target_lang', 'en')

    if not text.strip():
        return jsonify({'error': 'No text provided'}), 400

    try:
        # Standardize language codes if necessary. 
        # deep-translator uses standard 2-character iso codes, or codes like 'zh-CN'.
        # Indian languages are supported (hi, ta, te, kn, ml, bn, mr, gu, pa, ur, etc.)
        # If the code passed is like 'hi-IN', we extract the first 2 characters 'hi'
        # unless it is a specific compound code like 'zh-CN'.
        src = source_lang.split('-')[0] if source_lang != 'auto' else 'auto'
        tgt = target_lang.split('-')[0]

        # Use GoogleTranslator (does not require API key)
        translator = GoogleTranslator(source=src, target=tgt)
        translated_text = translator.translate(text)

        return jsonify({
            'original_text': text,
            'translated_text': translated_text,
            'source_lang': source_lang,
            'target_lang': target_lang
        })
    except Exception as e:
        print(f"Translation error: {e}")
        return jsonify({'error': str(e)}), 500

VOICE_MAPPING = {
    'hi-in': {'Female': 'hi-IN-SwaraNeural', 'Male': 'hi-IN-PrabhatNeural'},
    'en-in': {'Female': 'en-IN-NeerjaNeural', 'Male': 'en-IN-PrabhatNeural'},
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

@app.route('/api/tts', methods=['GET'])
def text_to_speech():
    text = request.args.get('text', '')
    lang = request.args.get('lang', 'en')
    rate = request.args.get('rate', '1.0')
    pitch = request.args.get('pitch', '1.0')
    gender = request.args.get('gender', 'Female')

    if not text.strip():
        return jsonify({'error': 'No text provided'}), 400

    try:
        import asyncio
        import edge_tts

        # Convert numeric rate/pitch to edge-tts percentage formats
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
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    fp.write(chunk["data"])
            fp.seek(0)
            return fp

        fp = asyncio.run(generate_speech())

        return send_file(
            fp,
            mimetype='audio/mpeg',
            as_attachment=True,
            download_name=f'translated_{gender.lower()}.mp3'
        )
    except Exception as e:
        print(f"TTS Generation Error: {e}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    local_ip = get_local_ip()
    port = 5000
    print("\n" + "="*60)
    print(" AARKAY'S VOICE TRANSLATOR SERVER IS STARTING (SECURE)...")
    print(f" * Local Address:   https://localhost:{port}")
    print(f" * Network Address: https://{local_ip}:{port}")
    print(" Connect your mobile phone to the SAME Wi-Fi network and enter")
    print(f" the Network Address above in your mobile browser to run the app!")
    print(" NOTE: When your phone displays 'Your connection is not private',")
    print(" tap 'Advanced' -> 'Proceed to...' to continue. This enables")
    print(" secure microphone access natively.")
    print("="*60 + "\n")
    
    app.run(host='0.0.0.0', port=port, ssl_context='adhoc', debug=True)


