"""One explicit configuration contract for the MCP projection and coordinator CLI."""
import json
import os
import re
import sys
from pathlib import Path


def config_path(value=None):
    selected=value or os.environ.get('TIANSHU_CONFIG')
    home=os.environ.get('TIANSHU_HOME') or (
        Path.home()/'Library/Application Support/Tianshu' if sys.platform=='darwin'
        else Path(os.environ.get('XDG_DATA_HOME') or Path.home()/'.local/share')/'tianshu')
    path=Path(selected) if selected else Path(os.path.normpath(str(Path(home)/'config.json')))
    if not path.is_absolute():
        raise ValueError('配置路径必须为绝对路径')
    return path


def load_config(value=None):
    path=config_path(value)
    raw=json.loads(path.read_text(encoding='utf-8'))
    if not isinstance(raw,dict) or not isinstance(raw.get('sources'),list) or not raw['sources']:
        raise ValueError('配置必须包含非空sources列表')
    sources=[]
    for source in raw['sources']:
        if not isinstance(source,dict) or not isinstance(source.get('id'),str) or not re.fullmatch(r'[A-Za-z0-9_-]+',source['id']):
            raise ValueError('无效来源ID')
        if not isinstance(source.get('label'),str) or not source['label'].strip():
            raise ValueError('来源label不能为空')
        if not isinstance(source.get('path'),str) or not Path(source['path']).is_absolute():
            raise ValueError('台账路径必须为绝对路径')
        sources.append({k:source[k] for k in ('id','label','path')})
    if len({s['id'] for s in sources})!=len(sources):
        raise ValueError('来源ID重复')
    result={'sources':sources}
    presentation=raw.get('presentation_path')
    if presentation is not None:
        if not isinstance(presentation,str) or not Path(presentation).is_absolute():
            raise ValueError('展示文案路径必须为绝对路径')
        result['presentation']=json.loads(Path(presentation).read_text(encoding='utf-8'))
        if not isinstance(result['presentation'],dict):
            raise ValueError('展示文案必须为对象')
    return result
