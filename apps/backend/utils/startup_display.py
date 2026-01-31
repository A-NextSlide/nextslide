"""
Compact startup banner and step display for the NextSlide API server.

Usage:
    from utils.startup_display import banner, step, done

    banner(host, port, env)
    step("Config", "gemini-3-pro / flash / claude-opus-4-5")
    step("Fonts", "741 fonts · 1009 tags")
    done(host, port)
"""

import os
import sys

# ANSI color codes (disabled when not a TTY or NO_COLOR is set)
_use_color = hasattr(sys.stdout, "isatty") and sys.stdout.isatty() and not os.environ.get("NO_COLOR")

_GREEN = "\033[32m" if _use_color else ""
_YELLOW = "\033[33m" if _use_color else ""
_DIM = "\033[2m" if _use_color else ""
_BOLD = "\033[1m" if _use_color else ""
_RESET = "\033[0m" if _use_color else ""
_CYAN = "\033[36m" if _use_color else ""

VERSION = "1.0"


def banner(host: str, port: int, env: str) -> None:
    """Print the boxed startup banner."""
    title = f"NextSlide API · v{VERSION}"
    subtitle = f"{env} · {host}:{port}"
    width = max(len(title), len(subtitle)) + 10

    box_top = f"  ┌{'─' * width}┐"
    box_bot = f"  └{'─' * width}┘"

    def _center(text: str) -> str:
        pad = width - len(text)
        left = pad // 2
        right = pad - left
        return f"  │{' ' * left}{_BOLD}{text}{_RESET}{' ' * right}│"

    print()
    print(box_top)
    print(_center(title))
    print(_center(subtitle))
    print(box_bot)
    print()


def step(label: str, detail: str, status: str = "ok") -> None:
    """Print a single startup step line.

    status: "ok" (green bullet), "warn" (yellow bullet), "skip" (dim bullet)
    """
    if status == "warn":
        bullet = f"{_YELLOW}●{_RESET}"
    elif status == "skip":
        bullet = f"{_DIM}●{_RESET}"
    else:
        bullet = f"{_GREEN}●{_RESET}"

    # Right-pad label to 13 chars for alignment
    padded_label = f"{label:<13}"
    print(f"  {bullet} {_BOLD}{padded_label}{_RESET} {detail}")


def done(host: str, port: int) -> None:
    """Print the final ready line."""
    url = f"http://{host}:{port}"
    print(f"\n  {_GREEN}✓{_RESET} {_BOLD}Server ready{_RESET} — {_CYAN}{url}{_RESET}")
    print()
