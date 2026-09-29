#!/usr/bin/env python3
"""Validate request/event receipts; do not infer a target result from policy names."""
import argparse, collections, gzip, hashlib, json
from pathlib import Path

def analyze(path):
    data = path.read_bytes()
    lines = gzip.decompress(data).decode().splitlines() if path.suffix == '.gz' else data.decode().splitlines()
    records = [json.loads(line) for line in lines if line.startswith('{')]
    setup = next(r for r in records if r['type'] == 'setup')
    requests = [r for r in records if r['type'] == 'request']
    assert len(requests) == setup['pages'] * setup['passes']
    assert [r['request'] for r in requests] == list(range(len(requests)))
    groups = collections.defaultdict(list)
    snapshots = {}
    for row in records:
        if row['type'] == 'event': groups[row['request']].append(row)
        if row['type'] == 'snapshot': snapshots[row['request']] = row
    assert len(snapshots) == len(requests) + 1
    residents = set()
    passes = [dict(hits=0, misses=0, target_evictions=0, all_reads=0) for _ in range(setup['passes'])]
    targets = {(r['volid'], r['pageid']) for r in requests}
    assert len(targets) == setup['pages']
    first = requests[:setup['pages']]
    for r in requests:
        key = (r['volid'], r['pageid'])
        assert key == (first[r['index']]['volid'], first[r['index']]['pageid'])
        events = groups[r['request']]
        outcome = [e['event'] for e in events if (e['volid'], e['pageid']) == key and e['event'] in ('FIX_HIT', 'READ_FROM_DISK')]
        assert len(outcome) == 1, (r, outcome)
        hit = outcome[0] == 'FIX_HIT'
        assert hit == (key in residents), (r, 'residency mismatch')
        result = passes[r['pass']]
        result['hits' if hit else 'misses'] += 1
        for e in events:
            k = (e['volid'], e['pageid'])
            if e['event'] == 'READ_FROM_DISK':
                result['all_reads'] += 1
                if k in targets: residents.add(k)
            if e['event'] == 'EVICTED' and k in targets:
                assert k in residents
                residents.remove(k)
                result['target_evictions'] += 1
        assert key in residents
        snapshot = snapshots[r['request']]
        assert 0 <= sum(snapshot['zones']) <= setup['buffers']
        assert snapshot['thresholds'] == [int(snapshot['quota'] * .05)] * 2
        assert snapshot['aout'] == 0
    assert passes[0]['misses'] == setup['pages'], 'cold target set'
    if setup['scenario'] == 'fits': assert all(p['misses'] == 0 for p in passes[1:])
    return dict(file=path.name, sha256=hashlib.sha256(data).hexdigest(), setup=setup,
                passes=passes, initial=snapshots[-1], final=snapshots[len(requests)-1],
                verdict='PASS: request counts, VPID outcomes, residency transitions, cold start, quota thresholds and fitting control')

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('traces', type=Path, nargs='+')
    args = parser.parse_args()
    print(json.dumps([analyze(p) for p in args.traces], indent=2))
