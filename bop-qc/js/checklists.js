// Checklist library. Generated from the research workflow; plain data, safe to edit.
// basis: code = general code requirement (generic edition) | practice = common field QC practice (inferred)
//        project = acceptance depends on project documents -> value unknown, ask on site
// codeRef: a clause is cited only when an adversarial check confirmed it; otherwise "verify clause/edition".
// Sources per type: {"piping_line": "draft", "flanged_joint": "draft", "valve": "draft", "pipe_support": "draft", "rotating": "draft", "tank_vessel": "draft", "instrument_hookup": "draft", "general_area": "draft"}
export const CHECKLIST_VERSION = "2026-10-14 draft (citations pending check)";
export const TYPES = [
 {
  "key": "piping_line",
  "label": "Piping line",
  "checks": [
   {
    "id": "leak_test_record",
    "group": "Records (pre-walk)",
    "text": "Leak test done, record signed",
    "basis": "code",
    "codeRef": "ASME B31.3 / ASME B31.1 – verify clause/edition",
    "defects": [
     "Test record not available",
     "Test record not signed",
     "Line outside test limits",
     "Modified after test, no retest",
     "Joints insulated before test"
    ],
    "ask": "Which test limit covers this line, and is it released?"
   },
   {
    "id": "weld_nde_record",
    "group": "Records (pre-walk)",
    "text": "Weld/NDE records complete, no open repairs",
    "basis": "code",
    "codeRef": "ASME B31.3 / ASME B31.1 / ASME Sec V / ASME Sec IX – verify clause/edition",
    "defects": [
     "NDE result pending",
     "Repair not re-examined",
     "Weld log incomplete",
     "Welder ID not traceable",
     "PWHT record missing"
    ],
    "ask": "What NDE extent and PWHT (if any) apply to this line class?"
   },
   {
    "id": "flush_record",
    "group": "Records (pre-walk)",
    "text": "Flushing/cleaning record available",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Flushing not recorded",
     "Not in flushing scope",
     "Debris at low point",
     "Temp flushing spool left"
    ],
    "ask": "Is flushing/blowing done by construction or commissioning, and what is the acceptance?"
   },
   {
    "id": "routing",
    "group": "Routing & condition",
    "text": "Routing per latest approved drawing",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Routing deviates from drawing",
     "Field change not marked up",
     "Valve not accessible",
     "Inline item reversed"
    ],
    "ask": "Are field changes red-lined and approved before handover?"
   },
   {
    "id": "clearances",
    "group": "Routing & condition",
    "text": "Clear of steel, cables and other lines",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "Pipe touching steel",
     "Pipe touching other line",
     "Hot line close to cables",
     "No space for insulation",
     "Blocks access/walkway"
    ],
    "ask": "What minimum clearances does the project spec require?"
   },
   {
    "id": "slope_pockets",
    "group": "Routing & condition",
    "text": "Slope toward drains, no pockets",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Slope reversed",
     "Undrained low point",
     "Pocket in line",
     "Sagging between supports"
    ],
    "ask": "Which lines must slope, and at what slope?"
   },
   {
    "id": "pipe_surface",
    "group": "Routing & condition",
    "text": "Pipe free of dents, arc strikes, lugs",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "Dent on pipe",
     "Arc strike",
     "Temp lug not removed",
     "Gouge/grind mark",
     "Mechanical damage"
    ],
    "ask": "What are the acceptance limits for dents, gouges and arc strikes?"
   },
   {
    "id": "supports_installed",
    "group": "Supports",
    "text": "All supports installed, type as drawn",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Support missing",
     "Wrong support type",
     "Support not welded/bolted",
     "U-bolt/clamp loose",
     "Pad/shim missing"
    ],
    "ask": "Is the support drawing set on site the latest revision?"
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
    "ask": ""
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
    "text": "Spring hangers: stops and setting checked",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Travel stop still fitted",
     "Stop removed too early",
     "Indicator off cold setting",
     "Nameplate missing",
     "Rod/turnbuckle loose"
    ],
    "ask": "When are travel stops removed (after test or before hot commissioning), and by whom?"
   },
   {
    "id": "small_bore",
    "group": "Supports",
    "text": "Small-bore branches braced/supported",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "Small-bore unsupported",
     "Branch vibrating",
     "Bracing missing",
     "Gusset missing"
    ],
    "ask": "Does the project spec require bracing on small-bore branches?"
   },
   {
    "id": "drains_vents",
    "group": "Drains & vents",
    "text": "Drains/vents fitted, valved and capped",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Drain missing",
     "Vent missing",
     "Plug/cap missing",
     "Drain valve not accessible",
     "Discharge not to safe point"
    ],
    "ask": "Which end closure is required: plug, cap or blind?"
   },
   {
    "id": "test_blinds_removed",
    "group": "Temporary items",
    "text": "Test blinds and temp items removed",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "Test blind not removed",
     "Spectacle in wrong position",
     "Temp gasket left in",
     "Debris/scaffold left on line",
     "Open end not capped"
    ],
    "ask": "Is there a register of blinds and temporary items to close against?"
   },
   {
    "id": "reinstatement",
    "group": "Temporary items",
    "text": "Items removed for test reinstated",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "Temp spool still fitted",
     "Instrument not reinstated",
     "PSV not reinstated",
     "Orifice plate missing",
     "Temp gasket not replaced"
    ],
    "ask": "Who signs reinstatement: construction, QC or commissioning?"
   },
   {
    "id": "paint",
    "group": "Finish & marking",
    "text": "Paint complete, damage touched up",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Paint damaged",
     "Weld area not painted",
     "Rust at support contact",
     "Touch-up missing",
     "Wrong colour/system"
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
     "Insulation missing",
     "Cladding not sealed",
     "Cladding damaged",
     "Personnel protection missing",
     "Removable box missing"
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
    "text": "Flanges aligned, even gap, no forced fit",
    "basis": "code",
    "codeRef": "ASME B31.3 / ASME B31.1 – verify clause/edition",
    "defects": [
     "Flanges misaligned",
     "Uneven gap around flange",
     "Bolt holes offset",
     "Joint pulled into line"
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
    "id": "gasket_type",
    "group": "Gasket",
    "text": "Gasket type/material per line class",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Wrong gasket type",
     "Gasket not identifiable",
     "Inner ring missing (if spec)",
     "Gasket rating not marked"
    ],
    "ask": "Which gasket type, material and inner/outer rings does each line class require?"
   },
   {
    "id": "single_gasket",
    "group": "Gasket",
    "text": "One gasket only, centred, undamaged",
    "basis": "code",
    "codeRef": "ASME B31.3 / ASME B31.1 – verify clause/edition",
    "defects": [
     "Double gasket fitted",
     "Gasket off-centre",
     "Gasket protrudes into bore",
     "Gasket damaged/crushed",
     "Sealant on gasket (check spec)"
    ],
    "ask": ""
   },
   {
    "id": "bolts_complete",
    "group": "Bolting",
    "text": "All holes bolted, correct stud size",
    "basis": "code",
    "codeRef": "ASME B16.5 – verify clause/edition",
    "defects": [
     "Bolt missing",
     "Nut missing",
     "Undersize stud",
     "Mixed stud sizes"
    ],
    "ask": ""
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
    "codeRef": "ASME B31.3 / ASME B31.1 – verify clause/edition",
    "defects": [
     "Bolt not fully through nut",
     "Excess stud projection",
     "Uneven projection both sides",
     "Stud too short - replace"
    ],
    "ask": "Under the project edition/spec, is full engagement required or is one thread short allowed? Is there a min/max stud protrusion?"
   },
   {
    "id": "nuts_washers",
    "group": "Bolting",
    "text": "Nuts seated flat; washers as specified",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Nut not seated flat",
     "Washer missing",
     "Wrong washer type",
     "Nut type not per spec"
    ],
    "ask": "Are washers required, and of what type (e.g. for tensioning or insulating kits)?"
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
     "Nut corners rounded"
    ],
    "ask": "What is the rust acceptance (clean or replace), and what bolt protection is required (coating/grease/caps)?"
   },
   {
    "id": "tightened_marked",
    "group": "Bolting",
    "text": "Joint tightened and marked/tagged",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "Bolts hand-tight only",
     "Loose bolt found",
     "No torque mark",
     "Joint tag missing"
    ],
    "ask": "Does the project require a paint mark or tag on tightened joints?"
   },
   {
    "id": "test_blinds_removed",
    "group": "Blinds & spacers",
    "text": "Test blinds and temp gaskets removed",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "Test blind left in",
     "Temp gasket not replaced",
     "Temporary bolting left",
     "Blind removal not recorded"
    ],
    "ask": "Must hydrotest gaskets and bolting be replaced with permanent ones, and is blind removal tracked in a register?"
   },
   {
    "id": "spectacle_position",
    "group": "Blinds & spacers",
    "text": "Spectacle/spade in required position",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Spectacle in wrong position",
     "Blind not tagged",
     "Spacer missing with paddle",
     "No room to swing blind",
     "Blind rating not marked"
    ],
    "ask": "What open/closed position is required at handover, and who controls blind position after handover?"
   },
   {
    "id": "insulating_kit",
    "group": "Fittings & finish",
    "text": "Insulating kit fitted where specified",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Insulating kit missing",
     "Sleeve/washer damaged",
     "Kit bridged by metal/paint",
     "Isolation not tested"
    ],
    "ask": "Which joints need insulating kits, and is an isolation test required?"
   },
   {
    "id": "spray_guard",
    "group": "Fittings & finish",
    "text": "Spray guard fitted where specified",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Spray guard missing",
     "Guard damaged",
     "Wrong guard type",
     "Guard not secured"
    ],
    "ask": "Which services or lines need flange spray guards?"
   },
   {
    "id": "bonding_jumper",
    "group": "Fittings & finish",
    "text": "Bonding jumper fitted where specified",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Bonding jumper missing",
     "Jumper loose",
     "Jumper corroded"
    ],
    "ask": "Are flange bonding jumpers required, and on which lines (e.g. fuel gas)?"
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
     "Gasket extruding"
    ],
    "ask": ""
   },
   {
    "id": "torque_record",
    "group": "Records",
    "text": "Torque/tension record available",
    "basis": "project",
    "codeRef": "ASME PCC-1 – verify clause/edition",
    "defects": [
     "Torque not recorded",
     "Joint not on record",
     "Record unsigned",
     "Value not per procedure",
     "Tool calibration not shown"
    ],
    "ask": "Is a per-joint torque/tension record required? Which method and value source apply, and who signs (subcontractor/QC)?"
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
    "text": "Valve tag fitted, legible, matches line",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "Tag missing",
     "Tag illegible",
     "Tag differs from P&ID",
     "Temporary tag only",
     "Tag loose"
    ],
    "ask": "Which tag type, material and fixing does the project spec require, and must all hand valves be tagged?"
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
    "ask": "What valve type, pressure class and material does the line class / valve spec require for this line? Check the local copy."
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
     "Flow direction unclear"
    ],
    "ask": "Is this valve unidirectional (datasheet), and what flow direction does the local P&ID show?"
   },
   {
    "id": "check_orient",
    "group": "Orientation",
    "text": "Check valve orientation per maker's IOM",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Swing check in down-flow",
     "Hinge pin not horizontal",
     "Orientation not per IOM",
     "Cover access blocked"
    ],
    "ask": "Which mounting orientations does the manufacturer's IOM allow for this check valve type?"
   },
   {
    "id": "stem_orient",
    "group": "Orientation",
    "text": "Stem/actuator orientation as per layout",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Stem below horizontal",
     "Actuator rotated wrong",
     "Stem clashes with steel",
     "Not per piping layout"
    ],
    "ask": "Does the project piping spec restrict stem orientation (for example, not below horizontal)?"
   },
   {
    "id": "operator_access",
    "group": "Operation & access",
    "text": "Handwheel/lever fitted, reachable, clear",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "Handwheel/lever missing",
     "Not reachable from platform",
     "Clash with adjacent item",
     "Chainwheel or chain missing",
     "Position indicator missing"
    ],
    "ask": "What maximum operating height, and what chainwheel or extension-spindle criteria, does the project spec set?"
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
    "id": "end_bolting",
    "group": "Body & ends",
    "text": "End flange bolts through nuts; torque record",
    "basis": "code",
    "codeRef": "ASME B31.3 / ASME B31.1 – verify clause/edition",
    "defects": [
     "Bolt not fully through nut",
     "Bolts rusted",
     "Bolt/nut missing",
     "Torque not recorded",
     "Mixed bolt grades"
    ],
    "ask": "Is a torque or tightening record required for valve end joints on this line class, and who holds it?"
   },
   {
    "id": "vent_drain_plug",
    "group": "Body & ends",
    "text": "Open-end vent/drain valves plugged/capped",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Plug/cap missing",
     "Plastic shipping plug left",
     "Valve left open",
     "Blind flange missing"
    ],
    "ask": "What does the project require on open-ended vents and drains: plug, cap or blind flange?"
   },
   {
    "id": "finish",
    "group": "Body & ends",
    "text": "Paint/insulation done; plate and gland clear",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Paint damaged/missing",
     "Rust on body",
     "Insulation covers nameplate",
     "Gland insulated over",
     "Removable box missing"
    ],
    "ask": "Does the paint/insulation spec require valves on this line to be insulated, and if so, are removable boxes or jackets required?"
   },
   {
    "id": "locks",
    "group": "Locking",
    "text": "LO/LC lock or car seal fitted as required",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Lock missing",
     "Car seal missing/broken",
     "Valve in wrong position",
     "Lock tag missing",
     "Not in lock register"
    ],
    "ask": "Which valves are LO, LC or CSO on the P&ID, and who keeps the lock/key register: construction or commissioning?"
   },
   {
    "id": "cv_hookup",
    "group": "Control valves",
    "text": "Actuator air, tubing, cable, earth hooked up",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "Air supply not connected",
     "Tubing unsupported",
     "Cable gland not sealed",
     "Positioner cover missing",
     "Fail action not marked"
    ],
    "ask": "Is control valve hookup inspected by I&C QC or mechanical QC, and is the fail position (FO/FC) taken from the instrument datasheet?"
   },
   {
    "id": "cv_transport",
    "group": "Control valves",
    "text": "Transport locks/brackets removed from actuator",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "Transport lock not removed",
     "Shipping bracket still fitted",
     "Vent/breather plug left in",
     "Protective cap left on"
    ],
    "ask": "Does construction remove transport locks, or does the vendor representative do it at commissioning?"
   },
   {
    "id": "cv_station",
    "group": "Control valves",
    "text": "CV block/bypass/drain valves fitted",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Block valve missing",
     "Bypass valve missing",
     "Drain valve missing",
     "Actuator support missing"
    ],
    "ask": "Does the local P&ID show a block/bypass/drain arrangement for this CV, and does it need an actuator support?"
   },
   {
    "id": "psv_plate",
    "group": "Relief valves (observe only)",
    "text": "Set-pressure plate legible; seal intact",
    "basis": "code",
    "codeRef": "verify clause/edition",
    "defects": [
     "Nameplate missing",
     "Set pressure illegible",
     "Plate painted over",
     "Seal wire broken/missing",
     "Set value to verify vs datasheet"
    ],
    "ask": "What set pressure does the PSV datasheet specify? Compare locally and record only the value you observe."
   },
   {
    "id": "psv_record",
    "group": "Relief valves (observe only)",
    "text": "PSV bench-test/set record available",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Test record not available",
     "Test tag missing",
     "Test date not on tag",
     "Tag no. not on record"
    ],
    "ask": "Is a PSV bench test or re-test required before handover, who performs it, and where is the record held?"
   },
   {
    "id": "psv_isolation",
    "group": "Relief valves (observe only)",
    "text": "PSV inlet/outlet blocks locked/sealed open",
    "basis": "code",
    "codeRef": "ASME B31.3 / ASME B31.1 – verify clause/edition",
    "defects": [
     "Block valve not locked open",
     "Car seal missing",
     "Block valve closed",
     "Spare PSV blocks not secured"
    ],
    "ask": "Which PSV block valves are CSO/LO on the P&ID, and are mechanical interlocks used?"
   },
   {
    "id": "psv_discharge",
    "group": "Relief valves (observe only)",
    "text": "Discharge routing noted (observe only)",
    "basis": "project",
    "codeRef": "ASME B31.3 / ASME B31.1 – verify clause/edition",
    "defects": [
     "Outlet faces walkway",
     "Discharge unsupported",
     "No drain at low point",
     "Outlet blinded or capped",
     "Rain cap missing"
    ],
    "ask": "Does the design route discharge to atmosphere or to a closed header, and who reviews routing concerns: design or process?"
   }
  ]
 },
 {
  "key": "pipe_support",
  "label": "Supports & pipe rack",
  "checks": [
   {
    "id": "rack_base",
    "group": "Rack structure",
    "text": "Base plates grouted, anchor nuts tight",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "Grout missing",
     "Grout cracked / voids",
     "Anchor nut loose",
     "Bolt not fully through nut",
     "Anchor bolts rusted"
    ],
    "ask": "Civil spec: grout type, and are double nuts or a minimum thread projection required?"
   },
   {
    "id": "rack_steel",
    "group": "Rack structure",
    "text": "Rack steel & bracing complete, bolts tight",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Bracing missing",
     "Bolts missing",
     "Bolt not fully through nut",
     "Torque mark missing",
     "Member bent / damaged"
    ],
    "ask": "Structural bolt tightening method, and is a torque/tension record required?"
   },
   {
    "id": "sup_location",
    "group": "Support type & location",
    "text": "Support type & location as per drawing",
    "basis": "project",
    "codeRef": "ASME B31.3 / ASME B31.1 – verify clause/edition",
    "defects": [
     "Support missing",
     "Wrong support type",
     "Support mislocated",
     "Extra support not on drawing",
     "Support number not marked"
    ],
    "ask": "Is the walkdown being done against the latest approved support drawing revision?"
   },
   {
    "id": "sup_bearing",
    "group": "Support type & location",
    "text": "Pipe bearing on support, no lift-off",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "Pipe not bearing on support",
     "Gap under shoe",
     "Unapproved packing / shim",
     "Support bent / overloaded"
    ],
    "ask": "Are any supports designed with an intentional cold gap (e.g. on thermal lines)?"
   },
   {
    "id": "shoe_position",
    "group": "Shoes, guides & stops",
    "text": "Shoe centred, enough length for movement",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Shoe off-centre",
     "Shoe near beam edge",
     "Shoe not attached to pipe",
     "Shoe too low for insulation"
    ],
    "ask": "Are shoes cold-offset for thermal growth, and what offset is specified?"
   },
   {
    "id": "guides",
    "group": "Shoes, guides & stops",
    "text": "Guides fitted, gap as per detail",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Guide missing",
     "Guide gap wrong",
     "Guide welded to shoe",
     "Guide too short for travel"
    ],
    "ask": "What guide gap does the support detail specify?"
   },
   {
    "id": "anchors_stops",
    "group": "Shoes, guides & stops",
    "text": "Anchors & line stops fixed as detailed",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Anchor not welded",
     "Stop missing",
     "Stop on wrong side",
     "Stop gap wrong",
     "Anchor bolts loose"
    ],
    "ask": "What stop gap and anchor weld/bolt details does the support detail specify?"
   },
   {
    "id": "slide_ptfe",
    "group": "Shoes, guides & stops",
    "text": "Slide plate/PTFE intact, clean, can slide",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "PTFE pad missing",
     "PTFE damaged / displaced",
     "Paint / spatter on slide face",
     "Slide tack-welded solid",
     "Slide plate misaligned"
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
     "Clash with steel",
     "Clash with cable tray",
     "Touching adjacent pipe",
     "Insulation fouling support",
     "Debris blocking slide"
    ],
    "ask": "Which lines run hot, and in which direction should they move?"
   },
   {
    "id": "clamps_ubolts",
    "group": "Clamps & pads",
    "text": "U-bolts/clamps fitted, nuts tight, locked",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "U-bolt missing",
     "Nut loose",
     "Lock nut missing",
     "U-bolt tight on guided line",
     "Bolt not fully through nut"
    ],
    "ask": "Should each U-bolt be snug (hold-down) or have a gap (guide)? Are double nuts required?"
   },
   {
    "id": "isolation_pads",
    "group": "Clamps & pads",
    "text": "Isolation/wear pads fitted where specified",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Isolation pad missing",
     "Pad damaged / displaced",
     "SS in contact with CS",
     "Wear pad not fitted"
    ],
    "ask": "Which lines need isolation or wear pads (stainless, GRP/plastic, lined, coated)?"
   },
   {
    "id": "spring_stops",
    "group": "Spring & constant hangers",
    "text": "Travel stop / locking pin status noted",
    "basis": "project",
    "codeRef": "ASME B31.1 / ASME B31.3 – verify clause/edition",
    "defects": [
     "Travel stop still fitted",
     "Stop removed too early",
     "Locking pin missing",
     "Stop status not tagged"
    ],
    "ask": "At what stage are travel stops removed, by whom, and is a QC witness required?"
   },
   {
    "id": "spring_cold",
    "group": "Spring & constant hangers",
    "text": "Cold load indicator at set mark (observe)",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Indicator off cold mark",
     "Spring at end of travel",
     "Cold mark not marked",
     "Nameplate unreadable"
    ],
    "ask": "What cold load/travel does the hanger schedule give, and who records the setting?"
   },
   {
    "id": "spring_hardware",
    "group": "Spring & constant hangers",
    "text": "Hanger rods plumb, lock nuts, threads engaged",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "Lock nut missing",
     "Turnbuckle not engaged",
     "Rod bent",
     "Rod out of plumb",
     "Hanger tag missing"
    ],
    "ask": "What rod angle or cold offset of hanger rods is allowed?"
   },
   {
    "id": "attach_welds",
    "group": "Welding",
    "text": "Support welds complete, no visible defects",
    "basis": "code",
    "codeRef": "ASME B31.1 / ASME B31.3 / ASME Sec IX – verify clause/edition",
    "defects": [
     "Weld incomplete",
     "Undercut on pipe",
     "Arc strike on pipe",
     "Weld spatter",
     "Weld not painted"
    ],
    "ask": "Do attachment welds to pressure pipe need NDE or PWHT under the project spec?"
   },
   {
    "id": "temp_removed",
    "group": "Temporary items",
    "text": "Temporary supports, wedges & lugs removed",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "Temporary support left",
     "Wooden block under pipe",
     "Temp lug not removed",
     "Lug area not ground / repaired",
     "Pipe tied to scaffold"
    ],
    "ask": ""
   },
   {
    "id": "paint_finish",
    "group": "Finish",
    "text": "Paint/galvanising touched up at supports",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Paint damaged",
     "No touch-up after welding",
     "Rust at support",
     "Galvanising damaged",
     "Coating missing under shoe"
    ],
    "ask": "Which touch-up system applies to painted support steel and to galvanised steel?"
   },
   {
    "id": "records",
    "group": "Records",
    "text": "Support walkdown & spring set records available",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "Record not available",
     "Record not signed",
     "Spring setting not recorded",
     "Torque not recorded",
     "Open punch not closed"
    ],
    "ask": "Which support records are required in the handover dossier?"
   }
  ]
 },
 {
  "key": "rotating",
  "label": "Pump / rotating equip.",
  "checks": [
   {
    "id": "tag_nameplate",
    "group": "Identification",
    "text": "Tag fitted; nameplate matches datasheet",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Tag missing",
     "Nameplate illegible/painted over",
     "Nameplate differs from datasheet",
     "Motor nameplate differs"
    ],
    "ask": "Is the current-revision datasheet (pump and motor) on site to compare?"
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
    "id": "grout",
    "group": "Foundation",
    "text": "Grout complete, no cracks, voids or gaps",
    "basis": "practice",
    "codeRef": "verify clause/edition",
    "defects": [
     "Grout cracked",
     "Voids under baseplate",
     "Grout edge not finished",
     "Jack screws not backed off",
     "Grout record missing"
    ],
    "ask": "Grout type, void acceptance and jack-screw treatment per project spec?"
   },
   {
    "id": "pipe_strain",
    "group": "Piping at nozzles",
    "text": "No pipe strain at nozzles; pipe supported",
    "basis": "practice",
    "codeRef": "ASME B31.3 / ASME B31.1 – verify clause/edition",
    "defects": [
     "Flange misaligned at nozzle",
     "Pipe forced into nozzle",
     "Support missing near pump",
     "Temporary support left in place",
     "Pipe weight on nozzle"
    ],
    "ask": "Is a pipe-strain check (dial indicators at coupling during bolt-up) required and recorded?"
   },
   {
    "id": "temp_strainer",
    "group": "Piping at nozzles",
    "text": "Temp suction strainer logged and flagged",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Temp strainer not in register",
     "Strainer flag/tab missing",
     "Strainer installed backwards",
     "Strainer missing where required"
    ],
    "ask": "Is a temporary start-up strainer required here, and who keeps the register?"
   },
   {
    "id": "seal_plan",
    "group": "Seal and drains",
    "text": "Seal plan piping complete and supported",
    "basis": "project",
    "codeRef": "API 682 – verify clause/edition",
    "defects": [
     "Seal flush line missing",
     "Seal pot/level gauge missing",
     "Orifice missing or untagged",
     "Seal tubing unsupported",
     "Seal plan differs from datasheet"
    ],
    "ask": "Which seal plan (if any) applies to this pump per datasheet?"
   },
   {
    "id": "drains_vents",
    "group": "Seal and drains",
    "text": "Casing/baseplate drains and vents fitted",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "Casing drain plug missing",
     "Drain not piped to hub",
     "Baseplate drain blocked",
     "Vent valve/plug missing",
     "Drain piping unsupported"
    ],
    "ask": "Are casing/baseplate drains to be piped to a drain hub per design?"
   },
   {
    "id": "coupling_guard",
    "group": "Coupling and rotation",
    "text": "Coupling guard fitted, all fasteners in",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "Coupling guard missing",
     "Guard bolts missing/loose",
     "Guard touching coupling",
     "Guard off - not logged",
     "Guard damaged"
    ],
    "ask": "Is the guard off on purpose (alignment or solo run), and is that tracked?"
   },
   {
    "id": "rotation_arrow",
    "group": "Coupling and rotation",
    "text": "Rotation arrows fitted (pump and driver)",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "Rotation arrow missing",
     "Pump/motor arrows disagree",
     "Arrow painted over",
     "Rotation not verified"
    ],
    "ask": "Has motor rotation been checked (solo run), and is the record available?"
   },
   {
    "id": "transit_locks",
    "group": "Coupling and rotation",
    "text": "Transit locks/shipping brackets removed",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "Transit lock still fitted",
     "AV mount bolts not released",
     "Motor shaft lock not removed",
     "Shipping bracket left on skid"
    ],
    "ask": "Who removes transit locks (construction or vendor), and at what stage?"
   },
   {
    "id": "lubrication",
    "group": "Lubrication",
    "text": "Lube level visible, grade per schedule",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Oil level low/not visible",
     "Oiler missing/broken",
     "Oil contaminated/water",
     "Lube grade not identified",
     "Breather/fill plug missing"
    ],
    "ask": "Lube grade and who does first fill, per lube schedule or vendor?"
   },
   {
    "id": "instruments",
    "group": "Instruments and electrical",
    "text": "Local instruments fitted and tagged",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Pressure gauge missing",
     "Gauge isolation valve missing",
     "Vibration/temp sensor not fitted",
     "Instrument tag missing",
     "Impulse line unsupported"
    ],
    "ask": "Which local instruments are specified for this unit per design?"
   },
   {
    "id": "earthing",
    "group": "Instruments and electrical",
    "text": "Baseplate and motor frame earthed",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Earth cable missing",
     "Earth lug loose/corroded",
     "Earth on painted surface",
     "Bonding jumper missing"
    ],
    "ask": "Earthing points and conductor size per project earthing design?"
   },
   {
    "id": "motor_hookup",
    "group": "Instruments and electrical",
    "text": "Motor cable, gland and terminal box closed",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "Gland loose/not sealed",
     "Terminal box cover open",
     "Cover bolts missing",
     "Cable unsupported",
     "Cable tag missing"
    ],
    "ask": "Is this a hazardous area (Ex-rated glands/motor required)?"
   },
   {
    "id": "fan_compressor",
    "group": "Fans/compressors/blowers",
    "text": "Fan/compr.: belt guard, inlet screen, PSV, traps",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "Belt guard missing",
     "Belt tension not recorded",
     "Inlet screen/filter missing",
     "PSV tag/cert missing",
     "Condensate drain/trap missing"
    ],
    "ask": "Are PSV test certificate and belt-tension record required for handover?"
   },
   {
    "id": "paint_housekeeping",
    "group": "Finish",
    "text": "Paint touched up; temp items cleared",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "Paint damaged/rust spots",
     "Touch-up not done",
     "Temp covers/blinds left",
     "Debris on baseplate",
     "Temp material left"
    ],
    "ask": "Touch-up paint system for vendor-painted equipment per spec?"
   },
   {
    "id": "alignment_record",
    "group": "Records",
    "text": "Final alignment record available",
    "basis": "project",
    "codeRef": "verify clause/edition",
    "defects": [
     "Alignment record missing",
     "Only pre-piping record",
     "Out of tolerance on record",
     "Record not signed off",
     "Tolerance basis not stated"
    ],
    "ask": "Alignment tolerances (vendor or spec), and is a final check after piping required?"
   },
   {
    "id": "preservation",
    "group": "Records",
    "text": "Preservation log up to date",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Preservation log missing",
     "Shaft rotation overdue",
     "Desiccant/VCI expired",
     "Openings not sealed",
     "Space heater not energised"
    ],
    "ask": "Preservation interval and method per vendor or project procedure?"
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
     "Bund wall cracked",
     "Pipe penetration not sealed",
     "Bund drain valve missing",
     "Debris/water in bund",
     "Bund lining damaged"
    ],
    "ask": "Bund lining type, and is the bund drain valve required locked closed?"
   },
   {
    "id": "anchor_bolts",
    "group": "Bund & base",
    "text": "Anchor bolts: nuts tight, full thread engagement",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "Anchor nut missing",
     "Anchor nut loose",
     "Bolt short of nut",
     "Lock nut/tack missing",
     "Anchor bolt corroded"
    ],
    "ask": "What anchor nut locking (double nut, tack weld or none) and tightening are specified by design or vendor?"
   },
   {
    "id": "base_grout_seal",
    "group": "Bund & base",
    "text": "Base grout / edge seal intact, no ponding",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "Grout cracked",
     "Voids under base plate",
     "Edge seal missing",
     "Water ponding at base",
     "Shims not grouted"
    ],
    "ask": "Is a tank bottom-edge sealant or a specific grout type specified?"
   },
   {
    "id": "earthing",
    "group": "Earthing",
    "text": "Earth cable connected at every earth boss",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Earth cable missing",
     "Earth lug loose",
     "Lug painted over",
     "Connection corroded",
     "No earth label"
    ],
    "ask": "How many earthing points are required per tank or vessel, and is a continuity or resistance test record required?"
   },
   {
    "id": "coating",
    "group": "Shell & ID",
    "text": "Paint/coating complete, no damage or rust",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Coating damaged",
     "Rust spots",
     "Touch-up not done",
     "Wrong colour/band",
     "DFT record missing"
    ],
    "ask": "What paint system and colour code apply, and is a DFT or holiday-test record required (internal linings especially)?"
   },
   {
    "id": "nameplate_tag",
    "group": "Shell & ID",
    "text": "Nameplate & tag fitted, legible, match datasheet",
    "basis": "code",
    "codeRef": "API 650 – verify clause/edition",
    "defects": [
     "Nameplate missing",
     "Nameplate painted over",
     "Data differs from datasheet",
     "Tag number missing",
     "Temporary tag only"
    ],
    "ask": ""
   },
   {
    "id": "temp_attachments",
    "group": "Shell & ID",
    "text": "Temp cleats removed, ground and recoated",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "Temp cleat not removed",
     "Weld scar not ground",
     "Area not recoated",
     "Arc strike visible",
     "Lifting lug left on"
    ],
    "ask": "Do lifting lugs stay or come off per design, and is NDE required where temporary attachments were removed?"
   },
   {
    "id": "nozzle_flange_bolting",
    "group": "Nozzles & manways",
    "text": "Nozzle/manway flanges: gasket OK, bolts through nut",
    "basis": "code",
    "codeRef": "ASME B31.3 – verify clause/edition",
    "defects": [
     "Bolt not fully through nut",
     "Bolts rusted",
     "Wrong gasket type",
     "Flange misaligned",
     "Washer/nut missing"
    ],
    "ask": "Which gasket type applies per nozzle or piping class, and is the connecting piping B31.1 or B31.3?"
   },
   {
    "id": "torque_record",
    "group": "Nozzles & manways",
    "text": "Torque record for nozzle/manway joints",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Torque not recorded",
     "Torque mark missing",
     "Record incomplete",
     "Joint not in record",
     "Gasket reused after opening"
    ],
    "ask": "Which joints need controlled tightening with a record, and do the torque values come from the spec or the vendor?"
   },
   {
    "id": "blinds_spares",
    "group": "Nozzles & manways",
    "text": "Test blinds out; spare nozzles blinded",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "Test blind left in",
     "Spare nozzle open",
     "Plastic cap only",
     "Temporary gasket fitted",
     "Blind bolting incomplete"
    ],
    "ask": "Which nozzles are spare, and how should each be closed (blind flange or plug) per design?"
   },
   {
    "id": "overflow_drain",
    "group": "Nozzles & manways",
    "text": "Overflow & drain lines complete and routed",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Overflow not piped",
     "Overflow screen missing",
     "Drain valve not capped",
     "Seal loop/pot missing",
     "Drain line unsupported"
    ],
    "ask": "Where should the overflow terminate (drain, bund or seal pot), and how is the drain valve end closed per design?"
   },
   {
    "id": "internals_boxup",
    "group": "Nozzles & manways",
    "text": "Internals clean before box-up; record signed",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "Debris inside",
     "Box-up record missing",
     "Internal lining damaged",
     "Internals missing/loose",
     "Closed without witness"
    ],
    "ask": "Is a QC or client witness hold point required before manway closure, and which internals are specified?"
   },
   {
    "id": "level_instruments",
    "group": "Instruments",
    "text": "Level gauge/transmitter installed, hooked up",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "Instrument not installed",
     "Gauge glass broken/dirty",
     "Root valve missing",
     "Cable gland not sealed",
     "Instrument tag missing"
    ],
    "ask": "Which level devices (gauge, transmitter, switch) are specified, and is a loop-check record needed before handover?"
   },
   {
    "id": "access_structure",
    "group": "Access",
    "text": "Ladder/stair/platform complete, bolts tight",
    "basis": "practice",
    "codeRef": "API 650 – verify clause/edition",
    "defects": [
     "Bolts missing/loose",
     "Ladder cage incomplete",
     "Stair tread loose",
     "Grating clip missing",
     "Galvanising damaged"
    ],
    "ask": "Which access and fall-protection standard applies on site (client or local regulation)?"
   },
   {
    "id": "handrails",
    "group": "Access",
    "text": "Handrails, toe boards, self-closing gates fitted",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Handrail gap",
     "Toe board missing",
     "Self-closing gate missing",
     "Handrail loose",
     "Sharp edges/burrs"
    ],
    "ask": "What handrail height, toe board and ladder gate type does the project safety standard require?"
   },
   {
    "id": "vents_arrestors",
    "group": "Roof & relief",
    "text": "Vent/PVRV/flame arrestor fitted, covers removed",
    "basis": "project",
    "codeRef": "API 2000 / ISO 16852 – verify clause/edition",
    "defects": [
     "Shipping cover left on",
     "Bird screen missing",
     "Flame arrestor missing",
     "Wrong vent type vs datasheet",
     "Gauge hatch not closed"
    ],
    "ask": "Which tanks need a PVRV or flame arrestor rather than an open vent, and is a device certificate required?"
   },
   {
    "id": "relief_valve",
    "group": "Roof & relief",
    "text": "PSV fitted, tagged; set-test cert available",
    "basis": "code",
    "codeRef": "ASME Sec VIII – verify clause/edition",
    "defects": [
     "PSV not installed",
     "Set-test cert missing",
     "Seal/tag missing",
     "Isolation valve not locked open",
     "Discharge not routed safe"
    ],
    "ask": "Does the PSV tag set pressure match the datasheet, and must inlet/outlet isolation valves be car-sealed or locked open?"
   },
   {
    "id": "test_records",
    "group": "Records",
    "text": "Hydrotest & NDE records available",
    "basis": "code",
    "codeRef": "API 650 / ASME Sec VIII / ASME Sec V – verify clause/edition",
    "defects": [
     "Hydrotest record missing",
     "Settlement record missing",
     "NDE report missing",
     "Mfr data report missing",
     "Record not signed off"
    ],
    "ask": "Which records make up the tank/vessel handover dossier (hydrotest, settlement, NDE, MDR, coating)?"
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
    "codeRef": "ASME B31.3 / ASME B31.1 – verify clause/edition",
    "defects": [
     "Root valve missing",
     "Wrong valve type/rating",
     "Handle/handwheel missing",
     "Root valve not accessible",
     "Root valve not tagged"
    ],
    "ask": "Which code (B31.1 or B31.3) governs this line, and what root valve type/rating does the hookup specify?"
   },
   {
    "id": "tie_in_bolting",
    "group": "Tap & root valve",
    "text": "Flanged tie-in: bolts fully through nut",
    "basis": "code",
    "codeRef": "ASME B31.3 / ASME B31.1 – verify clause/edition",
    "defects": [
     "Bolt not fully through nut",
     "Bolts rusted",
     "Torque not recorded",
     "Gasket not as spec",
     "Bolt missing"
    ],
    "ask": "Gasket type and torque record required for instrument tie-in flanges?"
   },
   {
    "id": "impulse_slope",
    "group": "Impulse line & tubing",
    "text": "Impulse line slope/routing per hookup",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Slope wrong for service",
     "Low point/pocket in gas line",
     "High point in liquid line",
     "Line sagging",
     "Routing differs from hookup"
    ],
    "ask": "Required slope direction and value for this service (liquid, gas, steam)?"
   },
   {
    "id": "tube_material",
    "group": "Impulse line & tubing",
    "text": "Tube & fittings material/size per spec",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Wrong tube material",
     "Wrong tube OD/wall",
     "Mixed fitting makes",
     "CS fitting on SS tube"
    ],
    "ask": "Spec tube material, OD/wall and approved fitting make?"
   },
   {
    "id": "fittings_made_up",
    "group": "Impulse line & tubing",
    "text": "Compression fittings made up, gap-checked",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "Fitting not gap-checked",
     "Fitting loose",
     "Tape/sealant on compression thread",
     "Leak/stain at fitting",
     "Tube scored/kinked at fitting"
    ],
    "ask": "Is a gap-gauge check required, and is it recorded?"
   },
   {
    "id": "tubing_supports",
    "group": "Impulse line & tubing",
    "text": "Tubing clipped, supported, no strain",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "Unsupported span",
     "Clip/cleat missing",
     "Tube load on instrument",
     "SS tube on CS, no isolator",
     "Tubing kinked/flattened"
    ],
    "ask": "Max tubing support spacing and isolator requirement per spec?"
   },
   {
    "id": "vents_drains",
    "group": "Impulse line & tubing",
    "text": "Vent/drain/test points fitted & plugged",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Vent/drain plug missing",
     "Drain valve left open",
     "Test tee cap missing",
     "Open end not plugged",
     "Drain not routed safely"
    ],
    "ask": "Which vents/drains/test points does the hookup show, and drain routing for hazardous/hot service?"
   },
   {
    "id": "manifold",
    "group": "Manifold & instrument",
    "text": "Manifold fitted, HP/LP not reversed",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "HP/LP legs reversed",
     "Equalizing valve open",
     "Manifold loose on bracket",
     "Valve handle missing",
     "Manifold type not as hookup"
    ],
    "ask": "Manifold type (2/3/5-valve) per hookup?"
   },
   {
    "id": "instrument_mounting",
    "group": "Manifold & instrument",
    "text": "Instrument rigid, accessible, readable",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "Instrument loose",
     "Stand not anchored",
     "Display not readable",
     "No maintenance access",
     "Sunshade missing"
    ],
    "ask": "Is a sunshade/protective cover required for field instruments?"
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
     "Tag illegible/faded",
     "Range/material differs from datasheet"
    ],
    "ask": "Tag plate material/fixing method, and which datasheet fields to check (range, material, rating)?"
   },
   {
    "id": "cable_gland",
    "group": "Cable & gland",
    "text": "Gland type/size correct, tight, sealed",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Gland loose",
     "Wrong gland size",
     "Shroud/seal missing",
     "Shipping plug in spare entry",
     "Spare entry not plugged"
    ],
    "ask": "Gland type per area (Ex/IP rating, armoured, shroud) and approved stopping plugs?"
   },
   {
    "id": "cable_routing",
    "group": "Cable & gland",
    "text": "Cable supported, bend radius OK, tagged",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "Cable unsupported/hanging",
     "Bend too tight",
     "Sheath damaged",
     "Cable tag missing",
     "No drip loop at entry"
    ],
    "ask": "Minimum bend radius basis (manufacturer or spec) and cable tag format?"
   },
   {
    "id": "tray_conduit",
    "group": "Tray, conduit & JB",
    "text": "Tray/conduit complete, covers & bushes",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Tray cover missing",
     "Tray support missing",
     "Sharp edge, no bush/grommet",
     "Conduit end not sealed",
     "Cable outside tray"
    ],
    "ask": "Which runs need covers, and what IS/non-IS segregation rule applies?"
   },
   {
    "id": "jb_condition",
    "group": "Tray, conduit & JB",
    "text": "JB closed, gasket OK, labelled",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "Cover screws missing",
     "Gasket damaged",
     "Water/debris inside JB",
     "JB label missing",
     "Spare entry open"
    ],
    "ask": "Is an internal JB check (terminations, ferrules) in QC walkdown scope?"
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
     "Earth not labelled"
    ],
    "ask": "Instrument earthing scheme (PE vs IS/clean earth) and which end is the screen earthed?"
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
     "Refer to Ex inspector"
    ],
    "ask": "Is this area classified, and who verifies Ex compliance?"
   },
   {
    "id": "temp_items_removed",
    "group": "Clearance & records",
    "text": "Temp plugs, caps, tape & debris removed",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "Shipping plug left in",
     "Protective tape left on",
     "Temp blind/dummy left in",
     "Instrument not reinstated",
     "Debris/offcuts left"
    ],
    "ask": ""
   },
   {
    "id": "leak_test_record",
    "group": "Clearance & records",
    "text": "Hookup leak test done & recorded",
    "basis": "project",
    "codeRef": "ASME B31.3 / ASME B31.1 – verify clause/edition",
    "defects": [
     "Leak test not recorded",
     "Record incomplete",
     "Instrument not isolated in test",
     "Leak/stain seen",
     "Test not witnessed by QC"
    ],
    "ask": "Are hookups leak-tested with the line or separately, and with what medium/pressure?"
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
     "Escape route blocked",
     "Material stored on walkway",
     "Temporary barricade left",
     "Trip hazard on walkway"
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
     "Handrail missing",
     "Toe board missing",
     "Grating not clamped",
     "Floor opening unprotected",
     "Stair tread loose"
    ],
    "ask": ""
   },
   {
    "id": "lighting",
    "group": "Access & Lighting",
    "text": "Permanent lighting installed and working",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Light fitting not working",
     "Fitting missing",
     "Temporary lighting still in use",
     "Emergency light not working",
     "Fitting cover/lens missing"
    ],
    "ask": "Is permanent lighting energised yet, and is a lux survey or emergency-light test record needed before handover?"
   },
   {
    "id": "housekeeping",
    "group": "Housekeeping & Temporary Items",
    "text": "Area clean: debris, scrap, waste removed",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "Debris on floor",
     "Scrap material left",
     "Oil/chemical spill",
     "Packing waste left",
     "Weld rods/discs left"
    ],
    "ask": ""
   },
   {
    "id": "temp_materials",
    "group": "Housekeeping & Temporary Items",
    "text": "Temporary supports, hoses, cables removed",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "Temporary support left",
     "Temp hose left connected",
     "Welding cable not removed",
     "Wood packing left in place",
     "Rigging left on structure"
    ],
    "ask": ""
   },
   {
    "id": "scaffolds",
    "group": "Housekeeping & Temporary Items",
    "text": "Scaffolds removed or tagged valid",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Scaffold not removed",
     "Scaffold tag expired",
     "Scaffold blocking access",
     "Loose tubes/clamps left"
    ],
    "ask": "Which scaffolds may stay for commissioning, and is there an agreed retention list?"
   },
   {
    "id": "test_blinds_removed",
    "group": "Housekeeping & Temporary Items",
    "text": "Test blinds/spades removed, gaskets fitted",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "Test blind left in line",
     "Temporary gasket not replaced",
     "Blind removal not signed off",
     "Blind not in register"
    ],
    "ask": "Is a test-blind register kept for this system, and does QC sign off each removal?"
   },
   {
    "id": "preservation",
    "group": "Housekeeping & Temporary Items",
    "text": "Open ends capped, equipment preserved",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Open end not capped",
     "Preservation tag missing",
     "Protective cover missing",
     "Preservation not recorded"
    ],
    "ask": "What preservation is required after handover, and who owns it (construction or commissioning)?"
   },
   {
    "id": "drainage_bunds",
    "group": "Drainage",
    "text": "Drains, trenches, bunds clear; covers fitted",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "Drain blocked",
     "Trench cover missing",
     "Standing water",
     "Bund wall damaged/not sealed",
     "Bund drain valve open"
    ],
    "ask": "What is the normal position of the bund drain valve under the operating philosophy?"
   },
   {
    "id": "safety_shower",
    "group": "Safety Equipment",
    "text": "Safety shower/eyewash: access clear, water on",
    "basis": "project",
    "codeRef": "verify clause/edition",
    "defects": [
     "Access obstructed",
     "No water supply",
     "Sign missing",
     "Flow test not recorded",
     "Dust cap missing"
    ],
    "ask": "Which standard governs showers/eyewash here, and is a flow test record required before handover?"
   },
   {
    "id": "fire_water_obs",
    "group": "Safety Equipment",
    "text": "Hydrants/monitors: access clear, no damage (observe)",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Hydrant access blocked",
     "Hydrant cap missing",
     "Monitor damaged",
     "Handwheel missing",
     "Tag/marking missing"
    ],
    "ask": "Is fire water in QC walkdown scope or inspected separately, and which fire code governs?"
   },
   {
    "id": "equipment_tags",
    "group": "Labelling & Signage",
    "text": "Equipment and valve tags fitted, legible",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Tag missing",
     "Tag illegible",
     "Tag does not match equipment",
     "Tag loose/not fixed"
    ],
    "ask": "Which tagging spec applies (tag material, fixing method, location)?"
   },
   {
    "id": "line_marking",
    "group": "Labelling & Signage",
    "text": "Line ID and flow arrows marked",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Flow arrow missing",
     "Flow arrow wrong direction",
     "Line ID missing",
     "Colour band missing"
    ],
    "ask": "Which pipe marking and colour-code standard does the project use?"
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
    "ask": "Which signage spec applies, including required languages?"
   },
   {
    "id": "insulation_damage",
    "group": "Finish & Protection",
    "text": "Insulation/cladding intact, joints sealed",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Cladding dented",
     "Insulation missing",
     "Cladding joint open",
     "End cap missing",
     "Insulation wet"
    ],
    "ask": "Must insulation be complete before handover, or may it be punched? What are the acceptance criteria?"
   },
   {
    "id": "paint_touchup",
    "group": "Finish & Protection",
    "text": "Paint damage touched up, no rust/bare steel",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Paint damaged",
     "Rust spots",
     "Touch-up not done",
     "Field weld not painted",
     "Overspray on equipment"
    ],
    "ask": "Which touch-up system and DFT acceptance does the project paint spec require?"
   },
   {
    "id": "punch_closure",
    "group": "Handover Records",
    "text": "Previous punch items closed and verified",
    "basis": "practice",
    "codeRef": "",
    "defects": [
     "Punch item still open",
     "Marked closed, not fixed",
     "No closure evidence photo",
     "Punch category disputed"
    ],
    "ask": "Which role signs punch closure (QC, client, or both)?"
   },
   {
    "id": "handover_records",
    "group": "Handover Records",
    "text": "Handover records available for area/system",
    "basis": "project",
    "codeRef": "",
    "defects": [
     "Record not available",
     "Record unsigned",
     "Record incomplete",
     "Record not matching site"
    ],
    "ask": "Which record types are mandatory in the handover dossier for this system?"
   }
  ]
 },
 {
  "key": "free",
  "label": "Other (free check)",
  "checks": []
 }
];
export const CLOSURE_CHECKS = [
 {
  "id": "loto",
  "text": "Isolation / LOTO status known before touching"
 },
 {
  "id": "located",
  "text": "Item located; tag and location match the punch"
 },
 {
  "id": "as_written",
  "text": "Fix addresses the punch as written"
 },
 {
  "id": "rectified",
  "text": "Original defect fully rectified"
 },
 {
  "id": "permanent",
  "text": "Permanent fix, not a temporary workaround"
 },
 {
  "id": "no_damage",
  "text": "No new damage caused by the fix"
 },
 {
  "id": "refitted",
  "text": "Removed items refitted (guards, insulation, tags)"
 },
 {
  "id": "cleared",
  "text": "Temporary materials and debris cleared"
 },
 {
  "id": "records",
  "text": "Supporting record attached where needed (torque, alignment, NDE, re-test)"
 }
];
export const SITE_QUESTIONS = {
 "piping_line": [
  "Which code governs each line (B31.1 or B31.3), and which edition is in the contract?",
  "What NDE extent and PWHT apply to each line class or fluid service?",
  "Which test limit covers the line, is it released, and where can QC see the signed record?",
  "Are field routing changes red-lined and approved before handover?",
  "Which lines must slope, and at what minimum slope?",
  "What minimum clearances to steel, other lines and cables does the project spec require?",
  "Which supports are anchors, guides or sliding, and what guide gaps and shoe overhang are specified?",
  "When are spring hanger travel stops removed (after test or before hot commissioning), and who removes them?",
  "Does the project require bracing on small-bore branches, and to which detail?",
  "What end closure is required on drains and vents (plug, cap or blind)?",
  "Is there a register of blinds and temporary items to close against, and who signs reinstatement?",
  "Is flushing/blowing in construction or commissioning scope, and what is the acceptance?",
  "What are the acceptance limits for dents, gouges and arc strikes on pipe?",
  "Which coating system, colour and DFT apply, and what insulation type, thickness and personnel protection?",
  "What is the project line marking standard (colours, flow arrows, spacing, locations)?",
  "Which lines need flange bonding or earthing jumpers (e.g. fuel gas)?",
  "How is the B+ punch tier defined, and who assigns punch categories (A/B/B+/C/D)?"
 ],
 "flanged_joint": [
  "Which code and edition applies to each system (B31.1 power piping vs B31.3 process piping), and where is the boundary between them?",
  "What flange alignment tolerance applies (project spec vs code edition value)?",
  "What stud protrusion is acceptable (full engagement only, or one thread short allowed; min/max threads beyond the nut)?",
  "What is the tightening method (torque wrench vs tensioning), where do the values come from, and is the project assembly procedure based on ASME PCC-1?",
  "Is a per-joint torque record required? Who witnesses or signs it, and must tool calibration be shown?",
  "Is a joint tag or paint mark required on tightened joints?",
  "Were temporary gaskets/bolting used for hydrotest, and must they be replaced before handover?",
  "Is a blind/spectacle register kept, and what position is required at handover to commissioning?",
  "Which joints need insulating kits, and is an isolation test required?",
  "Which services need flange spray guards?",
  "Which lines need flange bonding jumpers (e.g. fuel gas)?",
  "What is the rust acceptance for bolting: clean and protect, or replace? What bolt coating/protection is specified?",
  "Can bolts and gaskets be reused after a joint is broken?",
  "Which joints, if any, need re-torque or hot torque after first heat-up, and how is that tracked?",
  "How is punch tier B+ defined, and what category do typical flange defects get (e.g. missing torque record, rusted bolts)?",
  "When construction closes a flange punch item, does QC verify it by re-inspection, witnessing or record review?"
 ],
 "valve": [
  "Which code and edition (B31.1 or B31.3) applies to each BOP system's valves?",
  "Which project document holds valve type, class and material per line class, and is a current copy available locally?",
  "Valve tagging: which valves need tags (all hand valves, or line/instrument valves only), and what tag material and fixing are required?",
  "Which valves are LO, LC or CSO, who installs the locks or seals, and who owns the lock/key register at handover?",
  "Is a PSV bench test or re-test required before handover, who performs it, and in what record format?",
  "Is checking PSV set pressure against the datasheet in QC scope, or only process/commissioning scope?",
  "Is a torque/tightening record required for valve end flanges, and does that depend on line class? Who records it?",
  "Does the piping spec restrict stem orientation, operating height or chainwheel use?",
  "Is control valve hookup (air, tubing, cable, earth) inspected by I&C QC or mechanical QC?",
  "Who removes actuator transport locks: construction or the vendor representative at commissioning?",
  "Is valve stroke/function checking in construction QC scope, or does it belong to commissioning?",
  "What does the project require on open-ended vents and drains: plug, cap or blind flange?",
  "How does this project define punch category B+?",
  "Which valve defects does the project grade as category A (for example, a reversed check valve or a closed PSV block valve)?"
 ],
 "pipe_support": [
  "Which code governs each BOP system's piping (B31.1 or B31.3), and which edition does the project use?",
  "Which pipe hanger/support standard does the project spec reference (MSS SP-58 is an example, not confirmed), and which edition?",
  "Where are guide gaps, shoe offsets and stop gaps defined: the support standard detail or the stress output?",
  "At what stage are spring/constant hanger travel stops removed, who removes them, and does QC witness it?",
  "Who records spring hanger cold settings, and who signs that record off?",
  "Is a hot walkdown of supports planned during commissioning, and does QC attend?",
  "Are supports numbered/tagged in the field, and in what marking format?",
  "Structural bolt tightening on racks: what method is used, and is it recorded per connection or by sampling?",
  "What welding standard applies to rack and support steel welds that are not on pressure pipe?",
  "Is NDE or PWHT required on support attachment welds to pressure pipe, and is a record expected?",
  "Which materials or lines need isolation or wear pads (stainless, GRP/plastic, lined or coated pipe)?",
  "What paint/galvanising touch-up system applies to supports, and who applies it?",
  "Have temporary supports used for erection/hydrotest been logged, so their removal can be verified?",
  "How is 'B+' defined on this project, and how are support defects graded between A, B, B+, C and D?",
  "Who owns support walkdown punch items before handover: piping, civil/structural or stress?"
 ],
 "rotating": [
  "Which piping code governs each system at the pumps: B31.1 or B31.3? Which editions?",
  "Does the project spec invoke API RP 686 for machinery installation (grout, anchors, alignment, pipe strain)? Which edition?",
  "Which pump standard applies to BOP pumps (API 610, ISO 5199, ASME B73, or vendor standard)? Does API 682 apply to seals?",
  "Alignment method and tolerances: from the vendor manual or the project spec? Is a final alignment after piping bolt-up required?",
  "Is a pipe-strain check (dial indicators during flange bolt-up) required? Which role witnesses it (QC, vendor, client)?",
  "Grout type, void acceptance criteria and jack-screw treatment after grouting, per spec?",
  "Anchor bolt torque values: is a torque record required for handover?",
  "Who removes transit locks and does the first lube oil fill (construction, vendor or commissioning), and when?",
  "Preservation procedure and interval for installed rotating equipment awaiting commissioning?",
  "Are temporary start-up strainers required, and who keeps the register (construction or commissioning)?",
  "Which skids or items need vendor installation sign-off before handover?",
  "Hazardous area classification for fuel-gas and chemical areas: are Ex motors and glands required?",
  "Are motor terminations and earthing signed off by electrical QC, with mechanical QC observing only?",
  "Is the motor solo run / rotation record part of the mechanical completion package or commissioning?",
  "How is the B+ punch category defined on this project, and which rotating-equipment defects go there?",
  "Which punch category is used for a missing coupling guard on equipment not yet energised?"
 ],
 "tank_vessel": [
  "What is the design or construction code of each tank, vessel and skid vessel (API 650, ASME VIII Div 1, vendor or EN code), and which project edition applies?",
  "How is the 'B+' punch category defined on this project, and who assigns it?",
  "Is QC or client witness a hold point before any manway box-up?",
  "Which painting spec applies (system, colour code), and is a DFT or holiday-test record required for internal linings on demin and chemical tanks?",
  "How many earthing points per tank or vessel, and is an earth continuity or resistance test record required?",
  "Which flange joints need controlled tightening and a torque record, and where do the torque values come from (spec or vendor)?",
  "Which tanks need a PVRV or flame arrestor, and are device certificates part of handover?",
  "PSV: is a set-test certificate required before handover, and must isolation valves be car-sealed or locked open?",
  "What anchor bolt locking and tightening are required (double nut, tack weld, torque)?",
  "What lining is required in chemical-area bunds, and what is the normal position of the bund drain valve (locked closed?)?",
  "Do lifting lugs and trunnions stay or come off, and is NDE required where temporary attachments were removed?",
  "Which access or fall-protection standard governs handrails, ladders and gates on site (client or local regulation)?",
  "What does the tank/vessel handover dossier contain (hydrotest, settlement survey, NDE, MDR/certification, coating records)?",
  "What preservation is required after hydrotest (drain, dry, nitrogen blanket) for vessels and skids awaiting commissioning?",
  "Is cathodic protection specified for any tank bottom, and is its test point or junction box part of this walkdown?",
  "Is a calibration (strapping) certificate required for any tank?"
 ],
 "instrument_hookup": [
  "Which code (B31.1 or B31.3) governs instrument piping on each BOP system, and where is the process/instrument code break?",
  "Which hookup revision is current for walkdown, and where is the controlled copy?",
  "Approved tube material, OD/wall and fitting make; is mixing fitting makes prohibited?",
  "Is a compression-fitting gap-gauge check required, and is it recorded?",
  "Required impulse line slope per service (liquid, gas, steam)?",
  "Max support spacing for tubing and for cable?",
  "Are hookups leak-tested with the process line or separately? Test medium/pressure? Instrument isolated or removed during test?",
  "Tag plate standard: material, fixing method, wording?",
  "Are sunshades/protective covers required for field transmitters?",
  "Cable gland type and IP/Ex rating per area; approved stopping plugs for spare entries?",
  "Which BOP areas are hazardous-area classified (e.g. fuel-gas conditioning), and who performs Ex inspection?",
  "Instrument earthing scheme (PE vs IS/clean earth), screen earthing end, and tray bonding rule?",
  "Cable bend radius basis, tray cover requirement and IS/non-IS segregation rule?",
  "Are JB internals (terminations, ferrules) and calibration/loop check in QC scope or commissioning scope?",
  "Insulation or heat tracing required on any impulse lines?",
  "How is punch category B+ defined on this project?",
  "Are any hookup defects pre-agreed as Cat A (e.g. HP/LP reversed, root valve missing, open vent on hazardous service)?"
 ],
 "general_area": [
  "What does punch category B+ mean on this project, and who may assign it?",
  "What is the default punch category for leftover temporary items or housekeeping at handover (A or B)?",
  "Is a test-blind register kept per system, and does QC sign off each removal?",
  "Which scaffolds may stay for commissioning, and is there an agreed retention list?",
  "Which standard governs safety showers and eyewash? Is cooled or tempered water specified for site ambient? Is a flow test record required?",
  "Is fire water (hydrants/monitors) in the QC walkdown scope or inspected separately, and which fire code applies?",
  "Which tagging, pipe marking/colour-code and safety signage specs apply, including required sign languages?",
  "What are the paint touch-up system and DFT acceptance in the project paint spec?",
  "Must insulation be complete before handover, or may it be punched? What are the acceptance criteria?",
  "Is permanent lighting energised in this area? Is a lux survey or emergency-light test record needed before handover?",
  "Who owns preservation after handover (construction or commissioning), and which preservation procedure applies?",
  "What is the normal position of bund drain valves under the operating philosophy?",
  "Which record types are mandatory in the system handover dossier?",
  "Which role signs punch closure, and is a closure photo required as evidence?"
 ]
};
export const GENERAL_DEFECTS = ["Housekeeping not done", "Temporary material not removed", "Tag / label missing", "Paint damaged", "Insulation damaged", "Support missing", "Bolt not fully through nut", "Bolts rusted", "Torque not recorded", "Drain / vent missing", "Guard missing", "Earthing missing"];
