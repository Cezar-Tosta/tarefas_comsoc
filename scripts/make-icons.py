"""Gera logo e ícones a partir de design/logo-original.png.

Uso (na raiz do projeto):  python scripts/make-icons.py
Requer: Pillow, numpy, scipy. Só é preciso rodar de novo se o logo mudar.

Saídas:
  src/assets/logo-384.png, logo-96.png      logo com fundo transparente (login e topo)
  public/favicon.ico, favicon-32.png        ícone da aba do navegador
  public/apple-touch-icon.png (180)         atalho no iPhone/iPad
  public/icon-192.png, icon-512.png         ícones "any" do manifesto (fundo transparente)
  public/icon-maskable-512.png              ícone "maskable" (Android recorta em círculo/quadrado)
"""

from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "design" / "logo-original.png"
BRAND_BG = (28, 35, 24)  # verde-escuro do logo, usado atrás dos ícones opacos


def cut_out_background(img: Image.Image) -> Image.Image:
    """Remove o fundo branco ligado às bordas, com bordas suavizadas."""
    rgb = np.asarray(img.convert("RGB")).astype(np.float32)
    lum = rgb.mean(axis=2)
    near_white = lum >= 225
    labels, _ = ndimage.label(near_white)
    border = np.unique(
        np.concatenate([labels[0, :], labels[-1, :], labels[:, 0], labels[:, -1]])
    )
    background = np.isin(labels, border[border > 0])

    # faixa de transição: pixels perto do fundo com tons entre o contorno escuro e o branco
    band = ndimage.binary_dilation(background, iterations=3) & ~background
    dark = 40.0
    alpha = np.ones(lum.shape, dtype=np.float32)
    alpha[background] = 0.0
    soft = np.clip((255.0 - lum) / (255.0 - dark), 0.0, 1.0)
    alpha[band] = soft[band]

    # nas bordas, usa a cor escura do contorno (evita halo claro sobre fundos escuros)
    interior = ~background & ~band
    idx = ndimage.distance_transform_edt(~interior, return_distances=False, return_indices=True)
    filled = rgb[idx[0], idx[1]]
    out_rgb = np.where(band[..., None], filled, rgb)

    rgba = np.dstack([out_rgb, alpha * 255.0]).clip(0, 255).astype(np.uint8)
    return Image.fromarray(rgba, "RGBA")


def tight_square(img: Image.Image, pad_ratio: float) -> Image.Image:
    box = img.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
    if box is None:
        raise SystemExit("logo vazio depois de remover o fundo")
    cropped = img.crop(box)
    side = int(max(cropped.size) * (1 + 2 * pad_ratio))
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(
        cropped, ((side - cropped.width) // 2, (side - cropped.height) // 2), cropped
    )
    return canvas


def on_background(logo: Image.Image, size: int, logo_ratio: float) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), BRAND_BG + (255,))
    target = int(size * logo_ratio)
    scaled = logo.resize((target, target), Image.LANCZOS)
    canvas.paste(scaled, ((size - target) // 2, (size - target) // 2), scaled)
    return canvas.convert("RGB")


def main() -> None:
    logo = tight_square(cut_out_background(Image.open(SRC)), pad_ratio=0.02)
    assets = ROOT / "src" / "assets"
    public = ROOT / "public"
    assets.mkdir(exist_ok=True)
    public.mkdir(exist_ok=True)

    for size in (384, 96):
        logo.resize((size, size), Image.LANCZOS).save(
            assets / f"logo-{size}.png", optimize=True
        )

    padded = tight_square(logo, pad_ratio=0.06)
    for size in (192, 512):
        padded.resize((size, size), Image.LANCZOS).save(
            public / f"icon-{size}.png", optimize=True
        )
    on_background(logo, 512, 0.62).save(public / "icon-maskable-512.png", optimize=True)
    on_background(logo, 180, 0.84).save(public / "apple-touch-icon.png", optimize=True)

    small = logo.resize((32, 32), Image.LANCZOS)
    small.save(public / "favicon-32.png", optimize=True)
    logo.resize((256, 256), Image.LANCZOS).save(
        public / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)]
    )
    print("ok")


if __name__ == "__main__":
    main()
