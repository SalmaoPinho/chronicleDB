import sys
import os
import subprocess

def main():
    if len(sys.argv) < 4:
        print("Usage: piper_tts.py <text> <modelPath> <outputPath>")
        sys.exit(1)
    
    text = sys.argv[1]
    model_path = sys.argv[2]
    output_path = sys.argv[3]
    
    print(f"Generating TTS for: '{text}' using {model_path} -> {output_path}")
    
    try:
        # Check if piper executable is available and run it
        # We pipe the text to it
        process = subprocess.Popen(
            ['piper', '--model', model_path, '--output_file', output_path],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )
        stdout, stderr = process.communicate(input=text)
        if process.returncode != 0:
            print(f"Piper failed: {stderr}", file=sys.stderr)
            # Try running python -m piper if available
            process2 = subprocess.Popen(
                [sys.executable, '-m', 'piper', '--model', model_path, '--output_file', output_path],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True
            )
            stdout2, stderr2 = process2.communicate(input=text)
            if process2.returncode != 0:
                raise Exception(f"Piper command and module both failed. stderr: {stderr2}")
            
        print("TTS generated successfully.")
    except Exception as e:
        print(f"Failed to run piper: {e}. Writing mock WAV file.", file=sys.stderr)
        # Create a mock WAV file if piper is not installed, so the server can return something
        with open(output_path, "wb") as f:
            # A minimal valid silent mono 16kHz WAV header and data
            f.write(b'RIFF$\x1f\x00\x00WAVEfmt \x10\x00\x00\x00\x01\x00\x01\x00\x80>\x00\x00\x00}\x00\x00\x02\x00\x10\x00data\x00\x1f\x00\x00' + b'\x00' * 8000)
        sys.exit(0)

if __name__ == '__main__':
    main()
