import asyncio
import sys
import types
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import AsyncMock, patch

import dev_tts_api as dev


class Upload:
  content_type = 'video/mp4'
  filename = 'sample.mp4'

  def __init__(self, data: bytes):
    self.data = data

  async def read(self, _size: int):
    data = self.data
    self.data = b''
    return data

  async def close(self):
    pass


class Segment:
  start = 0
  end = 1.5
  text = ' 你好 '


class Info:
  language = 'zh'
  duration = 1.5


class Model:
  def transcribe(self, *_args, **_kwargs):
    return [Segment()], Info()


class Source:
  duration = 1_500_000
  streams = types.SimpleNamespace(audio=[object()])

  def __enter__(self):
    return self

  def __exit__(self, *_args):
    pass


class LocalMediaApiTests(unittest.TestCase):
  def setUp(self):
    dev.jobs.clear()

  def test_creates_local_transcription_job(self):
    async def create():
      with TemporaryDirectory() as directory, patch.object(dev, 'JOBS_DIR', Path(directory) / 'jobs'), patch.object(dev, 'run_transcription', AsyncMock()):
        result = await dev.create_transcription(Upload(b'video'), 'zh')
        await asyncio.sleep(0)
        return result

    result = asyncio.run(create())
    self.assertEqual(result['data']['status'], 'queued')
    self.assertIn(result['data']['id'], dev.jobs)

  def test_normalizes_local_transcription(self):
    av = types.ModuleType('av')
    av.time_base = 1_000_000
    av.open = lambda _path: Source()
    job_id = 'job-1'
    dev.jobs[job_id] = {'id': job_id, 'status': 'running'}

    with TemporaryDirectory() as directory, patch.object(dev, 'model', Model()), patch.dict(sys.modules, {'av': av}):
      path = Path(directory) / 'video.mp4'
      path.write_bytes(b'video')
      result = dev.transcribe_path(job_id, path, 'zh')

    self.assertEqual(result['language'], 'zh')
    self.assertEqual(result['segments'], [{'id': 0, 'start': 0, 'end': 1.5, 'text': '你好'}])

  def test_updates_job_and_removes_input_after_success(self):
    async def run():
      with TemporaryDirectory() as directory:
        path = Path(directory) / 'job-2' / 'input'
        path.parent.mkdir()
        path.write_bytes(b'video')
        dev.jobs['job-2'] = {'id': 'job-2', 'status': 'queued'}
        result = {'language': 'zh', 'duration': 1.5, 'segments': []}
        with patch.object(dev, 'transcribe_path', return_value=result):
          await dev.run_transcription('job-2', path, 'zh')
        self.assertFalse(path.parent.exists())

    asyncio.run(run())
    self.assertEqual(dev.jobs['job-2']['status'], 'succeeded')

  def test_cancels_running_job(self):
    dev.jobs['job-3'] = {'id': 'job-3', 'status': 'running'}
    result = asyncio.run(dev.cancel_transcription('job-3'))
    self.assertEqual(dev.jobs['job-3']['status'], 'canceled')
    self.assertTrue(result['data']['deleted'])

  def test_reports_broken_media(self):
    async def run():
      with TemporaryDirectory() as directory:
        path = Path(directory) / 'job-4' / 'input'
        path.parent.mkdir()
        path.write_bytes(b'broken')
        dev.jobs['job-4'] = {'id': 'job-4', 'status': 'queued'}
        with patch.object(dev, 'transcribe_path', side_effect=ValueError('broken')):
          await dev.run_transcription('job-4', path, None)

    asyncio.run(run())
    self.assertEqual(dev.jobs['job-4']['status'], 'failed')
    self.assertEqual(dev.jobs['job-4']['error'], '视频文件无法读取或格式损坏')


if __name__ == '__main__':
  unittest.main()
