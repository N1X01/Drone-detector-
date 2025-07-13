import sounddevice as sd
import numpy as np
import time

DURATION = 5  # seconds
THRESHOLD = 0.3  # sensitivity

def detect_audio():
    print("🎤 Listening for drone sounds...")

    def callback(indata, frames, time_info, status):
        volume_norm = np.linalg.norm(indata) * 10
        timestamp = time.strftime("%H:%M:%S")
        if volume_norm > THRESHOLD:
            print(f"[{timestamp}] 🚨 Detected sound spike: {volume_norm:.2f}")

    with sd.InputStream(callback=callback):
        sd.sleep(int(DURATION * 1000))

if __name__ == "__main__":
    detect_audio()
