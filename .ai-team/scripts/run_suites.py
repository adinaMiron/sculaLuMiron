#!/usr/bin/env python3
"""Legacy entrypoint; all harnesses use scripts/run-tests.py.
Historical KNOWN failures now remain failures (nonzero).
"""
from pathlib import Path
import runpy

runpy.run_path(str(Path(__file__).resolve().parents[2] / "scripts/run-tests.py"), run_name="__main__")
