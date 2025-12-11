"""
Editing Orchestrator - Clean, simple entry point.

This file is the API entry point. All logic is in orchestrator_v2.py.
"""

from agents.editing.orchestrator_v2 import edit_deck, orchestrate

__all__ = ['edit_deck', 'orchestrate']
