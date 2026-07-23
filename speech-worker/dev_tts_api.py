import asyncio
import logging
import shutil
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path
from threading import Lock
from typing import AsyncIterator
from uuid import uuid4

import edge_tts
from edge_tts.exceptions import NoAudioReceived
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field

MAX_TTS_ATTEMPTS = 4
MAX_VIDEO_SIZE = 600 * 1024 * 1024
MAX_VIDEO_DURATION = 2 * 60 * 60
VIDEO_TYPES = {'video/mp4', 'video/webm', 'video/quicktime'}
LANGUAGES = {'zh', 'en', 'ja', 'ko'}
JOBS_DIR = Path(tempfile.gettempdir()) / 'jws-media-jobs'
MODEL_DIR = Path(tempfile.gettempdir()) / 'jws-whisper-models'
logger = logging.getLogger('uvicorn.error')
jobs: dict[str, dict[str, object]] = {}
tasks: set[asyncio.Task] = set()
model = None
model_lock = Lock()


class TtsInput(BaseModel):
  text: str = Field(min_length=1, max_length=5000)
  voice: str = Field(min_length=1, max_length=200)
  rate: int = Field(ge=-50, le=100)
  pitch: int = Field(ge=-50, le=50)
  volume: int = Field(ge=-50, le=100)


@asynccontextmanager
async def lifespan(_: FastAPI):
  shutil.rmtree(JOBS_DIR, ignore_errors=True)
  yield
  shutil.rmtree(JOBS_DIR, ignore_errors=True)


app = FastAPI(title='Local Media API', lifespan=lifespan)


@app.get('/health')
async def health():
  return {'status': 'ok'}


@app.get('/api/media/voices')
async def voices():
  try:
    items = await edge_tts.list_voices()
  except Exception as err:
    raise HTTPException(status_code=502, detail='voice list failed') from err
  return {'data': [
    {
      'name': item['ShortName'],
      'locale': item['Locale'],
      'gender': item['Gender'],
      'displayName': item.get('FriendlyName') or item['ShortName'],
    }
    for item in items
    if item.get('ShortName') and item.get('Locale') and item.get('Gender') in ('Female', 'Male')
  ]}


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


@app.post('/api/media/tts')
async def tts(input: TtsInput):
  try:
    audio = await audio_bytes(input)
  except NoAudioReceived as err:
    raise HTTPException(status_code=502, detail='当前音色没有返回音频，请确认文字语言与音色匹配后重试') from err
  logger.info('TTS generated voice=%s text_length=%d bytes=%d', input.voice, len(input.text), len(audio))
  return Response(audio, media_type='audio/mpeg')


def transcribe_path(job_id: str, path: Path, language: str | None):
  global model
  import av

  with av.open(str(path)) as source:
    if not source.streams.audio:
      raise ValueError('NO_AUDIO')
    duration = float(source.duration / av.time_base) if source.duration else 0
    if duration > MAX_VIDEO_DURATION:
      raise ValueError('VIDEO_TOO_LONG')

  with model_lock:
    if model is None:
      from faster_whisper import WhisperModel
      MODEL_DIR.mkdir(parents=True, exist_ok=True)
      logger.info('Loading Whisper model=small')
      model = WhisperModel('small', device='cpu', compute_type='int8', download_root=str(MODEL_DIR))
    segments, info = model.transcribe(str(path), language=language, vad_filter=True)
    result = []
    for idx, segment in enumerate(segments):
      if jobs.get(job_id, {}).get('status') == 'canceled':
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


async def run_transcription(job_id: str, path: Path, language: str | None):
  try:
    job = jobs.get(job_id)
    if not job or job['status'] == 'canceled':
      return
    job['status'] = 'running'
    logger.info('Transcription started job=%s language=%s', job_id, language or 'auto')
    result = await asyncio.to_thread(transcribe_path, job_id, path, language)
    if job['status'] == 'canceled':
      return
    job.update(status='succeeded', **result)
    logger.info('Transcription succeeded job=%s segments=%d', job_id, len(result['segments']))
  except InterruptedError:
    logger.info('Transcription canceled job=%s', job_id)
  except ValueError as err:
    job = jobs.get(job_id)
    if job and job['status'] != 'canceled':
      job['status'] = 'failed'
      job['error'] = {
        'NO_AUDIO': '视频没有可识别的音轨',
        'VIDEO_TOO_LONG': '视频时长不能超过两小时',
      }.get(str(err), '视频文件无法读取或格式损坏')
    logger.warning('Transcription rejected job=%s reason=%s', job_id, err)
  except Exception as err:
    job = jobs.get(job_id)
    if job and job['status'] != 'canceled':
      job['status'] = 'failed'
      job['error'] = '字幕模型加载或识别失败，请查看 Worker 日志'
    logger.error('Transcription failed job=%s error=%s', job_id, type(err).__name__)
  finally:
    shutil.rmtree(path.parent, ignore_errors=True)


@app.post('/api/media/transcriptions', status_code=202)
async def create_transcription(file: UploadFile = File(...), language: str | None = Form(None)):
  if file.content_type not in VIDEO_TYPES:
    raise HTTPException(status_code=415, detail='请选择 MP4、WebM 或 MOV 视频')
  if language and language not in LANGUAGES:
    raise HTTPException(status_code=400, detail='识别语言无效')
  if any(job['status'] in ('queued', 'running') for job in jobs.values()):
    raise HTTPException(status_code=409, detail='已有字幕识别任务正在处理')

  job_id = str(uuid4())
  job_dir = JOBS_DIR / job_id
  path = job_dir / 'input'
  size = 0
  try:
    job_dir.mkdir(parents=True)
    with path.open('xb') as output:
      while chunk := await file.read(1024 * 1024):
        size += len(chunk)
        if size > MAX_VIDEO_SIZE:
          raise HTTPException(status_code=413, detail='视频文件不能超过 600MB')
        output.write(chunk)
    if not size:
      raise HTTPException(status_code=400, detail='视频文件为空')
  except Exception:
    shutil.rmtree(job_dir, ignore_errors=True)
    raise
  finally:
    await file.close()

  job = {'id': job_id, 'status': 'queued'}
  jobs[job_id] = job
  task = asyncio.create_task(run_transcription(job_id, path, language))
  tasks.add(task)
  task.add_done_callback(tasks.discard)
  return {'data': job.copy()}


@app.get('/api/media/transcriptions/{job_id}')
async def get_transcription(job_id: str):
  job = jobs.get(job_id)
  if not job:
    raise HTTPException(status_code=404, detail='字幕识别任务不存在')
  return {'data': job.copy()}


@app.delete('/api/media/transcriptions/{job_id}')
async def cancel_transcription(job_id: str):
  job = jobs.get(job_id)
  if job and job['status'] in ('queued', 'running'):
    job['status'] = 'canceled'
  return {'data': {'deleted': True}}
