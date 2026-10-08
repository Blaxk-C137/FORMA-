# Lightweight Local Speech-to-Text and Text-to-Speech Web Application

## Revised Project Blueprint

This version revises the original Chapters 1–5 project so the application does **not depend on the OpenAI API or a cloud speech-recognition API**.

### Selected Models

- **STT:** Whisper Tiny (`whisper-tiny`) as the lightweight pretrained speech-recognition foundation.
- **TTS:** Piper VITS using a lightweight voice model.
- The models will run locally.
- Whisper Tiny will be fine-tuned using an appropriate speech dataset.
- TTS fine-tuning will only be performed if the selected Piper training workflow and dataset make it practical.

---

## 1. Proposed Project Title

**Design and Implementation of a Lightweight Intelligent Speech-to-Text and Text-to-Speech Web Application Using Deep Learning**

If the project must remain primarily STT-focused:

**Design and Implementation of a Lightweight Intelligent Speech-to-Text Web Application Using a Locally Fine-Tuned Deep Learning Model**

---

## 2. Project Concept

The application will allow a user to:

1. Open the web application.
2. Grant microphone permission.
3. Record speech.
4. Send the recording to the local backend.
5. Process it using Whisper Tiny.
6. Display the transcription.
7. Optionally send the generated text to Piper TTS.
8. Generate speech locally.
9. Play the generated audio.

### Core Workflow

```text
User Speech
     ↓
Microphone
     ↓
Web Interface
     ↓
Local Application Server
     ↓
Audio Preprocessing
     ↓
Whisper Tiny STT
     ↓
Transcribed Text
     ↓
Web Interface
     ↓
Optional Text-to-Speech
     ↓
Piper TTS
     ↓
Generated Audio
     ↓
Browser Playback
```

---

## 3. Relationship to the Original Project

The original document uses an external Whisper/OpenAI API. This revised implementation replaces that component with local inference and fine-tuning.

### Original

```text
Browser
   ↓
Node.js/Express
   ↓
OpenAI Speech API
   ↓
Whisper
   ↓
Transcription
```

### Revised

```text
Browser
   ↓
Local Application Server
   ↓
Audio Processing
   ↓
Whisper Tiny
   ↓
Transcription
```

The revised project removes:

- OpenAI API key
- Cloud transcription requests
- External API dependency for STT
- API authentication for transcription

It introduces:

- Local model storage
- Local inference
- Model fine-tuning
- Dataset preparation
- Training/evaluation
- Local TTS processing

---

## 4. Main Objectives

1. Design a user-friendly web interface for capturing and processing spoken input.
2. Implement microphone-based speech acquisition.
3. Integrate a lightweight local Whisper Tiny model.
4. Prepare a suitable speech dataset for fine-tuning.
5. Fine-tune the lightweight STT model.
6. Implement local speech-to-text processing.
7. Display generated transcription clearly.
8. Integrate lightweight local Piper-based TTS.
9. Evaluate transcription using Word Error Rate (WER).
10. Measure processing time under selected conditions.
11. Compare pretrained and fine-tuned STT performance.
12. Identify strengths and limitations of the developed system.

---

## 5. Scope

The project covers:

- Web-based user interface.
- Microphone speech capture.
- Audio preprocessing.
- Local speech recognition.
- Whisper Tiny.
- STT fine-tuning.
- Local text-to-speech.
- Piper-based TTS.
- Transcription display.
- Audio playback.
- Basic transcription management.
- WER evaluation.
- Response-time measurement.
- Testing under selected speech conditions.

The project does **not** include:

- Training a large ASR model from scratch.
- Reproducing the original Whisper training process.
- Training a large-scale TTS model from scratch.
- Building a commercial-scale ASR system.
- Complete natural-language understanding.
- Dependence on an OpenAI API key.

---

## 6. Model Strategy

### 6.1 Speech-to-Text

**Selected model: Whisper Tiny**

The model will be fine-tuned rather than trained from zero.

```text
Pretrained Whisper Tiny
        ↓
Training Dataset
        ↓
Fine-Tuning
        ↓
Project-Specific STT Model
```

The project contribution is the dataset preparation, fine-tuning, integration and evaluation rather than inventing the underlying Whisper architecture.

Whisper Tiny is selected because the project prioritizes low resource requirements, manageable experimentation, local inference and practical training.

### 6.2 Text-to-Speech

**Selected technology: Piper VITS**

Piper will provide lightweight local neural TTS.

```text
Generated Text
      ↓
Piper TTS
      ↓
Audio File
      ↓
Browser Audio Player
```

TTS fine-tuning should only be performed if the selected Piper training workflow and available dataset make it practical. The project should not force TTS training simply to claim that every component was trained.

---

## 7. STT Training Pipeline

```text
Dataset Collection
       ↓
Dataset Cleaning
       ↓
Audio Validation
       ↓
Transcription Verification
       ↓
Train / Validation / Test Split
       ↓
Audio Preprocessing
       ↓
Whisper Tiny Fine-Tuning
       ↓
Validation
       ↓
WER Evaluation
       ↓
Final Local Model
```

### Dataset requirements

The dataset should contain:

- Speech recordings.
- Corresponding transcriptions.
- Speaker diversity.
- Suitable research licensing/permission.
- Appropriate audio quality.
- Speech conditions relevant to the project.

If the research focus becomes Nigerian English, the evaluation dataset should contain suitable Nigerian English speech rather than assuming generic English represents Nigerian speech.

---

## 8. Model Comparison

A major experiment should compare the pretrained and fine-tuned models.

### Experiment A — Pretrained

```text
Test Speech
     ↓
Whisper Tiny
     ↓
Transcription
     ↓
WER
```

### Experiment B — Fine-Tuned

```text
Test Speech
     ↓
Fine-Tuned Whisper Tiny
     ↓
Transcription
     ↓
WER
```

### Results table

| Model | Test Samples | WER | Average Response Time |
|---|---:|---:|---:|
| Pretrained Whisper Tiny | TBD | TBD | TBD |
| Fine-Tuned Whisper Tiny | TBD | TBD | TBD |

Values must only be entered after actual experiments.

---

## 9. System Architecture

```text
┌─────────────────────┐
│        User         │
└──────────┬──────────┘
           │ Speech
           ▼
┌─────────────────────┐
│    Web Browser      │
│                     │
│ Microphone Capture  │
│ Transcription UI    │
│ Audio Player        │
└──────────┬──────────┘
           │ HTTP Request
           ▼
┌─────────────────────┐
│   Local Backend     │
│                     │
│ Audio Processing    │
│ Model Management    │
│ Application Logic   │
└──────────┬──────────┘
           │
      ┌────┴─────┐
      │          │
      ▼          ▼
┌──────────┐ ┌──────────┐
│ Whisper  │ │  Piper   │
│   Tiny   │ │   TTS    │
│   STT    │ │  VITS    │
└────┬─────┘ └────┬─────┘
     │             │
     ▼             ▼
  Text        Generated Audio
     │             │
     └──────┬──────┘
            ▼
       Web Browser
```

---

## 10. Recommended Technology Stack

### Frontend

- HTML5
- CSS3
- JavaScript
- Browser MediaRecorder API

### Backend

- Python
- FastAPI or Flask

Python is recommended for the model-serving backend because the machine-learning ecosystem is primarily Python-based.

### Machine Learning

- PyTorch
- Hugging Face Transformers
- Hugging Face Datasets
- Whisper Tiny
- Piper VITS
- Appropriate audio-processing libraries

### Development

- Visual Studio Code
- Git
- Linux/Fedora
- Python virtual environment

---

## 11. Proposed Project Structure

```text
speech-ai-project/
│
├── app/
│   ├── main.py
│   ├── routes/
│   │   ├── transcription.py
│   │   └── synthesis.py
│   │
│   ├── services/
│   │   ├── stt_service.py
│   │   ├── tts_service.py
│   │   └── audio_service.py
│   │
│   └── models/
│       ├── stt/
│       └── tts/
│
├── frontend/
│   ├── index.html
│   ├── style.css
│   └── app.js
│
├── training/
│   ├── prepare_dataset.py
│   ├── train_stt.py
│   ├── evaluate_stt.py
│   └── configs/
│
├── datasets/
│   ├── train/
│   ├── validation/
│   └── test/
│
├── evaluation/
│   ├── references/
│   ├── predictions/
│   └── results/
│
├── models/
│   ├── whisper-tiny-base/
│   ├── whisper-tiny-finetuned/
│   └── piper/
│
├── recordings/
├── scripts/
├── requirements.txt
├── .gitignore
└── README.md
```

---

## 12. Frontend Requirements

The interface should contain:

- Start Recording
- Stop Recording
- Transcribe
- Clear
- Copy Text
- Speak Text / Generate Speech

### Status states

```text
IDLE
↓
REQUESTING MICROPHONE
↓
RECORDING
↓
PROCESSING
↓
TRANSCRIPTION READY
```

For TTS:

```text
TEXT AVAILABLE
↓
GENERATING SPEECH
↓
AUDIO READY
↓
PLAYING
```

---

## 13. Backend Responsibilities

The backend should:

1. Receive audio from the browser.
2. Validate uploaded audio.
3. Convert audio to the required format if necessary.
4. Load the local Whisper Tiny model.
5. Run speech recognition.
6. Return the transcription.
7. Accept text for TTS.
8. Run the local Piper model.
9. Return generated audio.
10. Handle errors.
11. Measure processing time.
12. Clean temporary audio files when appropriate.

---

## 14. No API Key Requirement

The revised system should not require:

```text
OPENAI_API_KEY
```

There should be no OpenAI cloud transcription request.

The processing path becomes:

```text
Browser
   ↓
Your Computer
   ↓
Your Backend
   ↓
Your Local Models
```

Internet access is primarily required during setup for packages, model files and datasets. After setup, the application should be capable of operating offline.

---

## 15. Audio Processing

The application should standardize incoming audio before inference.

```text
Recorded Audio
      ↓
Format Validation
      ↓
Resampling
      ↓
Channel Normalization
      ↓
Audio Checks
      ↓
Model Input
```

The exact preprocessing pipeline should follow the requirements of the selected model.

---

## 16. STT Evaluation

The primary metric remains:

### Word Error Rate

```text
WER = (S + D + I) / N
```

Where:

- **S** = substitutions
- **D** = deletions
- **I** = insertions
- **N** = number of words in the reference transcription

Lower WER represents fewer word-level transcription errors.

---

## 17. Evaluation Conditions

Test under selected conditions.

### Speaker variation

Use multiple speakers where possible.

### Speaking speed

Compare:

- Normal speech
- Relatively slow speech
- Relatively fast speech

### Background noise

Where practical:

- Quiet environment
- Moderate background noise
- Higher background noise

### Pronunciation and accent

Evaluate different pronunciation patterns.

### Microphone quality

Compare available microphone types where practical.

---

## 18. TTS Evaluation

Evaluate TTS separately from STT.

Possible measurements:

- Generation time
- Playback success
- Intelligibility
- Pronunciation
- Consistency
- Subjective listening evaluation

Participants can rate generated speech for:

- Clarity
- Naturalness
- Intelligibility

Only actual experimental results should be reported.

---

## 19. Response-Time Evaluation

Measure:

```text
Request Started
       ↓
Model Processing
       ↓
Response Received
```

Example:

| Test | Audio Duration | Processing Time |
|---|---:|---:|
| RT01 | TBD | TBD |
| RT02 | TBD | TBD |
| RT03 | TBD | TBD |
| RT04 | TBD | TBD |
| RT05 | TBD | TBD |

Do not claim true real-time streaming unless the implementation actually performs streaming recognition.

If the application records, stops, processes and then returns text, describe it accurately as near-real-time, interactive, or record-and-transcribe.

---

## 20. Functional Testing

| Test ID | Test | Expected Result |
|---|---|---|
| TC01 | Open application | Interface loads |
| TC02 | Grant microphone permission | Microphone becomes available |
| TC03 | Start recording | Recording begins |
| TC04 | Stop recording | Audio is captured |
| TC05 | Submit recording | Audio is processed locally |
| TC06 | STT inference | Transcription is generated |
| TC07 | Display transcription | Text appears correctly |
| TC08 | Copy transcription | Text is copied |
| TC09 | Clear transcription | Text is removed |
| TC10 | Generate speech | TTS audio is generated |
| TC11 | Play generated speech | Audio plays |
| TC12 | Deny microphone permission | Clear error is shown |
| TC13 | Invalid audio | Clear error is shown |
| TC14 | Model unavailable | Clear system error is shown |

---

## 21. Training Experiments

Maintain a record of:

- Dataset used
- Dataset size
- Number of speakers
- Audio duration
- Train/validation/test split
- Preprocessing
- Model version
- Training parameters
- Number of epochs
- Batch size
- Learning rate
- Training time
- Hardware used
- Validation results

This information will provide evidence for the implementation and evaluation chapters.

---

## 22. Reproducibility

Save:

```text
Dataset configuration
Training configuration
Model version
Python dependencies
Evaluation scripts
WER results
Training logs
```

The final README should explain how the environment can be reproduced.

---

## 23. Security and Privacy

Because speech processing is local, the system can reduce the need to transmit user audio to an external service.

The application should:

- Process audio locally.
- Avoid unnecessary permanent storage.
- Delete temporary files when no longer required.
- Validate uploaded files.
- Restrict accepted audio formats.
- Avoid exposing internal filesystem paths.
- Avoid storing sensitive speech recordings unnecessarily.

---

## 24. Chapter Four Evidence

Use actual implementation evidence:

1. Application home screen.
2. Microphone permission.
3. Recording state.
4. Processing state.
5. Generated transcription.
6. TTS controls.
7. Generated audio playback.
8. Evaluation interface if included.
9. Test results.
10. WER comparison.
11. Response-time results.

Do not use placeholder screenshots in the final submission.

---

## 25. Chapter Four Results

Results must come from actual experiments.

### Pretrained Whisper Tiny

```text
Number of test samples: TBD
Average WER: TBD
Average processing time: TBD
```

### Fine-Tuned Whisper Tiny

```text
Number of test samples: TBD
Average WER: TBD
Average processing time: TBD
```

### Comparison

```text
Pretrained Model
       ↓
Baseline performance

Fine-Tuned Model
       ↓
Project-specific performance
```

Do not manufacture results.

---

## 26. Expected Strengths

Potential strengths include:

- Local processing.
- No OpenAI API key.
- Reduced dependence on internet connectivity.
- Lightweight model architecture.
- Ability to fine-tune the STT model.
- Direct control over the model and application.
- Web-based interface.
- Reproducible experiments.
- Comparison of pretrained and fine-tuned performance.
- Potential adaptation to speech patterns underrepresented in generic training data.

These should be confirmed through actual implementation and testing.

---

## 27. Expected Limitations

Potential limitations include:

- Limited computing resources.
- Whisper Tiny may be less accurate than larger models.
- Fine-tuning requires suitable data.
- Dataset quality affects model performance.
- Training can still take significant time.
- CPU-only inference may be slower.
- TTS quality depends on the selected Piper voice.
- Accent, noise and speaker variation can reduce recognition accuracy.
- Small datasets can limit generalisation.

---

## 28. Development Roadmap

### Phase 1 — Environment

- Install Python.
- Create virtual environment.
- Install ML dependencies.
- Verify PyTorch.
- Verify audio libraries.

### Phase 2 — Baseline STT

- Download Whisper Tiny.
- Load it locally.
- Test sample audio.
- Confirm transcription.

### Phase 3 — Dataset

- Select dataset.
- Prepare data.
- Validate recordings.
- Validate transcriptions.
- Create train/validation/test splits.

### Phase 4 — Fine-Tuning

- Configure training.
- Fine-tune Whisper Tiny.
- Save checkpoints.
- Monitor validation performance.
- Select final model.

### Phase 5 — STT Evaluation

- Test pretrained model.
- Test fine-tuned model.
- Calculate WER.
- Measure response time.
- Compare results.

### Phase 6 — TTS

- Install Piper.
- Download lightweight voice model.
- Verify local synthesis.
- Integrate generated audio.

### Phase 7 — Web Application

- Build frontend.
- Implement microphone recording.
- Build Python backend.
- Connect local STT.
- Connect local TTS.
- Add error handling.

### Phase 8 — Integration

- Connect all components.
- Test complete STT workflow.
- Test TTS workflow.
- Improve interface.

### Phase 9 — Testing

- Functional testing.
- Microphone testing.
- Audio testing.
- Model testing.
- WER evaluation.
- Response-time testing.
- TTS evaluation.
- Usability testing.

### Phase 10 — Documentation

- Capture screenshots.
- Record experimental results.
- Update Chapter Four.
- Update Chapter Five.
- Document limitations.
- Document recommendations.

---

## 29. Academic Positioning

The project should distinguish clearly between existing technology and the student's contribution.

### Existing technology

```text
Whisper architecture
Piper architecture
Pretrained model weights
```

### Project contribution

```text
Dataset preparation
Fine-tuning
Model evaluation
Web application
Local model integration
Testing
Performance analysis
```

The project should not claim that a new speech-recognition architecture was invented. It should state that a lightweight pretrained model was fine-tuned, integrated and evaluated as part of the developed system.

---

## 30. Definition of Done

- [ ] Whisper Tiny runs locally.
- [ ] Suitable dataset prepared.
- [ ] STT model fine-tuned.
- [ ] Fine-tuned model transcribes speech.
- [ ] Pretrained and fine-tuned models evaluated.
- [ ] WER calculated.
- [ ] Response time measured.
- [ ] Piper TTS runs locally.
- [ ] TTS output generated and played.
- [ ] Web interface completed.
- [ ] Microphone recording works.
- [ ] Backend communicates with local models.
- [ ] Error handling works.
- [ ] No OpenAI API key required.
- [ ] Application operates locally after setup.
- [ ] Functional testing completed.
- [ ] Evaluation results documented.
- [ ] Chapter Four contains real implementation evidence.
- [ ] Chapter Five is based on actual results.

---

## 31. Final System Concept

```text
                     USER
                      │
                      ▼
             ┌─────────────────┐
             │   Web Browser   │
             └────────┬────────┘
                      │
              Speech / Text
                      │
                      ▼
             ┌─────────────────┐
             │ Python Backend  │
             └────────┬────────┘
                      │
             ┌────────┴────────┐
             │                 │
             ▼                 ▼
      ┌──────────────┐   ┌──────────────┐
      │ Whisper Tiny │   │  Piper VITS  │
      │     STT      │   │     TTS      │
      └──────┬───────┘   └──────┬───────┘
             │                  │
             ▼                  ▼
       Transcribed Text    Generated Audio
             │                  │
             └────────┬─────────┘
                      ▼
                Web Interface
```

### Core Principle

**Small local models + fine-tuning + measurable evaluation + practical web application.**
