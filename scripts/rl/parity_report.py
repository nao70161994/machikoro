"""Lightweight RL parity diagnostics.

This report is intentionally small and deterministic. It documents known places
where the Python RL environment is an approximation of the browser GameManager,
so model adoption reviews can separate expected approximation drift from bugs.
"""

import argparse
import json


def _js_winery_resolution(total_wineries, dormant_wineries, grapes):
    active = max(0, total_wineries - dormant_wineries)
    if active <= 0 or grapes <= 0:
        return {"gain": 0, "dormantAfter": max(0, dormant_wineries)}
    # Browser GameManager revives dormant green cards for the dice first, but
    # cards revived in that same dice resolution do not activate. Already-active
    # wineries each activate once and then become dormant.
    gain = active * grapes * 6
    return {"gain": gain, "dormantAfter": active}


def _python_winery_approximation(total_wineries, dormant_wineries, grapes):
    active = max(0, total_wineries - dormant_wineries)
    if active <= 0 or grapes <= 0:
        return {"gain": 0, "dormantAfter": max(0, dormant_wineries)}
    # scripts.rl.game_env keeps card counts aggregated. If at least one winery
    # is active it approximates the activation as all owned wineries firing, and
    # keeps at least one winery dormant afterward.
    gain = total_wineries * grapes * 6
    return {"gain": gain, "dormantAfter": max(dormant_wineries, 1)}


def winery_approximation_cases():
    cases = []
    for total, dormant, grapes in [
        (1, 0, 1),
        (2, 0, 1),
        (2, 1, 1),
        (3, 2, 2),
    ]:
        js = _js_winery_resolution(total, dormant, grapes)
        py = _python_winery_approximation(total, dormant, grapes)
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
        "schema": "rl-parity-report-v1",
        "knownApproximationCount": sum(1 for case in cases if case["gainDiff"] or case["dormantDiff"]),
        "knownApproximations": cases,
        "notes": [
            "Python RL env uses aggregate card counts; browser GameManager resolves dormant cards per card instance.",
            "Winery approximation drift is expected in training diagnostics and should not be treated as JS runtime regression by itself.",
        ],
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
