"""Reject incomplete or inconsistent receipts, independently of expected counts."""
import gzip
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).parent
spec = importlib.util.spec_from_file_location('receipt', ROOT / 'analyze.py')
receipt = importlib.util.module_from_spec(spec)
spec.loader.exec_module(receipt)

class ReceiptIntegrity(unittest.TestCase):
    def corrupt(self, mutation):
        rows = [json.loads(x) for x in gzip.decompress((ROOT / 'cycle.jsonl.gz').read_bytes()).decode().splitlines() if x.startswith('{')]
        mutation(rows)
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'trace.jsonl'
            path.write_text('\n'.join(json.dumps(x) for x in rows))
            with self.assertRaises(AssertionError):
                receipt.analyze(path)

    def test_missing_request(self):
        self.corrupt(lambda rows: rows.remove(next(x for x in rows if x['type'] == 'request')))

    def test_missing_target_read(self):
        def mutate(rows):
            target = next(x for x in rows if x['type'] == 'request')
            rows.remove(next(x for x in rows if x['type'] == 'event' and x['event'] == 'READ_FROM_DISK' and x['volid'] == target['volid'] and x['pageid'] == target['pageid']))
        self.corrupt(mutate)

    def test_missing_target_eviction(self):
        def mutate(rows):
            targets = {(x['volid'],x['pageid']) for x in rows if x['type'] == 'request'}
            rows.remove(next(x for x in rows if x['type'] == 'event' and x['event'] == 'EVICTED' and (x['volid'],x['pageid']) in targets))
        self.corrupt(mutate)

    def test_wrong_threshold(self):
        self.corrupt(lambda rows: next(x for x in rows if x['type'] == 'snapshot' and x['request'] == 0)['thresholds'].__setitem__(0,9999))

if __name__ == '__main__': unittest.main()
