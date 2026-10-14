// Checklist library (plain data - safe to edit).
// Built from field-QC research: one drafter per item type, then a field-QC reviewer and an
// adversarial citation auditor, then a reconciliation pass; cited clauses were checked again
// by two independent skeptics and kept only when both agreed.
//
// basis:   code     = general code requirement (generic edition - confirm the project edition)
//          practice = common field QC practice (inferred, not a code requirement)
//          project  = acceptance depends on project documents -> value unknown, ask on site
// codeRef: a clause number appears only where it was confirmed; otherwise "verify clause/edition".
// ask:     the question to raise on site when the requirement is unknown.
export const CHECKLIST_VERSION = "2026-10-14";
export const TYPES = [
 {
  "key": "piping_line",
  "label": "Piping line",
  "checks": [
   {
    "id": "prior_punch_closed",
    "group": "Records (pre-walk)",
    "text": "Previous punch/NCR items closed, verified",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Punch closed, not fixed",
     "Punch item still open",
     "Fix caused new defect",
     "Open NCR on line",
     "Closure not signed"
    ],
    "ask": "Where is the current punch/NCR list for this line, and who signs closure?"
   },
   {
    "id": "leak_test_record",
    "group": "Records (pre-walk)",
    "text": "Leak test done, record signed",
    "basis": "code",
    "codeRef": "B31.1 para 137 Pressure Tests, or B31.3 para 345 Testing (345.3.1 joints exposed during the leak test; exceptions differ by edition) – per project line class. The signed record is a project requirement, not from these clauses (confirm project edition)",
    "defects": [
     "Test record missing/unsigned",
     "Line not in a test boundary",
     "Welded/modified, no retest",
     "Joints covered before test",
     "Gauge cal. not recorded"
    ],
    "ask": "Which test type and limit cover this line (hydro/pneumatic/initial service), and is it released?"
   },
   {
    "id": "weld_nde_record",
    "group": "Records (pre-walk)",
    "text": "Weld/NDE records complete, no open repairs",
    "basis": "code",
    "codeRef": "B31.1 para 136 Inspection and Examination, or B31.3 para 341 Examination – per project line class. NDE methods ASME Sec V, qualifications ASME Sec IX: verify clause/edition (confirm project edition)",
    "defects": [
     "NDE result pending",
     "Repair not re-examined",
     "Weld log/welder ID gap",
     "PWHT record missing (if req.)",
     "PMI record missing (alloy)"
    ],
    "ask": "What NDE extent and PWHT (if any) apply to this line class, and is PMI required for this material?"
   },
   {
    "id": "routing_inline",
    "group": "Routing & condition",
    "text": "Routing and inline items as drawn",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Routing deviates from drawing",
     "Field change not marked up",
     "Inline item missing/wrong type",
     "Flow direction reversed",
     "Not accessible for maintenance"
    ],
    "ask": "Are field changes red-lined and approved, and is an inline-item list per line available?"
   },
   {
    "id": "clearances_sleeves",
    "group": "Routing & condition",
    "text": "Clear of steel/cables; sleeves sealed",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "Touching steel/line/sleeve",
     "Hot line close to cables",
     "Low pipe at walkway unmarked",
     "Sleeve/seal missing or open",
     "Blocks access/walkway"
    ],
    "ask": "What minimum clearances and walkway headroom apply, and which penetrations need fire-stop or watertight seals?"
   },
   {
    "id": "pipe_surface",
    "group": "Routing & condition",
    "text": "Pipe surface undamaged, temp lugs removed",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "Dent/gouge/arc strike",
     "Temp lug left/not ground",
     "CS contamination on SS",
     "GRE/PE cracked or UV-damaged",
     "Lining vent hole painted over"
    ],
    "ask": "What acceptance limits apply to dents, gouges and arc strikes, and what examination is needed after temp lug removal?"
   },
   {
    "id": "supports_installed",
    "group": "Supports",
    "text": "All supports installed, type as drawn",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Support missing/wrong type",
     "Loose, damaged or not fixed",
     "Clamp/U-bolt too tight",
     "Pad/shim/saddle missing",
     "SS pipe on bare CS support"
    ],
    "ask": "Is the support drawing set on site the latest revision, and is an isolation pad required between SS pipe and CS supports?"
   },
   {
    "id": "no_temp_supports",
    "group": "Supports",
    "text": "No temporary supports or wedges left",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "Temp support left",
     "Wedge/packing left",
     "Chain block/strap left",
     "Scaffold tube as support",
     "Rope/wire tie left"
    ],
    "ask": "Were temporary supports added for hydrotest, and are they listed?"
   },
   {
    "id": "supports_seated",
    "group": "Supports",
    "text": "Shoes seated, guides/slides free",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "Pipe not bearing on support",
     "Shoe off beam edge",
     "Sliding shoe welded/blocked",
     "Slide pad missing/damaged",
     "Anchor not fully welded"
    ],
    "ask": "Which supports are anchors or guides, and what gaps and shoe overhang are specified?"
   },
   {
    "id": "spring_hangers",
    "group": "Supports",
    "text": "Spring hangers: stops/setting per plan",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Stop status not tracked",
     "Stop removed too early",
     "Off cold setting/topped out",
     "Rod loose/out of vertical",
     "Nameplate missing"
    ],
    "ask": "When are travel stops removed (after test or before hot commissioning), and by whom? Cold settings and rod-angle limits are vendor/project values."
   },
   {
    "id": "expansion_joints",
    "group": "Supports",
    "text": "Expansion joints: bars/rods per vendor",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Shipping bar still fitted",
     "Limit/tie rods not set",
     "Bellows/rubber joint damaged",
     "Liner flow arrow reversed",
     "Misaligned/overstretched"
    ],
    "ask": "When are shipping bars removed, and what limit-rod settings does the vendor give?"
   },
   {
    "id": "small_bore",
    "group": "Supports",
    "text": "Small-bore branches braced/supported",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "Small-bore unsupported",
     "Bracing missing",
     "Heavy valve unsupported",
     "Branch near pump unbraced",
     "Seal weld missing (if spec)"
    ],
    "ask": "Does the project spec require bracing on small-bore branches, and are threaded joints to be seal-welded?"
   },
   {
    "id": "slope_drains_vents",
    "group": "Slope, drains & vents",
    "text": "Slope per design, drains/vents per spec",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Wrong slope/sag/undrained pocket",
     "Drain/vent missing",
     "End closure not per spec",
     "Drain to wrong/unsafe point",
     "Temp test vent not removed"
    ],
    "ask": "Which lines must slope and at what slope, and which end closure (plug/cap/blind) and single or double valve are required?"
   },
   {
    "id": "blinds_temp_items",
    "group": "Temporary items",
    "text": "Blinds per status list, temp items gone",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Test blind not removed",
     "Spectacle not as status list",
     "Blind/strainer not registered",
     "Boundary isolation missing",
     "Debris/scaffold left on line"
    ],
    "ask": "Is there a blind/spectacle status list for handover, and who maintains it?"
   },
   {
    "id": "reinstatement",
    "group": "Temporary items",
    "text": "Items removed for test reinstated",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "Temp spool still fitted",
     "Item not reinstated, not listed",
     "Temp gasket not replaced",
     "Gasket reused",
     "Joint not torqued/recorded"
    ],
    "ask": "Who signs reinstatement (construction, QC or commissioning), and which items stay out until flushing ends?"
   },
   {
    "id": "flush_preservation",
    "group": "Flushing & preservation",
    "text": "Flushed and drained, open ends sealed",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Flush not recorded/signed",
     "Test water not drained",
     "Open end not sealed",
     "N2/preservation not kept",
     "Preservation tag missing"
    ],
    "ask": "Is flushing in construction or commissioning scope, and what preservation applies after test (drain, dry, N2, inhibitor)?"
   },
   {
    "id": "paint",
    "group": "Finish & marking",
    "text": "Paint complete, damage touched up",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Damaged, not touched up",
     "Field weld not painted",
     "Rust at support contact",
     "Wrong colour/colour band",
     "Wrap missing at grade entry"
    ],
    "ask": "What coating system, colour and DFT apply to this line?"
   },
   {
    "id": "insulation",
    "group": "Finish & marking",
    "text": "Insulation/cladding complete, sealed",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Insulation/box missing",
     "Cladding damaged/unsealed",
     "Overlap not shedding water",
     "Personnel protection missing",
     "Tag/nameplate covered"
    ],
    "ask": "What insulation type and thickness apply, and which lines need personnel protection?"
   },
   {
    "id": "line_tags",
    "group": "Finish & marking",
    "text": "Line ID and flow arrows fitted",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Line ID missing",
     "Wrong line number",
     "Flow arrow missing",
     "Flow arrow reversed",
     "Marking faded/illegible"
    ],
    "ask": "What is the project marking standard (colours, spacing, locations)?"
   },
   {
    "id": "shields_bonding",
    "group": "Safety fittings",
    "text": "Spray shields/bonding jumpers fitted",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Spray shield missing",
     "Shield loose/wrong type",
     "Bonding jumper missing",
     "Jumper loose/corroded",
     "Insulating joint bridged"
    ],
    "ask": "Which chemical lines need flange spray shields, and which lines need bonding jumpers or insulating joints?"
   }
  ]
 },
 {
  "key": "flanged_joint",
  "label": "Flanged joint",
  "checks": [
   {
    "id": "flange_alignment",
    "group": "Fit-up",
    "text": "Even gap, studs square, no visible strain",
    "basis": "code",
    "codeRef": "ASME B31.1 / ASME B31.3 – verify clause/edition",
    "defects": [
     "Uneven gap around flange",
     "Studs not square / nut not flat",
     "Bolt holes offset",
     "Support strained/shimmed to fit",
     "Pipe springs when loosened (joint open)"
    ],
    "ask": "Which alignment tolerance applies: the project spec or the value in the code edition?"
   },
   {
    "id": "flange_class_facing",
    "group": "Fit-up",
    "text": "Flange class/facing match mating flange",
    "basis": "project",
    "codeRef": "ASME B16.5 – verify clause/edition",
    "defects": [
     "Flange class mismatch",
     "RF flange mated to FF",
     "Flange marking not legible",
     "Wrong flange type"
    ],
    "ask": "What rating and facing (RF/FF/RTJ) does the line class require, and what is the rule for mating with FF equipment nozzles?"
   },
   {
    "id": "nozzle_pipe_strain",
    "group": "Fit-up",
    "text": "Pump/equipment nozzle: no pipe strain",
    "basis": "practice",
    "codeRef": "verify clause/edition",
    "defects": [
     "Nozzle flange forced into line",
     "Support missing near nozzle",
     "Support jacked/shimmed to fit",
     "Shaft moved at bolt-up",
     "No pipe-strain record"
    ],
    "ask": "Is a free-bolting/pipe-strain check required at pump nozzles, who witnesses it, and must it come before final alignment?"
   },
   {
    "id": "gasket_type",
    "group": "Gasket",
    "text": "Gasket marking/colour per line class",
    "basis": "project",
    "codeRef": "ASME B16.20 – verify clause/edition",
    "defects": [
     "Wrong gasket type",
     "Ring colour not per spec",
     "Gasket not identifiable",
     "Gasket rating not marked"
    ],
    "ask": "Which gasket type, material and inner/outer rings does each line class require?"
   },
   {
    "id": "single_gasket",
    "group": "Gasket",
    "text": "Single gasket only",
    "basis": "code",
    "codeRef": "ASME B31.3 para 335.2.4 Gaskets. B31.1: verify clause/edition (confirm project edition)",
    "defects": [
     "Double gasket fitted",
     "Gasket stacked to fill gap",
     "Wide gap - suspect 2nd gasket"
    ],
    "ask": ""
   },
   {
    "id": "gasket_condition",
    "group": "Gasket",
    "text": "Gasket centred, visible edge sound",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "Gasket off-centre",
     "Visible edge damaged/crushed",
     "Sealant on gasket (check spec)",
     "Protrudes into bore (joint open)"
    ],
    "ask": "Are gasket sealants or compounds allowed by the project or gasket maker?"
   },
   {
    "id": "bolts_complete",
    "group": "Bolting",
    "text": "All holes bolted, correct size; washers if spec",
    "basis": "code",
    "codeRef": "ASME B16.5 – verify clause/edition",
    "defects": [
     "Bolt/nut missing",
     "Undersize stud",
     "Mixed stud sizes",
     "Washer missing (if spec)"
    ],
    "ask": "Which flange standards apply besides B16.5 (e.g. B16.47, AWWA, EN, equipment nozzles), and are washers required?"
   },
   {
    "id": "bolt_grade_marking",
    "group": "Bolting",
    "text": "Stud/nut grade marks match line class",
    "basis": "project",
    "codeRef": "ASTM A193 – verify clause/edition",
    "defects": [
     "No grade mark on stud",
     "Wrong nut grade",
     "Mixed bolt grades",
     "Marking not legible"
    ],
    "ask": "Which stud/nut grade and coating does each line class require?"
   },
   {
    "id": "thread_engagement",
    "group": "Bolting",
    "text": "Studs fully through nuts, both ends",
    "basis": "code",
    "codeRef": "ASME B31.3 para 335.2.3 Bolt Length – acceptance wording changed between editions. B31.1: verify clause/edition (confirm project edition)",
    "defects": [
     "Nut not fully engaged",
     "1 thread short (check spec)",
     "Excess projection (check spec)",
     "Uneven projection"
    ],
    "ask": "For B31.3 and B31.1 lines under the project editions/spec: is full engagement required or is one thread short allowed? Is there a min/max stud protrusion?"
   },
   {
    "id": "bolt_condition",
    "group": "Bolting",
    "text": "Bolts free of rust/damage, coating OK",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "Bolts rusted",
     "Coating damaged",
     "Threads damaged",
     "Nut corners rounded",
     "Mixed coated/plain bolts"
    ],
    "ask": "What is the rust acceptance (clean or replace), and what bolt protection is required (coating/grease/caps)?"
   },
   {
    "id": "torque_done_recorded",
    "group": "Bolting",
    "text": "Torque done, marked and recorded",
    "basis": "project",
    "codeRef": "ASME PCC-1 – verify clause/edition",
    "defects": [
     "Bolts hand-tight/loose",
     "No torque mark/tag",
     "Torque not recorded",
     "Record unsigned/incomplete",
     "Tool calibration not shown"
    ],
    "ask": "Is a per-joint torque/tension record and tightening mark required? Which method and value source apply, and who signs (subcontractor/QC)?"
   },
   {
    "id": "bolt_access",
    "group": "Bolting",
    "text": "Studs removable, tool access clear",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "Stud blocked by steel",
     "No wrench/tensioner access",
     "Joint inside wall/sleeve",
     "Cable tray clashes with joint"
    ],
    "ask": "Is a minimum tool/tensioner clearance specified at flanged joints?"
   },
   {
    "id": "temp_items_cleared",
    "group": "Blinds & temp items",
    "text": "Test blinds out; temp items removed/tagged",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Test blind left in",
     "Temp strainer left/untagged",
     "Spool in place of valve/FE",
     "Orifice plate missing/reversed",
     "Open flange not covered"
    ],
    "ask": "Which test blinds, temp strainers or spools may stay at handover, and how are they tagged and tracked?"
   },
   {
    "id": "reinstated_joint",
    "group": "Blinds & temp items",
    "text": "Post-test broken joint re-made & recorded",
    "basis": "project",
    "codeRef": "ASME B31.1 / ASME B31.3 – verify clause/edition",
    "defects": [
     "Old/temp gasket reused",
     "Temp bolting left in",
     "Not re-tightened",
     "Not on reinstatement list",
     "No leak check after re-make"
    ],
    "ask": "Must joints broken after test get new gaskets, is a reinstatement sign-off required, and how are they leak-checked before commissioning?"
   },
   {
    "id": "spectacle_position",
    "group": "Blinds & temp items",
    "text": "Spectacle/spade in required position",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Spectacle in wrong position",
     "Paddle out, no spacer fitted",
     "Blind tag/rating missing",
     "No room to swing blind",
     "Jackscrews missing (if spec)"
    ],
    "ask": "What open/closed position is required at handover, and who controls blind position after handover?"
   },
   {
    "id": "nonmetallic_flange",
    "group": "Special joints",
    "text": "Plastic/lined flange: washers, no cracks",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Flange cracked",
     "Washers missing",
     "Over-tightened/crushed",
     "Backing ring wrong/missing",
     "Liner face damaged"
    ],
    "ask": "Which BOP lines are non-metallic or lined, and what torque limits, washers and gaskets does the maker require?"
   },
   {
    "id": "wafer_valve_joint",
    "group": "Special joints",
    "text": "Wafer/lug valve: disc clear, gasket per maker",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Disc fouls pipe/liner",
     "Extra gasket on liner seat",
     "Wrong stud/cap-screw length",
     "Lug screws bottomed"
    ],
    "ask": "Does the maker want separate gaskets or the liner as gasket, and is a full-stroke check required before handover?"
   },
   {
    "id": "joint_accessories",
    "group": "Fittings & finish",
    "text": "Insul. kit / spray guard / bond jumper if spec",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Insulating kit missing/bridged",
     "Spray guard missing/loose",
     "Bonding jumper missing/loose",
     "Insul. sleeve/washer damaged",
     "Requirement unknown - ask"
    ],
    "ask": "Which joints need insulating kits (and an isolation test), spray guards or bonding jumpers?"
   },
   {
    "id": "paint_finish",
    "group": "Fittings & finish",
    "text": "Flange/bolting paint and protection done",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Flange not painted",
     "Paint damaged at joint",
     "Bolts not protected",
     "Insulation box missing"
    ],
    "ask": "What paint/protection system applies to flanges and bolting, and are removable insulation covers required?"
   },
   {
    "id": "no_leak",
    "group": "Fittings & finish",
    "text": "No leak, stain or weep at joint",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "Leak at flange",
     "Stain/residue at joint",
     "Gasket extruding",
     "Line status unknown - ask"
    ],
    "ask": ""
   }
  ]
 },
 {
  "key": "valve",
  "label": "Valve",
  "checks": [
   {
    "id": "tag",
    "group": "Identification",
    "text": "Valve tag fitted, legible, matches P&ID",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "Tag missing",
     "Tag illegible",
     "Tag differs from P&ID",
     "Temporary tag only",
     "Tag on handwheel (removable)"
    ],
    "ask": "Which valves need tags, and what tag type, material and fixing does the project require?"
   },
   {
    "id": "body_marking",
    "group": "Identification",
    "text": "Body marking: type/class/material per line",
    "basis": "project",
    "codeRef": "ASME B16.34 – verify clause/edition",
    "defects": [
     "Wrong valve type",
     "Pressure class mismatch",
     "Body material mismatch",
     "Marking illegible",
     "Nameplate missing"
    ],
    "ask": "What type, pressure class and material does the local line class/valve spec require here?"
   },
   {
    "id": "flow_arrow",
    "group": "Orientation",
    "text": "Flow arrow matches process flow direction",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "Installed against flow",
     "Flow arrow missing",
     "Arrow painted over",
     "Arrow hidden by insulation"
    ],
    "ask": "Is this valve unidirectional (datasheet), and which flow direction does the local P&ID show?"
   },
   {
    "id": "stem_check_orient",
    "group": "Orientation",
    "text": "Stem/actuator/check orientation per spec/IOM",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Stem orientation not per spec",
     "Actuator rotated/unsupported",
     "Check orientation not per IOM",
     "Not per piping layout"
    ],
    "ask": "Does the piping spec limit stem orientation, and which mountings does this check valve's IOM allow?"
   },
   {
    "id": "operator_access",
    "group": "Operation & access",
    "text": "Handwheel/lever fitted, reachable, clear",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "Handwheel/lever missing",
     "Handwheel loose/damaged",
     "Not reachable from platform",
     "Chain not secured/hooked",
     "Clash/no maintenance access"
    ],
    "ask": "What operating height, chainwheel and extension-spindle limits does the project spec set?"
   },
   {
    "id": "operation",
    "group": "Operation & access",
    "text": "Valve operates freely (with permit holder only)",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Valve seized/stiff",
     "Disc binds (wafer valve)",
     "Indicator not matching position",
     "Position indicator missing",
     "Gearbox stiff/damaged"
    ],
    "ask": "Is valve operation in construction QC scope, and may QC operate this valve under site isolation/LOTO rules?"
   },
   {
    "id": "reinstated",
    "group": "Body & ends",
    "text": "Valve refitted; temporary spool/blind removed",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Flush spool still in place",
     "Valve internals not refitted",
     "Test blind left in",
     "Temp/test gasket left",
     "Transport lock/cap left on"
    ],
    "ask": "Which valves or internals were removed for flushing/test on this system, and where is the reinstatement list?"
   },
   {
    "id": "end_bolt_engage",
    "group": "Body & ends",
    "text": "End flange bolts fully through nuts",
    "basis": "code",
    "codeRef": "ASME B31.3 para 335.2.3 Bolt Length – acceptance wording changed between editions. B31.1: verify clause/edition (confirm project edition)",
    "defects": [
     "Bolt short of nut",
     "Bolts rusted",
     "Bolt/nut missing",
     "Mixed bolt grades",
     "Wrong bolt length (wafer/lug)"
    ],
    "ask": "Is this line B31.1 or B31.3, and what engagement allowance does the project edition state?"
   },
   {
    "id": "end_torque_rec",
    "group": "Body & ends",
    "text": "End joint tightening record available",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Torque not recorded",
     "Record not available",
     "Joint not marked as tightened"
    ],
    "ask": "Is a torque/tightening record required for valve end joints on this line class, and who holds it?"
   },
   {
    "id": "gland_bonnet",
    "group": "Body & ends",
    "text": "Gland/bonnet bolts complete, no leak/damage",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "Gland leaking",
     "Bonnet bolt missing",
     "Gland bolts rusted",
     "Body/bonnet damaged",
     "Gland follower cocked"
    ],
    "ask": ""
   },
   {
    "id": "vent_drain_plug",
    "group": "Body & ends",
    "text": "Vents/drains fitted; open ends plugged/capped",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Vent/drain valve missing",
     "Plug/cap/blind missing",
     "Shipping plug left in",
     "Valve left open"
    ],
    "ask": "Which closure does the project require on open-ended vents and drains: plug, cap or blind?"
   },
   {
    "id": "finish",
    "group": "Body & ends",
    "text": "Paint/insulation done; nameplate, gland visible",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Paint damaged/rusted",
     "Stem/threads painted",
     "Paint over nameplate",
     "Insulation over gland/plate",
     "Removable box missing"
    ],
    "ask": "Does the paint/insulation spec require this valve insulated, and with removable boxes or jackets?"
   },
   {
    "id": "locks",
    "group": "Locking",
    "text": "LO/LC/CSO locking provision fitted",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Lockable lugs/device missing",
     "Lock/seal missing (if due now)",
     "Lock tag missing",
     "Tamper switch missing (if specified)"
    ],
    "ask": "Which valves are LO/LC/CSO on the local P&ID, and when and by whom are locks/seals fitted and positions set?"
   },
   {
    "id": "actuator_hookup",
    "group": "Actuated valves (CV/XV/MOV)",
    "text": "Actuator hookup done: air/cable/earth/covers",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "Air supply not connected",
     "Tubing unsupported/kinked",
     "Cable gland/entry not sealed",
     "Earth missing",
     "Cover/terminal lid missing"
    ],
    "ask": "Who inspects actuator hookup (I&C, electrical or mechanical QC), and is fail-action marking required?"
   },
   {
    "id": "psv_reinstated",
    "group": "Relief valves",
    "text": "PSV refitted; test blind/gag removed",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "PSV not reinstalled",
     "Spool/blind in place of PSV",
     "Test gag still fitted",
     "Inlet/outlet blind or cap left",
     "Temp gasket not replaced"
    ],
    "ask": "Were PSVs removed or gagged for hydrotest/flushing, and who records and signs reinstatement?"
   },
   {
    "id": "psv_plate",
    "group": "Relief valves",
    "text": "PSV nameplate, seal and test tag present",
    "basis": "project",
    "codeRef": "verify clause/edition",
    "defects": [
     "Nameplate missing",
     "Plate painted over",
     "Seal wire broken/missing",
     "Test tag missing",
     "Test date not on tag"
    ],
    "ask": "Is a PSV bench test/re-test and test tag required before handover, and where is the record held?"
   },
   {
    "id": "psv_mounting",
    "group": "Relief valves",
    "text": "PSV upright; lever free; bellows vent open",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "PSV not upright (per IOM)",
     "Lever tied/wired/blocked",
     "Lever missing (if on datasheet)",
     "Bellows vent plugged",
     "Shipping plug left in vent"
    ],
    "ask": "Is this PSV bellows type with a lever (datasheet), and what mounting and vent does the IOM require?"
   },
   {
    "id": "psv_isolation",
    "group": "Relief valves",
    "text": "PSV block valves secured per P&ID (LO/CSO)",
    "basis": "project",
    "codeRef": "ASME B31.3 para 322.6.1 Stop Valves in Pressure Relief Piping. B31.1: verify clause/edition (confirm project edition)",
    "defects": [
     "Lock/seal provision missing",
     "Car seal missing (if due now)",
     "Block position not per status",
     "Spare PSV blocks not secured"
    ],
    "ask": "Which 322.6.1 condition (or B31.1 rule) applies to these blocks, and when and by whom are they sealed open?"
   },
   {
    "id": "psv_setnote",
    "group": "Relief valves",
    "text": "Set pressure on plate noted (observe only)",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Set illegible",
     "Set not shown on plate",
     "Set differs from datasheet (note)"
    ],
    "ask": "What set pressure does the local PSV datasheet give? Compare locally; record only what you see."
   },
   {
    "id": "psv_discharge",
    "group": "Relief valves",
    "text": "Discharge routing noted (observe only)",
    "basis": "project",
    "codeRef": "ASME B31.1 / ASME B31.3 – verify clause/edition",
    "defects": [
     "Outlet toward walkway/platform",
     "Discharge looks unsupported",
     "No low-point drain seen",
     "Rain cap/weep hole: confirm design"
    ],
    "ask": "Does the design discharge to atmosphere or a closed header, and who reviews routing concerns?"
   }
  ]
 },
 {
  "key": "pipe_support",
  "label": "Supports & pipe rack",
  "checks": [
   {
    "id": "base_anchor",
    "group": "Steel & bases",
    "text": "Rack & support bases, anchors, grout complete",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Grout missing / not full plate",
     "Grout cracked / voids",
     "Anchor nut missing / loose",
     "Thread short (if rule req'd)",
     "Spalled concrete at anchor"
    ],
    "ask": "Civil spec: what grout type, thread projection rule, and post-installed anchor type and edge distance apply?"
   },
   {
    "id": "support_steel",
    "group": "Steel & bases",
    "text": "Rack/support steel complete, bolts & welds",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Member / bracing missing",
     "Bolt missing / short of nut",
     "Torque mark missing (if req'd)",
     "Weld incomplete / cracked",
     "Earthing bond missing"
    ],
    "ask": "Structural spec: what bolt tightening method and record, and which welding standard, apply to support steel? Is rack earthing checked here or by electrical QC?"
   },
   {
    "id": "sup_location",
    "group": "Support type & location",
    "text": "Support type & location as per drawing",
    "basis": "project",
    "codeRef": "ASME B31.1 / ASME B31.3 – verify clause/edition",
    "defects": [
     "Support missing",
     "Wrong support type",
     "Support mislocated",
     "Extra support not on drawing",
     "Support ID not marked (if req'd)"
    ],
    "ask": "Is the walkdown against the latest approved support drawing revision, and is this line B31.1 or B31.3?"
   },
   {
    "id": "nozzle_sup",
    "group": "Support type & location",
    "text": "Supports at equipment nozzles in place",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "Support missing at nozzle",
     "Temp support at nozzle",
     "Flange visibly forced",
     "Pipe weight on nozzle"
    ],
    "ask": "Does QC witness a pipe-strain/free-bolting check at pump nozzles, and on which checklist is it recorded?"
   },
   {
    "id": "smallbore_sup",
    "group": "Support type & location",
    "text": "Small-bore, vents, drains, impulse lines supported",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "Small-bore unsupported",
     "Valve hanging on small-bore",
     "Impulse line unclipped",
     "Drain/vent hits steel",
     "Tube clamp missing"
    ],
    "ask": "Is there a project small-bore support standard, and is impulse-line support piping or instrument QC scope?"
   },
   {
    "id": "sup_bearing",
    "group": "Support type & location",
    "text": "Pipe bearing on support, no lift-off",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "Gap under pipe / shoe",
     "Visible sag between supports",
     "Unapproved packing / shim",
     "Shim loose / not fixed",
     "Support bent / overloaded"
    ],
    "ask": "Are any supports designed with an intentional cold gap (e.g. on thermal lines)?"
   },
   {
    "id": "shoe_position",
    "group": "Shoes, guides & stops",
    "text": "Shoe on steel, offset & length per detail",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Offset not per detail",
     "Shoe welded to beam",
     "Shoe near beam edge",
     "Shoe weld missing / cracked",
     "Shoe too low for insulation"
    ],
    "ask": "Are shoes cold-offset for thermal growth, and what offset is specified?"
   },
   {
    "id": "guides_stops",
    "group": "Shoes, guides & stops",
    "text": "Guides, stops & anchors as per detail",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Guide / stop missing",
     "Gap not per detail",
     "Guide welded to shoe",
     "Stop on wrong side",
     "Anchor weld / bolts incomplete"
    ],
    "ask": "What guide gap, stop gap and anchor weld/bolt details does the support detail specify?"
   },
   {
    "id": "slide_ptfe",
    "group": "Shoes, guides & stops",
    "text": "Slide plate/PTFE intact, clean, can slide",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "PTFE missing / damaged",
     "PTFE burnt by welding",
     "Paint / spatter on slide face",
     "Slide tack-welded solid",
     "Plate misaligned / fixings loose"
    ],
    "ask": "Which supports specify PTFE or other low-friction pads?"
   },
   {
    "id": "free_movement",
    "group": "Shoes, guides & stops",
    "text": "Free path for thermal movement, no clash",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "Clash with steel / cable tray",
     "Touching adjacent pipe",
     "Branch/drain will hit steel",
     "Insulation fouling support",
     "Cable/tube tied to pipe"
    ],
    "ask": "Which lines run hot, and in which direction should they move?"
   },
   {
    "id": "clamps_pads",
    "group": "Clamps & pads",
    "text": "U-bolt/clamp snug or gap, pads per detail",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "U-bolt / clamp missing",
     "Snug/gap not per detail",
     "Nut loose / short of nut",
     "Isolation / wear pad missing",
     "Plastic pipe clamp overtight"
    ],
    "ask": "Which U-bolts are snug and which gapped, are lock nuts required, and which lines need pads or continuous support (SS, plastic, lined)?"
   },
   {
    "id": "exp_joint",
    "group": "Expansion joints",
    "text": "Expansion joint shipping bars status noted",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Obs: bars IN",
     "Obs: bars OUT",
     "Bellows damaged / misaligned",
     "Flow arrow reversed",
     "Bar removed, not recorded"
    ],
    "ask": "Are there expansion joints in this system, and at what stage, and by whom, are shipping bars removed?"
   },
   {
    "id": "spring_stops",
    "group": "Hangers",
    "text": "Travel stops / locking pins status noted",
    "basis": "project",
    "codeRef": "ASME B31.1 / ASME B31.3 – verify clause/edition",
    "defects": [
     "Obs: stops IN",
     "Obs: stops OUT",
     "Stop removed before hydro/flush",
     "Stop removed, not recorded",
     "Locking pin missing / lost"
    ],
    "ask": "When are stops removed, by whom, and is a QC witness required? Must they stay in during hydrotest/flush, or are temp supports used?"
   },
   {
    "id": "spring_setting",
    "group": "Hangers",
    "text": "Nameplate vs schedule; indicator (stops out)",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Wrong hanger size / type",
     "Nameplate / ID missing",
     "Indicator off cold mark",
     "Spring at end of travel",
     "No cold mark on scale"
    ],
    "ask": "What type, size, load and cold position does the hanger schedule give, and who records the cold setting?"
   },
   {
    "id": "spring_hardware",
    "group": "Hangers",
    "text": "Rod: lock nuts, thread engaged, angle per detail",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "Lock nut missing",
     "No thread visible in turnbuckle",
     "Rod bent",
     "Rod angle not per detail",
     "Rod touching steel / insulation"
    ],
    "ask": "What rod angle or cold offset of hanger rods is allowed?"
   },
   {
    "id": "pipe_welds",
    "group": "Welding",
    "text": "Welds on pipe sound; no unapproved attachments",
    "basis": "code",
    "codeRef": "ASME B31.1 / ASME B31.3 / ASME Sec IX – verify clause/edition",
    "defects": [
     "Crack / porosity",
     "Undercut / arc strike on pipe",
     "Weld incomplete",
     "New weld on pipe after test",
     "Unapproved bracket on pipe"
    ],
    "ask": "Do support welds on pressure pipe need NDE/PWHT? If pipe was welded after hydrotest, what retest/NDE is required, and who approves it?"
   },
   {
    "id": "temp_removed",
    "group": "Temporary items",
    "text": "Temporary supports, wedges & lugs removed",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "Temp / hydrotest support left",
     "Wooden block / wedge under pipe",
     "Temp lug not removed",
     "Lug area not ground / repaired",
     "Rope, chain, scaffold as support"
    ],
    "ask": "Where temp lugs are removed from pipe, is NDE or a repair record required?"
   },
   {
    "id": "paint_finish",
    "group": "Finish",
    "text": "Paint/galvanising touched up at supports",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Paint / galvanising damaged",
     "No touch-up after welding",
     "Rust at support / under clamp",
     "Cladding not sealed at shoe",
     "Insulation crushed at support"
    ],
    "ask": "Which touch-up system applies to painted and galvanised support steel, and who applies it?"
   },
   {
    "id": "sup_hazard",
    "group": "Safety",
    "text": "No trip, head or access hazard from supports",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "Head-knocker unmarked",
     "Trip hazard at walkway",
     "Sharp edge / cut end",
     "Blocks valve access",
     "Blocks escape route"
    ],
    "ask": "What project marking is required for head-knockers and trip hazards?"
   },
   {
    "id": "punch_closure",
    "group": "Closure & records",
    "text": "Earlier punch closed in field; records signed",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Closed on paper, open in field",
     "Fix incomplete / new defect",
     "Punch tag still fitted",
     "Record missing / not signed",
     "Welder ID untraceable (if req'd)"
    ],
    "ask": "Who signs support punch closure? Does QC field-verify every category (A/B/B+/C/D)? Which support records go in the handover dossier?"
   }
  ]
 },
 {
  "key": "rotating",
  "label": "Pump / rotating equip.",
  "checks": [
   {
    "id": "status_isolation",
    "group": "Identification",
    "text": "Status/isolation tag checked first",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "No status/LOTO tag",
     "Energised - no PTW visible",
     "Guard off while energised",
     "Status tag unclear/outdated"
    ],
    "ask": "After handover to commissioning, may QC open guards/covers? Who issues PTW?"
   },
   {
    "id": "tag_nameplate",
    "group": "Identification",
    "text": "Tag/arrows fitted; nameplate matches datasheet",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Tag missing/wrong/duplicate",
     "Nameplate missing/illegible",
     "Nameplate differs from datasheet",
     "Rotation arrow missing/painted",
     "Pump/motor arrows disagree"
    ],
    "ask": "Is the current-revision pump and motor datasheet on site to compare?"
   },
   {
    "id": "anchor_bolts",
    "group": "Foundation",
    "text": "Anchor nuts tight, full engagement, no rust",
    "basis": "practice",
    "codeRef": "verify clause/edition",
    "defects": [
     "Anchor nut loose",
     "Bolt not fully through nut",
     "Anchor bolts rusted",
     "Washer/lock nut missing",
     "Anchor torque not recorded"
    ],
    "ask": "Is anchor bolt torque required and recorded per project spec?"
   },
   {
    "id": "holddown_shims",
    "group": "Foundation",
    "text": "Pump/motor hold-down bolts tight; shims OK",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "Hold-down bolt loose",
     "Bolt not fully through nut",
     "Shims rusty/damaged",
     "Shim pack not per spec",
     "Jack screws not per spec"
    ],
    "ask": "Shim material/max count, jack-screw treatment and dowelling per vendor or spec?"
   },
   {
    "id": "grout",
    "group": "Foundation",
    "text": "Grout complete, edges sealed, no cracks",
    "basis": "practice",
    "codeRef": "verify clause/edition",
    "defects": [
     "Grout cracked",
     "Grout edge not sealed",
     "Foundation concrete spalled",
     "Fill/vent holes not plugged",
     "Hollow on tap test (if done)"
    ],
    "ask": "Grout type, void acceptance and levelling-screw treatment per spec? Is tap testing allowed?"
   },
   {
    "id": "pipe_strain",
    "group": "Piping at nozzles",
    "text": "Nozzle flanges aligned; pipe supported near pump",
    "basis": "practice",
    "codeRef": "ASME B31.1 / ASME B31.3 – verify clause/edition",
    "defects": [
     "Flange misaligned at nozzle",
     "Support missing/not bearing",
     "Temp support left in place",
     "Exp. joint bars/rods status unclear",
     "Spring stop status unclear"
    ],
    "ask": "Nozzle flange alignment tolerance: vendor or spec? Spring stops and exp.-joint rods: set or released at handover?"
   },
   {
    "id": "blinds_strainer",
    "group": "Piping at nozzles",
    "text": "Test blinds out; temp strainer flagged",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Test blind/spade left in",
     "Shipping cover between flanges",
     "Blind removed - not in register",
     "Temp strainer not in register",
     "Strainer flag/tab missing"
    ],
    "ask": "Who keeps the blind and strainer registers? Is a temp strainer required here?"
   },
   {
    "id": "seal_drains",
    "group": "Seal and drains",
    "text": "Seal plan piping, drains and vents complete",
    "basis": "project",
    "codeRef": "API 682 – verify clause/edition",
    "defects": [
     "Seal piping not per datasheet",
     "Seal pot/orifice missing",
     "Gland leak-off not piped",
     "Drain/vent plug missing",
     "Seal/drain line unsupported"
    ],
    "ask": "Which seal plan (if any) per datasheet? Casing drains piped to a hub per design?"
   },
   {
    "id": "coupling_guard",
    "group": "Coupling and rotation",
    "text": "Coupling status logged; guard fully fitted",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "Coupling guard missing",
     "Guard loose/touching coupling",
     "Guard opening allows reach-in",
     "Spacer out - not logged",
     "Coupling bolts loose"
    ],
    "ask": "Coupling open for solo run: who reconnects and re-aligns? Non-sparking guards needed in Ex areas?"
   },
   {
    "id": "transit_preservation",
    "group": "Shipping and preservation",
    "text": "Transit locks/seal clips off; preservation OK",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Transit lock still fitted",
     "Seal setting clips not removed",
     "AV mount/shaft lock not released",
     "Preservation log missing/overdue",
     "Openings not sealed"
    ],
    "ask": "Who removes transit locks and seal clips, and when? Preservation interval/method per vendor?"
   },
   {
    "id": "lubrication",
    "group": "Lubrication",
    "text": "Lube: level visible, tag fitted, no leaks",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Oil level low/not visible",
     "Oil leak at bearing",
     "Oiler/breather missing/broken",
     "Lube tag/label missing",
     "Grease nipple/plug missing"
    ],
    "ask": "Is first oil fill construction scope? If not, how is 'not filled yet' recorded?"
   },
   {
    "id": "instruments",
    "group": "Instruments and electrical",
    "text": "Local instruments and stop station fitted, tagged",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Gauge missing/glass broken",
     "Gauge not at zero (idle)",
     "Gauge isolation valve missing",
     "Instrument/station tag missing",
     "Local stop missing/unlabelled"
    ],
    "ask": "Which local instruments and local stop station does the design show for this unit?"
   },
   {
    "id": "motor_earthing",
    "group": "Instruments and electrical",
    "text": "Motor hookup and earthing (observe only)",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Earth cable missing/loose",
     "Unused entry open/plastic plug",
     "Gland loose/box cover open",
     "Cable unsupported/untagged",
     "Ex marking not visible"
    ],
    "ask": "Hazardous area here (Ex motor/glands)? Earthing points and size per design?"
   },
   {
    "id": "fan_items",
    "group": "Fans/compressors/blowers",
    "text": "Fan: belt guard, inlet screen, flex joint",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "Belt guard missing/open",
     "Inlet/bird screen missing",
     "Flex connector torn/taut",
     "Damper linkage loose",
     "Belt tension not recorded"
    ],
    "ask": "Is a belt-tension record required for handover?"
   },
   {
    "id": "compressor_psv",
    "group": "Fans/compressors/blowers",
    "text": "Compressor/blower: PSV sealed and tagged",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "PSV gag/blind not removed",
     "PSV seal broken/tag missing",
     "PSV outlet not to safe point",
     "Drain/trap not piped",
     "Inlet filter/panel missing"
    ],
    "ask": "Is a PSV test certificate required for handover, and who holds it?"
   },
   {
    "id": "wet_pit",
    "group": "Vertical/sump pumps",
    "text": "Wet pit/sump clean; screens fitted",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "Debris/formwork in sump",
     "Intake screen missing",
     "Discharge head bolts loose",
     "Guide rail/lift chain missing",
     "Submersible cable unsupported"
    ],
    "ask": "Who signs off sump cleanliness before first fill?"
   },
   {
    "id": "dosing_pump",
    "group": "Dosing pumps",
    "text": "Dosing pump: relief, damper, cal. column",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Relief valve missing/not piped",
     "Pulsation damper missing",
     "Calibration column missing",
     "Chemical leak at pump head",
     "Drip tray/bund missing"
    ],
    "ask": "Which dosing skids are vendor packages, and what relief/damper/calibration items does the design show?"
   },
   {
    "id": "paint_housekeeping",
    "group": "Finish",
    "text": "Paint touched up; debris and temp items cleared",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "Paint damaged/rust spots",
     "Touch-up not done",
     "Debris on baseplate",
     "Temp material left"
    ],
    "ask": "Touch-up paint system for vendor-painted equipment per spec?"
   },
   {
    "id": "alignment_record",
    "group": "Records",
    "text": "Final alignment and solo-run records seen",
    "basis": "project",
    "codeRef": "verify clause/edition",
    "defects": [
     "Alignment record missing",
     "Out of tolerance on record",
     "Record predates piping/rework",
     "Pipe-strain check not recorded",
     "Solo-run/rotation not recorded"
    ],
    "ask": "Alignment tolerances (vendor/spec)? Final check after piping required? Solo-run record in MC or commissioning?"
   },
   {
    "id": "prior_punch",
    "group": "Records",
    "text": "Prior punch items re-verified closed",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Closed on paper, still open",
     "Closure not signed by constr.",
     "No closure photo",
     "New damage from rework"
    ],
    "ask": "Who signs construction closure before QC verification?"
   }
  ]
 },
 {
  "key": "tank_vessel",
  "label": "Tank / vessel",
  "checks": [
   {
    "id": "bund_intact",
    "group": "Bund & base",
    "text": "Bund intact, penetrations sealed, drain valve fitted",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "Bund wall/lining cracked",
     "Penetration not sealed",
     "Bund drain valve left open",
     "Bund drain valve missing",
     "Debris/water in bund"
    ],
    "ask": "What bund lining type is required, and must the bund drain valve be locked closed?"
   },
   {
    "id": "anchors_saddle",
    "group": "Bund & base",
    "text": "Anchor nuts fitted; sliding saddle free",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Anchor nut missing/loose",
     "Bolt short of nut",
     "Lock nut/tack missing",
     "Slide nut fully tightened",
     "Slot blocked/saddle welded"
    ],
    "ask": "Is this item anchored per design, what nut locking applies, and which saddle slides with what nut setting (snug, gap, double nut)?"
   },
   {
    "id": "base_grout_seal",
    "group": "Bund & base",
    "text": "Base grout / edge seal intact, no ponding",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "Grout cracked/missing",
     "Grout hollow on tap test",
     "Bottom edge not sealed",
     "Water ponding at base",
     "Shims not grouted"
    ],
    "ask": "Is a tank bottom-edge sealant or a specific grout type specified?"
   },
   {
    "id": "earthing_cp",
    "group": "Earthing",
    "text": "Earth cable at every boss; CP point if fitted",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Earth cable missing",
     "Earth lug loose/painted over",
     "Connection corroded",
     "CP test box/cable damaged",
     "Earth/CP point not labelled"
    ],
    "ask": "How many earth points per item, is a continuity or resistance record required, and is CP fitted on any tank bottom?"
   },
   {
    "id": "coating_insulation",
    "group": "Shell & ID",
    "text": "Paint/insulation complete, no damage/rust",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Coating damaged/rust spots",
     "Rust stain on stainless",
     "CS-SS contact, no isolation",
     "Insulation/cladding open/wet",
     "Repad tell-tale plugged"
    ],
    "ask": "Which paint system and colour code apply, which items are insulated and for what purpose, and is a DFT or holiday-test record required?"
   },
   {
    "id": "nonmetallic_shell",
    "group": "Shell & ID",
    "text": "GRP/HDPE tank: no cracks, UV or chem damage",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "Crack/craze at nozzle",
     "UV chalking/discolour",
     "Hold-down strap loose",
     "Base not fully supported",
     "Weeping at seam"
    ],
    "ask": "Which tanks are GRP, HDPE or lined steel, and to what design standard (verify clause/edition)?"
   },
   {
    "id": "nameplate",
    "group": "Shell & ID",
    "text": "Nameplate fitted, legible, not painted over",
    "basis": "code",
    "codeRef": "API 650 para 10.1 Nameplates (API 650 tanks only). Vessels / other tanks: verify clause/edition (confirm project edition)",
    "defects": [
     "Nameplate missing",
     "Nameplate painted/insulated over",
     "Nameplate illegible",
     "Code stamp missing (if req'd)",
     "Nameplate loose/damaged"
    ],
    "ask": "For non-API 650 vessels and skids, which code governs the nameplate or stamping (ASME VIII, vendor, EN), and is a code stamp required?"
   },
   {
    "id": "tag_labels",
    "group": "Shell & ID",
    "text": "Tag & labels fitted; nameplate = datasheet",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Tag number missing",
     "Temporary tag only",
     "Data differs from datasheet",
     "Content/hazard label missing",
     "Label faded/wrong content"
    ],
    "ask": "Which labelling and hazard-sign standard applies (client, local regulation or other)?"
   },
   {
    "id": "temp_attachments",
    "group": "Shell & ID",
    "text": "Temp cleats & shipping restraints removed",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "Temp cleat not removed",
     "Scar/arc strike not ground",
     "Area not recoated",
     "Shipping brace/bolt left on",
     "Lug left on (to be removed)"
    ],
    "ask": "Do lifting lugs and trunnions stay per design, is NDE required where temporary attachments were removed, and which restraints does the vendor mark for removal?"
   },
   {
    "id": "nozzle_bolting",
    "group": "Nozzles & manways",
    "text": "Nozzle/manway bolts: engagement & condition",
    "basis": "code",
    "codeRef": "ASME B31.3 para 335.2.3 Bolt Length – acceptance wording changed between editions (B31.3 piping joints only). Tank / vessel nozzles: verify clause/edition (confirm project edition)",
    "defects": [
     "Bolt short of full nut engagement",
     "Bolts rusted",
     "Washer/nut missing",
     "Mixed bolt grade/size",
     "Flange misaligned"
    ],
    "ask": "Is the connecting piping B31.1 or B31.3, which edition applies, and is any thread short of full nut engagement acceptable under the project spec?"
   },
   {
    "id": "flange_joint_spec",
    "group": "Nozzles & manways",
    "text": "Gasket, torque, spray guard per spec",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Wrong gasket type",
     "Gasket off-centre/protruding",
     "Torque mark missing",
     "Gasket reused after opening",
     "Spray guard missing (chem)"
    ],
    "ask": "Which gasket applies per piping class, which joints need a torque record (spec or vendor values), and are spray guards required on chemical joints?"
   },
   {
    "id": "nozzle_pipe_strain",
    "group": "Nozzles & manways",
    "text": "No pipe strain on nozzles; first support fitted",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "Pipe forced into nozzle",
     "Flange gap/offset at nozzle",
     "First support missing",
     "Temp support at nozzle",
     "Pipe weight on plastic nozzle"
    ],
    "ask": "Are flexible connectors or bellows specified at any tank nozzle?"
   },
   {
    "id": "blinds_preservation",
    "group": "Nozzles & manways",
    "text": "Test blinds out; nozzles closed/preserved",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Test blind left in",
     "Spare nozzle open/cap only",
     "Nozzle cover missing",
     "N2 blanket pressure lost",
     "Water left after hydrotest"
    ],
    "ask": "Which nozzles are spare and how are they closed (blind or plug), and what preservation (N2, desiccant, drained) is required until commissioning?"
   },
   {
    "id": "drains_vents",
    "group": "Nozzles & manways",
    "text": "Drains, vents, overflow fitted; ends capped",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Drain/vent not installed",
     "Drain/vent plug/cap missing",
     "Overflow not piped/screened",
     "Seal loop/pot missing",
     "Drain line unsupported"
    ],
    "ask": "Where should the overflow terminate (drain, bund or seal pot), and how is each drain and vent end closed per design?"
   },
   {
    "id": "internals_boxup",
    "group": "Nozzles & manways",
    "text": "If open: internals clean before box-up",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Foreign material inside",
     "Internal lining damaged",
     "Internals missing/loose",
     "Closed without witness (if HP)"
    ],
    "ask": "Is a QC or client witness hold point required before manway closure, and which internals are specified?"
   },
   {
    "id": "instruments",
    "group": "Instruments",
    "text": "Level/PG/TG fitted, valved, hooked up, tagged",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "Instrument missing/untagged",
     "Gauge glass broken/dirty",
     "Root/isolation valve missing",
     "Bridle/gauge unsupported",
     "Cable gland not sealed"
    ],
    "ask": "Which level, pressure and temperature devices are specified, and is a loop-check or gauge calibration record needed at handover?"
   },
   {
    "id": "access",
    "group": "Access",
    "text": "Ladder/stair/platform & handrails complete",
    "basis": "project",
    "codeRef": "API 650 – verify clause/edition",
    "defects": [
     "Bolts missing/loose",
     "Handrail gap/loose",
     "Toe board missing",
     "Ladder gate/chain missing",
     "Cage/tread/grating loose"
    ],
    "ask": "Which access and fall-protection standard governs on site (client or local regulation), and what handrail height, toe board and ladder gate type are required?"
   },
   {
    "id": "vents_arrestors",
    "group": "Roof & relief",
    "text": "Vent/PVRV/arrestor/breather fitted, covers off",
    "basis": "project",
    "codeRef": "API 2000 / ISO 16852 – verify clause/edition",
    "defects": [
     "Shipping cover left on",
     "Device missing/not per datasheet",
     "Screen missing/blocked",
     "Desiccant breather spent",
     "Gauge hatch not closed"
    ],
    "ask": "Which tanks need a PVRV, flame arrestor, desiccant breather, CO2 absorber or N2 blanket instead of an open vent, and are device certificates required?"
   },
   {
    "id": "relief_valve",
    "group": "Roof & relief",
    "text": "PSV fitted; tag set pressure = datasheet",
    "basis": "code",
    "codeRef": "ASME Sec VIII – verify clause/edition",
    "defects": [
     "PSV missing/not vertical",
     "Shipping plug/gag left in",
     "Set pressure not per datasheet",
     "Isolation valve not open/sealed",
     "Discharge not routed safe"
    ],
    "ask": "Is a PSV set-test cert required at handover, how recent must it be, and must the isolation valves be car-sealed open?"
   },
   {
    "id": "test_records",
    "group": "Records",
    "text": "Test & cert records in handover dossier",
    "basis": "project",
    "codeRef": "API 650 / ASME Sec VIII / ASME Sec V – verify clause/edition",
    "defects": [
     "No hydrotest/settlement record",
     "No NDE report or MDR",
     "No PSV set-test cert",
     "No coating/DFT record",
     "No box-up/torque record"
    ],
    "ask": "What does the tank or vessel handover dossier contain (hydrotest, settlement, NDE, MDR, PSV cert, coating/DFT, box-up, torque)?"
   }
  ]
 },
 {
  "key": "instrument_hookup",
  "label": "Instrument & cable hookup",
  "checks": [
   {
    "id": "root_valve",
    "group": "Tap & root valve",
    "text": "Root valve fitted, type/rating per hookup",
    "basis": "project",
    "codeRef": "ASME B31.1 / ASME B31.3 – verify clause/edition",
    "defects": [
     "Root valve missing",
     "Wrong type/rating",
     "Globe valve against flow",
     "Gland/bonnet leak",
     "Handle missing/no access"
    ],
    "ask": "Which code (B31.1 or B31.3) governs this line, and what root valve type/rating does the hookup specify?"
   },
   {
    "id": "sbc_bracing",
    "group": "Tap & root valve",
    "text": "Small-bore tap braced, no heavy overhang",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "Valve/manifold unbraced",
     "Tap on vibrating line unbraced",
     "Crack/leak at tap weld",
     "Brace welded to pipe"
    ],
    "ask": "Which taps must be braced on this project, and what bracing method is approved?"
   },
   {
    "id": "tie_in_bolts",
    "group": "Tap & root valve",
    "text": "Tie-in flange: bolts fully through nut",
    "basis": "code",
    "codeRef": "ASME B31.3 para 335.2.3 Bolt Length – acceptance wording changed between editions. B31.1: verify clause/edition (confirm project edition)",
    "defects": [
     "Bolt not fully through nut",
     "Bolt missing"
    ],
    "ask": "For the project code edition, is one thread short of full nut engagement acceptable?"
   },
   {
    "id": "tie_in_joint",
    "group": "Tap & root valve",
    "text": "Tie-in: alignment, gasket, torque, threads",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Flange misaligned/gap uneven",
     "Gasket not as spec",
     "Torque not recorded",
     "Bolts rusted",
     "Seal weld missing (if spec)"
    ],
    "ask": "What are the tie-in gasket type, torque record and alignment criteria, and are threaded connections seal-welded (on which services)?"
   },
   {
    "id": "impulse_slope",
    "group": "Impulse line & tubing",
    "text": "Impulse line slope & tap orientation per service",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "Slope wrong for service",
     "Pocket/high point in line",
     "Tap on top of liquid line",
     "Tap at bottom of gas line",
     "Condensate pots not level"
    ],
    "ask": "Required slope value for this service (liquid, gas, steam)?"
   },
   {
    "id": "tube_material",
    "group": "Impulse line & tubing",
    "text": "Tube & fitting material/make per spec",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Wrong tube OD (vs fitting)",
     "Tube marking not per spec",
     "Mixed fitting makes",
     "CS fitting on SS tube"
    ],
    "ask": "What tube material, OD/wall and fitting make does the spec require, and is mixing makes prohibited?"
   },
   {
    "id": "fittings_made_up",
    "group": "Impulse line & tubing",
    "text": "Compression fittings made up, no leak",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "Gap gauge enters (undertight)",
     "Remade fitting, gauge N/A",
     "Sealant on compression fitting",
     "Leak/stain at fitting",
     "Tube scored/kinked at fitting"
    ],
    "ask": "Which fitting maker's make-up/remake instructions apply, and is a gap-gauge record required?"
   },
   {
    "id": "tubing_supports",
    "group": "Impulse line & tubing",
    "text": "Tubing/capillary supported, no strain or kink",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "Unsupported span/clip missing",
     "Tube/capillary kinked",
     "Load on instrument/fitting",
     "SS on CS, no isolator",
     "Walkway/trip hazard"
    ],
    "ask": "What are the max tubing support spacing, the isolator rule for SS on CS, and the capillary coil/support method?"
   },
   {
    "id": "vents_drains",
    "group": "Impulse line & tubing",
    "text": "Vents/drains/test points fitted, ends plugged",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "Vent/drain plug missing",
     "Open end not plugged",
     "Test tee cap missing",
     "Drain not routed safely",
     "Valve pos. vs line-up (obs.)"
    ],
    "ask": "Which vents/drains/test points does the hookup show, and how should drains be routed on hazardous or hot service?"
   },
   {
    "id": "manifold",
    "group": "Manifold & instrument",
    "text": "Manifold fitted, HP/LP not reversed",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "HP/LP legs reversed",
     "HP/LP not marked at tap/TX",
     "Manifold type not as hookup",
     "Manifold loose/handle missing",
     "Valve pos. vs line-up (obs.)"
    ],
    "ask": "Which manifold type (2/3/5-valve) does the hookup specify?"
   },
   {
    "id": "inline_element",
    "group": "Manifold & instrument",
    "text": "Flow element/thermowell fitted, right way",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "FE reversed (arrow/tab)",
     "Spacer in, plate not fitted",
     "Thermowell missing, plug only",
     "TE not inserted/head open",
     "Earth ring missing (if req.)"
    ],
    "ask": "Are orifice plates, meters and TEs fitted now or after flushing, and what straight-run and earthing-ring requirements does the spec set?"
   },
   {
    "id": "instrument_mounting",
    "group": "Manifold & instrument",
    "text": "Instrument/gauge rigid, intact, readable",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "Instrument/stand loose",
     "Glass/cover cracked",
     "Paint overspray on instrument",
     "Bracket welded to pipe",
     "No siphon on steam (if spec)"
    ],
    "ask": "Which services need a siphon/snubber, are sunshades required, and are welded attachments allowed after the pressure test (is a retest needed)?"
   },
   {
    "id": "instrument_tag",
    "group": "Manifold & instrument",
    "text": "Tag fitted; nameplate matches datasheet",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Tag plate missing",
     "Tag differs from nameplate",
     "Temporary tag only",
     "Tag illegible/painted",
     "Range/material vs datasheet"
    ],
    "ask": "What tag plate material and fixing does the project require, and which datasheet fields should be checked (range, material, rating)?"
   },
   {
    "id": "gland_jb",
    "group": "Cable, gland & JB",
    "text": "Glands tight & sealed; JB closed, labelled",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Gland loose/wrong size",
     "Armour not clamped",
     "Spare entry: transit plug/open",
     "JB cover/gasket not sealed",
     "JB label missing"
    ],
    "ask": "What gland type and IP/Ex rating apply per area, which stopping plugs are approved, and may QC open JBs (permit)?"
   },
   {
    "id": "cable_tray",
    "group": "Cable, gland & JB",
    "text": "Cable supported in tray/conduit, protected",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "Cable unsupported/outside tray",
     "Tray cover/support missing",
     "Sheath damaged/tight bend",
     "Drop to instrument unprotected",
     "Cable tag missing"
    ],
    "ask": "What is the bend radius basis (maker or spec), which runs need covers, what IS/non-IS segregation rule applies, and what cable tag format is used?"
   },
   {
    "id": "earthing_bonding",
    "group": "Earthing & Ex",
    "text": "Earthing/bonding fitted, lugs tight",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Earth cable missing",
     "Lug loose/corroded",
     "Tray bonding jumper missing",
     "Earth lug on paint",
     "Gland earth tag missing"
    ],
    "ask": "What instrument earthing scheme applies (PE vs IS/clean earth), at which end is the screen earthed, and what is the tray bonding rule?"
   },
   {
    "id": "ex_marking_obs",
    "group": "Earthing & Ex",
    "text": "Ex marking visible (observe only)",
    "basis": "project",
    "codeRef": "IEC 60079 – verify clause/edition",
    "defects": [
     "Ex label not visible",
     "Ex label painted over",
     "Gland Ex marking not seen",
     "Ex d cover bolt missing"
    ],
    "ask": "Is this area classified, under which scheme (zone or class/division), and who verifies Ex compliance?"
   },
   {
    "id": "temp_items_removed",
    "group": "Clearance & records",
    "text": "Temp plugs, caps, tape & debris removed",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "Shipping plug left in",
     "Temp blind/dummy left in",
     "Hydrotest gauge left in",
     "Instrument not refitted",
     "Protective tape/debris left"
    ],
    "ask": "Is there a register of instruments removed for flushing/hydro?"
   },
   {
    "id": "leak_test_record",
    "group": "Clearance & records",
    "text": "Hookup leak test record seen",
    "basis": "project",
    "codeRef": "ASME B31.1 / ASME B31.3 – verify clause/edition",
    "defects": [
     "Record not seen",
     "Record incomplete",
     "Leak/stain seen",
     "QC witness missing (if req.)"
    ],
    "ask": "Are hookups tested with the line or separately, with what medium/pressure, and were instruments isolated or removed during the test?"
   },
   {
    "id": "punch_reverify",
    "group": "Clearance & records",
    "text": "Earlier punch on this hookup closed",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Reported closed, not done",
     "Fix caused new defect",
     "Wrong item fixed",
     "No closure photo/record"
    ],
    "ask": "Who signs closure (Construction or QC), and is a closure photo required?"
   }
  ]
 },
 {
  "key": "general_area",
  "label": "General area / handover",
  "checks": [
   {
    "id": "access_egress",
    "group": "Access & Lighting",
    "text": "Access and escape routes clear",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "Escape route/exit blocked",
     "Material/trip hazard on walkway",
     "Temporary barricade left",
     "Open excavation not barricaded",
     "Low headroom not marked"
    ],
    "ask": ""
   },
   {
    "id": "platforms_stairs",
    "group": "Access & Lighting",
    "text": "Platforms, stairs, handrails, toe boards complete",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "Handrail/toe board missing",
     "Grating/stair tread loose",
     "Floor opening unprotected",
     "Self-closing gate missing",
     "Rope/tape used as handrail"
    ],
    "ask": ""
   },
   {
    "id": "lighting",
    "group": "Access & Lighting",
    "text": "Light fittings installed; lit if energised",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Fitting missing",
     "Cover/lens missing",
     "Not lit (area energised)",
     "Temp lighting left after perm. live",
     "Emergency light charge LED off"
    ],
    "ask": "Is permanent lighting energised in this area?"
   },
   {
    "id": "area_earthing",
    "group": "Earthing",
    "text": "Steel/rack earthing connected, pits covered",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Earth cable not connected",
     "Earth lug loose/corroded",
     "Earth cable damaged",
     "Earth pit cover missing"
    ],
    "ask": "Which general-area items (lighting, earthing, signage, fire water, showers, lifting gear) are in mechanical QC scope?"
   },
   {
    "id": "housekeeping",
    "group": "Housekeeping & Temporary Items",
    "text": "Area clean: debris, scrap, waste removed",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "Debris/scrap/packing left",
     "Weld rods/discs left",
     "Oil/chemical spill",
     "Sand/dust build-up",
     "Grinding dust on equipment"
    ],
    "ask": ""
   },
   {
    "id": "temp_materials",
    "group": "Housekeeping & Temporary Items",
    "text": "Temp hoses, cables, cylinders, rigging removed",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "Gas cylinder left in area",
     "Temp hose/rigging left",
     "Temp power board/cable left",
     "Welding machine/cable left",
     "Non-Ex temp equipment in gas area"
    ],
    "ask": "Is this area hazardous-area classified?"
   },
   {
    "id": "scaffolds",
    "group": "Housekeeping & Temporary Items",
    "text": "Scaffolds removed or tagged valid",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Scaffold/loose tubes left",
     "Scaffold tag missing",
     "Scaffold blocking access",
     "Scaffold bearing on pipe/insulation",
     "Scaffold tied to pipe/tray/rail"
    ],
    "ask": "Which scaffolds may stay for commissioning?"
   },
   {
    "id": "test_blinds_removed",
    "group": "Housekeeping & Temporary Items",
    "text": "Test blinds out; spades/spectacles positioned",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Test blind left in line",
     "Blind handle visible at joint",
     "Spectacle/spade in wrong position",
     "Temporary gasket not replaced",
     "Removal not signed off (if req.)"
    ],
    "ask": "Where are required spade/spectacle positions listed?"
   },
   {
    "id": "preservation",
    "group": "Housekeeping & Temporary Items",
    "text": "Open ends capped, covers fitted",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Open end not capped",
     "Protective cover missing",
     "Cover removed, not refitted",
     "Sand ingress at opening",
     "Nearby hot work, item unprotected"
    ],
    "ask": "Who owns preservation after handover?"
   },
   {
    "id": "drainage_bunds",
    "group": "Drainage",
    "text": "Drains, trenches, bunds clear; covers fitted",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Drain/trench blocked (sand/silt)",
     "Trench cover missing/not flush",
     "Bund wall/lining damaged",
     "Bund drain valve wrong position",
     "Standing water"
    ],
    "ask": "What is the normal position of bund drain valves?"
   },
   {
    "id": "safety_shower",
    "group": "Safety Equipment",
    "text": "Safety shower/eyewash: clear, supply open",
    "basis": "project",
    "codeRef": "verify clause/edition",
    "defects": [
     "Access obstructed",
     "Supply valve not locked open",
     "Dust cap/sign missing",
     "Flow test record missing (if req.)",
     "Supply line in sun (if spec'd)"
    ],
    "ask": "Which standard governs safety showers/eyewash?"
   },
   {
    "id": "fire_water_obs",
    "group": "Safety Equipment",
    "text": "Hydrants/monitors: access clear, no damage (observe)",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Hydrant/monitor access blocked",
     "Hydrant cap/handwheel missing",
     "Monitor damaged",
     "Hose box empty/damaged",
     "Valve position not as required"
    ],
    "ask": "Which fire code governs fire water here?"
   },
   {
    "id": "lifting_appliances",
    "group": "Safety Equipment",
    "text": "Monorail/hoist/davit: SWL marked, cert seen",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "SWL marking missing",
     "Load-test cert not available",
     "Trolley end stop missing",
     "Hoist not parked/secured"
    ],
    "ask": "Which lifting appliances need a load-test cert before handover?"
   },
   {
    "id": "tags_line_marking",
    "group": "Labelling & Signage",
    "text": "Tags fitted; line ID and flow arrows marked",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Tag missing or illegible",
     "Temporary/marker tag only",
     "Tag does not match equipment",
     "Flow arrow missing/wrong way",
     "Line marking faded/peeling"
    ],
    "ask": "Which equipment tagging spec applies?"
   },
   {
    "id": "safety_signage",
    "group": "Labelling & Signage",
    "text": "Hazard and escape signs posted",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Hazard sign missing",
     "Sign faded/damaged",
     "Escape route sign missing",
     "PPE sign missing"
    ],
    "ask": "Which safety signage spec and languages apply?"
   },
   {
    "id": "insulation_damage",
    "group": "Finish & Protection",
    "text": "Insulation/cladding intact, joints sealed",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Cladding dented/joint open",
     "Insulation/end cap missing",
     "Sealant missing at penetration",
     "Cladding lap lets water in",
     "Water stain/drip from cladding"
    ],
    "ask": "May insulation be punched at handover?"
   },
   {
    "id": "personnel_protection",
    "group": "Finish & Protection",
    "text": "Hot-surface personnel protection fitted",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "PP guard missing",
     "PP guard loose/damaged",
     "PP insulation missing"
    ],
    "ask": "Which hot lines/surfaces need personnel protection?"
   },
   {
    "id": "paint_touchup",
    "group": "Finish & Protection",
    "text": "Paint damage touched up, no rust/bare steel",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Paint damaged/rust spots",
     "Field weld not painted",
     "Paint on nameplate/stem/gauge",
     "Galvanising damage not repaired",
     "Rust stain on stainless steel"
    ],
    "ask": "Which paint touch-up system applies?"
   },
   {
    "id": "no_open_cat_a",
    "group": "Handover",
    "text": "No open Cat A punch in area/system",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Open Cat A item in area",
     "Cat A marked closed, not fixed",
     "Closed item has no photo (if req.)",
     "Fix caused new damage"
    ],
    "ask": "Does B+ also block handover?"
   },
   {
    "id": "system_boundary",
    "group": "Handover",
    "text": "System limits tagged; handover records available",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Boundary valve/blind not tagged",
     "Boundary blind missing",
     "Limits differ from handover mark-up",
     "Handover record not available",
     "Record unsigned/incomplete"
    ],
    "ask": "How are system handover limits marked on site?"
   }
  ]
 },
 {
  "key": "free",
  "label": "Other (free check)",
  "checks": []
 }
];
// Punch closure verification. core = always answered; required = must be Yes (no N/A).
export const CLOSURE_CHECKS = [
 {
  "id": "safe_access",
  "text": "Safe to inspect? LOTO/permit status known",
  "basis": "practice",
  "codeRef": "",
  "core": true,
  "required": false
 },
 {
  "id": "item_located",
  "text": "Item located; tag/location matches punch log",
  "basis": "practice",
  "codeRef": "",
  "core": true,
  "required": true
 },
 {
  "id": "defect_cleared",
  "text": "Punched defect fully fixed, as written",
  "basis": "practice",
  "codeRef": "",
  "core": true,
  "required": true
 },
 {
  "id": "permanent_fix",
  "text": "Permanent fix, not temporary workaround",
  "basis": "practice",
  "codeRef": "",
  "core": true,
  "required": false
 },
 {
  "id": "no_new_damage",
  "text": "No new damage caused by the fix",
  "basis": "practice",
  "codeRef": "",
  "core": true,
  "required": true
 },
 {
  "id": "reinstated",
  "text": "Removed items refitted (guards, insul., tags)",
  "basis": "practice",
  "codeRef": "",
  "core": true,
  "required": false
 },
 {
  "id": "area_cleared",
  "text": "Temp materials, blinds, plugs removed",
  "basis": "practice",
  "codeRef": "",
  "core": true,
  "required": false
 },
 {
  "id": "fix_visible",
  "text": "Fix visible, not hidden by insul./paint",
  "basis": "project",
  "codeRef": "",
  "core": true,
  "required": false
 },
 {
  "id": "closure_signed",
  "text": "Construction closure sign-off present",
  "basis": "project",
  "codeRef": "",
  "core": false,
  "required": false
 },
 {
  "id": "joint_remade",
  "text": "Re-made joint: new gasket, bolts through nut",
  "basis": "code",
  "codeRef": "ASME B31.3 para 335.2.4 Gaskets; ASME B31.3 para 335.2.3 Bolt Length – acceptance wording changed between editions. B31.1: verify clause/edition (confirm project edition)",
  "core": false,
  "required": false
 },
 {
  "id": "correct_parts",
  "text": "Replacement parts match spec/rating",
  "basis": "project",
  "codeRef": "",
  "core": false,
  "required": false
 },
 {
  "id": "line_clean",
  "text": "Opened line kept clean / re-flushed",
  "basis": "project",
  "codeRef": "",
  "core": false,
  "required": false
 },
 {
  "id": "record_attached",
  "text": "Supporting record attached (torque, align, etc.)",
  "basis": "project",
  "codeRef": "",
  "core": false,
  "required": false
 },
 {
  "id": "retest_done",
  "text": "Re-test done where the fix requires it",
  "basis": "project",
  "codeRef": "ASME B31.1 / ASME B31.3 – verify clause/edition",
  "core": false,
  "required": false
 },
 {
  "id": "weld_repair_nde",
  "text": "Weld repair: NDE repeated, report attached",
  "basis": "code",
  "codeRef": "ASME B31.3 para 341.3.3 Defective Components and Workmanship (wording split into repair / replace cases since 2014). B31.1: verify clause/edition (confirm project edition)",
  "core": false,
  "required": false
 },
 {
  "id": "weld_repair_qual",
  "text": "Weld repair: welder ID and WPS on record",
  "basis": "code",
  "codeRef": "ASME Sec IX / ASME B31.1 / ASME B31.3 – verify clause/edition",
  "core": false,
  "required": false
 },
 {
  "id": "asbuilt_marked",
  "text": "As-built markup updated if config changed",
  "basis": "project",
  "codeRef": "",
  "core": false,
  "required": false
 },
 {
  "id": "photo_after",
  "text": "QC after-photo: same view, tag visible",
  "basis": "practice",
  "codeRef": "",
  "core": false,
  "required": false
 },
 {
  "id": "open_defects_punched",
  "text": "Open/new defects punched, category set",
  "basis": "project",
  "codeRef": "",
  "core": false,
  "required": false
 },
 {
  "id": "closure_recorded",
  "text": "Result recorded; required parties signed",
  "basis": "project",
  "codeRef": "",
  "core": false,
  "required": false
 }
];
export const SITE_QUESTIONS = {
 "piping_line": [
  "Which code governs each line (B31.1 or B31.3), and which edition is in the contract?",
  "Where is the current punch/NCR list for each line, and who signs closure?",
  "How is the B+ punch tier defined, and who assigns punch categories (A/B/B+/C/D)?",
  "Which test type and limit cover the line (hydro/pneumatic/initial service), is it released, and where can QC see the signed record?",
  "What NDE extent, PWHT and PMI apply to each line class or material?",
  "Are field routing changes red-lined and approved before handover?",
  "Does a separate valve/flange checklist cover valve type and flow direction, or should this line walkdown cover them?",
  "What minimum clearances to steel, other lines and cables, and what walkway headroom, does the project spec require?",
  "Which penetrations need fire-stop or watertight seals, and to which detail?",
  "What are the acceptance limits for dents, gouges and arc strikes, and what examination is required after temporary lug removal?",
  "Which lines are non-metallic or lined, and what support and UV-protection rules apply?",
  "Which supports are anchors, guides or sliding, and what guide gaps and shoe overhang are specified?",
  "Is an isolation pad required between stainless pipe and carbon-steel supports?",
  "Were temporary supports added for hydrotest, and are they listed?",
  "When are spring hanger travel stops removed (after test or before hot commissioning), and who removes them?",
  "When are expansion-joint shipping bars removed, and what limit-rod settings does the vendor give?",
  "Does the project require bracing on small-bore branches, and are threaded joints to be seal-welded?",
  "Which lines must slope, and at what minimum slope?",
  "What end closure is required on drains and vents (plug, cap or blind), and where is a double valve needed?",
  "Is there a blind/spectacle status list for handover, and who maintains it?",
  "Is there a register of temporary items (strainers, spools, removed instruments), and who signs reinstatement?",
  "Is flushing/blowing in construction or commissioning scope, and what is the acceptance?",
  "What preservation applies after test (drain, dry, N2, inhibitor), and to which lines?",
  "Which coating system, colour and DFT apply, and what insulation type, thickness and personnel protection?",
  "What is the project line marking standard (colours, flow arrows, spacing, locations)?",
  "Which chemical lines need flange spray shields, and of what type?",
  "Which lines need flange bonding or earthing jumpers (e.g. fuel gas), and where are insulating joints fitted?"
 ],
 "flanged_joint": [
  "Which code and edition applies to each system (B31.1 power piping vs B31.3 process piping), and where is the boundary between them?",
  "Which flange standards apply besides B16.5 (e.g. B16.47 above NPS 24, AWWA, EN, equipment nozzles)?",
  "What flange alignment tolerance applies (project spec vs code edition value)?",
  "What stud protrusion is acceptable on B31.1 and B31.3 lines (full engagement only, or one thread short allowed; min/max threads beyond the nut)?",
  "Are washers required (e.g. for tensioning), and of what type?",
  "Are gasket sealants or compounds allowed?",
  "What is the tightening method (torque wrench vs tensioning), where do the values come from, and is the project assembly procedure based on ASME PCC-1?",
  "Is a per-joint torque record required? Who witnesses or signs it, and must tool calibration be shown?",
  "Is a joint tag or paint mark required on tightened joints?",
  "Must temporary hydrotest gaskets/bolting be replaced before handover, and can bolts and gaskets be reused after a joint is broken?",
  "How are joints re-made after test leak-checked before commissioning, and is a reinstatement sign-off required?",
  "Is a blind/spectacle register kept, and what position is required at handover to commissioning?",
  "Which test blinds, temporary strainers or spools may remain at handover, and how are they tracked?",
  "Which joints need insulating kits, and is an isolation test required?",
  "Which services need flange spray guards?",
  "Which lines need flange bonding jumpers (e.g. fuel gas)?",
  "What is the rust acceptance for bolting: clean and protect, or replace? What bolt coating/protection is specified?",
  "Which joints, if any, need re-torque or hot torque after first heat-up, and how is that tracked?",
  "Is a pipe-strain/free-bolting check required at pump nozzles, who records it, and must it come before final alignment?",
  "Which lines are non-metallic or lined, and what maker torque limits, washers and gaskets apply?",
  "For wafer/lug butterfly valves: separate gasket or liner-as-gasket, and is a full-stroke check required before handover?",
  "Is a minimum tool/tensioner clearance specified at flanged joints?",
  "How is punch tier B+ defined, and what category do typical flange defects get (e.g. missing torque record, rusted bolts)?",
  "When construction closes a flange punch item, does QC verify it by re-inspection, witnessing or record review?"
 ],
 "valve": [
  "Which code and edition (B31.1 or B31.3) applies to each BOP system's valves?",
  "Which project document gives valve type, class and material per line class, and is a current copy available locally?",
  "Which valves need tags (all hand valves or line/instrument valves only), and what tag material and fixing are required?",
  "Which valves are LO, LC or CSO? When are locks and car seals fitted and positions set, by whom, and who owns the lock/key register at handover?",
  "Are fire water isolation valves supervised by a tamper switch or by a lock?",
  "Which B31.3 322.6.1 condition (or B31.1 rule) does the project apply to PSV block valves, and at what stage are they sealed open?",
  "Is a PSV bench test or re-test required before handover, who performs it, and in what record format?",
  "Is checking PSV set pressure against the datasheet in QC scope, or only in process/commissioning scope?",
  "Who records and signs reinstatement of PSVs and in-line valves after test or flushing?",
  "Is a torque/tightening record required for valve end joints, does it depend on line class, and who records it?",
  "Does the piping spec restrict stem orientation, operating height or chainwheel use?",
  "Under the site isolation/LOTO rules, may QC operate valves during walkdowns, and is stroke/function checking construction QC or commissioning scope?",
  "Who inspects actuator hookup (CV/XV/MOV): I&C, electrical or mechanical QC? Are MOV limit/torque settings commissioning scope?",
  "Does the project require fail-action (FO/FC) marking on control and on/off valves?",
  "Who removes actuator transport locks: construction, or the vendor representative at commissioning?",
  "What does the project require on open-ended vents and drains: plug, cap or blind flange?",
  "How does this project define punch category B+?",
  "Can an item with a category A punch be recorded OK with comments, or must it be Rejected?",
  "Which valve defects does the project grade as category A (for example a reversed check valve, a blinded or gagged PSV, or a closed PSV block valve)?"
 ],
 "pipe_support": [
  "Which code governs each BOP system's piping (B31.1 or B31.3), and which edition does the project use?",
  "Which pipe support standard does the project spec reference (MSS SP-58 is an example only, not confirmed), and which edition?",
  "Where are guide gaps, shoe offsets and stop gaps defined: the support standard detail or the stress output?",
  "When are spring/constant hanger travel stops removed, by whom, must they stay in during hydrotest/flush, and does QC witness removal?",
  "Who records spring hanger cold settings, and who signs that record off?",
  "Are there expansion joints/bellows in BOP systems, and at what stage, and by whom, are shipping bars removed?",
  "Is a hot walkdown of supports planned during commissioning, and does QC attend?",
  "Are supports numbered/tagged in the field, and in what marking format?",
  "Rack structural bolting: what method is used, is it recorded per connection or by sampling, and is torque marking required?",
  "Is rack earthing checked in this walkdown or by electrical QC?",
  "What welding standard applies to support steel welds that are not on pressure pipe?",
  "Is NDE or PWHT required on support attachment welds to pressure pipe, and is a record expected?",
  "If pipe is welded or modified after hydrotest, what retest/NDE is required and who approves it?",
  "Which lines need isolation/wear pads or continuous support (stainless, GRP/plastic, lined or coated)?",
  "Is there a project small-bore support standard, and is impulse-line support piping or instrument QC scope?",
  "Civil spec: what grout type, anchor thread projection rule, and post-installed anchor type and edge distance apply?",
  "Is the pipe-strain/free-bolting check at pump nozzles witnessed by QC, and where is it recorded?",
  "What paint/galvanising touch-up system applies to supports, and who applies it?",
  "Have temporary supports used for erection/hydrotest been logged, so their removal can be verified?",
  "Do project QC forms accept 'N/A (not fitted)' for items like springs, PTFE, bellows or pads, kept out of the OK / comments / Rejected tallies?",
  "How is 'B+' defined on this project, and how are support defects graded between A, B, B+, C and D?",
  "Who owns support walkdown punch items before handover: piping, civil/structural or stress?"
 ],
 "rotating": [
  "Which piping code governs each system at the pumps: B31.1 or B31.3? Which editions?",
  "Does the project spec invoke API RP 686 for machinery installation (grout, anchors, alignment, pipe strain)? Which edition (2009 2nd ed. reported superseded in 2024 - confirm)?",
  "Which pump standard applies to BOP pumps (API 610, ISO 5199, ASME B73 or vendor standard)? Does API 682 apply to seals?",
  "Are fire pumps covered here or by a separate fire-protection checklist? Governing standard and edition (e.g. NFPA 20 - verify applicability/edition)?",
  "Alignment method and tolerances: vendor manual or project spec? Is a final alignment after piping bolt-up required?",
  "Is a pipe-strain check (dial indicators during flange bolt-up) required? Who witnesses it (QC, vendor, client)?",
  "Nozzle flange alignment tolerance at machines: vendor or spec value?",
  "Spring stops and expansion-joint rods/shipping bars: set, removed or released at handover?",
  "Grout type, void acceptance criteria and levelling/jack-screw treatment after grouting, per spec? Is tap testing allowed?",
  "Shim material/max count and dowelling of pump and motor feet: per vendor or spec?",
  "Anchor bolt torque values: is a torque record required for handover?",
  "Who removes transit locks and seal setting clips (construction, vendor or commissioning), and when?",
  "Is first oil fill construction scope? If not, how is 'not filled yet' recorded?",
  "Is the coupling left open for solo run? Who reconnects it and re-checks alignment?",
  "Preservation procedure and interval for installed rotating equipment awaiting commissioning?",
  "Are temporary start-up strainers required, and who keeps the blind and strainer registers?",
  "Which skids or items need vendor installation sign-off before handover?",
  "After handover to commissioning, may QC open guards or covers? Who issues PTW?",
  "Hazardous area classification for fuel-gas and chemical areas: are Ex motors, Ex glands and non-sparking guards required?",
  "Are motor terminations, earthing and local stop stations signed off by electrical QC, with mechanical QC observing only?",
  "Is the motor solo-run/rotation record part of the mechanical completion package or of commissioning?",
  "Who signs off sump/wet-pit cleanliness before first fill?",
  "Are PSV test certificates and belt-tension records required for compressor/fan handover?",
  "Which dosing skids are vendor packages?",
  "How is the B+ punch category defined on this project, and which rotating-equipment defects go there?",
  "Which punch category is used for a missing coupling guard on equipment not yet energised?"
 ],
 "tank_vessel": [
  "What design or construction code is each tank, vessel and skid vessel built to (API 650, ASME VIII Div 1, vendor, EN, GRP/HDPE standard), and which project edition applies?",
  "How is the 'B+' punch category defined on this project, and who assigns it?",
  "What bund lining type is required, and must the bund drain valve be locked closed?",
  "Is each tank or vessel anchored per design, what anchor nut locking applies, and which saddles slide with what nut setting (snug, gap, double nut)?",
  "Is a tank bottom-edge sealant or a specific grout type specified?",
  "How many earth points per item, is a continuity or resistance record required, and is cathodic protection fitted on any tank bottom (test points part of this walkdown)?",
  "Which paint system and colour code apply, which items are insulated and for what purpose, and is a DFT or holiday-test record required (internal linings especially)?",
  "Which tanks are GRP, HDPE or lined steel, and to what design standard?",
  "For non-API 650 vessels and skids, which code governs the nameplate or stamping, and is a code stamp required?",
  "Which labelling and hazard-sign standard applies (client, local regulation or other)?",
  "Do lifting lugs and trunnions stay per design, is NDE required where temporary attachments were removed, and which shipping restraints does the vendor mark for removal?",
  "Is the piping at tank and vessel nozzles B31.1 or B31.3, and does the project spec require full bolt thread projection past the nut?",
  "Which gasket applies per piping class, which joints need a torque record, and do torque values come from the spec or the vendor?",
  "Are flange spray guards required on chemical tank joints, and on which services?",
  "Are flexible connectors or bellows specified at any tank nozzle?",
  "Which nozzles are spare and how are they closed, and what preservation (N2 blanket, desiccant, drained and dried) is required until commissioning?",
  "Where should each overflow terminate (drain, bund or seal pot), and how is each drain and vent end closed per design?",
  "Is a QC or client witness hold point required before any manway box-up, and which internals are specified?",
  "Which level, pressure and temperature devices are specified, and is a loop-check or gauge calibration record needed at handover?",
  "Which access and fall-protection standard governs on site, and what handrail height, toe board and ladder gate type are required?",
  "Which tanks need a PVRV, flame arrestor, desiccant breather, CO2 absorber or N2 blanket instead of an open vent, and are device certificates part of handover?",
  "Is a PSV set-test certificate required at handover, how recent must it be, and must PSV isolation valves be car-sealed open?",
  "What does the tank or vessel handover dossier contain (hydrotest, settlement survey, NDE, MDR/certification, PSV cert, coating, box-up, torque records)?",
  "Does any fuel or hydrocarbon tank have fixed fire protection (foam or cooling ring), and is it part of this walkdown?",
  "Is a calibration (strapping) certificate required for any tank?"
 ],
 "instrument_hookup": [
  "Which editions of ASME B31.1, B31.3, B16.5, Sec V, Sec IX and API 650 are contracted for this project?",
  "Which code (B31.1 or B31.3) governs instrument piping on each BOP system, and where is the process/instrument code break?",
  "Is instrument hookup and cable sign-off mechanical QC, E&I QC, or joint?",
  "On handed-over or energised systems, may QC operate valves or open JBs, and under which permit?",
  "Which hookup revision is current for walkdown, and where is the controlled copy kept?",
  "What tube material and OD/wall are approved, which fitting make, and is mixing fitting makes prohibited?",
  "Which fitting maker's make-up/remake instructions apply, and is a gap-gauge check recorded?",
  "Required impulse line slope per service (liquid, gas, steam)?",
  "What is the max support spacing for tubing and for cable, and what isolator rule applies for SS tubing on CS supports?",
  "Which taps require bracing, and what bracing method is approved?",
  "Are threaded instrument connections seal-welded, and on which services?",
  "Are welded attachments to pipe allowed after the pressure test, and is a retest needed?",
  "Are orifice plates, meters and TEs fitted before or after flushing?",
  "Is there a register of instruments removed for flushing/hydro?",
  "Are hookups leak-tested with the process line or separately? With what medium/pressure? Are instruments isolated or removed during the test?",
  "What is the tag plate standard (material, fixing method, wording)?",
  "Are sunshades/protective covers required for field transmitters?",
  "Which services need a siphon, snubber or gauge guard?",
  "Which impulse lines need insulation, personnel protection or heat tracing?",
  "Is the actuator air supply hookup (AFR, tubing) covered by this family or the valve family? Was the IA header blown clean before hookup?",
  "Is PSV/TSV inspection in this family or the valve family, and must PSV isolations be car-sealed or locked open?",
  "What cable gland type and IP/Ex rating apply per area, and which stopping plugs are approved for spare entries?",
  "Which BOP areas are hazardous-area classified, under which scheme (zone or class/division), and who performs Ex inspection?",
  "What instrument earthing scheme applies (PE vs IS/clean earth), at which end is the screen earthed, and what is the tray bonding rule?",
  "What is the cable bend radius basis, the tray cover requirement and the IS/non-IS segregation rule?",
  "Are JB internals (terminations, ferrules) and calibration/loop check in QC scope or commissioning scope?",
  "Who signs punch closure (Construction or QC), and is a closure photo required?",
  "How is punch category B+ defined on this project?",
  "Are any hookup defects pre-agreed as Cat A (e.g. HP/LP reversed, root valve missing, open vent on hazardous service)?"
 ],
 "general_area": [
  "How is punch category B+ defined on this project?",
  "Who may assign punch category B+?",
  "Does B+ also block handover?",
  "What punch category applies to leftover temporary items and housekeeping?",
  "Which general-area items (lighting, earthing, signage, fire water, showers, lifting gear) are in mechanical QC scope?",
  "Is this area hazardous-area classified?",
  "Is a test-blind register kept per system?",
  "Does QC sign off each test-blind removal?",
  "Where are required spade/spectacle positions listed?",
  "Which scaffolds may stay for commissioning?",
  "Which standard governs safety showers/eyewash?",
  "Is tempered or shaded supply specified for showers?",
  "Is a shower flow-test record needed before handover?",
  "Which fire code governs fire water here?",
  "Which lifting appliances need a load-test cert before handover?",
  "Who issues lifting-appliance load-test certs?",
  "Which equipment tagging spec applies?",
  "Which pipe marking/colour-code spec applies?",
  "Which safety signage spec and languages apply?",
  "Which paint touch-up system applies?",
  "What DFT acceptance applies to paint touch-up?",
  "May insulation be punched at handover?",
  "What are the insulation acceptance criteria?",
  "Which hot lines/surfaces need personnel protection?",
  "Is personnel protection by guard or by insulation?",
  "Is permanent lighting energised in this area?",
  "Is an emergency-light test record needed before handover?",
  "Is a lux survey needed before handover?",
  "Who owns preservation after handover?",
  "Which preservation procedure applies after handover?",
  "What is the normal position of bund drain valves?",
  "How are system handover limits marked on site?",
  "Who fits system boundary tags?",
  "Which record types are mandatory in the system handover dossier?",
  "Which role signs punch closure?",
  "Is a closure photo required as punch evidence?"
 ],
 "punch_closure": [
  "Which code editions apply (B31.1, B31.3, B16.5, Sec V, Sec IX, API 650), and is each line B31.1 or B31.3?",
  "What is the B+ category definition, and how does it differ from B?",
  "Who may change a punch category, and how is a change recorded?",
  "What evidence must construction attach before requesting QC closure (form, photos, records)?",
  "Which punch categories need client or commissioning witness at closure?",
  "For systems already under commissioning control, what permit/LOTO is needed before QC re-inspects?",
  "If QC cannot access an item, is the closure rejected or left pending?",
  "When does rework invalidate a completed pressure/leak or functional test, and who decides on re-test?",
  "Who may operate valves or equipment for a re-test under commissioning control?",
  "Does the project require a repair WPS/approval, and does it limit the number of weld repair attempts?",
  "For a repaired weld, was the original NDE 100% or spot, and must extra (progressive) exams be done?",
  "Is a QC hold point required before insulating or painting over a repair?",
  "If a flushed/blown or cleaned line is opened for rework, is re-flush required?",
  "Is gasket reuse ever allowed, and must bolting be replaced on re-make?",
  "Must torque records show the calibrated tool ID?",
  "Is a before-photo always on file from when the punch was raised, or must QC take one?",
  "Can a punch be closed OK with comments, or must residual defects stay open or be raised as new punch?",
  "If QC rejects a closure, is the same punch re-opened or a new punch raised?",
  "Are new defects found during verification raised as new punch items or added to the existing one?",
  "Is there a target closure date or milestone per category that QC must track?",
  "How are QC verifications logged: electronic punch system, paper sheet, or both?"
 ]
};
export const GENERAL_DEFECTS = ["Housekeeping not done", "Temporary material not removed", "Tag / label missing", "Paint damaged", "Insulation damaged", "Support missing", "Bolt not fully through nut", "Bolts rusted", "Torque not recorded", "Drain / vent missing", "Guard missing", "Earthing missing"];
