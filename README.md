# Drone Detector

This project contains a simple Python script for detecting loud audio events (like drones).

## Running the listener

1. Install the required dependencies:
```bash
pip install -r drone_detector/_processing/dio_processing/audio_processing/requirements.txt
```

2. Run the microphone listener:
```bash
python drone_detector/_processing/dio_processing/audio_processing/Mic_listener.py
```

The script prints a message whenever the sound level exceeds the configured threshold.
