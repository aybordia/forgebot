# OPENSCAD_SPEC.md — Forgebot OpenSCAD Parametric Templates

> **Claude Code norm:** After every set of changes, always `git add -A && git commit -m "<message>" && git push` to https://github.com/aybordia/forgebot before stopping.

---

## Overview

OpenSCAD is the CAD engine. Python generates a `.scad` file with parameter variables defined, which `include`s the master template `arm_4dof.scad`. OpenSCAD CLI compiles this to `.stl`. The STL is loaded into MuJoCo.

All templates live in `forgebot/robot_templates/`.

---

## Parameter Reference Table

| Variable Name | Type | Range | Unit | Physical Meaning |
|---|---|---|---|---|
| `arm_length` | float | 0.3 – 1.5 | meters | Total reach: tip of gripper to shoulder joint |
| `link_radius` | float | 0.015 – 0.06 | meters | Radius of each cylindrical link segment |
| `base_radius` | float | 0.05 – 0.15 | meters | Radius of the mounting base disc |
| `gripper_width` | float | 0.04 – 0.15 | meters | Open-jaw span of gripper |
| `dof` | int | 3 – 6 | count | Number of rotational joints |
| `mounted` | bool | true / false | — | If true: adds flat base plate for table mounting |
| `gripper_type` | string | "parallel" / "adaptive" | — | Selects gripper include file |
| `joint_range_0` | [float, float] | [-180, 180] | degrees | Angular range of joint 0 (shoulder) |
| `joint_range_1` | [float, float] | [-180, 180] | degrees | Angular range of joint 1 (upper arm) |
| `joint_range_2` | [float, float] | [-180, 180] | degrees | Angular range of joint 2 (forearm) |
| `joint_range_3` | [float, float] | [-180, 180] | degrees | Angular range of joint 3 (wrist) |

**Note:** Joint ranges are stored in the `.scad` file but only used for URDF generation (MuJoCo limits). They do not change the physical shape of the STL.

---

## File: `robot_templates/arm_4dof.scad`

Complete file contents — paste verbatim. Variables are defined by the Python-generated header file that `include`s this.

```scad
// arm_4dof.scad — Forgebot 4-DOF Parametric Arm Template
// Parameters are set by the caller (Python-generated header)
// All dimensions in meters, converted to mm internally (OpenSCAD uses mm)

// ── Unit conversion ──────────────────────────────────────────────────
M = 1000;  // multiply meters to get mm

// ── Derived dimensions ───────────────────────────────────────────────
link_r    = link_radius * M;          // link cylinder radius in mm
base_r    = base_radius * M;          // base disc radius in mm
grip_w    = gripper_width * M;        // gripper jaw span in mm
arm_l     = arm_length * M;           // total arm length in mm

// Each link's length: divide total arm length by DOF + 1
// (extra +1 accounts for gripper assembly at the end)
link_len  = arm_l / (dof + 1);

// Joint sphere radius: slightly larger than link for visual articulation
joint_r   = link_r * 1.4;

// ── Base ─────────────────────────────────────────────────────────────
module base_assembly() {
    if (mounted) {
        // Flat square mounting plate
        color("DarkSlateGray")
        cube([base_r * 2, base_r * 2, link_r * 0.5], center=true);
    }
    // Central pillar
    color("SlateGray")
    cylinder(h=link_r * 2, r=base_r, center=true, $fn=64);
}

// ── Single link segment ───────────────────────────────────────────────
module link_segment(length) {
    color("LightSteelBlue")
    cylinder(h=length, r=link_r, center=false, $fn=32);
}

// ── Joint sphere ──────────────────────────────────────────────────────
module joint_sphere() {
    color("SteelBlue")
    sphere(r=joint_r, $fn=32);
}

// ── Arm assembly ──────────────────────────────────────────────────────
// Builds DOF link segments stacked vertically with joint spheres between them
// (MuJoCo doesn't care about the exact visual pose — it uses the STL as collision mesh)
module arm_assembly() {
    current_height = 0;
    
    // Base joint
    joint_sphere();
    
    // Iterate DOF times: place link + joint
    // OpenSCAD doesn't have loops over variables, so we use if-else chains
    // for dof 3, 4, 5, or 6
    
    if (dof >= 1) {
        translate([0, 0, joint_r])
            link_segment(link_len);
        translate([0, 0, joint_r + link_len])
            joint_sphere();
    }
    if (dof >= 2) {
        translate([0, 0, joint_r + link_len + joint_r])
            link_segment(link_len);
        translate([0, 0, joint_r + link_len + joint_r + link_len])
            joint_sphere();
    }
    if (dof >= 3) {
        translate([0, 0, joint_r + (link_len + joint_r) * 2])
            link_segment(link_len);
        translate([0, 0, joint_r + (link_len + joint_r) * 2 + link_len])
            joint_sphere();
    }
    if (dof >= 4) {
        translate([0, 0, joint_r + (link_len + joint_r) * 3])
            link_segment(link_len);
        translate([0, 0, joint_r + (link_len + joint_r) * 3 + link_len])
            joint_sphere();
    }
    if (dof >= 5) {
        translate([0, 0, joint_r + (link_len + joint_r) * 4])
            link_segment(link_len);
        translate([0, 0, joint_r + (link_len + joint_r) * 4 + link_len])
            joint_sphere();
    }
    if (dof >= 6) {
        translate([0, 0, joint_r + (link_len + joint_r) * 5])
            link_segment(link_len);
        translate([0, 0, joint_r + (link_len + joint_r) * 5 + link_len])
            joint_sphere();
    }
}

// ── Gripper include ───────────────────────────────────────────────────
// Gripper mounts at the top of the last link
wrist_top_z = joint_r + (link_len + joint_r) * dof;

module gripper_assembly() {
    translate([0, 0, wrist_top_z]) {
        if (gripper_type == "parallel") {
            include <grippers/parallel.scad>;
        } else {
            include <grippers/adaptive.scad>;
        }
    }
}

// ── Final assembly ────────────────────────────────────────────────────
union() {
    translate([0, 0, base_r])
        base_assembly();
    translate([0, 0, base_r * 2])
        arm_assembly();
    gripper_assembly();
}
```

---

## File: `robot_templates/grippers/parallel.scad`

```scad
// parallel.scad — Parallel gripper
// Expects: grip_w (in mm) to be defined by parent
// Mounted at [0, 0, 0] — translate in parent

palm_w  = grip_w * 0.6;   // palm block width
palm_h  = link_r * 3;     // palm block height
finger_l = grip_w * 0.7;  // finger length
finger_r = link_r * 0.5;  // finger cylinder radius

// Palm
color("CornflowerBlue")
cube([palm_w, palm_w, palm_h], center=true);

// Left finger
color("DeepSkyBlue")
translate([-grip_w / 2, 0, palm_h / 2])
    cylinder(h=finger_l, r=finger_r, $fn=16);

// Right finger
color("DeepSkyBlue")
translate([grip_w / 2, 0, palm_h / 2])
    cylinder(h=finger_l, r=finger_r, $fn=16);
```

---

## File: `robot_templates/grippers/adaptive.scad`

```scad
// adaptive.scad — Adaptive (3-finger) gripper
// Expects: grip_w (in mm) to be defined by parent

palm_r   = grip_w * 0.3;
finger_l = grip_w * 0.8;
finger_r = link_r * 0.45;

// Palm disc
color("MediumSlateBlue")
cylinder(h=link_r * 2, r=palm_r, $fn=32);

// 3 fingers at 120-degree spacing
for (angle = [0, 120, 240]) {
    color("SlateBlue")
    rotate([0, 0, angle])
    translate([grip_w / 2, 0, link_r * 2])
        cylinder(h=finger_l, r=finger_r, $fn=16);
}
```

---

## Python → OpenSCAD File Generation

This is the exact content of the generated `.scad` file that Python writes to `/tmp/robot.scad`. Python uses an f-string template:

```python
SCAD_HEADER_TEMPLATE = """
// AUTO-GENERATED BY FORGEBOT — DO NOT EDIT MANUALLY
// Generated at: {timestamp}

// Parameters from robot spec + motion capture
arm_length    = {arm_length_m};      // meters
gripper_width = {gripper_width_m};   // meters
link_radius   = {link_radius_m};     // meters
base_radius   = {base_radius_m};     // meters
dof           = {dof};               // integer 3-6
mounted       = {mounted_str};       // true or false
gripper_type  = "{gripper_type}";    // "parallel" or "adaptive"

// Joint angular ranges (degrees) — used for URDF generation
joint_range_0 = [{joint_range_0_min}, {joint_range_0_max}];
joint_range_1 = [{joint_range_1_min}, {joint_range_1_max}];
joint_range_2 = [{joint_range_2_min}, {joint_range_2_max}];
joint_range_3 = [{joint_range_3_min}, {joint_range_3_max}];

// Include master template
include <{templates_dir}/arm_4dof.scad>;
"""
```

Python formatting call (in `cad_generator.generate_scad_file`):
```python
import datetime

content = SCAD_HEADER_TEMPLATE.format(
    timestamp=datetime.datetime.now().isoformat(),
    arm_length_m=round(params["arm_length_m"], 4),
    gripper_width_m=round(params["gripper_width_m"], 4),
    link_radius_m=round(params["link_radius_m"], 4),
    base_radius_m=round(params["base_radius_m"], 4),
    dof=int(params["dof"]),
    mounted_str="true" if params["mounted"] else "false",
    gripper_type=params["gripper_type"],
    joint_range_0_min=round(params["joint_ranges_deg"][0][0], 1),
    joint_range_0_max=round(params["joint_ranges_deg"][0][1], 1),
    joint_range_1_min=round(params["joint_ranges_deg"][1][0], 1),
    joint_range_1_max=round(params["joint_ranges_deg"][1][1], 1),
    joint_range_2_min=round(params["joint_ranges_deg"][2][0], 1),
    joint_range_2_max=round(params["joint_ranges_deg"][2][1], 1),
    joint_range_3_min=round(params["joint_ranges_deg"][3][0], 1),
    joint_range_3_max=round(params["joint_ranges_deg"][3][1], 1),
    templates_dir=os.environ.get("ROBOT_TEMPLATES_DIR", "../robot_templates"),
)

with open(output_path, "w") as f:
    f.write(content)
```

---

## OpenSCAD CLI Compilation Command

```bash
openscad -o /path/to/output/robot_current.stl /tmp/robot.scad
```

Python subprocess call (exact):
```python
import subprocess, os

result = subprocess.run(
    [
        os.environ.get("OPENSCAD_BIN", "openscad"),
        "-o", stl_path,
        scad_path
    ],
    capture_output=True,
    text=True,
    timeout=60
)

if result.returncode != 0:
    logger.error(f"OpenSCAD compile failed:\n{result.stderr}")
    return False

logger.info(f"OpenSCAD compile success. STL written to {stl_path}")
return True
```

**OpenSCAD install:**
```bash
# macOS:
brew install openscad

# Ubuntu/Debian (ASUS GPU machine):
sudo apt-get install openscad

# Verify:
openscad --version
```

---

## STL → URDF Conversion for MuJoCo

MuJoCo accepts STL directly via `<mesh>` asset — no URDF needed.

The MuJoCo XML approach (used in `sim.py`):
```xml
<asset>
  <mesh name="robot" file="/absolute/path/to/robot_current.stl" scale="1 1 1"/>
</asset>
<worldbody>
  <body name="robot_body" pos="0 0 0.5">
    <freejoint/>
    <geom type="mesh" mesh="robot" mass="5.0" contype="1" conaffinity="1"/>
  </body>
</worldbody>
```

Use `scale="1 1 1"` because the STL is already in mm from OpenSCAD. MuJoCo interprets mesh units as meters, so the robot will appear large. To fix scale: use `scale="0.001 0.001 0.001"` to convert mm → meters.

**Correct scale line:**
```xml
<mesh name="robot" file="{stl_path}" scale="0.001 0.001 0.001"/>
```

---

## Mesh Simplification

After OpenSCAD compiles the STL, Python simplifies it with trimesh to keep face count under 50,000 for fast MuJoCo loading:

```python
import trimesh

def simplify_stl(stl_path: str, max_faces: int = 50_000) -> None:
    mesh = trimesh.load(stl_path)
    if len(mesh.faces) > max_faces:
        logger.info(f"Simplifying mesh: {len(mesh.faces)} → {max_faces} faces")
        simplified = trimesh.simplify.quadric_decimation(mesh, max_faces)
        simplified.export(stl_path)
        logger.info(f"Mesh simplified and saved to {stl_path}")
    else:
        logger.info(f"Mesh OK: {len(mesh.faces)} faces (under {max_faces} limit)")
```

Expected face counts:
- 3-DOF arm (no gripper): ~8,000 faces
- 4-DOF arm + parallel gripper: ~14,000 faces  
- 6-DOF arm + adaptive gripper: ~22,000 faces
- All well under 50,000 — simplification rarely triggers, but keep it as a guard.

---

## Example Generated Parameters (for a 2.5kg pick-and-place arm)

Robot spec: `payload_kg=2.5, reach_cm=110, dof=4, gripper_type="parallel", mounted=true`
Motion params: `max_reach_cm=98, avg_joint_angles_deg=[45.2, 112.0, 78.5, 22.1], grip_aperture_cm=8.5`

Derived parameters:
```
arm_length_m   = max(98/100, 110/100) = 1.10  (spec reach wins)
gripper_width_m = 8.5/100 = 0.085
payload_factor  = 2.5/5.0 = 0.5  → clamped to 0.5
link_radius_m   = 0.02 * 0.5 = 0.010  → clamped to min 0.015
base_radius_m   = 0.015 * 3 = 0.045   → clamped to min 0.05
dof             = 4
joint_ranges_deg = [
  [-49.7, 49.7],    # shoulder: 45.2 * 1.1
  [-123.2, 123.2],  # upper arm: 112.0 * 1.1
  [-86.35, 86.35],  # forearm: 78.5 * 1.1
  [-24.31, 24.31]   # wrist: 22.1 * 1.1
]
```
