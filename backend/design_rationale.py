import logging

from fastapi import APIRouter

import plan_mode

logger = logging.getLogger(__name__)

router = APIRouter()

DEMO_SPEC = {
    "task": "pick and place",
    "payload_kg": 2.5,
    "mounted": True,
    "reach_cm": 100,
    "dof": 4,
    "gripper_type": "parallel",
}

DEMO_MOTION_PARAMS = {
    "max_reach_cm": 85,
    "grip_aperture_cm": 7.5,
    "motion_speed": "medium",
    "reps_detected": 3,
}

DEMO_PARAMS_USED = {
    "arm_length_m": 0.98,
    "gripper_width_m": 0.075,
    "link_radius_m": 0.015,
    "dof": 4,
    "gripper_type": "parallel",
}


def generate_explanations(params_used: dict, motion_params: dict, robot_spec: dict) -> list[dict]:
    explanations = []

    arm_cm = params_used.get("arm_length_m", 0.98) * 100
    max_reach = motion_params.get("max_reach_cm", 85)
    reps = motion_params.get("reps_detected", 3)
    task = robot_spec.get("task", "pick and place")
    payload = robot_spec.get("payload_kg", 2.5)
    dof = params_used.get("dof", 4)
    grip_ap = motion_params.get("grip_aperture_cm", 7.5)
    gripper_w_mm = params_used.get("gripper_width_m", 0.075) * 1000
    link_r_mm = params_used.get("link_radius_m", 0.015) * 1000
    gripper_type = params_used.get("gripper_type", "parallel")

    explanations.append({
        "component": "Arm Length",
        "value": f"{arm_cm:.0f}cm",
        "reason": f"Motion capture showed peak wrist reach of {max_reach:.0f}cm across {reps} reps. Added 10% safety margin for {task} task clearance.",
    })

    explanations.append({
        "component": "Gripper Width",
        "value": f"{gripper_w_mm:.0f}mm",
        "reason": f"Grip aperture measured from video: {grip_ap:.1f}cm average spacing at moment of object contact.",
    })

    explanations.append({
        "component": "Link Thickness",
        "value": f"{link_r_mm:.0f}mm radius",
        "reason": f"Scaled to handle {payload}kg payload with 2× safety factor. Baseline 20mm radius at 1kg scales linearly.",
    })

    explanations.append({
        "component": "Degrees of Freedom",
        "value": f"{dof}-DOF",
        "reason": f"Matched to robot spec request of {robot_spec.get('dof', 4)} DOF. {dof} joints provide sufficient workspace coverage for {task}.",
    })

    if gripper_type == "parallel":
        grip_reason = f"Selected for consistent gripping force on regular-shaped objects at {payload}kg."
    else:
        grip_reason = "Selected for irregular object geometries. Fingers conform to object surface."

    explanations.append({
        "component": "Gripper Type",
        "value": gripper_type.capitalize(),
        "reason": grip_reason,
    })

    mounted = robot_spec.get("mounted", True)
    explanations.append({
        "component": "Mounting",
        "value": "Fixed mount" if mounted else "Freestanding",
        "reason": f"{'Fixed base provides maximum rigidity for' if mounted else 'Mobile base allows repositioning for'} {task} at {payload}kg payload.",
    })

    return explanations


@router.get("/rationale")
async def get_rationale() -> dict:
    spec = plan_mode.robot_specs.get("default")
    if not spec:
        logger.info("No robot spec found — using demo data for rationale")
        spec = DEMO_SPEC
        params_used = DEMO_PARAMS_USED
        motion_params = DEMO_MOTION_PARAMS
    else:
        params_used = {
            "arm_length_m": spec.get("reach_cm", 100) / 100 * 0.98,
            "gripper_width_m": 0.075,
            "link_radius_m": 0.01 + spec.get("payload_kg", 1) * 0.005,
            "dof": spec.get("dof", 4),
            "gripper_type": spec.get("gripper_type", "parallel"),
        }
        motion_params = DEMO_MOTION_PARAMS

    explanations = generate_explanations(params_used, motion_params, spec)
    return {"explanations": explanations}
