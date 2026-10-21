"""Gate measured text bounds, rendered contrast, logo geometry and encoded frames."""
import json
import math
import re
import subprocess
import sys
from pathlib import Path
from PIL import Image, ImageStat


def luminance(rgb):
    values = [v / 255 for v in rgb[:3]]
    linear = [v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in values]
    return sum(a * b for a, b in zip(linear, (.2126, .7152, .0722)))


def haloed(text, rgba, threshold):
    """True when the text has an outline (>= 2px) or a tight, opaque shadow whose colour contrasts with the fill."""
    fill = luminance(rgba[:3])
    halos = []
    if text.get('stroke', 0) >= 2:
        halos.append(text.get('strokeColor') or '')
    for part in re.split(r',(?![^()]*\))', text.get('shadow') or ''):
        nums = [float(n) for n in re.findall(r'(-?[\d.]+)px', part)]
        color = re.search(r'rgba?\([^)]*\)', part)
        if color and len(nums) >= 3 and nums[2] <= 12:
            halos.append(color.group(0))
    for halo in halos:
        c = [float(n) for n in re.findall(r'[\d.]+', halo)]
        if len(c) >= 3 and (len(c) < 4 or c[3] >= .6):
            h = luminance(c[:3])
            if (max(fill, h) + .05) / (min(fill, h) + .05) >= max(threshold, 4.5):
                return True
    return False


def inspect(project, records, encode=True):
    issues, text_count, blank = [], 0, []
    for record in records:
        t = record['t']
        with Image.open(project / record['background']) as image:
            image = image.convert('RGB')
            if image.size != (1080, 1920):
                issues.append('The sample has the wrong frame size.')
            for text in record['texts']:
                text_count += 1
                x, y, w, h = (text[k] for k in ('x', 'y', 'width', 'height'))
                if not all(math.isfinite(v) for v in (x, y, w, h)) or x < 90 or y < 200 or x + w > 990 or y + h > 1600:
                    issues.append(f'Text leaves the safe area at {t:.2f}s.')
                    continue
                rgba = [float(n) for n in re.findall(r'[\d.]+', text['color'])]
                if len(rgba) < 3:
                    issues.append('A text color could not be checked.')
                    continue
                alpha = rgba[3] if len(rgba) > 3 else 1
                crop = image.crop((int(x), int(y), int(x + w), int(y + h))).resize((12, 8))
                ratios = []
                for bg in (crop.getpixel((x, y)) for y in range(crop.height) for x in range(crop.width)):
                    fg = [rgba[i] * alpha + bg[i] * (1 - alpha) for i in range(3)]
                    a, b = luminance(fg), luminance(bg)
                    ratios.append((max(a, b) + .05) / (min(a, b) + .05))
                threshold = 3 if text['size'] >= 24 or text['size'] >= 19 and text['weight'] >= 700 else 4.5
                # Most of each glyph region must remain legible over the layered background, unless the glyphs
                # carry their own outline or tight shadow that contrasts with the fill (captions over footage).
                if sorted(ratios)[int(len(ratios) * .1)] < threshold and not haloed(text, rgba, threshold):
                    issues.append(f'Text contrast is too low at {t:.2f}s.')
        for logo in record['logos']:
            if not all(logo[k] > 0 for k in ('width', 'height', 'naturalWidth', 'naturalHeight', 'scaleX', 'scaleY')):
                issues.append('A logo is missing or invisible.')
                continue
            natural = logo['naturalWidth'] / logo['naturalHeight']
            shown = logo['width'] / logo['height']
            if abs(logo['scaleX'] / logo['scaleY'] - 1) > .02 or (logo['fit'] not in ('contain', 'scale-down') and abs(shown / natural - 1) > .02):
                issues.append('A logo is stretched.')
        if encode:
            frame = project / f'review/frames/encoded-{t:.2f}.png'
            result = subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', str(t), '-i', str(project / 'renders/sample.mp4'),
                                     '-frames:v', '1', str(frame)], capture_output=True, timeout=30)
            if result.returncode or not frame.exists():
                issues.append('A sample frame could not be decoded.')
            else:
                with Image.open(frame) as im:
                    if im.size != (1080, 1920):
                        issues.append(f'The sample has an incorrectly sized frame at {t:.2f}s.')
                    elif max(ImageStat.Stat(im.convert('RGB')).stddev) < 1:
                        blank.append(t)
    # A one-frame black or flash beat on a cut is a normal transition. Flag a blank first or last sample, or
    # blank that lasts across two samples in a row (half a second or more).
    if blank:
        times = [r['t'] for r in records]
        lasting = [t for t in blank if any(abs(t - u - .5) < 1e-6 for u in blank)]
        for t in sorted({*lasting, *[t for t in blank if t in (times[0], times[-1])]}):
            issues.append(f'The sample has an empty frame at {t:.2f}s.')
    if not text_count:
        issues.append('No readable sample text was found.')
    return sorted(set(issues))


def main():
    project = Path(sys.argv[1])
    records = json.loads((project / 'review/frame-measurements.json').read_text())
    issues = inspect(project, records)
    (project / 'review/frame-checks.json').write_text(json.dumps({'ok': not issues, 'issues': issues}, indent=2))
    print(json.dumps({'ok': not issues, 'issues': issues}))
    return int(bool(issues))


if __name__ == '__main__':
    sys.exit(main())
