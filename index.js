const five = require("johnny-five");
const express = require("express");
const http = require('http'); // Required for socket.io
const { Server } = require("socket.io"); // Required for socket.io

const SIMULATION_MODE = true; // Mettre à false pour le fonctionnement normal avec Arduino
const SIMULATION_DELAY_MS = 500; // Délai en ms pour simuler chaque étape en mode simulation

const app = express();
const server = http.createServer(app); // Create HTTP server for socket.io
const io = new Server(server, { // Initialize socket.io
  cors: {
    origin: "*", // Allow all origins for simplicity, adjust for production
    methods: ["GET", "POST"]
  }
});
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

server.listen(port, () => { // socket.io listens on this server
  console.log(`API and WebSocket server listening at http://localhost:${port}`);
});

const board = SIMULATION_MODE ? null : new five.Board(); // Ne pas initialiser le board en mode simulation

let motorAvancer;
let motorPlier;
let motorAvancerEnablePinCtrl; // ADDED: Control object for Avancer Enable Pin
let motorPlierEnablePinCtrl;   // ADDED: Control object for Plier Enable Pin
let isBoardReady = false;
let isRunningInstructions = false;
let lastPlierInstructionValeur = 0; // Variable to store the last PLIER value
let emergencyStopRequested = false; // ADDED: Flag for emergency stop
let currentProgress = 0; // Variable to store current progress percentage


// ADD THESE CONSTANTS - Update with your actual pin numbers
const MOTOR_AVANCER_ENABLE_PIN = 11; // Example pin, please change
const MOTOR_PLIER_ENABLE_PIN = 5;   // Example pin, please change
// Logic for enable pins: LOW = Enabled, HIGH = Disabled (common for A4988/DRV8825)
// If your logic is inverted, adjust pin.high()/pin.low() calls accordingly.

if (SIMULATION_MODE) {
  console.log("<<<<< MODE SIMULATION ACTIF >>>>>");
  isBoardReady = true; // En mode simulation, la carte est considérée comme prête immédiatement
  // Simuler l'existence des pins de contrôle pour éviter les erreurs
  motorAvancerEnablePinCtrl = { low: () => console.log("SIM: motorAvancerEnablePinCtrl.low()"), high: () => console.log("SIM: motorAvancerEnablePinCtrl.high()") };
  motorPlierEnablePinCtrl = { low: () => console.log("SIM: motorPlierEnablePinCtrl.low()"), high: () => console.log("SIM: motorPlierEnablePinCtrl.high()") };
  
  // Simuler l'initialisation des moteurs pour que les vérifications ne échouent pas
  motorAvancer = { step: () => console.log("SIM: motorAvancer.step()") };
  motorPlier = { step: () => console.log("SIM: motorPlier.step()") };
  
  console.log("SIM: Board et moteurs simulés prêts.");
  // Appeler motorEnablePinCtrl.low() pour simuler l'activation des moteurs
  motorAvancerEnablePinCtrl.low();
  motorPlierEnablePinCtrl.low();

} else {
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
}

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
    io.emit('progress_update', { percentage: 0, message: "Board or components not ready.", error: true });
    return res.status(503).json({ message: "Board or components not ready yet. Please wait. Instructions received but not executed." });
  }
  if (isRunningInstructions) {
    io.emit('progress_update', { percentage: 0, message: "Instructions already in progress.", error: true });
    return res.status(429).json({ message: "Instructions already in progress." });
  }

  isRunningInstructions = true;
  io.emit('progress_update', { percentage: 0, message: "Starting instructions..." });
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
        io.emit('progress_update', { percentage: currentProgress, message: "Instructions halted by emergency stop.", error: true });
      // }
    } else {
      // Only send this message if not emergency stopped
      res.status(201).json({ message: "All instructions completed successfully" });
      io.emit('instructions_complete', { message: "All instructions completed successfully." });
      // res.json({ message: "All instructions completed successfully." });
    }
  } catch (error) {
    console.error("Error during instruction execution triggered by interface:", error);
    io.emit('progress_update', { percentage: currentProgress, message: "Error executing instructions.", error: true });
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
    if (SIMULATION_MODE) {
      const motorName = motor === motorAvancer ? 'Avancer' : 'Plier';
      console.log(`SIM: Action ${instruction.action} pour moteur ${motorName} avec valeur ${instruction.valeur}. Délai: ${SIMULATION_DELAY_MS}ms`);
      setTimeout(() => {
        console.log(`SIM: ${instruction.action} pour moteur ${motorName} terminée.`);
        if (motorName === 'Plier') { // Simuler le retour du moteur Plier
          console.log(`SIM: Moteur Plier retourne à la position initiale. Délai: ${SIMULATION_DELAY_MS}ms`);
          setTimeout(() => {
            console.log(`SIM: Moteur Plier retourné à la position initiale.`);
            resolve();
          }, SIMULATION_DELAY_MS);
        } else {
          resolve();
        }
      }, SIMULATION_DELAY_MS);
      return;
    }

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

    if (SIMULATION_MODE && instruction.action !== "COUPER") { // Couper n'a pas de délai spécifique pour l'instant en simu
        const motorToSimulate = instruction.action === "AVANCER" ? motorAvancer : motorPlier;
        await handleAvancer(instruction, motorToSimulate); // handleAvancer gère déjà le délai de simulation
        resolve();
        return;
    }
    // La gestion de COUPER en mode simulation se fera ci-dessous si nécessaire, 
    // ou on peut ajouter une logique de délai spécifique ici aussi pour COUPER.

    if (instruction.action === "AVANCER") {
      await handleAvancer(instruction, motorAvancer);
      resolve();
    } else if (instruction.action === "PLIER") {
      await handleAvancer(instruction, motorPlier);
      resolve();
    } else if (instruction.action === "COUPER") {
      //await handleAvancer(instruction, motorAvancer);
      console.log("COUPER action - (Not yet implemented)");
      if (SIMULATION_MODE) {
        console.log(`SIM: Action COUPER. Délai: ${SIMULATION_DELAY_MS / 2}ms`); // Délai plus court pour couper
        setTimeout(() => {
          console.log("SIM: COUPER terminée.");
          resolve();
        }, SIMULATION_DELAY_MS / 2);
      } else {
        resolve(); // Résoudre immédiatement si pas de simulation et pas d'implémentation Arduino
      }
    } else {
      console.log("Unknown action:", instruction.action);
      resolve(); // Resolve even if unknown to continue sequence
    }
  });
}

// Function to run all instructions sequentially
async function runInstructions(instructionList) {
  if (!Array.isArray(instructionList)) {
    console.error("instructionList is not an array:", instructionList);
    io.emit('progress_update', { percentage: 0, message: "Invalid instruction format.", error: true });
    return;
  }
  const totalInstructions = instructionList.length;
  if (totalInstructions === 0) {
    console.log("Instruction list is empty.");
    io.emit('instructions_complete', { message: "Instruction list is empty." });
    return;
  }

  console.log(`Starting execution of ${totalInstructions} instructions.`);
  io.emit('progress_update', { percentage: 0, message: `Starting ${totalInstructions} instructions.`, totalInstructions });

  for (let i = 0; i < totalInstructions; i++) {
    if (emergencyStopRequested) {
      console.log("Emergency stop requested. Halting instruction execution.");
      io.emit('progress_update', { percentage: currentProgress, message: "Emergency stop activated.", error: true });
      break; // Exit the loop
    }
    const instruction = instructionList[i];
    console.log(`Executing instruction ${i + 1}/${totalInstructions}:`, instruction);
    await executeInstruction(instruction);
    
    currentProgress = Math.round(((i + 1) / totalInstructions) * 100);
    console.log(`Progress: ${currentProgress}%`);
    io.emit('progress_update', { 
      percentage: currentProgress, 
      message: `Executed: ${instruction.action} ${instruction.valeur || ''}`,
      currentInstruction: i + 1,
      totalInstructions: totalInstructions
    });

    // Optional: Add a small delay if needed, e.g., for smoother progress updates
    // await new Promise(resolve => setTimeout(resolve, 50)); 
  }

  if (!emergencyStopRequested) {
    console.log("All instructions executed.");
    // io.emit('instructions_complete', { message: "All instructions executed." }); // This is handled in the calling function's success path
  }
  // Reset emergency stop for the next run, or manage its state more globally if needed.
  // emergencyStopRequested = false; // It's reset when /start-instructions is called
}

io.on('connection', (socket) => {
  console.log('A user connected to WebSocket');
  socket.emit('connection_ack', { message: "Successfully connected to WebSocket." });

  socket.on('disconnect', () => {
    console.log('User disconnected from WebSocket');
  });
});

if (board) { // Seulement attacher les listeners si le board existe (pas en mode simulation)
  board.on("error", (err) => {
    console.error("Board error:", err);
  });
}

// Note: To use 'fetch' in Node.js versions prior to 18,
// you might need to install 'node-fetch': npm install node-fetch
// and then require it: const fetch = require('node-fetch');
// However, modern Node.js (18+) has fetch built-in globally.
// We've used express for the mock API, which doesn't require node-fetch for itself.
// The 'fetch' call to localhost will use the global fetch if available. 