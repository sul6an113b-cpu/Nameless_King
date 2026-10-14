# Build bop-qc/js/checklists.js from the reconciled (final) research checklists.
# Citations: a clause number appears only where the second, two-skeptic clause check
# kept it (table CITED below). Every other reference is reduced to the code name(s)
# plus "verify clause/edition".
import json, re, sys
# Usage (from bop-qc/): python3 tools/gen_checklists.py 2026-10-14
import os
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
VERSION = sys.argv[1] if len(sys.argv) > 1 else 'unversioned'
OUTFILE = os.path.join(ROOT, 'js', 'checklists.js')
d = json.load(open(os.path.join(ROOT, 'research', 'checklists-final.json')))
clause = {c['id']: c for c in json.load(open(os.path.join(ROOT, 'research', 'clause-verification.json')))['clauses']}
def kept(cid):
    c = clause.get(cid)
    return bool(c and c['keep'])

B3354 = 'ASME B31.3 para 335.2.4 Gaskets'
B3353 = 'ASME B31.3 para 335.2.3 Bolt Length – acceptance wording changed between editions'
CITED = {
  ('piping_line', 'leak_test_record'): ('B31.1 para 137 Pressure Tests, or B31.3 para 345 Testing (345.3.1 joints exposed during the leak test; exceptions differ by edition) – per project line class. Test record requirement: verify clause/edition', ['b311_137', 'b313_345']),
  ('piping_line', 'weld_nde_record'): ('B31.1 para 136 Inspection and Examination, or B31.3 para 341 Examination – per project line class. NDE methods ASME Sec V, qualifications ASME Sec IX: verify clause/edition', ['b311_136', 'b313_341']),
  ('flanged_joint', 'single_gasket'): (f'{B3354}. B31.1: verify clause/edition', ['b313_33524']),
  ('flanged_joint', 'thread_engagement'): (f'{B3353}. B31.1: verify clause/edition', ['b313_33523_number_title']),
  ('valve', 'end_bolt_engage'): (f'{B3353}. B31.1: verify clause/edition', ['b313_33523_number_title']),
  ('valve', 'psv_isolation'): ('ASME B31.3 para 322.6.1 Stop Valves in Pressure Relief Piping. B31.1: verify clause/edition', ['b313_32261']),
  ('tank_vessel', 'nameplate'): ('API 650 para 10.1 Nameplates (API 650 tanks only). Vessels / other tanks: verify clause/edition', ['api650_101']),
  ('tank_vessel', 'nozzle_bolting'): (f'{B3353} (B31.3 piping joints only). Tank / vessel nozzles: verify clause/edition', ['b313_33523_number_title']),
  ('instrument_hookup', 'tie_in_bolts'): (f'{B3353}. B31.1: verify clause/edition', ['b313_33523_number_title']),
  ('punch_closure', 'joint_remade'): (f'{B3354}; {B3353}. B31.1: verify clause/edition', ['b313_33524', 'b313_33523_number_title']),
  ('punch_closure', 'weld_repair_nde'): ('ASME B31.3 para 341.3.3 Defective Components and Workmanship (wording split into repair / replace cases since 2014). B31.1: verify clause/edition', ['b313_34133']),
}
# 335.2.3: both skeptics confirmed the number and title; they rejected only the old
# "one thread short" content, which is why the reference says the wording changed.
def ok(cids):
    return all(kept(c) if c != 'b313_33523_number_title' else (clause['b313_33523']['votes'] and all('335.2.3' in (v.get('correction') or '') for v in clause['b313_33523']['votes'])) for c in cids)

CODE_RE = re.compile(r'(ASME\s+)?(B31\.1|B31\.3|B16\.\d+|PCC-1|Sec(?:tion)?\.?\s+(?:VIII|IX|V)\b)|API\s+\d+\w*|ASTM\s+[A-Z]\d+|IEC\s+[\d-]+|NFPA\s+\d+|ISO\s+[\d-]+|MSS\s+SP-\d+|AWS\s+D[\d.]+|EN\s+\d+')
def downgrade(ref):
    if not ref: return ''
    codes = []
    for m in CODE_RE.finditer(ref):
        c = m.group(0).strip()
        if re.match(r'^(B31|B16|PCC|Sec)', c): c = 'ASME ' + c
        c = c.replace('Section', 'Sec').replace('Sec.', 'Sec')
        if c not in codes: codes.append(c)
    return (' / '.join(codes) + ' – verify clause/edition') if codes else 'verify clause/edition'

LABELS = [('piping_line', 'Piping line'), ('flanged_joint', 'Flanged joint'), ('valve', 'Valve'), ('pipe_support', 'Supports & pipe rack'), ('rotating', 'Pump / rotating equip.'), ('tank_vessel', 'Tank / vessel'), ('instrument_hookup', 'Instrument & cable hookup'), ('general_area', 'General area / handover')]
fams = {f['key']: f['final'] for f in d['families'] if f and f.get('final')}
report = []
# Corrections after the clause checks and the second review:
# - B31.3 335.2.3 dropped the "one thread short" allowance in 2016; no text may present it as current.
# - 335.2.4 allows one gasket per pair of contact faces: spectacle / spacer joints correctly have two.
# - 341.3.3 requires re-examination of a repair; the report itself is a records (project) matter.
# - Matching a datasheet set pressure is a project-document check, not a code requirement.
# - Whether gaskets / bolts must be renewed when a joint is broken is a project rule.
FIXES = {
  ('tank_vessel', 'nozzle_bolting'): {
    'defects': {'Bolt >1 thread short of nut': 'Bolt short of full nut engagement'},
    'ask': 'Is the connecting piping B31.1 or B31.3, which edition applies, and is any thread short of full nut engagement acceptable under the project spec?',
  },
  ('flanged_joint', 'single_gasket'): {
    'text': 'One gasket per pair of contact faces (no stacking)',
    'defects': {'Double gasket fitted': 'Stacked gaskets fitted', 'Wide gap - suspect 2nd gasket': 'Wide gap – suspect stacked gasket (not at spectacle/spacer)'},
  },
  ('tank_vessel', 'relief_valve'): {
    'text': 'PSV fitted, gag / shipping plug removed',
    'basis': 'practice', 'codeRef': '', 'refConfidence': 'none',
    'defects_list': ['PSV missing (per P&ID)', 'Shipping plug/gag left in', 'Isolation valve not open/sealed', 'Discharge not routed safe', 'PSV not vertical'],
    'ask': 'Must PSV isolation valves be car-sealed or locked open at handover?',
    'insert_after': [{
      'id': 'relief_setnote', 'group': 'Roof & relief', 'text': 'PSV set pressure on plate noted (observe only)', 'basis': 'project',
      'codeRef': '', 'refConfidence': 'none', 'defects': ['Set illegible', 'Set not shown on plate', 'Set differs from datasheet (note)'],
      'unknownQuestion': 'Is a PSV set-test certificate required at handover, how recent must it be, and which datasheet set pressure applies?',
    }],
  },
  ('punch_closure', 'joint_remade'): {
    'text': 'Re-made joint: one gasket per face pair, bolts engaged',
    'insert_after': [{
      'id': 'joint_parts_project', 'group': 'At the item', 'text': 'Gasket / bolts renewed where the project requires', 'basis': 'project',
      'codeRef': '', 'refConfidence': 'none', 'defects': [],
      'unknownQuestion': 'Does the project require new gaskets (and bolts) whenever a flanged joint is broken?',
    }],
  },
  ('punch_closure', 'weld_repair_nde'): {'text': 'Weld repair re-examined (same method / criteria)'},
}

def expand(key, checks):
    out = []
    for c in checks:
        fx = FIXES.get((key, c['id']))
        out.append(c)
        if fx:
            out.extend(fx.get('insert_after', []))
    return out

def conv(key, c):
    fx = FIXES.get((key, c['id']))
    if fx:
        c = dict(c)
        c['defects'] = fx.get('defects_list') or [fx.get('defects', {}).get(x, x) for x in c.get('defects', [])]
        if 'ask' in fx: c['unknownQuestion'] = fx['ask']
        for k in ('text', 'basis', 'codeRef', 'refConfidence'):
            if k in fx: c[k] = fx[k]
    ref = c.get('codeRef') or ''
    if c.get('refConfidence') == 'sure':
        cit = CITED.get((key, c['id']))
        if cit and ok(cit[1]):
            ref = cit[0] + ' (confirm project edition)'
            report.append(f'CITED {key}/{c["id"]}: {ref}')
        else:
            ref = downgrade(ref)
            report.append(f'DOWNGRADED {key}/{c["id"]}: {ref}')
    else:
        ref = downgrade(ref)
    assert not re.search(r'(para|section|clause)\s*\d|\b\d{3}\.\d', ref, re.I) or c.get('refConfidence') == 'sure', ref
    return {'id': c['id'], 'group': c['group'], 'text': c['text'], 'basis': c['basis'], 'codeRef': ref, 'defects': c.get('defects', [])[:6], 'ask': c.get('unknownQuestion', '') or ''}

types, siteq = [], {}
for key, label in LABELS:
    fin = fams[key]
    types.append({'key': key, 'label': label, 'checks': [conv(key, c) for c in expand(key, fin['checks'])]})
    siteq[key] = fin.get('siteQuestions', [])
types.append({'key': 'free', 'label': 'Other (free check)', 'checks': []})

CORE = ['safe_access', 'item_located', 'defect_cleared', 'permanent_fix', 'no_new_damage', 'reinstated', 'area_cleared', 'fix_visible']
REQUIRED = {'item_located', 'defect_cleared', 'no_new_damage'}
pc = fams['punch_closure']
closure = []
for c in expand('punch_closure', pc['checks']):
    x = conv('punch_closure', c)
    closure.append({'id': x['id'], 'text': x['text'], 'basis': x['basis'], 'codeRef': x['codeRef'], 'core': x['id'] in CORE, 'required': x['id'] in REQUIRED})
closure.sort(key=lambda c: (not c['core'], CORE.index(c['id']) if c['core'] else 0))
assert {c['id'] for c in closure if c['required']} == REQUIRED
siteq['punch_closure'] = pc.get('siteQuestions', [])

GEN = ['Housekeeping not done', 'Temporary material not removed', 'Tag / label missing', 'Paint damaged', 'Insulation damaged', 'Support missing', 'Bolt not fully through nut', 'Bolts rusted', 'Torque not recorded', 'Drain / vent missing', 'Guard missing', 'Earthing missing']
js = [
  '// Checklist library (plain data - safe to edit).',
  '// Built from field-QC research: one drafter per item type, then a field-QC reviewer and an',
  '// adversarial citation auditor, then a reconciliation pass; cited clauses were checked again',
  '// by two independent skeptics and kept only when both agreed.',
  '//',
  '// basis:   code     = general code requirement (generic edition - confirm the project edition)',
  '//          practice = common field QC practice (inferred, not a code requirement)',
  '//          project  = acceptance depends on project documents -> value unknown, ask on site',
  '// codeRef: a clause number appears only where it was confirmed; otherwise "verify clause/edition".',
  '// ask:     the question to raise on site when the requirement is unknown.',
  f'export const CHECKLIST_VERSION = {json.dumps(VERSION)};',
  'export const TYPES = ' + json.dumps(types, indent=1, ensure_ascii=False) + ';',
  '// Punch closure verification. core = always answered; required = must be Yes (no N/A).',
  'export const CLOSURE_CHECKS = ' + json.dumps(closure, indent=1, ensure_ascii=False) + ';',
  'export const SITE_QUESTIONS = ' + json.dumps(siteq, indent=1, ensure_ascii=False) + ';',
  'export const GENERAL_DEFECTS = ' + json.dumps(GEN, ensure_ascii=False) + ';', '']
open(OUTFILE, 'w').write('\n'.join(js))
print('\n'.join(report))
print(sum(len(t['checks']) for t in types), 'checks;', len(closure), 'closure checks')
