"""Tianshu coordinator entrypoint; configuration is shared with the MCP server."""
import runpy
import sys
from pathlib import Path
ledger=Path(__file__).resolve().parents[3]/'ledger'
sys.path.insert(0,str(ledger))
runpy.run_path(str(ledger/'cli.py'),run_name='__main__')
