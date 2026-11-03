import importlib.util
import json
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'ledger'))
spec=importlib.util.spec_from_file_location('reader',Path(__file__).resolve().parents[1]/'ledger/read_ledger.py')
reader=importlib.util.module_from_spec(spec);spec.loader.exec_module(reader)


class ReaderTests(unittest.TestCase):
    def test_missing_database_is_not_created_or_reported_healthy(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'missing.db'
            result=reader.snapshot({'sources':[{'id':'missing','label':'Missing','path':str(path)}]})
            self.assertFalse(path.exists())
            self.assertFalse(result['sources'][0]['ok'])
            self.assertEqual(result['tasks'],[])

    def test_projection_does_not_expose_dispatch_payload_and_preserves_constraints(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'test.db'
            db=sqlite3.connect(path)
            db.executescript('PRAGMA user_version=1; CREATE TABLE tasks(id,revision,state,mandate_version,data); CREATE TABLE mandates(task_id,version,data); CREATE TABLE observations(task_id,data); CREATE TABLE events(seq,task_id,at,action,data); CREATE TABLE dispatches(data);')
            data={'objective':'<script>unsafe text</script>','acceptance':['verify'],'execution':{'host_id':'local','thread_id':'test'},
                  'incident':{'id':'i1','category':'direction_drift','status':'open','summary':'drift','evidence':['safe-proof'],'authorization_source':'private-recovery-auth','prompt':'private-correction-prompt'},
                  'monitor':{'status':'waiting_decision','reason':'needs correction','authorization_source':'private-monitor-auth'}}
            db.execute('INSERT INTO tasks VALUES(?,?,?,?,?)',('test',3,'ready',1,json.dumps(data)))
            db.execute('INSERT INTO mandates VALUES(?,?,?)',('test',1,json.dumps({'allowed':['read'],'forbidden':['deploy'],'authorization_source':'private-original-message'})))
            db.execute('INSERT INTO dispatches VALUES(?)',('private-dispatch-payload',))
            db.execute('INSERT INTO events VALUES(?,?,?,?,?)',(1,'test','2026-11-01T00:00:00Z','observation-record',json.dumps({'summary':'safe'})))
            db.execute('INSERT INTO events VALUES(?,?,?,?,?)',(2,'test','2026-11-01T00:05:00Z','dispatch-prepare',json.dumps({'prompt':'private-dispatch-payload'})))
            db.commit();db.close()
            before=path.read_bytes()
            result=reader.snapshot({'sources':[{'id':'test','label':'Test','path':str(path)}]})
            self.assertEqual(result['tasks'][0]['forbidden'],['deploy'])
            self.assertEqual(result['tasks'][0]['observed_at'],'2026-11-01T00:00:00Z')
            self.assertEqual(result['tasks'][0]['updated_at'],'2026-11-01T00:05:00Z')
            self.assertIsNone(result['tasks'][0]['verification'])
            self.assertEqual(result['tasks'][0]['objective'],data['objective'])
            self.assertNotIn('private-dispatch-payload',json.dumps(result))
            self.assertNotIn('private-original-message',json.dumps(result))
            self.assertNotIn('private-recovery-auth',json.dumps(result))
            self.assertNotIn('private-correction-prompt',json.dumps(result))
            self.assertNotIn('private-monitor-auth',json.dumps(result))
            self.assertEqual(result['tasks'][0]['incident']['category'],'direction_drift')
            self.assertEqual(result['tasks'][0]['monitor']['status'],'waiting_decision')
            config={'sources':[{'id':'test','label':'Test','path':str(path)}],
                    'presentation':{'test:test':{'revision':3,'title':'简短标题','final_summary':'已核验结论','evidence':['result.md']}}}
            displayed=reader.snapshot(config)['tasks'][0]
            self.assertEqual(displayed['display']['title'],'简短标题')
            self.assertEqual(displayed['display']['evidence'],['result.md'])
            self.assertEqual(displayed['objective'],data['objective'])
            config['presentation']['test:test']['revision']=2
            self.assertNotIn('display',reader.snapshot(config)['tasks'][0])
            self.assertEqual(before,path.read_bytes())


if __name__=='__main__':unittest.main()
