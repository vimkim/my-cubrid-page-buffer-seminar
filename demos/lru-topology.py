#!/usr/bin/env python3
"""Enter-driven LRU demo using two persistent csql processes and real observations."""

import argparse
import importlib.util
import json
import os
from pathlib import Path
import pty
import re
import select
import signal
import subprocess
import sys
import termios
import time
import uuid

sys.dont_write_bytecode = True


class DemoError(RuntimeError):
    pass


class Csql:
    def __init__(self, name, database, output):
        self.name = name
        self.usable = True
        self.closed = False
        session_directory = output / f'session-{name}'
        session_directory.mkdir()
        self.log = (output / f'csql-{name}.log').open('w')
        self.master, slave = pty.openpty()
        attrs = termios.tcgetattr(slave)
        attrs[3] &= ~termios.ECHO
        termios.tcsetattr(slave, termios.TCSANOW, attrs)
        binary = Path(os.environ['CUBRID']) / 'bin/csql'
        try:
            self.process = subprocess.Popen(
                [str(binary), '-C', '-u', 'dba', '-s', '-l', '--no-pager', database],
                stdin=slave, stdout=slave, stderr=slave, start_new_session=True,
                cwd=session_directory,
            )
        except OSError:
            os.close(self.master)
            self.log.close()
            raise
        finally:
            os.close(slave)
        try:
            self.read_prompt()
        except BaseException:
            self.usable = False
            self.close()
            raise

    def read_prompt(self, timeout=60):
        data = bytearray()
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if select.select([self.master], [], [], 0.2)[0]:
                try:
                    chunk = os.read(self.master, 65536)
                except OSError as error:
                    raise DemoError(f'csql {self.name} disconnected: {data.decode(errors="replace")}') from error
                if not chunk:
                    raise DemoError(f'csql {self.name} exited')
                data.extend(chunk)
                if data.endswith(b'csql> '):
                    text = data.decode(errors='replace').replace('\r', '')
                    self.log.write(text)
                    self.log.flush()
                    if re.search(r'\bERROR:', text):
                        raise DemoError(f'csql {self.name}: {text}')
                    return text
        raise DemoError(f'csql {self.name} timed out: {data.decode(errors="replace")}')

    def sql(self, statement, timeout=60):
        try:
            os.write(self.master, (statement + '\n').encode())
            return self.read_prompt(timeout)
        except BaseException:
            # Never send cleanup SQL into a client with an incomplete command.
            self.usable = False
            self.close()
            raise

    def close(self):
        if self.closed:
            return
        self.closed = True
        if self.process.poll() is None:
            try:
                if self.usable:
                    os.write(self.master, b';exit\n')
                else:
                    self.process.terminate()
                self.process.wait(timeout=5)
            except (OSError, subprocess.TimeoutExpired):
                self.process.terminate()
                try:
                    self.process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    self.process.kill()
                    self.process.wait()
        os.close(self.master)
        self.log.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--database', required=True)
    parser.add_argument('--socket', required=True, type=Path)
    parser.add_argument('--volmap-root', type=Path, default=Path('/home/vimkim/temp/volmap'))
    parser.add_argument('--url', default='http://192.168.4.2:7777')
    parser.add_argument('--output', type=Path)
    parser.add_argument('--max-candidates', type=int, default=16, help='bound private-page allocation attempts (1..64)')
    parser.add_argument('--auto', action='store_true', help='execute without Enter, for rehearsal verification')
    args = parser.parse_args()
    if not 1 <= args.max_candidates <= 64:
        parser.error('--max-candidates must be between 1 and 64')
    if 'CUBRID' not in os.environ or 'CUBRID_DATABASES' not in os.environ:
        parser.error('source the inspector worktree runtime env.sh first')
    output = args.output or Path('/tmp') / f'lru-demo-{time.strftime("%Y%m%d-%H%M%S")}-{os.getpid()}'
    output = output.resolve()
    output.mkdir(parents=True, exist_ok=False)
    helper = args.volmap_root / 'examples/pgbuf_socket.py'
    spec = importlib.util.spec_from_file_location('volmap_pgbuf', helper)
    pg = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(pg)
    registry = Path(os.environ['CUBRID_DATABASES']) / 'databases.txt'
    entries = [line.split() for line in registry.read_text().splitlines() if line.strip() and not line.startswith('#')]
    entry = next((row for row in entries if row[0] == args.database), None)
    if entry is None:
        raise DemoError(f'{args.database} is not in {registry}')
    primary = (Path(entry[1]) / args.database).stat()

    def capture(page):
        for retry in range(12):
            try:
                return pg.query(str(args.socket), *page)
            except pg.ProtocolError as error:
                if not any(code in str(error) for code in ("'rate-limited'", "'busy'")) or retry == 11:
                    raise
                time.sleep(0.25)

    hello = capture((0, 0))['server']
    volume = next((v for v in hello['volumes'] if v['volid'] == 0), None)
    if not volume or (int(volume['device']), int(volume['inode'])) != (primary.st_dev, primary.st_ino):
        raise DemoError('Inspector socket belongs to a different database')
    incarnation = hello['incarnation']
    events = (output / 'observations.jsonl').open('w')
    sessions = []
    tables = []
    token = uuid.uuid4().hex[:10]
    target, filler = f'lru_demo_{token}', f'lru_fill_{token}'
    vpid = None
    previous = None

    def enter(title, explanation):
        print(f'\n{title}\n{explanation}', flush=True)
        if not args.auto:
            while True:
                response = input('[Enter] continue, q quit: ').strip().lower()
                if response == 'q':
                    raise KeyboardInterrupt
                if not response:
                    break
                print('Press Enter for the next step, or q to quit.')

    def observe(label):
        nonlocal previous
        result = capture(vpid)
        if result['server']['incarnation'] != incarnation:
            raise DemoError('Database restarted: rerun the demo with fresh sessions')
        events.write(json.dumps({'step': label, **result}) + '\n')
        events.flush()
        row = result['observation']
        if not row:
            raise DemoError(f'Target observation is {result["status"]}; see {output}')
        if not {'lru_list_kind', 'lru_list_index', 'lru_zone', 'fix_count', 'dirty'} <= row.keys():
            raise DemoError('Inspector does not supply the required LRU fields')
        print(f'  Page {vpid[0]}:{vpid[1]} -> {row["lru_list_kind"]} '
              f'list {row["lru_list_index"]} / {row["lru_zone"]} '
              f'(fix_count={row["fix_count"]}, dirty={row["dirty"]})', flush=True)
        state = (vpid, row['lru_list_kind'], row['lru_list_index'], row['lru_zone'])
        if previous and previous[0] == vpid:
            before = f'{previous[1]}[{previous[2]}]/{previous[3]}'
            after = f'{state[1]}[{state[2]}]/{state[3]}'
            print(f'  Change: {before} -> {after}' if state != previous else '  No list/zone change in these two samples.')
        previous = state
        return row

    try:
        print(f'Database: {args.database}\nEvidence: {output}')
        print('Samples are after SQL completion, not an atomic history. One query can fix a page multiple times.')
        a = Csql('A', args.database, output)
        sessions.append(a)
        b = Csql('B', args.database, output)
        sessions.append(b)
        print(f'Persistent csql A PID={a.process.pid}; B PID={b.process.pid}')
        (output / 'run.json').write_text(json.dumps({
            'database': args.database, 'registry': str(registry),
            'cubrid': os.environ['CUBRID'], 'socket': str(args.socket),
            'volmap_url': args.url, 'incarnation': incarnation,
            'sessions': {'A': a.process.pid, 'B': b.process.pid},
            'started_unix_seconds': time.time(),
        }, indent=2) + '\n')
        enter('1. A creates the target row', 'Only A accesses this new table. B stays connected and idle.')
        for attempt in range(args.max_candidates):
            target = f'lru_demo_{token}_{attempt}'
            a.sql(f'create table {target} (id int primary key, payload char(32));')
            tables.append(target)
            a.sql(f"insert into {target} values (1, 'LRU demo');")
            header = a.sql(f'show heap header of {target};')
            match = re.search(r"Volume_id\s*:\s*(\d+).*?Header_page_id\s*:\s*(\d+)", header, re.S)
            if not match:
                raise DemoError(f'Cannot locate the target heap-header page:\n{header}')
            vpid = tuple(map(int, match.groups()))
            initial = observe(f'target-candidate-{attempt}')
            if initial['lru_list_kind'] == 'private':
                break
            print('  Reused page is already shared; retaining it and trying another new table.')
        else:
            raise DemoError(f'No private target after {args.max_candidates} candidates; increase --max-candidates or use a fresh demo database')
        print(f'Watching the target table heap-header page {vpid[0]}:{vpid[1]}.')
        print(f'Open {args.url}/sector/{vpid[0]}/{vpid[1] // 64}')
        print(f'Page detail: {args.url}/page/{vpid[0]}/{vpid[1]}')
        print('Click Enable observations; choose LRU topology. Keep the browser tab visible.')
        enter('2. A admits other pages', 'A fills a separate table to age the target within its private list.')
        a.sql(f'create table {filler} (id int, payload char(2000));')
        tables.append(filler)
        a.sql(f"insert into {filler} select rownum, repeat('x', 2000) from db_class a, db_class b limit 4096;")
        aged = observe('after-filler')
        if aged['lru_list_kind'] != 'private':
            raise DemoError('Target left private membership during preparation')
        promoted = False
        query = f'select length(payload) as bytes_read from {target} where id=1;'
        for n in range(1, 4):
            enter(f'{n+2}. A reads the same target ({n}/3)', 'An old LRU2/LRU3 page can boost to LRU1. A page already in LRU1 can stay there.')
            print(f'  A> {query}')
            a.sql(query)
            row = observe(f'A-read-{n}')
            if row['lru_list_kind'] != 'private' or row['lru_list_index'] != initial['lru_list_index']:
                raise DemoError('Target left A\'s private list before B read it; do not present this as a B-caused transition')
            promoted |= aged['lru_zone'] in ('lru2', 'lru3') and row['lru_zone'] == 'lru1'
        if not promoted:
            print('  Private membership verified, but private-zone promotion was NOT captured in this run.')
        enter('6. B reads the very same target', 'A remains connected. A different private domain should move the page to shared LRU at final unfix.')
        print(f'  B> {query}')
        b.sql(query)
        row = observe('B-first-read')
        if row['lru_list_kind'] != 'shared':
            raise DemoError('No private-to-shared transition observed (sessions may share a private domain)')
        enter('7. B reads it again', 'Observe any shared-zone boost. Membership should stay shared.')
        print(f'  B> {query}')
        b.sql(query)
        again = observe('B-second-read')
        if again['lru_list_kind'] != 'shared':
            raise DemoError('Shared membership was not retained')
        if not promoted:
            raise DemoError('Private-to-shared observed, but private-zone promotion was not captured; rehearsal is incomplete')
        print('\nVerified: A retained private membership on repeated reads; B access changed the same page to shared.')
        enter('8. Finish', 'Inspect the browser before continuing. Enter closes both sessions and drops only this run\'s fixture tables.')
    finally:
        # A failed/interrupted command closes its client before cleanup. Use
        # whichever original client remains; never create a third SQL session.
        cleaner = next((session for session in sessions if session.usable and not session.closed), None)
        cleanup_failed = []
        for table in reversed(tables):
            try:
                if cleaner is None or cleaner.closed:
                    raise DemoError('no usable session remains')
                cleaner.sql(f'drop table {table};', timeout=10)
            except Exception as error:
                cleanup_failed.append(table)
                print(f'Cleanup needed in {args.database}: DROP TABLE {table}; ({error})', file=sys.stderr)
        for session in reversed(sessions):
            session.close()
        events.close()
        print(f'Logs retained: {output}')
        if cleanup_failed:
            raise DemoError('Some fixture tables need manual cleanup; see messages above')


if __name__ == '__main__':
    def stop(_signum, _frame):
        raise KeyboardInterrupt

    signal.signal(signal.SIGTERM, stop)
    try:
        main()
    except (KeyboardInterrupt, EOFError):
        print('\nDemo stopped.')
        sys.exit(130)
    except (DemoError, OSError, ValueError) as error:
        print(f'Demo failed: {error}', file=sys.stderr)
        sys.exit(1)
