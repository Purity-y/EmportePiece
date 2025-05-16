const five = require("johnny-five");
const express = require("express");

const app = express();
const port = 3000;

app.use(express.static('public')); // Serve static files from 'public' directory
app.use(express.json()); // To parse JSON body if we send data in POST, not strictly needed for this button

// Mock instructions - later this would come from an external API call
const instructions = [
  { action: "AVANCER", valeur: 100 },
  { action: "PLIER", valeur: 90 },
  { action: "AVANCER", valeur: 50 },
  { action: "PLIER", valeur: -45 },
  { action: "COUPER" },
];

app.get("/instructions", (req, res) => {
  res.json(instructions);
});

app.listen(port, () => {
  console.log(`Mock API server listening at http://localhost:${port}`);
});

const board = new five.Board();

let motorAvancer;
let motorPlier;
let servoMoteur;
let isBoardReady = false;
let isRunningInstructions = false;
let lastPlierInstructionValeur = 0; // Variable to store the last PLIER value

// Servo Configuration
const SERVO_PIN = 9; // <<< IMPORTANT: Change this to your servo's actual pin
const SERVO_ROD_DOWN_POSITION = 10; // Degrees
const SERVO_ROD_UP_POSITION = 90;   // Degrees
const SERVO_MOVE_DURATION = 1000; // Milliseconds, time to allow for servo to move

board.on("ready", () => {
  console.log("Board ready!");

  // Define stepper motor for AVANCER
  // IMPORTANT: Replace with your actual pin numbers
  // Pins: PUL-, PUL+, DIR-, DIR+
  // Johnny-Five stepper supports various interfaces.
  // For PUL/DIR, we use the DRIVER interface.
  // motor1.step(steps, direction, speed, callback)
  motorAvancer = new five.Stepper({
    type: five.Stepper.TYPE.DRIVER,
    stepsPerRev: 200, // Adjust if your motor has a different number of steps per revolution
    pins: {
      step: 2, // Connect to PUL+
      dir: 3,  // Connect to DIR+
      // PUL- and DIR- should be connected to GND if your driver requires it.
      // Or, if they are enable pins, connect them appropriately.
    },
  });

  // Define stepper motor for PLIER
  // IMPORTANT: Replace with your actual pin numbers
  motorPlier = new five.Stepper({
    type: five.Stepper.TYPE.DRIVER,
    stepsPerRev: 180, // Adjust if your motor has a different number of steps per revolution
    pins: {
      step: 4, // Connect to PUL+
      dir: 5,  // Connect to DIR+
    },
  });

  servoMoteur = new five.Servo(SERVO_PIN);
  console.log(`Servo initialized on pin ${SERVO_PIN}`);
  // Optionally move servo to a default position on start
  servoMoteur.to(SERVO_ROD_UP_POSITION);

  isBoardReady = true;
  console.log("Motors and Servo initialized. Ready to receive instructions via interface.");

  // DO NOT run instructions automatically anymore
  // runInstructions(); 
});

// New endpoint to trigger instructions
app.post('/start-instructions', async (req, res) => {
  if (!isBoardReady || !motorAvancer || !motorPlier || !servoMoteur) {
    return res.status(503).json({ message: "Board or components not ready yet. Please wait." });
  }
  if (isRunningInstructions) {
    return res.status(429).json({ message: "Instructions already in progress." });
  }

  isRunningInstructions = true;
  console.log("Received request to start instructions via interface.");
  try {
    await runInstructions(); // Make sure runInstructions can access motors
    res.json({ message: "Instructions sequence started successfully." });
  } catch (error) {
    console.error("Error during instruction execution triggered by interface:", error);
    res.status(500).json({ message: "Error executing instructions." });
  } finally {
    isRunningInstructions = false; 
  }
});

// Function to handle AVANCER action
function handleAvancer(instruction, motor) {
  return new Promise((resolve) => {
    // We need to convert mm to steps
    // For now, let's assume 'valeur' is steps for simplicity
    const steps = instruction.valeur;
    const direction = steps > 0 ? 1 : 0; // 1 for clockwise, 0 for counter-clockwise
    const speed = 1800; // RPM, adjust as needed

    if (steps !== 0) {
      console.log(`Motor Avancer: ${Math.abs(steps)} steps, direction: ${direction}, speed: ${speed} rpm`);
      motor.step({ steps: Math.abs(steps), direction: direction, rpm: speed }, () => {
        console.log("AVANCER completed.");
        resolve();
      });
    } else {
      resolve();
    }
  });
}

// Function to handle PLIER action
function handlePlier(instruction, motor, servo) {
  return new Promise(async (resolve) => {
    const steps = instruction.valeur; // This is the target value for the plier action
    const speed = 1000; // RPM, adjust as needed

    if (steps > 0) {
      // Positive value: Servo UP, then Plier action
      console.log("Plier (positive): Moving servo to UP position...");
      await new Promise(r => {
        servo.to(SERVO_ROD_UP_POSITION);
        setTimeout(() => {
          console.log("Plier (positive): Servo assumed UP position reached.");
          r();
        }, SERVO_MOVE_DURATION);
      });

      console.log(`Motor Plier: Executing positive action - ${steps} steps`);
      motor.step({ steps: steps, direction: 1, rpm: speed }, () => {
        console.log("PLIER (positive) completed.");
        resolve();
      });

    } else if (steps < 0) {
      // Negative value: MotorPlier 180 deg turn, Servo UP, then Plier action
      const preliminaryTurnSteps = 180;
      const preliminaryTurnDirection = 1; // Assuming CW for the 180-degree turn

      console.log(`Plier (negative): Preliminary 180-degree turn for motorPlier (${preliminaryTurnSteps} steps)...`);
      await new Promise(r => {
        motor.step({ steps: preliminaryTurnSteps, direction: preliminaryTurnDirection, rpm: speed }, () => {
          console.log("Plier (negative): Preliminary 180-degree turn completed.");
          r();
        });
      });

      console.log("Plier (negative): Moving servo to UP position...");
      await new Promise(r => {
        servo.to(SERVO_ROD_UP_POSITION);
        setTimeout(() => {
          console.log("Plier (negative): Servo assumed UP position reached.");
          r();
        }, SERVO_MOVE_DURATION);
      });

      console.log(`Motor Plier: Executing negative action - ${Math.abs(steps)} steps, direction 0`);
      // For negative steps, direction is 0 (e.g. CCW)
      motor.step({ steps: Math.abs(steps), direction: 0, rpm: speed }, () => {
        console.log("PLIER (negative) completed.");
        resolve();
      });
    } else { // steps === 0
      console.log("PLIER action: No movement (0 steps).");
      resolve();
    }
  });
}

// Function to handle RESET_POSITION action
function handleResetPosition(servo, plierMotor, previousPlierValeur) {
  return new Promise(async (resolve) => {
    console.log("Executing RESET_POSITION sequence...");

    // 1. Servo moves rod to DOWN position (and stays there)
    await new Promise(r => {
      console.log(`Servo: Moving to ROD_DOWN_POSITION (${SERVO_ROD_DOWN_POSITION} deg)`);
      servo.to(SERVO_ROD_DOWN_POSITION);
      setTimeout(() => {
        console.log("Servo: Assumed ROD_DOWN_POSITION reached.");
        r();
      }, SERVO_MOVE_DURATION);
    });

    // 2. Plier motor resets based on previous PLIER instruction value
    let resetSteps = 0;
    if (previousPlierValeur > 0) {
      resetSteps = -previousPlierValeur;
      console.log(`Motor Plier (Reset): Calculated resetSteps = ${resetSteps} (based on previous positive plier: ${previousPlierValeur})`);
    } else if (previousPlierValeur < 0) {
      // If previous plier was negative, it did +180 then previousPlierValeur.
      // Net displacement = 180 + previousPlierValeur.
      // To reset, move by -(180 + previousPlierValeur).
      resetSteps = -(180 + previousPlierValeur);
      console.log(`Motor Plier (Reset): Calculated resetSteps = ${resetSteps} (based on previous negative plier: ${previousPlierValeur}, includes preliminary +180 compensation)`);
    } else {
      console.log("Motor Plier (Reset): No previous plier value or it was 0. No reset movement.");
    }
    
    const speed = 1000; // Consistent speed
    if (resetSteps !== 0) {
      const resetDirection = resetSteps > 0 ? 1 : 0;
      const stepsToMove = Math.abs(resetSteps);
      console.log(`Motor Plier (Reset): Moving ${stepsToMove} steps, direction: ${resetDirection}, speed: ${speed} rpm`);
      await new Promise(r => {
        plierMotor.step({ steps: stepsToMove, direction: resetDirection, rpm: speed }, () => {
          console.log("Motor Plier (Reset): Rotation completed.");
          r();
        });
      });
    } else {
      console.log("Motor Plier (Reset): No steps to move for reset.");
    }

    console.log("RESET_POSITION sequence completed.");
    resolve();
  });
}

// Function to fetch instructions (simulated)
async function fetchInstructions() {
  try {
    // In a real scenario, you'd fetch from your actual API endpoint
    // const response = await fetch('YOUR_API_ENDPOINT/instructions');
    // const data = await response.json();
    // For now, we use the mock API
    const response = await fetch(`http://localhost:${port}/instructions`);
    const data = await response.json();
    console.log("Fetched instructions:", data);
    return data;
  } catch (error) {
    console.error("Error fetching instructions:", error);
    return [];
  }
}

// Function to execute a single instruction
function executeInstruction(instruction) {
  return new Promise(async (resolve) => {
    console.log(`Executing: ${instruction.action}, Value: ${instruction.valeur || 'N/A'}`);

    if (instruction.action === "AVANCER") {
      await handleAvancer(instruction, motorAvancer);
      resolve();
    } else if (instruction.action === "PLIER") {
      lastPlierInstructionValeur = instruction.valeur; // Store the plier value
      await handlePlier(instruction, motorPlier, servoMoteur);
      // Automatically call ResetPosition after PLIER completes
      console.log("PLIER action completed, initiating ResetPosition sequence...");
      await handleResetPosition(servoMoteur, motorPlier, lastPlierInstructionValeur); // Pass the stored value
      resolve();
    } else if (instruction.action === "COUPER") {
      // TODO: Implement logic for COUPER (Servomotor later)
      console.log("COUPER action - (Servomotor not yet implemented)");
      resolve();
    } else {
      console.log("Unknown action:", instruction.action);
      resolve(); // Resolve even if unknown to continue sequence
    }
  });
}

// Function to run all instructions sequentially
async function runInstructions() {
  // Ensure motors are defined before trying to use them if this function can be called before board ready
  if (!motorAvancer || !motorPlier || !servoMoteur) {
      console.error("Motors or Servo not initialized yet!");
      // Potentially throw an error or return early if this state is possible
      // However, our /start-instructions endpoint checks isBoardReady, which implies motors are set up.
      return;
  }
  const instructionList = await fetchInstructions();
  if (instructionList.length > 0) {
    console.log("\n--- Starting Instructions ---");
    for (const instruction of instructionList) {
      await executeInstruction(instruction);
    }
    console.log("--- All instructions completed ---");
  } else {
    console.log("No instructions to execute.");
  }
  // process.exit(0); // Uncomment to exit after completion
}

// Start the process - REMOVED, will be triggered by button
// runInstructions();

board.on("error", (err) => {
  console.error("Board error:", err);
});

// Note: To use 'fetch' in Node.js versions prior to 18,
// you might need to install 'node-fetch': npm install node-fetch
// and then require it: const fetch = require('node-fetch');
// However, modern Node.js (18+) has fetch built-in globally.
// We've used express for the mock API, which doesn't require node-fetch for itself.
// The 'fetch' call to localhost will use the global fetch if available. 