"""Read-only task projections. Paths come only from the operator's allowlist."""
import argparse
import json
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path
from config import load_config


def text(value, maximum=3000):
    return value[:maximum] if isinstance(value, str) else ''


def items(value):
    return [text(v) for v in value[:20] if isinstance(v, str)] if isinstance(value, list) else []


def read_source(source):
    path = Path(source['path'])
    if not path.is_absolute() or not path.is_file():
        raise ValueError('台账不存在')
    db = sqlite3.connect(path.as_uri() + '?mode=ro', uri=True, timeout=2)
    db.row_factory = sqlite3.Row
    try:
        db.execute('PRAGMA query_only=ON')
        db.execute('BEGIN')
        if db.execute('PRAGMA user_version').fetchone()[0] != 1:
            raise ValueError('不支持的台账版本')
        rows = db.execute('SELECT * FROM tasks ORDER BY rowid DESC LIMIT 200').fetchall()
        result = []
        for row in rows:
            data = json.loads(row['data'])
            grant = db.execute('SELECT data FROM mandates WHERE task_id=? AND version=?',
                               (row['id'], row['mandate_version'])).fetchone()
            grant = json.loads(grant[0]) if grant else {}
            latest = db.execute('SELECT data FROM observations WHERE task_id=? ORDER BY rowid DESC LIMIT 1', (row['id'],)).fetchone()
            observation = json.loads(latest[0]) if latest else {}
            last_event = db.execute('SELECT at FROM events WHERE task_id=? ORDER BY seq DESC LIMIT 1', (row['id'],)).fetchone()
            observation_event = db.execute("SELECT at FROM events WHERE task_id=? AND action='observation-record' ORDER BY seq DESC LIMIT 1", (row['id'],)).fetchone()
            transitions = db.execute("SELECT at,data FROM events WHERE task_id=? AND action='task-transition' ORDER BY seq DESC LIMIT 6", (row['id'],)).fetchall()
            verification = None
            if row['state'] == 'accepted':
                for transition in transitions:
                    record = json.loads(transition['data'])
                    if record.get('state') == 'accepted':
                        verification = {'at': transition['at'], 'by': text(record.get('verified_by')),
                                        'evidence': items(record.get('verification_evidence'))}
                        break
            execution = data.get('execution') or {}
            raw_incident = data.get('incident') or {}
            incident = {k: text(raw_incident.get(k)) for k in ('id','category','status','summary','at','resolution','resolved_at','verified_by','correction_dispatch_id')} if raw_incident else None
            if incident:
                incident['evidence'] = items(raw_incident.get('evidence'))
                incident['verification_evidence'] = items(raw_incident.get('verification_evidence'))
            raw_monitor = data.get('monitor') or {}
            monitor = {k: text(raw_monitor.get(k)) for k in ('status','automation_id','reason','at')} if raw_monitor else None
            result.append({
                'key': source['id'] + ':' + row['id'], 'id': text(row['id'],200),
                'source': source['id'], 'source_label': source['label'],
                'objective': text(data.get('objective')), 'state': text(row['state'],50),
                'revision': row['revision'], 'mandate_version': row['mandate_version'],
                'host_id': text(execution.get('host_id'),200), 'thread_id': text(execution.get('thread_id'),200),
                'acceptance': items(data.get('acceptance')), 'allowed': items(grant.get('allowed')),
                'forbidden': items(grant.get('forbidden')), 'summary': text(observation.get('summary')),
                'evidence': items(observation.get('evidence')), 'updated_at': last_event[0] if last_event else None,
                'observed_at': observation_event[0] if observation_event else None,
                'verification': verification,
                'incident': incident, 'monitor': monitor,
                'transitions': [{'at': e['at'], 'state': text(json.loads(e['data']).get('state'),50),
                                 'reason': text(json.loads(e['data']).get('reason'))} for e in reversed(transitions)],
            })
        return result
    finally:
        db.close()


def snapshot(config):
    tasks, sources = [], []
    for source in config['sources']:
        try:
            rows = read_source(source)
            for task in rows:
                display = config.get('presentation', {}).get(task['key'], {})
                if display.get('revision') == task['revision']:
                    task['display'] = {k: text(display.get(k), 1200) for k in
                                       ('title', 'project', 'final_summary', 'final_at')}
                    task['display']['evidence'] = items(display.get('evidence'))
            tasks.extend(rows)
            sources.append({'id': source['id'], 'label': source['label'], 'ok': True, 'count': len(rows)})
        except (OSError, ValueError, sqlite3.Error, TypeError, KeyError):
            sources.append({'id': source['id'], 'label': source['label'], 'ok': False,
                            'error': '台账暂不可读，请检查本地配置或稍后刷新'})
    return {'tasks': tasks, 'sources': sources, 'read_at': datetime.now(timezone.utc).isoformat(), 'readonly': True}


if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config')
    args=parser.parse_args()
    try:
        print(json.dumps(snapshot(load_config(args.config)),ensure_ascii=False))
    except (OSError,ValueError,TypeError) as error:
        print(json.dumps({'ok':False,'error':str(error)},ensure_ascii=False))
        sys.exit(1)
