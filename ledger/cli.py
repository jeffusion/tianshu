"""Resolve an allowlisted ledger, then invoke the unchanged transactional engine."""
import argparse
import json
import subprocess
import sys
from pathlib import Path
from config import load_config


def main():
    parser=argparse.ArgumentParser(description=__doc__,allow_abbrev=False)
    parser.add_argument('--config')
    parser.add_argument('--source',required=True)
    parser.add_argument('command')
    parser.add_argument('--input')
    args=parser.parse_args()
    try:
        config=load_config(args.config)
        source=next((s for s in config['sources'] if s['id']==args.source),None)
        if not source:
            raise ValueError('未配置的台账来源')
        arguments=[args.command]+(['--input',args.input] if args.input is not None else [])
        return subprocess.call([sys.executable,str(Path(__file__).with_name('coordinator.py')),
                                '--db',source['path'],*arguments])
    except (OSError,ValueError,TypeError) as error:
        print(json.dumps({'ok':False,'error':str(error)},ensure_ascii=False))
        return 1


if __name__=='__main__':
    sys.exit(main())
