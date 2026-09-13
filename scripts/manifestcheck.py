#!/usr/bin/env python3
"""Is the world in the tree the world the manifest says it is?

The bake cannot run in CI — it reads a game client that is not in this
repository — so what CI can check is the other half: `public/manifest.json`
names every file the bake produced and the hash of its contents, and those
files are committed.  If they disagree, somebody edited a baked file by hand or
committed half a bake.

This is also where the reproducibility promise lands.  `npm run bake --twice`
proves the bake is deterministic on the machine that has the client; this
proves the result of it is what actually got committed.
"""
import hashlib
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
path = os.path.join(ROOT, 'public', 'manifest.json')
if not os.path.exists(path):
    sys.exit('no public/manifest.json — run `npm run bake`')
with open(path) as f:
    manifest = json.load(f)

bad, missing = [], []
for rel, want in sorted(manifest.get('files', {}).items()):
    full = os.path.join(ROOT, rel)
    if not os.path.exists(full):
        missing.append(rel)
        continue
    with open(full, 'rb') as f:
        got = hashlib.sha256(f.read()).hexdigest()[:16]
    if got != want:
        bad.append(f'{rel}: manifest says {want}, the file is {got}')

print(f'manifest: baked {manifest.get("baked")} from azerothcore '
      f'{manifest.get("upstream", {}).get("azerothcore")}, client '
      f'{manifest.get("upstream", {}).get("client")}')
print(f'check: {len(manifest.get("files", {}))} baked files, {len(bad)} changed '
      f'since, {len(missing)} missing')
if bad or missing:
    for line in bad + [f'{m}: not in the tree' for m in missing]:
        print('  ' + line, file=sys.stderr)
    sys.exit('the committed world is not the world the manifest describes')
