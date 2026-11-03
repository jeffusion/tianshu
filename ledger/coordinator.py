#!/usr/bin/env python3
"""Local ledger only. Never calls Codex, executes payloads, or grants permissions."""
import argparse
import json
import os
import sqlite3
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path


SCHEMA = """
CREATE TABLE IF NOT EXISTS tasks (
 id TEXT PRIMARY KEY, revision INTEGER NOT NULL, state TEXT NOT NULL,
 mandate_version INTEGER NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS mandates (
 task_id TEXT NOT NULL REFERENCES tasks(id), version INTEGER NOT NULL,
 data TEXT NOT NULL, PRIMARY KEY(task_id, version));
CREATE TABLE IF NOT EXISTS dispatches (
 id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id),
 mandate_version INTEGER NOT NULL, state TEXT NOT NULL, data TEXT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS one_unresolved_dispatch ON dispatches(task_id)
 WHERE state IN ('prepared','sent','uncertain');
CREATE TABLE IF NOT EXISTS observations (
 id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id), data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS events (
 seq INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT NOT NULL REFERENCES tasks(id),
 at TEXT NOT NULL, action TEXT NOT NULL, data TEXT NOT NULL);
PRAGMA user_version=1;
"""
STATES = {
 'queued': {'running','waiting_human','waiting_external','failed','stopped'},
 'running': {'ready','waiting_human','waiting_external','failed','stopped'},
 'waiting_human': {'running','failed','stopped'},
 'waiting_external': {'running','failed','stopped'},
 'ready': {'accepted','running','waiting_human','failed','stopped'},
 'failed': {'running','stopped'}, 'accepted': set(), 'stopped': set(),
}


def encode(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'))


def require(condition, message):
    if not condition:
        raise ValueError(message)


def string(data, key):
    value = data.get(key)
    require(isinstance(value, str) and bool(value.strip()), f'{key}: nonempty string required')
    return value


def strings(data, key):
    value = data.get(key)
    require(isinstance(value, list) and value and all(isinstance(v, str) and v.strip() for v in value),
            f'{key}: nonempty string list required')
    return value


def event(db, task, action, data):
    db.execute('INSERT INTO events(task_id,at,action,data) VALUES(?,?,?,?)',
               (task, datetime.now(timezone.utc).isoformat(), action, encode(data)))


def get_task(db, task_id, expected=None):
    row = db.execute('SELECT * FROM tasks WHERE id=?', (task_id,)).fetchone()
    require(row is not None, 'task not found')
    task = dict(row)
    task['data'] = json.loads(task['data'])
    if expected is not None:
        require(type(expected) is int and task['revision'] == expected, 'stale or invalid expected_revision; reread task')
    return task


def live(task):
    require(task['state'] not in ('accepted','stopped'), 'terminal task; create a new task for new work')


def save(db, task):
    task['revision'] += 1
    db.execute('UPDATE tasks SET revision=?,state=?,mandate_version=?,data=? WHERE id=?',
               (task['revision'], task['state'], task['mandate_version'], encode(task['data']), task['id']))


def mandate(data):
    return {'allowed': strings(data, 'allowed'), 'forbidden': strings(data, 'forbidden'),
            'authorization_source': string(data, 'authorization_source')}


def dispatch(db, dispatch_id, task_id):
    row = db.execute('SELECT * FROM dispatches WHERE id=? AND task_id=?', (dispatch_id, task_id)).fetchone()
    require(row is not None, 'dispatch not found for this task')
    result = dict(row)
    result['data'] = json.loads(result['data'])
    return result


def deleted_task(db, task_id):
    if not db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='task_deletions'").fetchone():
        return None
    row = db.execute('SELECT receipt FROM task_deletions WHERE task_id=?', (task_id,)).fetchone()
    return json.loads(row[0]) if row else None


def preserve_rowid(db, table, allocate=False):
    """Deletion must not rewind the row ordering used by existing incident boundaries."""
    maximum = db.execute(f'SELECT COALESCE(MAX(rowid),0) FROM {table}').fetchone()[0]
    if db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='task_rowid_counters'").fetchone():
        row = db.execute('SELECT high_water FROM task_rowid_counters WHERE name=?', (table,)).fetchone()
        maximum = max(maximum, row[0] if row else 0)
        value = maximum + int(allocate)
        db.execute('INSERT INTO task_rowid_counters VALUES(?,?) ON CONFLICT(name) DO UPDATE SET high_water=excluded.high_water',
                   (table, value))
        return value
    return maximum + int(allocate)


def delete_task(db, data):
    task_id = string(data, 'task_id')
    require(type(data.get('expected_revision')) is int, 'expected_revision required for deletion')
    string(data, 'reason')
    string(data, 'authorization_source')
    previous = deleted_task(db, task_id)
    if previous:
        require(previous['deleted_revision'] == data['expected_revision'], 'deleted revision mismatch')
        return {**previous, 'already_deleted': True}
    task = get_task(db, task_id, data['expected_revision'])
    require(task['state'] in ('accepted','stopped'), 'only accepted or stopped tasks can be deleted')
    require(not db.execute("SELECT 1 FROM dispatches WHERE task_id=? AND state IN ('prepared','sent','uncertain')", (task_id,)).fetchone(),
            'reconcile unresolved dispatch before deletion')
    incident = task['data'].get('incident')
    require(not incident or incident['status'] == 'resolved', 'resolve open incident before deletion')
    monitor = task['data'].get('monitor')
    if monitor:
        require(monitor.get('status') == 'stopped' and monitor.get('evidence'), 'stop monitor with evidence before deletion')
    # This records the coordinator's actual external check, not a runtime authorization proof.
    if task['data'].get('execution'):
        string(data, 'execution_stop_evidence')
    snapshot = run(db, 'task-show', {'task_id': task_id})
    archive_id = str(uuid.uuid4())
    receipt = {'task_id': task_id, 'deleted_revision': task['revision'], 'deleted': True,
               'archive_id': archive_id, 'deleted_at': datetime.now(timezone.utc).isoformat(),
               'already_deleted': False}
    db.execute('''CREATE TABLE IF NOT EXISTS task_deletions (
        task_id TEXT PRIMARY KEY, archive_id TEXT NOT NULL UNIQUE,
        receipt TEXT NOT NULL, snapshot TEXT NOT NULL, request TEXT NOT NULL)''')
    db.execute('INSERT INTO task_deletions VALUES(?,?,?,?,?)',
               (task_id, archive_id, encode(receipt), encode(snapshot), encode(data)))
    db.execute('CREATE TABLE IF NOT EXISTS task_rowid_counters (name TEXT PRIMARY KEY, high_water INTEGER NOT NULL)')
    for table in ('observations','dispatches'):
        preserve_rowid(db, table)
    # Explicit ordering keeps foreign keys intact. Archive and removal share one transaction.
    for table in ('events','observations','dispatches','mandates'):
        db.execute(f'DELETE FROM {table} WHERE task_id=?', (task_id,))
    db.execute('DELETE FROM tasks WHERE id=?', (task_id,))
    return receipt


def run(db, command, data):
    if command == 'init':
        return {'schema_version': 1}
    if command == 'task-list':
        return [get_task(db, r[0]) for r in db.execute('SELECT id FROM tasks ORDER BY id')]
    task_id = string(data, 'task_id')
    if command == 'task-delete':
        return delete_task(db, data)
    if command == 'task-create':
        require(not deleted_task(db, task_id), 'deleted task id cannot be reused; use a new task id')
        contents = {k: string(data, k) for k in ('objective','owner_thread_id','owner_host_id')}
        contents['acceptance'] = strings(data, 'acceptance')
        contents['project_id'] = data.get('project_id')
        contents['execution'] = data.get('execution')
        if contents['execution'] is not None:
            require(isinstance(contents['execution'], dict), 'execution must be object')
            string(contents['execution'], 'thread_id')
            string(contents['execution'], 'host_id')
        grant = mandate(data)
        db.execute('INSERT INTO tasks VALUES(?,1,\'queued\',1,?)', (task_id, encode(contents)))
        db.execute('INSERT INTO mandates VALUES(?,1,?)', (task_id, encode(grant)))
        event(db, task_id, command, {'mandate_version': 1})
        return get_task(db, task_id)
    task = get_task(db, task_id)
    if command == 'task-show':
        task['mandates'] = [dict(r) | {'data': json.loads(r['data'])} for r in db.execute(
            'SELECT * FROM mandates WHERE task_id=? ORDER BY version', (task_id,))]
        for table in ('dispatches','observations','events'):
            order = 'seq' if table == 'events' else 'rowid'
            task[table] = [dict(r) | {'data': json.loads(r['data'])} for r in db.execute(
                f'SELECT * FROM {table} WHERE task_id=? ORDER BY {order}', (task_id,))]
        return task
    require('expected_revision' in data, 'expected_revision required for mutations')
    task = get_task(db, task_id, data['expected_revision'])
    if command != 'observation-record' and not (command == 'monitor-record' and data.get('status') == 'stopped'):
        live(task)
    result = None
    if command == 'mandate-revise':
        require(not db.execute("SELECT 1 FROM dispatches WHERE task_id=? AND state IN ('prepared','sent','uncertain')", (task_id,)).fetchone(),
                'reconcile unresolved dispatch before revising mandate')
        grant = mandate(data)
        task['mandate_version'] += 1
        db.execute('INSERT INTO mandates VALUES(?,?,?)', (task_id, task['mandate_version'], encode(grant)))
    elif command == 'dispatch-prepare':
        require(task['state'] != 'failed', 'resume failed task explicitly before dispatch')
        kind = string(data, 'kind')
        require(kind in ('create_thread','send_message'), 'invalid kind')
        require((kind == 'create_thread') == (task['data']['execution'] is None), 'kind conflicts with bound execution')
        dispatch_id = string(data, 'dispatch_id')
        payload = {'kind': kind, 'prompt': string(data, 'prompt'),
                   'authorization_source': string(data, 'authorization_source'),
                   'target': task['data']['execution'], 'project_id': task['data']['project_id']}
        db.execute('INSERT INTO dispatches(rowid,id,task_id,mandate_version,state,data) VALUES(?,?,?,?,\'prepared\',?)',
                   (preserve_rowid(db, 'dispatches', allocate=True), dispatch_id, task_id, task['mandate_version'], encode(payload)))
        result = {'dispatch_id': dispatch_id}
    elif command == 'dispatch-mark':
        item = dispatch(db, string(data, 'dispatch_id'), task_id)
        status = string(data, 'state')
        moves = {'prepared': {'sent','uncertain','cancelled'}, 'sent': {'observed','uncertain'},
                 'uncertain': {'sent','observed','cancelled'}}
        require(status in moves.get(item['state'], set()), 'invalid dispatch transition')
        require(item['mandate_version'] == task['mandate_version'], 'dispatch uses stale mandate')
        receipt = data.get('receipt')
        require(isinstance(receipt, dict) and receipt, 'receipt object required')
        if status == 'sent':
            string(receipt, 'thread_id')
            string(receipt, 'host_id')
            if task['data']['execution'] is None:
                task['data']['execution'] = {k: receipt[k] for k in ('thread_id','host_id')}
            else:
                require(all(receipt[k] == task['data']['execution'][k] for k in ('thread_id','host_id')), 'receipt target mismatch')
        if status == 'observed':
            require(task['data']['execution'] is not None, 'bind actual receipt using sent first')
            obs = db.execute('SELECT data FROM observations WHERE id=? AND task_id=?',
                             (string(receipt, 'observation_id'), task_id)).fetchone()
            require(obs is not None, 'observation required')
            require(json.loads(obs[0]).get('dispatch_id') == item['id'], 'observation does not confirm this dispatch')
        if status == 'cancelled':
            string(receipt, 'reconciliation')
        item['data']['receipt'] = receipt
        db.execute('UPDATE dispatches SET state=?,data=? WHERE id=?', (status, encode(item['data']), item['id']))
    elif command == 'observation-record':
        require(task['data']['execution'] is not None, 'task has no execution binding')
        require(data.get('host_id') == task['data']['execution']['host_id'] and
                data.get('thread_id') == task['data']['execution']['thread_id'], 'observation target mismatch')
        contents = {k: string(data,k) for k in ('host_id','thread_id','turn_id','summary')}
        contents['evidence'] = strings(data, 'evidence')
        contents['cursor'] = data.get('cursor')
        contents['dispatch_id'] = data.get('dispatch_id')
        if contents['dispatch_id']:
            dispatch(db, contents['dispatch_id'], task_id)
        observation_id = data.get('observation_id', str(uuid.uuid4()))
        require(isinstance(observation_id, str) and observation_id.strip(), 'observation_id required')
        db.execute('INSERT INTO observations(rowid,id,task_id,data) VALUES(?,?,?,?)',
                   (preserve_rowid(db, 'observations', allocate=True), observation_id, task_id, encode(contents)))
        task['data']['last_observation_id'] = observation_id
        if 'cursor' in data:
            require(data['cursor'] is None or isinstance(data['cursor'], str), 'cursor must be string or null')
            task['data']['cursor'] = data['cursor']
        result = {'observation_id': observation_id}
    elif command == 'incident-record':
        previous = task['data'].get('incident')
        require(not previous or previous['status'] == 'resolved', 'resolve existing incident before recording another')
        category = string(data, 'category')
        require(category in ('direction_drift','authorization_gap','execution_failure','observation_unavailable'), 'invalid incident category')
        incident_id = string(data, 'incident_id')
        require(not previous or previous['id'] != incident_id, 'use a new incident id')
        task['data']['incident'] = {'id': incident_id, 'category': category, 'status': 'open',
            'summary': string(data, 'summary'), 'evidence': strings(data, 'evidence'),
            'observation_boundary': db.execute('SELECT COALESCE(MAX(rowid),0) FROM observations').fetchone()[0],
            'dispatch_boundary': db.execute('SELECT COALESCE(MAX(rowid),0) FROM dispatches').fetchone()[0],
            'at': datetime.now(timezone.utc).isoformat()}
    elif command == 'correction-link':
        incident = task['data'].get('incident')
        require(incident and incident['id'] == data.get('incident_id') and incident['status'] == 'open', 'open matching incident required')
        item = dispatch(db, string(data, 'dispatch_id'), task_id)
        dispatch_order = db.execute('SELECT rowid FROM dispatches WHERE id=?', (item['id'],)).fetchone()[0]
        require(dispatch_order > incident['dispatch_boundary'], 'correction must be prepared after this incident')
        require(item['data']['kind'] == 'send_message' and item['mandate_version'] == task['mandate_version'], 'correction must target current bound chat and mandate')
        require(item['state'] != 'cancelled', 'cancelled correction cannot be linked')
        old = incident.get('correction_dispatch_id')
        old_item = dispatch(db, old, task_id) if old else None
        if old_item and old != item['id']:
            require(old_item['state'] in ('cancelled','observed'), 'reconcile existing correction before replacing')
            old_order = db.execute('SELECT rowid FROM dispatches WHERE id=?', (old,)).fetchone()[0]
            require(dispatch_order > old_order, 'replacement correction must be newer than current correction')
            incident.setdefault('correction_history', []).append({'dispatch_id':old,
                'reason':string(data,'replacement_reason'), 'evidence':strings(data,'replacement_evidence')})
        incident['correction_dispatch_id'] = item['id']
    elif command == 'incident-resolve':
        incident = task['data'].get('incident')
        require(incident and incident['id'] == data.get('incident_id') and incident['status'] == 'open', 'open matching incident required')
        resolution = string(data, 'resolution')
        require(resolution in ('corrected','dismissed','observation_restored'), 'invalid resolution')
        require(not db.execute("SELECT 1 FROM dispatches WHERE task_id=? AND state IN ('prepared','sent','uncertain')", (task_id,)).fetchone(), 'reconcile unresolved dispatch before resolving')
        if resolution != 'dismissed':
            obs = db.execute('SELECT rowid,data FROM observations WHERE task_id=? AND id=?',
                (task_id, string(data, 'observation_id'))).fetchone()
            require(obs is not None, 'resolution requires observed evidence')
            require(obs['rowid'] > incident['observation_boundary'], 'resolution requires a new observation after incident')
            if resolution == 'corrected':
                item = dispatch(db, incident.get('correction_dispatch_id'), task_id)
                require(item['state'] == 'observed' and item['mandate_version'] == task['mandate_version'], 'correction must be read back under current mandate')
                require(json.loads(obs['data']).get('dispatch_id') == item['id'], 'resolution observation must confirm linked correction')
            else:
                require(incident['category'] == 'observation_unavailable', 'observation restoration applies only to observation incidents')
        incident.update({'status':'resolved', 'resolution':resolution,
            'verified_by':string(data,'verified_by'), 'verification_evidence':strings(data,'verification_evidence'),
            'resolved_at':datetime.now(timezone.utc).isoformat()})
    elif command == 'monitor-record':
        status = string(data, 'status')
        require(status in ('watching','waiting_decision','stopped'), 'invalid monitor status')
        if status == 'watching':
            require(task['data']['execution'] is not None, 'monitor requires a bound execution chat')
            require(not task['data'].get('incident') or task['data']['incident']['status'] == 'resolved', 'resolve open incident before resuming monitor')
            string(data, 'automation_id')
            string(data, 'authorization_source')
        task['data']['monitor'] = {'status':status, 'automation_id':data.get('automation_id'),
            'reason':string(data,'reason'), 'evidence':strings(data,'evidence'),
            'at':datetime.now(timezone.utc).isoformat()}
    elif command == 'task-transition':
        status = string(data, 'state')
        require(status in STATES[task['state']], 'invalid task transition')
        string(data, 'reason')
        if status in ('accepted','stopped'):
            require(not db.execute("SELECT 1 FROM dispatches WHERE task_id=? AND state IN ('prepared','sent','uncertain')", (task_id,)).fetchone(),
                    'reconcile dispatch before terminal transition')
        if status == 'accepted':
            require(not task['data'].get('incident') or task['data']['incident']['status'] == 'resolved', 'resolve open incident before acceptance')
            require(task['data'].get('last_observation_id'), 'acceptance requires observation')
            strings(data, 'verification_evidence')
            string(data, 'verified_by')
        if status == 'stopped':
            string(data, 'stop_authorization_source')
            string(data, 'execution_stop_evidence')
        task['state'] = status
    else:
        raise ValueError('unknown command')
    save(db, task)
    event(db, task_id, command, data)
    return {'task': task, **(result or {})}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--db', required=True, help='absolute database path; only init creates it')
    parser.add_argument('command', choices=('init','task-create','task-list','task-show','mandate-revise',
                       'dispatch-prepare','dispatch-mark','observation-record','task-transition',
                       'incident-record','correction-link','incident-resolve','monitor-record','task-delete'))
    parser.add_argument('--input', help='UTF-8 JSON object file; - reads stdin')
    args = parser.parse_args()
    try:
        path = Path(args.db)
        require(path.is_absolute(), '--db must be absolute')
        data = {}
        if args.input:
            data = json.load(sys.stdin) if args.input == '-' else json.loads(Path(args.input).read_text(encoding='utf-8'))
        require(isinstance(data, dict), 'input must be a JSON object')
        os.umask(0o077)
        if args.command == 'init':
            require(not path.exists(), 'database already exists; init will not reset it')
            path.parent.mkdir(parents=True, exist_ok=True)
            fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
            os.close(fd)
        else:
            require(path.is_file(), 'database missing; use init explicitly')
        db = sqlite3.connect(path.as_uri() + '?mode=rw', uri=True, timeout=5, isolation_level=None)
        db.row_factory = sqlite3.Row
        db.execute('PRAGMA foreign_keys=ON')
        if args.command == 'init':
            db.executescript('BEGIN IMMEDIATE;\n' + SCHEMA + '\nCOMMIT;')
        require(db.execute('PRAGMA user_version').fetchone()[0] == 1, 'unsupported database schema')
        try:
            db.execute('BEGIN IMMEDIATE')
            output = run(db, args.command, data)
            db.execute('COMMIT')
        except Exception:
            if db.in_transaction:
                db.execute('ROLLBACK')
            raise
        finally:
            db.close()
        print(encode({'ok': True, 'result': output}))
        return 0
    except (ValueError, OSError, sqlite3.Error, json.JSONDecodeError) as exc:
        print(encode({'ok': False, 'error': str(exc)}))
        return 1


if __name__ == '__main__':
    sys.exit(main())
