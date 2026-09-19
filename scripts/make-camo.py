"""Gera src/assets/camo.png: textura de camuflagem pixelada, discreta e sem emendas.

Uso (na raiz do projeto):  python scripts/make-camo.py
Requer: Pillow, numpy, scipy.

A imagem tem 1 pixel por "célula" de camuflagem e fundo quase todo transparente: as manchas são
sobreposições (escuras, marrons e cáqui) de baixa opacidade, então funcionam sobre qualquer cor de base.
O CSS a amplia com `image-rendering: pixelated` (cada célula vira um bloco).
"""

from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
SIZE = 48  # células por lado; o CSS repete a imagem sem emendas (mode="wrap")
SEED = 7

# (R, G, B, alpha 0-255) por classe de mancha; a classe 0 é transparente (cor de base aparece)
OVERLAYS = [
    (0, 0, 0, 0),
    (0, 0, 0, 16),  # sombra
    (92, 66, 36, 24),  # marrom-terra
    (196, 178, 128, 14),  # cáqui
]
# fração de células por classe, na ordem acima
SHARES = [0.34, 0.26, 0.22, 0.18]


def main() -> None:
    rng = np.random.default_rng(SEED)
    field = ndimage.gaussian_filter(rng.random((SIZE, SIZE)), sigma=2.3, mode="wrap")
    order = np.argsort(field, axis=None)
    classes = np.zeros(field.size, dtype=np.uint8)
    start = 0
    for index, share in enumerate(SHARES):
        stop = start + round(share * field.size)
        classes[order[start:stop]] = index
        start = stop
    classes[order[start:]] = len(SHARES) - 1
    grid = classes.reshape(field.shape)

    rgba = np.zeros((SIZE, SIZE, 4), dtype=np.uint8)
    for index, color in enumerate(OVERLAYS):
        rgba[grid == index] = color

    out = ROOT / "src" / "assets" / "camo.png"
    Image.fromarray(rgba, "RGBA").save(out, optimize=True)
    print("ok", out.stat().st_size, "bytes")


if __name__ == "__main__":
    main()
