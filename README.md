# Contrôle de Moteur Pas à Pas avec Johnny-Five et ConfigurableFirmata

Ce projet permet de contrôler un moteur pas à pas connecté à une carte Arduino (ou similaire) via une interface web. Il utilise Node.js, Express, Socket.io et la bibliothèque Johnny-Five pour communiquer avec le firmware ConfigurableFirmata (ou StandardFirmata) sur l'Arduino.

## Prérequis

1.  **Arduino avec Firmata** :
    *   Votre carte Arduino doit avoir `ConfigurableFirmata` (ou `StandardFirmata`) téléversé.
        *   Pour `ConfigurableFirmata` : Ouvrez l'IDE Arduino, Fichier > Exemples > Firmata > ConfigurableFirmata. Avant de téléverser, vous pourriez avoir besoin de décommenter `#define STEPPER_SUPPORT` dans le fichier .ino si ce n'est pas fait par défaut, pour assurer le support des moteurs pas à pas.
        *   Pour `StandardFirmata` : Fichier > Exemples > Firmata > StandardFirmata (le support Stepper est généralement inclus).
    *   Notez le port série sur lequel votre Arduino est connecté (ex: `COM3` sous Windows, `/dev/ttyUSB0` sous Linux, `/dev/cu.usbmodemXXXX` sous macOS). Johnny-Five essaiera de le détecter automatiquement, mais vous pouvez le spécifier dans `app.js` si besoin (`J5_PORT`).

2.  **Node.js et npm** :
    *   Installez Node.js (qui inclut npm) depuis [nodejs.org](https://nodejs.org/).

3.  **Matériel Moteur Pas à Pas**:
    *   Un moteur pas à pas.
    *   Un driver pour moteur pas à pas compatible (ex: ULN2003, A4988, DRV8825).
    *   Câblage approprié entre l'Arduino, le driver, et le moteur.

## Installation

1.  Clonez ce dépôt (ou copiez les fichiers du projet).
2.  Ouvrez un terminal dans le dossier du projet.
3.  Installez les dépendances Node.js :
    ```bash
    npm install
    ```

## Configuration Cruciale dans `app.js`

Ouvrez le fichier `app.js` et modifiez les constantes dans la section `// --- CONFIGURATION MOTEUR PAS A PAS ---` :

*   `MOTOR_TYPE`: Définit le type de driver et d'interface de broches.
    *   `five.Stepper.TYPE.FOUR_WIRE`: Pour les drivers comme ULN2003 qui contrôlent 4 bobines. `MOTOR_PINS` doit être un tableau de 4 numéros de broches. Ex: `[8, 9, 10, 11]`.
    *   `five.Stepper.TYPE.DRIVER`: Pour les drivers basés sur STEP/DIR comme A4988 ou DRV8825. `MOTOR_PINS` doit être un objet avec les broches `step` et `dir`. Ex: `{ step: 2, dir: 3 }`.
*   `MOTOR_PINS`: Les broches de l'Arduino connectées au driver du moteur, comme décrit ci-dessus.
*   `STEPS_PER_REVOLUTION`: Le nombre total de pas que votre moteur effectue pour une révolution complète (360°). Cette valeur est cruciale pour des rotations précises.
    *   Exemples: 200 (pour un moteur de 1.8°/pas), 400 (pour 0.9°/pas), 2048 ou 4096 (pour un moteur 28BYJ-48 avec sa boîte de vitesses, selon le mode).
*   `MOTOR_RPM`: La vitesse de rotation souhaitée pour le moteur en tours par minute (RPM). Ajustez en fonction des capacités de votre moteur et driver.

*Optionnel : Configuration du Port Johnny-Five*
*   `J5_PORT`: Si Johnny-Five ne détecte pas automatiquement le port de votre Arduino, décommentez la ligne `// const J5_PORT = "COM4";` et remplacez `"COM4"` par le port correct.

## Utilisation

1.  Assurez-vous que votre Arduino avec `ConfigurableFirmata` (ou `StandardFirmata`) est connecté à votre PC.
2.  **Vérifiez bien la configuration du moteur dans `app.js` !**
3.  Démarrez le serveur Node.js :
    ```bash
    npm start
    ```
4.  Ouvrez votre navigateur web et allez à `http://localhost:3000`.

L'interface web affichera :
*   L'état de la connexion à l'Arduino et au moteur.
*   Des boutons "Rotation +90°" et "Rotation -90°".
*   Un log affichant les messages de communication avec le moteur.

## Dépannage

*   **"Échec de connexion à la carte Arduino..." / "Board not ready" / "Device or resource busy"**:
    *   Assurez-vous que `ConfigurableFirmata` (ou `StandardFirmata`) est bien téléversé sur l'Arduino.
    *   Vérifiez que le bon port est utilisé (configurez `J5_PORT` dans `app.js` si nécessaire).
    *   Assurez-vous qu'aucun autre logiciel (comme l'IDE Arduino, un terminal série, etc.) n'utilise le port série en même temps.
    *   Redémarrez l'Arduino et le script Node.js.
    *   Sur Linux, vous pourriez avoir besoin de droits d'accès au port série (ajoutez votre utilisateur au groupe `dialout` ou `tty`).
*   **Le moteur ne tourne pas ou tourne bizarrement**:
    *   Vérifiez attentivement le câblage entre l'Arduino, le driver et le moteur.
    *   Assurez-vous que les `MOTOR_PINS`, `MOTOR_TYPE`, et `STEPS_PER_REVOLUTION` dans `app.js` sont corrects pour *votre* moteur et *votre* câblage.
    *   Vérifiez l'alimentation du moteur (certains drivers nécessitent une alimentation externe pour les moteurs).
    *   Essayez une valeur de `MOTOR_RPM` plus faible.
    *   Si vous utilisez `ConfigurableFirmata`, assurez-vous que le support `STEPPER` est bien activé lors du téléversement.
*   **Les rotations ne sont pas de 90°**:
    *   La cause la plus probable est une valeur incorrecte pour `STEPS_PER_REVOLUTION` dans `app.js`.

## Fonctionnalités

- Contrôle individuel de la vitesse de chaque moteur avec sliders
- Commandes directionnelles (avancer, reculer, tourner à gauche/droite)
- Séquences prédéfinies (carré, zigzag, rotation)
- Contrôle au clavier avec les flèches et la barre d'espace
- Journal en temps réel des actions

## Configuration avancée

Pour personnaliser les broches ou ajouter un contrôle de direction, modifiez la section de configuration des moteurs dans `app.js`:

```javascript
motor1 = new Motor({
  pins: {
    pwm: 6,
    dir: 2,
    cdir: 3
  }
});
``` 