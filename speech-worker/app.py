import asyncio
import json
import logging
import subprocess
from contextlib import asynccontextmanager
from pathlib import Path
from threading import Lock
from typing import AsyncIterator, Literal
from uuid import UUID

import edge_tts
from edge_tts.exceptions import NoAudioReceived
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from faster_whisper import WhisperModel
from pydantic import BaseModel, Field

JOBS_DIR = Path('/data/media-jobs')
MODEL_DIR = '/models'
MAX_DURATION = 2 * 60 * 60
MAX_TTS_ATTEMPTS = 4
logger = logging.getLogger('uvicorn.error')
model: WhisperModel | None = None
model_lock = Lock()


class TtsInput(BaseModel):
  text: str = Field(min_length=1, max_length=5000)
  voice: str = Field(min_length=1, max_length=200)
  rate: int = Field(ge=-50, le=100)
  pitch: int = Field(ge=-50, le=50)
  volume: int = Field(ge=-50, le=100)


class TranscribeInput(BaseModel):
  jobId: UUID
  language: Literal['zh', 'en', 'ja', 'ko'] | None = None


def load_model() -> WhisperModel:
  return WhisperModel('small', device='cpu', compute_type='int8', download_root=MODEL_DIR)


@asynccontextmanager
async def lifespan(_: FastAPI):
  global model
  JOBS_DIR.mkdir(parents=True, exist_ok=True)
  model = await asyncio.to_thread(load_model)
  yield


app = FastAPI(title='Speech Worker', lifespan=lifespan)


@app.get('/health')
async def health():
  return {'status': 'ok', 'model': 'small'}


@app.get('/voices')
async def voices():
  try:
    items = await edge_tts.list_voices()
  except Exception as err:
    raise HTTPException(status_code=502, detail='voice list failed') from err
  return [
    {
      'name': item['ShortName'],
      'locale': item['Locale'],
      'gender': item['Gender'],
      'displayName': item.get('FriendlyName') or item['ShortName'],
    }
    for item in items
    if item.get('ShortName') and item.get('Locale') and item.get('Gender') in ('Female', 'Male')
  ]


async def audio_stream(input: TtsInput) -> AsyncIterator[bytes]:
  speech = edge_tts.Communicate(
    input.text,
    input.voice,
    rate=f'{input.rate:+d}%',
    pitch=f'{input.pitch:+d}Hz',
    volume=f'{input.volume:+d}%',
  )
  async for part in speech.stream():
    if part['type'] == 'audio':
      yield part['data']


async def audio_bytes(input: TtsInput):
  for attempt in range(MAX_TTS_ATTEMPTS):
    try:
      audio = b''.join([part async for part in audio_stream(input)])
      if not audio:
        raise NoAudioReceived('no audio was received')
      return audio
    except NoAudioReceived:
      logger.warning('TTS no audio voice=%s text_length=%d attempt=%d/%d', input.voice, len(input.text), attempt + 1, MAX_TTS_ATTEMPTS)
      if attempt == MAX_TTS_ATTEMPTS - 1:
        raise
      await asyncio.sleep((attempt + 1) * 0.5)


@app.post('/tts')
async def tts(input: TtsInput):
  try:
    audio = await audio_bytes(input)
  except NoAudioReceived as err:
    raise HTTPException(status_code=502, detail='Voice returned no audio; check that text and voice languages match') from err
  logger.info('TTS generated voice=%s text_length=%d bytes=%d', input.voice, len(input.text), len(audio))
  return Response(audio, media_type='audio/mpeg')


def transcribe_file(input: TranscribeInput):
  if model is None:
    raise RuntimeError('model is not ready')
  job_dir = JOBS_DIR / str(input.jobId)
  source = job_dir / 'input'
  cancel = job_dir / 'cancel'
  if not source.is_file():
    raise FileNotFoundError('input not found')
  probe = subprocess.run(
    ['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'json', str(source)],
    capture_output=True,
    check=True,
    text=True,
  )
  duration = float(json.loads(probe.stdout)['format']['duration'])
  if duration > MAX_DURATION:
    raise ValueError('video too long')

  with model_lock:
    segments, info = model.transcribe(
      str(source),
      language=input.language,
      vad_filter=True,
    )
    result = []
    for idx, segment in enumerate(segments):
      if cancel.exists():
        raise InterruptedError('canceled')
      text = segment.text.strip()
      if text:
        result.append({
          'id': idx,
          'start': max(0, float(segment.start)),
          'end': max(float(segment.start), float(segment.end)),
          'text': text,
        })
  return {
    'language': info.language,
    'duration': float(info.duration),
    'segments': result,
  }


@app.post('/transcribe')
async def transcribe(input: TranscribeInput):
  try:
    return await asyncio.to_thread(transcribe_file, input)
  except InterruptedError as err:
    raise HTTPException(status_code=409, detail='canceled') from err
  except FileNotFoundError as err:
    raise HTTPException(status_code=404, detail='input not found') from err
  except ValueError as err:
    raise HTTPException(status_code=413, detail='video too long') from err
  except Exception as err:
    raise HTTPException(status_code=500, detail='transcription failed') from err
