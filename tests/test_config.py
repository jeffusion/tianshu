import json
import os
from unittest.mock import patch
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'ledger'))
from config import load_config, config_path


class ConfigTests(unittest.TestCase):
    def test_missing_config_never_creates_files(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'missing.json'
            with self.assertRaises(OSError):load_config(str(path))
            self.assertEqual(list(Path(directory).iterdir()),[])

    def test_invalid_or_duplicate_sources_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'config.json'
            for sources in [[],[{'id':'bad:id','label':'test','path':'/tmp/a.db'}],[{'id':'a','label':'test','path':'relative'}],[{'id':'a','label':'test','path':'/tmp/a.db'}]*2]:
                path.write_text(json.dumps({'sources':sources}))
                with self.assertRaises(ValueError):load_config(str(path))

    def test_skill_entrypoint_and_reader_use_same_config_and_no_db_override(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(__file__).resolve().parents[1];path=Path(directory)/'config.json';db=Path(directory)/'test.db'
            path.write_text(json.dumps({'sources':[{'id':'fixture','label':'Fixture','path':str(db)}]}))
            skill=root/'skills/coordinator/scripts/coordinator.py'
            def run(*args):return subprocess.run([sys.executable,str(skill),'--config',str(path),'--source','fixture',*args],capture_output=True,text=True)
            self.assertEqual(run('init').returncode,0)
            self.assertEqual(json.loads(run('task-list').stdout)['result'],[])
            projected=subprocess.run([sys.executable,str(root/'ledger/read_ledger.py'),'--config',str(path)],capture_output=True,text=True,check=True)
            self.assertEqual(json.loads(projected.stdout)['sources'][0]['id'],'fixture')
            for flag in ['--db=/tmp/not-allowed.db','--db','--d=/tmp/not-allowed.db']:
                result=run('task-list',flag)
                self.assertNotEqual(result.returncode,0)
                self.assertIn('unrecognized arguments',result.stderr)

    def test_stable_home_and_config_precedence(self):
        with patch.dict(os.environ, {'TIANSHU_HOME':'/tmp/tianshu-fixture'}, clear=True):
            self.assertEqual(config_path(),Path('/tmp/tianshu-fixture/config.json'))
            with patch.dict(os.environ, {'TIANSHU_CONFIG':'/tmp/explicit.json'}):
                self.assertEqual(config_path(),Path('/tmp/explicit.json'))
                self.assertEqual(config_path('/tmp/argument.json'),Path('/tmp/argument.json'))
        with patch.dict(os.environ, {'XDG_DATA_HOME':'/tmp/xdg'}, clear=True), patch('config.sys.platform','linux'):
            self.assertEqual(config_path(),Path('/tmp/xdg/tianshu/config.json'))
        with patch.dict(os.environ, {'TIANSHU_HOME':'relative'}, clear=True):
            with self.assertRaises(ValueError):config_path()

    def test_node_and_python_default_path_match_with_symlink_and_parent(self):
        root=Path(__file__).resolve().parents[1]
        with tempfile.TemporaryDirectory() as directory:
            base=Path(directory)
            (base/'target'/'nested').mkdir(parents=True)
            (base/'link').symlink_to(base/'target'/'nested',target_is_directory=True)
            home=str(base/'link'/'..'/'business')
            with patch.dict(os.environ, {'TIANSHU_HOME':home}, clear=True):
                expected=str(config_path())
            script='const m=await import(process.argv[1]);console.log(m.configPath());'
            environment=dict(os.environ,TIANSHU_HOME=home)
            environment.pop('TIANSHU_CONFIG',None)
            node=subprocess.run(['node','--input-type=module','-e',script,
                                 (root/'src/contracts/config-path.mjs').as_uri()],
                                env=environment,capture_output=True,text=True,check=True)
            self.assertEqual(node.stdout.strip(),expected)
