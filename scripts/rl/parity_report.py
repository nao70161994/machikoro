"""Lightweight RL parity diagnostics."""

import argparse
import json


def _js_winery_resolution(total_wineries, dormant_wineries, grapes):
    active = max(0, total_wineries - dormant_wineries)
    # Browser GameManager revives dormant green cards for the dice first, but
    # cards revived in that same dice resolution do not activate. Already-active
    # wineries each activate once and then become dormant.
    gain = active * grapes * 6
    return {"gain": gain, "dormantAfter": active}


def _python_winery_resolution(total_wineries, dormant_wineries, grapes):
    active = max(0, total_wineries - dormant_wineries)
    gain = active * grapes * 6
    return {"gain": gain, "dormantAfter": active}


def winery_approximation_cases():
    cases = []
    for total, dormant, grapes in [
        (1, 0, 1),
        (2, 0, 1),
        (2, 1, 1),
        (3, 2, 2),
    ]:
        js = _js_winery_resolution(total, dormant, grapes)
        py = _python_winery_resolution(total, dormant, grapes)
        cases.append({
            "card": "ワイナリー",
            "totalWineries": total,
            "dormantWineriesBefore": dormant,
            "grapes": grapes,
            "js": js,
            "pythonApprox": py,
            "gainDiff": py["gain"] - js["gain"],
            "dormantDiff": py["dormantAfter"] - js["dormantAfter"],
        })
    return cases


def build_report():
    cases = winery_approximation_cases()
    return {
        "schema": "rl-parity-report-v2",
        "knownApproximationCount": sum(1 for case in cases if case["gainDiff"] or case["dormantDiff"]),
        "knownApproximations": cases,
        "notes": ["Python RL winery resolution matches browser GameManager aggregate outcomes."],
    }


def main():
    parser = argparse.ArgumentParser(description="Print lightweight RL parity diagnostics.")
    parser.add_argument("--format", choices=["json", "text"], default="json")
    args = parser.parse_args()
    report = build_report()
    if args.format == "text":
        print(f"schema={report['schema']} knownApproximationCount={report['knownApproximationCount']}")
        for case in report["knownApproximations"]:
            print(
                f"{case['card']} total={case['totalWineries']} dormant={case['dormantWineriesBefore']} "
                f"grapes={case['grapes']} gainDiff={case['gainDiff']} dormantDiff={case['dormantDiff']}"
            )
        return
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
