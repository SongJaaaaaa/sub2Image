from contextlib import asynccontextmanager
from io import BytesIO
import asyncio
import os
import time

import cv2
import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import Response
from PIL import Image, UnidentifiedImageError
import torch
from torchvision import transforms
from transformers import AutoModelForImageSegmentation

MODEL_ID = os.getenv('MATTING_MODEL', 'ZhengPeng7/BiRefNet-matting')
MODEL_REVISION = os.getenv('MATTING_MODEL_REVISION', '57f9f68b43ba337c75762b14cf3075d659007268')
MAX_UPLOAD_BYTES = 20 * 1024 * 1024
MAX_SIDE = int(os.getenv('MATTING_MAX_SIDE', '2048'))
THREADS = int(os.getenv('MATTING_CPU_THREADS', '4'))

model = None
lock = asyncio.Lock()
preprocess = transforms.Compose([
    transforms.Resize((1024, 1024)),
    transforms.ToTensor(),
    transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
])


def estimate_foreground(image: Image.Image, mask: Image.Image, radius: int = 90):
    image_data = np.asarray(image, dtype=np.float32) / 255
    alpha = np.asarray(mask, dtype=np.float32)[:, :, None] / 255
    foreground = image_data
    background = image_data

    for blur_radius in (radius, 6):
        blurred_alpha = cv2.blur(alpha, (blur_radius, blur_radius))
        if blurred_alpha.ndim == 2:
            blurred_alpha = blurred_alpha[:, :, None]
        blurred_foreground = cv2.blur(foreground * alpha, (blur_radius, blur_radius)) / (blurred_alpha + 1e-5)
        blurred_background = cv2.blur(background * (1 - alpha), (blur_radius, blur_radius)) / (1 - blurred_alpha + 1e-5)
        foreground = np.clip(
            blurred_foreground + alpha * (image_data - alpha * blurred_foreground - (1 - alpha) * blurred_background),
            0,
            1,
        )
        background = blurred_background

    return Image.fromarray((foreground * 255).astype(np.uint8))


def remove_background(data: bytes):
    try:
        image = Image.open(BytesIO(data)).convert('RGB')
    except (UnidentifiedImageError, OSError) as err:
        raise HTTPException(status_code=400, detail='无法读取图片') from err

    if max(image.size) > MAX_SIDE:
        scale = MAX_SIDE / max(image.size)
        image = image.resize((round(image.width * scale), round(image.height * scale)), Image.Resampling.LANCZOS)

    tensor = preprocess(image).unsqueeze(0)
    with torch.inference_mode():
        prediction = model(tensor)[-1].sigmoid().cpu()[0].squeeze()

    mask = transforms.ToPILImage()(prediction).resize(image.size, Image.Resampling.LANCZOS)
    result = estimate_foreground(image, mask)
    result.putalpha(mask)
    output = BytesIO()
    result.save(output, format='PNG', optimize=True)
    return output.getvalue(), image.size


@asynccontextmanager
async def lifespan(_: FastAPI):
    global model
    torch.set_num_threads(THREADS)
    torch.set_num_interop_threads(1)
    model = AutoModelForImageSegmentation.from_pretrained(
        MODEL_ID,
        revision=MODEL_REVISION,
        trust_remote_code=True,
    )
    model.to('cpu').eval()
    yield


app = FastAPI(title='高清抠图服务', lifespan=lifespan)


@app.get('/health')
def health():
    return {
        'status': 'ok',
        'model': MODEL_ID,
        'revision': MODEL_REVISION,
        'device': 'cpu',
        'maxSide': MAX_SIDE,
    }


@app.post('/v1/remove-background')
async def remove_background_api(image: UploadFile = File(...)):
    if image.content_type and not image.content_type.startswith('image/') and image.content_type != 'application/octet-stream':
        raise HTTPException(status_code=400, detail='请选择图片文件')
    data = await image.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail='图片不能超过 20MB')

    started = time.perf_counter()
    async with lock:
        output, size = await run_in_threadpool(remove_background, data)
    elapsed = time.perf_counter() - started
    return Response(
        output,
        media_type='image/png',
        headers={
            'X-Image-Size': f'{size[0]}x{size[1]}',
            'X-Process-Time': f'{elapsed:.2f}',
        },
    )
