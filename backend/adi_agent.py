import logging

from fastapi import APIRouter
from pydantic import BaseModel

import plan_mode

logger = logging.getLogger(__name__)

router = APIRouter()

ADI_CATALOG = [
    {
        "category": "IMU",
        "part_number": "ADIS16470",
        "description": "10-DOF MEMS inertial sensor with accelerometer, gyroscope, magnetometer",
        "use_case": "joint angle feedback, balance correction, vibration monitoring",
        "quantity_per_robot": "1 per joint",
        "datasheet_url": "https://www.analog.com/en/products/adis16470.html",
    },
    {
        "category": "IMU",
        "part_number": "ADXL345",
        "description": "3-axis digital accelerometer, ±16g",
        "use_case": "end-effector acceleration sensing, collision detection",
        "quantity_per_robot": "1",
        "datasheet_url": "https://www.analog.com/en/products/adxl345.html",
    },
    {
        "category": "Motor Driver",
        "part_number": "TMC2209",
        "description": "Stepper motor driver with StealthChop2, up to 2.8A",
        "use_case": "silent, precise control of stepper motors in each joint",
        "quantity_per_robot": "1 per DOF",
        "datasheet_url": "https://www.analog.com/en/products/tmc2209.html",
    },
    {
        "category": "Power Management",
        "part_number": "LTC3780",
        "description": "High-efficiency synchronous buck-boost DC/DC controller",
        "use_case": "regulated 12V power rail for motor drivers from battery input",
        "quantity_per_robot": "1",
        "datasheet_url": "https://www.analog.com/en/products/ltc3780.html",
    },
    {
        "category": "Signal Processor",
        "part_number": "AD7606C-18",
        "description": "18-bit, 8-channel simultaneous sampling ADC",
        "use_case": "high-speed sampling of force/torque sensors on gripper",
        "quantity_per_robot": "1",
        "datasheet_url": "https://www.analog.com/en/products/ad7606c-18.html",
    },
    {
        "category": "Amplifier",
        "part_number": "AD8221",
        "description": "Rail-to-rail instrumentation amplifier, 0.1μV/°C drift",
        "use_case": "amplify strain gauge signals from load cells in gripper fingers",
        "quantity_per_robot": "2",
        "datasheet_url": "https://www.analog.com/en/products/ad8221.html",
    },
]

DEMO_SPEC = {
    "task": "pick and place",
    "payload_kg": 2.5,
    "mounted": True,
    "reach_cm": 100,
    "dof": 4,
    "gripper_type": "parallel",
    "notes": "Warehouse box sorting from low shelf to table height",
}


class BOMItem(BaseModel):
    category: str
    part_number: str
    description: str
    justification: str
    quantity: int
    datasheet_url: str


def generate_bom(robot_spec: dict) -> list[dict]:
    dof = int(robot_spec.get("dof", 4))
    payload = float(robot_spec.get("payload_kg", 2.5))
    task = robot_spec.get("task", "pick and place")

    bom: list[dict] = []

    # ADIS16470 — always included, 1 per joint
    bom.append({
        "category": "IMU",
        "part_number": "ADIS16470",
        "description": ADI_CATALOG[0]["description"],
        "justification": f"{dof} ADIS16470 IMUs provide per-joint angle feedback for the {task} task at {payload}kg payload",
        "quantity": dof,
        "datasheet_url": ADI_CATALOG[0]["datasheet_url"],
    })

    # TMC2209 — if dof >= 4
    if dof >= 4:
        bom.append({
            "category": "Motor Driver",
            "part_number": "TMC2209",
            "description": ADI_CATALOG[2]["description"],
            "justification": f"Silent precise control of {dof} stepper joints for {task}",
            "quantity": dof,
            "datasheet_url": ADI_CATALOG[2]["datasheet_url"],
        })

    # LTC3780 — always
    bom.append({
        "category": "Power Management",
        "part_number": "LTC3780",
        "description": ADI_CATALOG[3]["description"],
        "justification": f"Regulated 12V rail for {dof} motor drivers from battery input",
        "quantity": 1,
        "datasheet_url": ADI_CATALOG[3]["datasheet_url"],
    })

    # AD7606C-18 — if payload >= 2.0
    if payload >= 2.0:
        bom.append({
            "category": "Signal Processor",
            "part_number": "AD7606C-18",
            "description": ADI_CATALOG[4]["description"],
            "justification": f"High-speed force/torque sampling needed for {payload}kg payload handling",
            "quantity": 1,
            "datasheet_url": ADI_CATALOG[4]["datasheet_url"],
        })

    # AD8221 — always
    bom.append({
        "category": "Amplifier",
        "part_number": "AD8221",
        "description": ADI_CATALOG[5]["description"],
        "justification": f"Strain gauge amplification for gripper load cells at {payload}kg",
        "quantity": 2,
        "datasheet_url": ADI_CATALOG[5]["datasheet_url"],
    })

    # ADXL345 — include for fast motion
    bom.append({
        "category": "IMU",
        "part_number": "ADXL345",
        "description": ADI_CATALOG[1]["description"],
        "justification": f"End-effector acceleration sensing for collision detection during {task}",
        "quantity": 1,
        "datasheet_url": ADI_CATALOG[1]["datasheet_url"],
    })

    return bom


@router.get("/bom")
async def get_bom() -> dict:
    spec = plan_mode.robot_specs.get("default")
    if not spec:
        logger.info("No robot spec found — using demo spec for BOM")
        spec = DEMO_SPEC
    bom = generate_bom(spec)
    return {"bom": bom}
