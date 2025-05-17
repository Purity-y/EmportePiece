const five = require("johnny-five");
const express = require("express");

const app = express();
const port = 3000;

app.use(express.static('public')); // Serve static files from 'public' directory
app.use(express.json()); // To parse JSON body if we send data in POST, not strictly needed for this button

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: "API is running", timestamp: new Date().toISOString() });
});

// Emergency stop endpoint
app.post('/emergency-stop', (req, res) => {
  console.log("EMERGENCY STOP signal received!");
  emergencyStopRequested = true;
  isRunningInstructions = false; // Immediately mark instructions as not running

  // Disable motors via Enable pins for rapid stop
  if (motorAvancerEnablePinCtrl) {
    motorAvancerEnablePinCtrl.high(); // Disable motorAvancer
    console.log("Motor Avancer Disabled via Enable Pin.");
  }
  if (motorPlierEnablePinCtrl) {
    motorPlierEnablePinCtrl.high();   // Disable motorPlier
    console.log("Motor Plier Disabled via Enable Pin.");
  }

  // The commented-out motor.stop() calls remain, as they might not be effective
  // or could cause errors with the base Stepper API.
  // The primary stop mechanism is now the Enable pins and the emergencyStopRequested flag.

  if (motorAvancer) {
    // motorAvancer.stop();
    console.log("Attempted to stop motorAvancer. (Relying on Enable Pin and instruction loop termination)");
  }
  if (motorPlier) {
    // motorPlier.stop();
    console.log("Attempted to stop motorPlier. (Relying on Enable Pin and instruction loop termination)");
  }
  
  res.status(200).json({ message: "Emergency stop signal processed. Motors disabled via Enable Pins." });
});

app.listen(port, () => {
  console.log(`Mock API server listening at http://localhost:${port}`);
});

const board = new five.Board();

let motorAvancer;
let motorPlier;
let motorAvancerEnablePinCtrl; // ADDED: Control object for Avancer Enable Pin
let motorPlierEnablePinCtrl;   // ADDED: Control object for Plier Enable Pin
let isBoardReady = false;
let isRunningInstructions = false;
let lastPlierInstructionValeur = 0; // Variable to store the last PLIER value
let emergencyStopRequested = false; // ADDED: Flag for emergency stop


// ADD THESE CONSTANTS - Update with your actual pin numbers
const MOTOR_AVANCER_ENABLE_PIN = 11; // Example pin, please change
const MOTOR_PLIER_ENABLE_PIN = 5;   // Example pin, please change
// Logic for enable pins: LOW = Enabled, HIGH = Disabled (common for A4988/DRV8825)
// If your logic is inverted, adjust pin.high()/pin.low() calls accordingly.

board.on("ready", () => {
  console.log("Board ready!");

  // Initialize Enable Pins
  motorAvancerEnablePinCtrl = new five.Pin(MOTOR_AVANCER_ENABLE_PIN);
  motorPlierEnablePinCtrl = new five.Pin(MOTOR_PLIER_ENABLE_PIN);

  // Ensure motors are enabled by default when board is ready
  motorAvancerEnablePinCtrl.low(); // Enable motorAvancer
  motorPlierEnablePinCtrl.low();   // Enable motorPlier
  console.log(`Motor Enable Pins initialized: Avancer (Pin ${MOTOR_AVANCER_ENABLE_PIN}), Plier (Pin ${MOTOR_PLIER_ENABLE_PIN}). Motors enabled.`);

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
      step: 3, // Connect to PUL+
      dir: 9,  // Connect to DIR+
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
      step: 12, // Connect to PUL+
      dir: 10,  // Connect to DIR+
    },
  });

  

  isBoardReady = true;
  console.log("Motors initialized. Ready to receive instructions via interface.");

  // DO NOT run instructions automatically anymore
  // runInstructions(); 
});

// New endpoint to trigger instructions
app.post('/start-instructions', async (req, res) => {
  const instructionsFromRequest = req.body;
  console.log(req.body); // Added logging for the instructions

  emergencyStopRequested = false; // ADDED: Reset emergency stop flag

  // Ensure motors are re-enabled if they were disabled by an emergency stop
  if (isBoardReady) { // Only try to control pins if board is ready
    if (motorAvancerEnablePinCtrl) {
      motorAvancerEnablePinCtrl.low(); // Enable motorAvancer
    }
    if (motorPlierEnablePinCtrl) {
      motorPlierEnablePinCtrl.low();   // Enable motorPlier
    }
    console.log("Motor Enable Pins checked/set to LOW for instruction start.");
  }

  if (!instructionsFromRequest || !Array.isArray(instructionsFromRequest) || instructionsFromRequest.length === 0) {
    return res.status(400).json({ message: "Invalid or empty instructions array provided directly in the request body. Expected an array of instructions." });
  }

  // Log the received instructions here
  console.log("Received instructions:", JSON.stringify(instructionsFromRequest, null, 2)); // Added logging for the instructions

  if (!isBoardReady || !motorAvancer || !motorPlier) {
    console.log("Board or components not ready. Instructions will not be executed at this time."); // Added log for clarity
    return res.status(503).json({ message: "Board or components not ready yet. Please wait. Instructions received but not executed." });
  }
  if (isRunningInstructions) {
    return res.status(429).json({ message: "Instructions already in progress." });
  }

  isRunningInstructions = true;
  console.log("Received request to start instructions via interface.");
  try {
    await runInstructions(instructionsFromRequest);
    // Check if an emergency stop was requested during execution
    if (emergencyStopRequested) {
      // It's possible the emergency stop endpoint already sent a response.
      // However, if runInstructions completed because of the flag, we can send a specific message.
      // To avoid "Error [ERR_HTTP_HEADERS_SENT]: Cannot set headers after they are sent to the client",
      // we should only send a response if one hasn't been sent by /emergency-stop already.
      // For simplicity here, we assume /emergency-stop handles its own response and this endpoint
      // will only send a success if it runs to full completion without an emergency stop.
      // If runInstructions finished due to emergencyStop, the client would have gotten response from /emergency-stop.
      // If it's a very short instruction list and emergency stop is hit, this res.json might conflict.
      // A more robust solution would involve a state machine or ensuring only one response path.
      console.log("Instructions execution was halted by an emergency stop.");
      // No res.json here if emergency stop was the cause, as /emergency-stop likely responded.
      // If /emergency-stop did NOT send a response, you could add one here:
      // if (!res.headersSent) { // Check if headers were already sent
        res.status(200).json({ message: "Instructions sequence halted by emergency stop." });
      // }
    } else {
      // Only send this message if not emergency stopped
      res.status(201).json({ message: "All instructions completed successfully" });
      // res.json({ message: "All instructions completed successfully." });
    }
  } catch (error) {
    console.error("Error during instruction execution triggered by interface:", error);
    if (!res.headersSent) { // Avoid sending headers twice if error occurs after some response
        res.status(500).json({ message: "Error executing instructions." });
    }
  } finally {
    isRunningInstructions = false; 
  }
});

// Function to handle AVANCER action
function handleAvancer(instruction, motor) {
  return new Promise(async (resolve) => {
    // We need to convert mm to steps
    // For now, let's assume 'valeur' is steps for simplicity
    let steps = instruction.valeur;
    let isPlierMotor = false; // Flag to identify if it's the plier motor

    if(motor === motorAvancer) {
      const value = -instruction.valeur;
      const rayon = 45;
      const radian = value/rayon;
      const degret = radian*(180/Math.PI);
      steps = degret/1.8;
      console.log('value dure',value,degret,'value steps',steps,'value radian',radian);
    } else if(motor === motorPlier) {
      isPlierMotor = true;
      const degret = instruction.valeur / 2.55 + 30;
      steps = degret/1.8*30;
      console.log("Calculated steps for Plier motor:", steps);
    }
    const direction = steps > 0 ? 1 : 0; // 1 for clockwise, 0 for counter-clockwise
    const speed = 100; // RPM, adjust as needed

    if (steps !== 0) {
      const calculatedSteps = Math.abs(steps);
      console.log(`Motor ${isPlierMotor ? 'Plier' : 'Avancer'}: ${calculatedSteps} steps, direction: ${direction}, speed: ${speed} rpm`);
      
      await new Promise(innerResolve => { // Wait for the first step to complete
        motor.step({ steps: calculatedSteps, direction: direction, rpm: speed }, () => {
          console.log(`${isPlierMotor ? 'PLIER' : 'AVANCER'} movement completed.`);
          innerResolve();
        });
      });

      if(isPlierMotor) {
        console.log('Plier motor: Returning to initial position...');
        await new Promise(innerResolve => { // Wait for the return step to complete
          motor.step({ steps: calculatedSteps, direction: direction === 1 ? 0 : 1, rpm: speed }, () => {
            console.log('Plier motor: Return to initial position completed.');
            innerResolve();
          });
        });
      }
      resolve(); // Resolve the main promise after all movements for this call are done
    } else {
      console.log(`Motor ${isPlierMotor ? 'Plier' : 'Avancer'}: No steps to move.`);
      resolve();
    }
  });
}

// Function to execute a single instruction
function executeInstruction(instruction) {
  return new Promise(async (resolve) => {
    console.log(`Executing: ${instruction.action}, Value: ${instruction.valeur || 'N/A'}`);

    if (instruction.action === "AVANCER") {
      await handleAvancer(instruction, motorAvancer);
      resolve();
    } else if (instruction.action === "PLIER") {
      await handleAvancer(instruction, motorPlier);
      resolve();
    } else if (instruction.action === "COUPER") {
      //await handleAvancer(instruction, motorAvancer);
      console.log("COUPER action - (Not yet implemented)");
      resolve();
    } else {
      console.log("Unknown action:", instruction.action);
      resolve(); // Resolve even if unknown to continue sequence
    }
  });
}

// Function to run all instructions sequentially
async function runInstructions(instructionList) {
  // Ensure motors are defined before trying to use them if this function can be called before board ready
  if (!motorAvancer || !motorPlier) {
      console.error("Motors not initialized yet!");
      // Potentially throw an error or return early if this state is possible
      // However, our /start-instructions endpoint checks isBoardReady, which implies motors are set up.
      return;
  }
  if (instructionList && instructionList.length > 0) {
    console.log("\n--- Starting Instructions ---");
    for (const instruction of instructionList) {
      if (emergencyStopRequested) { // ADDED: Check for emergency stop
        console.log("EMERGENCY STOP triggered. Halting instruction execution loop.");
        break; // Exit the loop
      }
      await executeInstruction(instruction);
    }
    // After loop
    if (emergencyStopRequested) { // ADDED: Log if loop was exited due to emergency stop
      console.log("Instruction loop terminated by emergency stop.");
    } else {
      console.log("--- All instructions completed ---");
    }
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