"""Join audit: sound at a tight join only fails the clean cut when it is an audible fault."""
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "pipeline"))
import join_audit  # noqa: E402

TIGHT = "30   49.83   0.00s  <-- speech at cut  0.007"
CLICK = "13   21.13   0.00s  <-- speech at cut  0.090"


class Joins(unittest.TestCase):
    def test_room_tone_at_a_tight_join_passes_with_a_clean_gate(self):
        self.assertEqual(join_audit.hard_joins([TIGHT], gate_pass=True), [])

    def test_an_audible_click_fails(self):
        self.assertEqual(join_audit.hard_joins([TIGHT, CLICK], gate_pass=True), [CLICK])

    def test_every_flag_counts_when_the_scribe_gate_failed(self):
        self.assertEqual(join_audit.hard_joins([TIGHT], gate_pass=False), [TIGHT])

    def test_the_render_output_parser_still_finds_flags(self):
        out = "A/V stream durations: [103.68, 103.667] expected 103.667\n" + TIGHT + "\n12  20.00  0.30s  0.001\n"
        self.assertEqual(join_audit.parse_render_cut(out)[2], [TIGHT])


if __name__ == "__main__":
    unittest.main()
