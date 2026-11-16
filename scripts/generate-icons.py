"""Generate original Folio app icons. Optional tooling: pip install Pillow."""
from pathlib import Path
from PIL import Image, ImageDraw

out = Path(__file__).resolve().parent.parent / 'public' / 'icons'
out.mkdir(parents=True, exist_ok=True)
for name, size, maskable in [('icon-192.png', 192, False), ('icon-512.png', 512, False), ('maskable-512.png', 512, True), ('apple-touch-icon.png', 180, False)]:
    scale = 4
    image = Image.new('RGB', (size * scale, size * scale), '#7761d4')
    draw = ImageDraw.Draw(image)
    unit = size * scale / 512
    # All foreground strokes stay inside the central 80% maskable safe area.
    for points in [[(142, 164), (142, 366), (372, 366)], [(195, 295), (257, 227), (302, 259), (367, 161)]]:
        xy = [(round(x * unit), round(y * unit)) for x, y in points]
        width = round(30 * unit)
        draw.line(xy, fill='white', width=width, joint='curve')
        radius = width / 2
        for x, y in xy:
            draw.ellipse((x-radius, y-radius, x+radius, y+radius), fill='white')
    image.resize((size, size), Image.Resampling.LANCZOS).save(out / name)
