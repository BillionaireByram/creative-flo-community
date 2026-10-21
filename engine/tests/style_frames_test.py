"""Synthetic measured frames exercise each gate without a browser or network."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
from PIL import Image

spec = importlib.util.spec_from_file_location('style_frames', Path(__file__).resolve().parents[1] / 'pipeline/style_frames.py')
frames = importlib.util.module_from_spec(spec)
spec.loader.exec_module(frames)


class Frames(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.project = Path(tmp.name)
        Image.new('RGB', (1080, 1920), 'black').save(self.project / 'bg.png')
        self.record = {'t': 2.5, 'background': 'bg.png', 'texts': [
            {'text': 'Readable sample', 'x': 100, 'y': 300, 'width': 600, 'height': 90,
             'color': 'rgb(255, 255, 255)', 'size': 60, 'weight': 700}], 'logos': []}

    def issues(self): return frames.inspect(self.project, [self.record], encode=False)

    def test_legible_safe_text_passes(self): self.assertEqual(self.issues(), [])
    def test_text_outside_safe_area_fails(self):
        self.record['texts'][0]['x'] = 30
        self.assertIn('safe area', self.issues()[0])
    def test_low_contrast_fails(self):
        self.record['texts'][0]['color'] = 'rgb(20, 20, 20)'
        self.assertIn('contrast', self.issues()[0])
    def test_stretched_logo_fails(self):
        self.record['logos'] = [{'width': 400, 'height': 100, 'naturalWidth': 200, 'naturalHeight': 100,
                                 'scaleX': 1, 'scaleY': 1, 'fit': 'fill'}]
        self.assertIn('stretched', self.issues()[0])
    def test_contained_logo_preserves_ratio(self):
        self.record['logos'] = [{'width': 400, 'height': 100, 'naturalWidth': 200, 'naturalHeight': 100,
                                 'scaleX': 1, 'scaleY': 1, 'fit': 'contain'}]
        self.assertEqual(self.issues(), [])
    def test_nonuniform_transform_fails_even_with_contain(self):
        self.record['logos'] = [{'width': 400, 'height': 100, 'naturalWidth': 200, 'naturalHeight': 100,
                                 'scaleX': 2, 'scaleY': 1, 'fit': 'contain'}]
        self.assertIn('stretched', self.issues()[0])
    def test_empty_text_fails(self):
        self.record['texts'] = []
        self.assertIn('No readable', self.issues()[0])

    def test_outlined_text_passes_over_matching_background(self):
        Image.new('RGB', (1080, 1920), 'white').save(self.project / 'bg.png')
        self.assertIn('contrast', self.issues()[0])
        self.record['texts'][0]['stroke'] = 3
        self.record['texts'][0]['strokeColor'] = 'rgb(0, 0, 0)'
        self.assertEqual(self.issues(), [])
    def test_tight_dark_shadow_counts_but_soft_glow_does_not(self):
        Image.new('RGB', (1080, 1920), 'white').save(self.project / 'bg.png')
        self.record['texts'][0]['shadow'] = 'rgba(0, 0, 0, 0.9) 0px 2px 4px'
        self.assertEqual(self.issues(), [])
        self.record['texts'][0]['shadow'] = 'rgba(0, 0, 0, 0.9) 0px 0px 40px'
        self.assertIn('contrast', self.issues()[0])
    def encoded(self, blank_at):
        """Run the encoded-frame pass with ffmpeg stubbed: frames at blank_at are solid black, others textured."""
        def fake_run(argv, **kw):
            t = float(argv[argv.index('-ss') + 1])
            im = Image.new('RGB', (1080, 1920), 'black')
            if t not in blank_at:
                im.paste((200, 30, 30), (0, 0, 540, 1920))
            im.save(argv[-1])
            return type('R', (), {'returncode': 0})()
        (self.project / 'review/frames').mkdir(parents=True)
        records = [dict(self.record, t=t) for t in (0.5, 1.0, 1.5, 2.0, 2.5)]
        real, frames.subprocess.run = frames.subprocess.run, fake_run
        try:
            return frames.inspect(self.project, records)
        finally:
            frames.subprocess.run = real

    def test_one_black_transition_frame_passes(self): self.assertEqual(self.encoded({1.5}), [])
    def test_lasting_black_fails(self): self.assertEqual(self.encoded({1.5, 2.0}), ['The sample has an empty frame at 2.00s.'])
    def test_black_first_frame_fails(self): self.assertEqual(self.encoded({0.5}), ['The sample has an empty frame at 0.50s.'])


if __name__ == '__main__': unittest.main()
