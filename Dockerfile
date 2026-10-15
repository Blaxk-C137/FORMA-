# syntax=docker/dockerfile:1

# Build the Vite UI separately. Its hosted-mode flag ensures the UI discloses
# that speech audio is sent to this Render service for local-model inference.
FROM node:20-bookworm-slim AS ui-build
WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY frontend/ ./
ARG VITE_FORMA_HOSTED_MODE=1
ENV VITE_FORMA_HOSTED_MODE=${VITE_FORMA_HOSTED_MODE}
RUN npm run build

# Python runtime: CPU PyTorch, local speech dependencies, and bundled models.
FROM python:3.12-slim AS app
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    FORMA_MODELS_DIR=/opt/forma/models \
    HF_HUB_DISABLE_TELEMETRY=1

WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates libgomp1 passwd \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt /app/backend/requirements.txt
RUN python -m pip install --no-cache-dir --upgrade pip \
    && python -m pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu torch \
    && python -m pip install --no-cache-dir -r /app/backend/requirements.txt \
    && python -m pip check

# Keep this layer independent from ordinary app-code changes so Docker can
# reuse the model-download layer when the backend or UI is edited.
COPY backend/download_models.py /app/backend/download_models.py
RUN mkdir -p /opt/forma/models \
    && python /app/backend/download_models.py \
    && chmod -R a+rX /opt/forma/models

# Runtime inference is offline; weights are already included in the image.
ENV HF_HUB_OFFLINE=1 \
    TRANSFORMERS_OFFLINE=1 \
    HOME=/home/forma \
    HF_HOME=/home/forma/.cache/huggingface
RUN groupadd --system forma \
    && useradd --system --gid forma --home-dir /home/forma --create-home forma \
    && mkdir -p /home/forma/.cache/huggingface \
    && chown -R forma:forma /home/forma

COPY backend/ /app/backend/
COPY --from=ui-build /build/frontend/dist /app/frontend/dist

# download_models.py verified each file after download; this keeps a cheap
# final assertion in the image build without loading the models into RAM.
RUN test -s /opt/forma/models/whisper-tiny/config.json \
    && test -s /opt/forma/models/whisper-tiny/model.safetensors \
    && test -s /opt/forma/models/en_US-lessac-medium.onnx \
    && test -s /opt/forma/models/en_US-lessac-medium.onnx.json \
    && test -s /opt/forma/models/en_GB-alba-medium.onnx \
    && test -s /opt/forma/models/en_GB-alba-medium.onnx.json

USER forma
WORKDIR /app/backend

EXPOSE 10000
CMD ["sh", "-c", "exec uvicorn main:app --host 0.0.0.0 --port ${PORT:-10000}"]
