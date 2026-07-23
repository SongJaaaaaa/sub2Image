import asyncio
import sys
import types
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import AsyncMock, patch

try:
  from fastapi import HTTPException
except ModuleNotFoundError:
  fastapi = types.ModuleType('fastapi')
  responses = types.ModuleType('fastapi.responses')
  pydantic = types.ModuleType('pydantic')

  class HTTPException(Exception):
    def __init__(self, status_code, detail):
      self.status_code = status_code
      self.detail = detail

  class FastAPI:
    def __init__(self, **_kwargs):
      pass

    def get(self, *_args, **_kwargs):
      return lambda fn: fn

    def post(self, *_args, **_kwargs):
      return lambda fn: fn

  class Response:
    def __init__(self, content, media_type):
      self.content = content
      self.media_type = media_type

  class BaseModel:
    def __init__(self, **values):
      for key, value in values.items():
        setattr(self, key, value)

  fastapi.FastAPI = FastAPI
  fastapi.HTTPException = HTTPException
  responses.Response = Response
  pydantic.BaseModel = BaseModel
  pydantic.Field = lambda **_kwargs: None
  sys.modules['fastapi'] = fastapi
  sys.modules['fastapi.responses'] = responses
  sys.modules['pydantic'] = pydantic

edge_tts = types.ModuleType('edge_tts')
edge_tts.list_voices = AsyncMock()
edge_tts.Communicate = object
sys.modules['edge_tts'] = edge_tts
edge_tts_exceptions = types.ModuleType('edge_tts.exceptions')


class NoAudioReceived(Exception):
  pass


edge_tts_exceptions.NoAudioReceived = NoAudioReceived
sys.modules['edge_tts.exceptions'] = edge_tts_exceptions

faster_whisper = types.ModuleType('faster_whisper')
faster_whisper.WhisperModel = object
sys.modules['faster_whisper'] = faster_whisper

import app


class Segment:
  def __init__(self, start, end, text):
    self.start = start
    self.end = end
    self.text = text


class Info:
  language = 'zh'
  duration = 3.5


class Model:
  def transcribe(self, *_args, **_kwargs):
    return [Segment(0, 1.2, ' 你好 '), Segment(1.2, 3.5, ' 世界 ')], Info()


class SpeechWorkerTests(unittest.TestCase):
  def test_normalizes_voices(self):
    edge_tts.list_voices.reset_mock()
    edge_tts.list_voices.return_value = [{
      'ShortName': 'zh-CN-XiaoxiaoNeural',
      'Locale': 'zh-CN',
      'Gender': 'Female',
      'FriendlyName': 'Xiaoxiao',
    }]
    result = asyncio.run(app.voices())
    self.assertEqual(result[0]['name'], 'zh-CN-XiaoxiaoNeural')
    self.assertEqual(result[0]['displayName'], 'Xiaoxiao')

  def test_normalizes_transcription_segments(self):
    with TemporaryDirectory() as directory:
      job_id = '2c295f07-e942-458c-bf4a-4677a039ef05'
      job_dir = Path(directory) / job_id
      job_dir.mkdir()
      (job_dir / 'input').write_bytes(b'video')
      probe = types.SimpleNamespace(stdout='{"format":{"duration":"3.5"}}')
      with patch.object(app, 'JOBS_DIR', Path(directory)), patch.object(app, 'model', Model()), patch.object(app.subprocess, 'run', return_value=probe):
        result = app.transcribe_file(app.TranscribeInput(jobId=job_id))
    self.assertEqual(result['language'], 'zh')
    self.assertEqual(result['segments'][0], {'id': 0, 'start': 0, 'end': 1.2, 'text': '你好'})

  def test_converts_tts_parameters_and_streams_chinese_mp3(self):
    calls = []

    class Speech:
      def __init__(self, text, voice, **options):
        calls.append((text, voice, options))

      async def stream(self):
        yield {'type': 'audio', 'data': b'mp3-data'}
        yield {'type': 'WordBoundary', 'text': '你好'}

    input = app.TtsInput(
      text='你好，欢迎使用音色工具。',
      voice='zh-CN-XiaoxiaoNeural',
      rate=20,
      pitch=-5,
      volume=10,
    )

    async def collect():
      return b''.join([part async for part in app.audio_stream(input)])

    with patch.object(app.edge_tts, 'Communicate', Speech):
      audio = asyncio.run(collect())

    self.assertEqual(audio, b'mp3-data')
    self.assertEqual(calls[0], (
      '你好，欢迎使用音色工具。',
      'zh-CN-XiaoxiaoNeural',
      {'rate': '+20%', 'pitch': '-5Hz', 'volume': '+10%'},
    ))

  def test_retries_when_edge_returns_no_audio(self):
    attempts = []

    class Speech:
      def __init__(self, *_args, **_kwargs):
        self.attempt = len(attempts)
        attempts.append(self.attempt)

      async def stream(self):
        if self.attempt == 0:
          raise app.NoAudioReceived('temporary failure')
        yield {'type': 'audio', 'data': b'mp3-data'}

    input = app.TtsInput(
      text='试听文字',
      voice='zh-CN-XiaoxiaoNeural',
      rate=0,
      pitch=0,
      volume=0,
    )
    with patch.object(app.edge_tts, 'Communicate', Speech):
      audio = asyncio.run(app.audio_bytes(input))

    self.assertEqual(audio, b'mp3-data')
    self.assertEqual(len(attempts), 2)

  def test_reports_video_without_audio_as_transcription_error(self):
    class NoAudioModel:
      def transcribe(self, *_args, **_kwargs):
        raise RuntimeError('no audio stream')

    with TemporaryDirectory() as directory:
      job_id = '2c295f07-e942-458c-bf4a-4677a039ef05'
      job_dir = Path(directory) / job_id
      job_dir.mkdir()
      (job_dir / 'input').write_bytes(b'video')
      probe = types.SimpleNamespace(stdout='{"format":{"duration":"3.5"}}')
      with patch.object(app, 'JOBS_DIR', Path(directory)), patch.object(app, 'model', NoAudioModel()), patch.object(app.subprocess, 'run', return_value=probe):
        with self.assertRaises(HTTPException) as error:
          asyncio.run(app.transcribe(app.TranscribeInput(jobId=job_id)))
    self.assertEqual(error.exception.status_code, 500)
    self.assertEqual(error.exception.detail, 'transcription failed')


if __name__ == '__main__':
  unittest.main()
