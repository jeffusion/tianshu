from contextlib import closing
import concurrent.futures
import importlib.util
import json
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / 'ledger/coordinator.py'
spec = importlib.util.spec_from_file_location('coordinator', SCRIPT)
c = importlib.util.module_from_spec(spec)
spec.loader.exec_module(c)


class LedgerTest(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:', isolation_level=None)
        self.db.row_factory = sqlite3.Row
        self.db.execute('PRAGMA foreign_keys=ON')
        self.db.executescript(c.SCHEMA)
        self.call('task-create', objective='test', owner_thread_id='owner', owner_host_id='local',
                  acceptance=['read actual output'], allowed=['test files'], forbidden=['production'],
                  authorization_source='human request')

    def tearDown(self):
        self.db.close()

    def call(self, command, **data):
        data = {'task_id': 'pilot', **data}
        if command not in ('task-create','task-show','task-list','init'):
            data.setdefault('expected_revision', c.get_task(self.db,'pilot')['revision'])
        self.db.execute('BEGIN IMMEDIATE')
        try:
            result = c.run(self.db, command, data)
            self.db.execute('COMMIT')
            return result
        except Exception:
            self.db.execute('ROLLBACK')
            raise

    def prepare(self, name='d1', kind='create_thread'):
        return self.call('dispatch-prepare', dispatch_id=name, kind=kind,
                         prompt=f'[{name}] bounded task', authorization_source='human request')

    def sent(self):
        self.call('dispatch-mark',dispatch_id='d1',state='sent',
                  receipt={'thread_id':'worker','host_id':'local'})

    def observe(self):
        return self.call('observation-record', observation_id='o1', host_id='local', thread_id='worker',
                         turn_id='turn1', summary='read back dispatch', dispatch_id='d1',
                         evidence=['read_thread message ID'])

    def confirm(self):
        self.prepare()
        self.sent()
        self.observe()
        self.call('dispatch-mark', dispatch_id='d1',state='observed',receipt={'observation_id':'o1'})

    def test_end_to_end_requires_verification(self):
        self.confirm()
        self.call('task-transition',state='running',reason='started')
        self.call('task-transition',state='ready',reason='report returned')
        with self.assertRaises(ValueError):
            self.call('task-transition',state='accepted',reason='looks fine')
        self.call('task-transition',state='accepted',reason='checked output',
                  verified_by='owner',verification_evidence=['actual file checked'])
        with self.assertRaises(ValueError):
            self.prepare('d2', 'send_message')
        self.assertEqual(c.get_task(self.db,'pilot')['state'],'accepted')

    def test_stale_update_rolls_back(self):
        self.prepare()
        with self.assertRaises(ValueError):
            self.call('task-transition',expected_revision=1,state='running',reason='stale')
        self.assertEqual(c.get_task(self.db,'pilot')['state'],'queued')

    def test_uncertain_blocks_duplicate_and_mandate_revision(self):
        self.prepare()
        self.call('dispatch-mark',dispatch_id='d1',state='uncertain',receipt={'reason':'timeout'})
        with self.assertRaises(sqlite3.IntegrityError):
            self.prepare('d2')
        with self.assertRaises(ValueError):
            self.call('mandate-revise',allowed=['more'],forbidden=['production'],authorization_source='new human request')
        self.sent()
        self.observe()
        self.call('dispatch-mark',dispatch_id='d1',state='observed',receipt={'observation_id':'o1'})

    def test_duplicate_id_never_reused(self):
        self.confirm()
        with self.assertRaises(sqlite3.IntegrityError):
            self.prepare('d1','send_message')

    def test_wrong_target_receipt_is_atomic(self):
        self.confirm()
        self.prepare('d2','send_message')
        before = c.get_task(self.db,'pilot')['revision']
        with self.assertRaises(ValueError):
            self.call('dispatch-mark',dispatch_id='d2',state='sent',receipt={'thread_id':'other','host_id':'local'})
        self.assertEqual(c.get_task(self.db,'pilot')['revision'],before)
        self.assertEqual(c.dispatch(self.db,'d2','pilot')['state'],'prepared')

    def test_observation_must_confirm_its_own_dispatch(self):
        self.confirm()
        self.prepare('d2','send_message')
        self.call('dispatch-mark',dispatch_id='d2',state='sent',receipt={'thread_id':'worker','host_id':'local'})
        with self.assertRaises(ValueError):
            self.call('dispatch-mark',dispatch_id='d2',state='observed',receipt={'observation_id':'o1'})

    def test_wrong_host_observation_rejected(self):
        self.prepare()
        self.sent()
        with self.assertRaises(ValueError):
            self.call('observation-record',host_id='remote',thread_id='worker',turn_id='t',summary='bad',evidence=['x'])

    def test_idle_observation_does_not_complete_task(self):
        self.prepare()
        self.sent()
        self.call('observation-record',host_id='local',thread_id='worker',turn_id='t',summary='idle',evidence=['snapshot'])
        self.assertEqual(c.get_task(self.db,'pilot')['state'],'queued')

    def test_body_read_preserves_wait_cursor(self):
        self.prepare()
        self.sent()
        base = dict(host_id='local',thread_id='worker',turn_id='t',summary='snapshot',evidence=['read'])
        self.call('observation-record',cursor='saved-wait-cursor',**base)
        self.call('observation-record',**base)
        self.assertEqual(c.get_task(self.db,'pilot')['data']['cursor'],'saved-wait-cursor')
        self.call('observation-record',cursor=None,**base)
        self.assertIsNone(c.get_task(self.db,'pilot')['data']['cursor'])

    def test_authorization_history_preserved(self):
        self.call('mandate-revise',allowed=['test and review'],forbidden=['production'],authorization_source='new human request')
        rows = self.call('task-show')['mandates']
        self.assertEqual([r['version'] for r in rows],[1,2])
        self.assertEqual(rows[0]['data']['allowed'],['test files'])

    def test_stopped_requires_execution_evidence(self):
        with self.assertRaises(ValueError):
            self.call('task-transition',state='stopped',reason='stop',stop_authorization_source='human')
        self.call('task-transition',state='stopped',reason='stop',stop_authorization_source='human',
                  execution_stop_evidence='never dispatched')


    def incident(self):
        self.confirm()
        self.call('task-transition',state='running',reason='fixture started')
        self.call('incident-record',incident_id='i1',category='direction_drift',summary='fixture went off task',evidence=['fixture transcript'])
        self.call('monitor-record',status='waiting_decision',reason='await bounded correction',evidence=['monitor fixture suspended'])

    def correction(self):
        self.prepare('fix1','send_message')
        self.call('correction-link',incident_id='i1',dispatch_id='fix1')
        self.call('dispatch-mark',dispatch_id='fix1',state='sent',receipt={'host_id':'local','thread_id':'worker'})
        self.call('observation-record',observation_id='fixed',host_id='local',thread_id='worker',turn_id='fix-turn',summary='fixture returned to required work',evidence=['fixture expected output'],dispatch_id='fix1')
        self.call('dispatch-mark',dispatch_id='fix1',state='observed',receipt={'observation_id':'fixed'})

    def test_incident_keeps_business_state_and_cursor(self):
        self.incident()
        t=self.call('task-show')
        self.assertEqual(t['state'],'running')
        self.assertEqual(t['data']['incident']['status'],'open')
        self.assertEqual(t['data']['monitor']['status'],'waiting_decision')
        with self.assertRaises(ValueError):
            self.call('incident-record',incident_id='i2',category='execution_failure',summary='overwrite',evidence=['x'])

    def test_correction_requires_authorization_readback_and_verification(self):
        self.incident()
        with self.assertRaises(ValueError):
            self.call('dispatch-prepare',dispatch_id='unauthorized',kind='send_message',prompt='fixture correction')
        with self.assertRaises(ValueError):
            self.call('monitor-record',status='watching',automation_id='fixture',authorization_source='human',reason='premature',evidence=['x'])
        self.correction()
        with self.assertRaises(ValueError):
            self.call('incident-resolve',incident_id='i1',resolution='corrected',observation_id='o1',verified_by='owner',verification_evidence=['wrong observation'])
        self.call('incident-resolve',incident_id='i1',resolution='corrected',observation_id='fixed',verified_by='owner',verification_evidence=['fixture expected result independently checked'])
        self.call('monitor-record',status='watching',automation_id='fixture',authorization_source='human bounded fixture',reason='fixture resume receipt',evidence=['fixture schedule receipt; no real automation'])
        self.assertEqual(self.call('task-show')['data']['monitor']['status'],'watching')

    def test_uncertain_correction_cannot_resolve_or_duplicate(self):
        self.incident();self.prepare('fix1','send_message')
        self.call('correction-link',incident_id='i1',dispatch_id='fix1')
        self.call('dispatch-mark',dispatch_id='fix1',state='uncertain',receipt={'reason':'fixture receipt loss'})
        with self.assertRaises(sqlite3.IntegrityError):self.prepare('fix2','send_message')
        with self.assertRaises(ValueError):
            self.call('incident-resolve',incident_id='i1',resolution='dismissed',verified_by='owner',verification_evidence=['not reconciled'])

    def test_open_incident_blocks_acceptance(self):
        self.incident();self.call('task-transition',state='ready',reason='fixture finished')
        with self.assertRaises(ValueError):
            self.call('task-transition',state='accepted',reason='premature',verified_by='owner',verification_evidence=['artifact only'])

    def test_read_failure_is_not_execution_failure(self):
        self.confirm();self.call('task-transition',state='running',reason='started')
        self.call('incident-record',incident_id='read1',category='observation_unavailable',summary='repeated fixture transport failures',evidence=['fixture failure log'])
        self.call('observation-record',observation_id='restored',host_id='local',thread_id='worker',turn_id='t2',summary='fixture reads restored',evidence=['fixture snapshot'])
        self.call('incident-resolve',incident_id='read1',resolution='observation_restored',observation_id='restored',verified_by='owner',verification_evidence=['fixture snapshot checked'])
        self.assertEqual(self.call('task-show')['state'],'running')

    def test_historical_observation_and_dispatch_cannot_resolve_new_incident(self):
        self.confirm()
        self.prepare('old-fix','send_message')
        self.call('dispatch-mark',dispatch_id='old-fix',state='sent',receipt={'host_id':'local','thread_id':'worker'})
        self.call('observation-record',observation_id='older',host_id='local',thread_id='worker',turn_id='old',summary='old correction',dispatch_id='old-fix',evidence=['old'])
        self.call('dispatch-mark',dispatch_id='old-fix',state='observed',receipt={'observation_id':'older'})
        self.call('observation-record',observation_id='latest',host_id='local',thread_id='worker',turn_id='last',summary='last before incident',evidence=['last'])
        self.call('incident-record',incident_id='i1',category='observation_unavailable',summary='new incident',evidence=['new'])
        with self.assertRaises(ValueError):
            self.call('incident-resolve',incident_id='i1',resolution='observation_restored',observation_id='older',verified_by='owner',verification_evidence=['old'])
        with self.assertRaises(ValueError):
            self.call('correction-link',incident_id='i1',dispatch_id='old-fix')

    def test_delivered_but_ineffective_correction_can_be_replaced_with_evidence(self):
        self.incident();self.correction();self.prepare('fix2','send_message')
        with self.assertRaises(ValueError):self.call('correction-link',incident_id='i1',dispatch_id='fix2')
        self.call('correction-link',incident_id='i1',dispatch_id='fix2',replacement_reason='first delivery did not restore expected output',replacement_evidence=['checked first reply'])
        incident=self.call('task-show')['data']['incident']
        self.assertEqual(incident['correction_dispatch_id'],'fix2')
        self.assertEqual(incident['correction_history'][0]['dispatch_id'],'fix1')
        self.call('dispatch-mark',dispatch_id='fix2',state='sent',receipt={'host_id':'local','thread_id':'worker'})
        self.call('observation-record',observation_id='fixed2',host_id='local',thread_id='worker',turn_id='t2',summary='second correction',evidence=['second result'],dispatch_id='fix2')
        self.call('dispatch-mark',dispatch_id='fix2',state='observed',receipt={'observation_id':'fixed2'})
        with self.assertRaises(ValueError):
            self.call('correction-link',incident_id='i1',dispatch_id='fix1',replacement_reason='roll back',replacement_evidence=['old result'])
        self.assertEqual(self.call('task-show')['data']['incident']['correction_dispatch_id'],'fix2')

    def test_terminal_task_can_record_actual_monitor_stop_but_not_resume(self):
        self.confirm();self.call('task-transition',state='running',reason='started')
        self.call('monitor-record',status='watching',automation_id='fixture',authorization_source='human fixture',reason='fixture started',evidence=['fixture config receipt'])
        self.call('task-transition',state='ready',reason='finished')
        self.call('task-transition',state='accepted',reason='checked',verified_by='owner',verification_evidence=['actual fixture checked'])
        self.call('monitor-record',status='stopped',automation_id='fixture',reason='fixture deleted',evidence=['fixture deletion receipt'])
        self.assertEqual(self.call('task-show')['data']['monitor']['status'],'stopped')
        with self.assertRaises(ValueError):
            self.call('monitor-record',status='watching',automation_id='fixture',authorization_source='human',reason='forbidden',evidence=['x'])

    def test_terminal_bound_task_requires_execution_check_and_stopped_monitor(self):
        self.confirm();self.call('task-transition',state='running',reason='start')
        self.call('monitor-record',status='watching',automation_id='fixture',authorization_source='human',reason='start',evidence=['receipt'])
        self.call('task-transition',state='ready',reason='report')
        self.call('task-transition',state='accepted',reason='verified',verified_by='owner',verification_evidence=['proof'])
        request={'reason':'delete','authorization_source':'human explicit delete','execution_stop_evidence':'actual idle check'}
        with self.assertRaisesRegex(ValueError,'stop monitor'):
            self.call('task-delete',**request)
        self.call('monitor-record',status='stopped',reason='deleted',evidence=['automation deleted receipt'])
        with self.assertRaisesRegex(ValueError,'execution_stop_evidence'):
            self.call('task-delete',reason='delete',authorization_source='human explicit delete')
        result=self.call('task-delete',**request)
        self.assertTrue(result['deleted'])
        snapshot=json.loads(self.db.execute('SELECT snapshot FROM task_deletions').fetchone()[0])
        self.assertEqual(snapshot['state'],'accepted');self.assertEqual(len(snapshot['observations']),1)

    def test_unresolved_dispatch_and_incident_block_even_terminal_record(self):
        # Simulate a previously inconsistent/imported terminal record; deletion must still fail.
        self.prepare();self.db.execute("UPDATE tasks SET state='stopped'")
        with self.assertRaisesRegex(ValueError,'unresolved dispatch'):
            self.call('task-delete',reason='cleanup',authorization_source='human')
        self.db.execute("DELETE FROM dispatches")
        self.db.execute("UPDATE tasks SET state='queued'")
        self.call('incident-record',incident_id='i',category='execution_failure',summary='failed',evidence=['x'])
        self.call('task-transition',state='stopped',reason='stop',stop_authorization_source='human',execution_stop_evidence='no worker')
        with self.assertRaisesRegex(ValueError,'open incident'):
            self.call('task-delete',reason='cleanup',authorization_source='human')


    def test_deleting_other_task_does_not_rewind_incident_order(self):
        self.confirm()
        self.call('task-create',task_id='other',objective='other',owner_thread_id='owner',owner_host_id='local',
            acceptance=['test'],allowed=['test'],forbidden=['prod'],authorization_source='human',
            execution={'host_id':'local','thread_id':'other-worker'})
        self.call('dispatch-prepare',task_id='other',expected_revision=1,dispatch_id='other-d',kind='send_message',prompt='fixture',authorization_source='human')
        self.call('dispatch-mark',task_id='other',expected_revision=2,dispatch_id='other-d',state='cancelled',receipt={'reconciliation':'never sent'})
        self.call('observation-record',task_id='other',expected_revision=3,host_id='local',thread_id='other-worker',turn_id='other-turn',summary='fixture read',evidence=['actual fixture'])
        self.call('task-transition',task_id='other',expected_revision=4,state='stopped',reason='done',stop_authorization_source='human',execution_stop_evidence='idle')
        self.call('incident-record',incident_id='order',category='direction_drift',summary='fixture drift',evidence=['actual fixture'])
        boundary=self.call('task-show')['data']['incident']
        self.call('task-delete',task_id='other',expected_revision=5,reason='explicit cleanup',authorization_source='human',execution_stop_evidence='idle')
        self.prepare('fix-after-delete','send_message')
        self.call('correction-link',incident_id='order',dispatch_id='fix-after-delete')
        self.call('dispatch-mark',dispatch_id='fix-after-delete',state='sent',receipt={'thread_id':'worker','host_id':'local'})
        self.call('observation-record',observation_id='new-after-delete',host_id='local',thread_id='worker',turn_id='fixed',summary='fixed',evidence=['new fixture result'],dispatch_id='fix-after-delete')
        self.call('dispatch-mark',dispatch_id='fix-after-delete',state='observed',receipt={'observation_id':'new-after-delete'})
        self.call('incident-resolve',incident_id='order',resolution='corrected',observation_id='new-after-delete',verified_by='owner',verification_evidence=['fixed fixture'])
        self.assertEqual(self.call('task-show')['data']['incident']['status'],'resolved')
        self.assertGreater(self.db.execute("SELECT rowid FROM dispatches WHERE id='fix-after-delete'").fetchone()[0],boundary['dispatch_boundary'])
        self.assertGreater(self.db.execute("SELECT rowid FROM observations WHERE id='new-after-delete'").fetchone()[0],boundary['observation_boundary'])


class CliTest(unittest.TestCase):
    def invoke(self, db, command, data=None):
        cmd = [sys.executable,str(SCRIPT),'--db',str(db),command]
        if data is not None:
            cmd += ['--input','-']
        result = subprocess.run(cmd,input=json.dumps(data) if data is not None else None,
                                capture_output=True,text=True)
        return result.returncode,json.loads(result.stdout)

    def test_init_persistence_and_missing_db(self):
        with tempfile.TemporaryDirectory() as directory:
            db = Path(directory)/'ledger.db'
            self.assertEqual(self.invoke(db,'task-list')[0],1)
            self.assertFalse(db.exists())
            self.assertEqual(self.invoke(db,'init')[0],0)
            self.assertEqual(db.stat().st_mode & 0o777,0o600)
            self.assertEqual(self.invoke(db,'init')[0],1)
            self.assertEqual(self.invoke(db,'task-list')[1]['result'],[])

    def test_concurrent_stale_writers_only_one_succeeds(self):
        with tempfile.TemporaryDirectory() as directory:
            db = Path(directory)/'ledger.db'
            self.invoke(db,'init')
            self.invoke(db,'task-create',{'task_id':'p','objective':'test','owner_thread_id':'owner',
                'owner_host_id':'local','acceptance':['proof'],'allowed':['test'],'forbidden':['prod'],
                'authorization_source':'human'})
            data = {'task_id':'p','expected_revision':1,'state':'running','reason':'start'}
            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
                results = list(pool.map(lambda _: self.invoke(db,'task-transition',data),range(2)))
            self.assertEqual(sorted(r[0] for r in results),[0,1])
            task = self.invoke(db,'task-show',{'task_id':'p'})[1]['result']
            self.assertEqual(task['revision'],2)
            self.assertEqual(len(task['events']),2)

    def test_delete_is_atomic_archived_and_idempotent_across_processes(self):
        with tempfile.TemporaryDirectory() as directory:
            db = Path(directory)/'ledger.db'
            self.invoke(db,'init')
            create = {'task_id':'p','objective':'test','owner_thread_id':'owner',
                'owner_host_id':'local','acceptance':['proof'],'allowed':['test'],'forbidden':['prod'],
                'authorization_source':'human'}
            self.invoke(db,'task-create',create)
            request = {'task_id':'p','expected_revision':1,'reason':'human cleanup',
                       'authorization_source':'explicit user delete'}
            self.assertEqual(self.invoke(db,'task-delete',request)[0],1)
            self.invoke(db,'task-transition',{'task_id':'p','expected_revision':1,'state':'stopped',
                'reason':'fixture finished','stop_authorization_source':'human',
                'execution_stop_evidence':'unbound isolated fixture, no worker'})
            self.assertEqual(self.invoke(db,'task-delete',request)[0],1)  # stale revision
            request['expected_revision'] = 2
            with closing(sqlite3.connect(db)) as connection:
                connection.execute("CREATE TRIGGER fail_delete BEFORE DELETE ON tasks BEGIN SELECT RAISE(ABORT,'fixture disk failure'); END");connection.commit()
            self.assertEqual(self.invoke(db,'task-delete',request)[0],1)
            self.assertEqual(self.invoke(db,'task-show',{'task_id':'p'})[0],0)
            with closing(sqlite3.connect(db)) as connection:
                self.assertEqual(connection.execute('SELECT count(*) FROM mandates').fetchone()[0],1)
                self.assertEqual(connection.execute("SELECT count(*) FROM sqlite_master WHERE name='task_deletions'").fetchone()[0],0)
                connection.execute('DROP TRIGGER fail_delete');connection.commit()
            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
                responses = list(pool.map(lambda _:self.invoke(db,'task-delete',request),range(2)))
            self.assertTrue(all(code==0 for code,_ in responses))
            receipts = [r['result'] for _,r in responses]
            self.assertEqual(receipts[0]['archive_id'],receipts[1]['archive_id'])
            self.assertEqual(sorted(r['already_deleted'] for r in receipts),[False,True])
            self.assertEqual(self.invoke(db,'task-show',{'task_id':'p'})[0],1)
            self.assertEqual(self.invoke(db,'task-create',create)[0],1)
            with closing(sqlite3.connect(db)) as connection:
                for table in ('tasks','mandates','dispatches','observations','events'):
                    self.assertEqual(connection.execute(f'SELECT count(*) FROM {table}').fetchone()[0],0)
                archive = connection.execute('SELECT snapshot,request FROM task_deletions').fetchone()
                saved=json.loads(archive[0]);self.assertEqual(saved['state'],'stopped')
                self.assertEqual(len(saved['mandates']),1);self.assertEqual(len(saved['events']),2)
                self.assertEqual(json.loads(archive[1])['authorization_source'],'explicit user delete')
                self.assertEqual(connection.execute('PRAGMA integrity_check').fetchone()[0],'ok')
                self.assertEqual(connection.execute('PRAGMA foreign_key_check').fetchall(),[])


if __name__ == '__main__':
    unittest.main()
