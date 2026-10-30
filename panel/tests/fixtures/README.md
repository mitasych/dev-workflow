`dw2.ts`, `dw3.ts` and `dw4.ts` are real archived scratchpads, kept so the parser is tested
against formats the skills actually wrote. `.workflow/` itself is never committed, so contact
details and hostnames are replaced before they land here. To regenerate from the repo root:

```bash
python3 - <<'PY'
import json
REPL = [('mitasych@gmail.com', 'author@example.com'),
        ('<work email>', 'author@example.com'),
        ('git@<work git host>', 'git@git.example.com'),
        ('<work git host>', 'git.example.com')]
for key, name in [('DW-2', 'dw2'), ('DW-3', 'dw3'), ('DW-4', 'dw4')]:
    body = open(f'.workflow/{key}-issue.md').read()
    for old, new in REPL:
        body = body.replace(old, new)
    head = (f'// .workflow/{key}-issue.md with contact details and hosts replaced, for parser tests.\n'
            '// Regenerate with the script in panel/tests/fixtures/README.md.\n')
    open(f'panel/tests/fixtures/{name}.ts', 'w').write(head + 'export default ' + json.dumps(body) + '\n')
PY
```

`mid.ts` and `tdd.ts` are hand-written.
