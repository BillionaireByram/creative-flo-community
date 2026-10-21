"""Parse clean-cut join diagnostics and identify audible faults."""

import re

JOIN_CLICK_HARD = 0.03


def parse_render_cut(output: str):
    match = re.search(r"A/V stream durations: \[(.*?)\] expected ([\d.]+)", output)
    durations = [float(value) for value in re.findall(r"[\d.]+", match.group(1))] if match else []
    expected = float(match.group(2)) if match else 0.0
    speech = [line.strip() for line in output.splitlines() if "<-- speech at cut" in line]
    return durations, expected, speech


def hard_joins(speech: list[str], gate_pass: bool) -> list[str]:
    """Return joins that click, or every flagged join when the speech gate failed."""
    if not gate_pass:
        return list(speech)
    faults = []
    for line in speech:
        numbers = re.findall(r"[\d.]+", line.split("<--")[-1])
        click = float(numbers[-1]) if numbers else 1.0
        if click >= JOIN_CLICK_HARD:
            faults.append(line)
    return faults
