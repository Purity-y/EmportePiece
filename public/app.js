document.addEventListener('DOMContentLoaded', () => {
    const startButton = document.getElementById('startButton');
    const statusDiv = document.getElementById('status');

    startButton.addEventListener('click', async () => {
        startButton.disabled = true;
        statusDiv.textContent = 'Exécution des instructions en cours...';

        try {
            const response = await fetch('/start-instructions', {
                method: 'POST',
            });

            if (response.ok) {
                const result = await response.json();
                statusDiv.textContent = result.message || 'Instructions lancées!';
                // Re-enable button after a short delay or based on further status updates
                setTimeout(() => {
                    startButton.disabled = false;
                    // statusDiv.textContent = 'Prêt à démarrer.'; // Optionally reset status
                }, 2000); // Adjust delay as needed
            } else {
                const errorResult = await response.json();
                statusDiv.textContent = `Erreur: ${errorResult.message || response.statusText}`;
                startButton.disabled = false;
            }
        } catch (error) {
            console.error('Error starting instructions:', error);
            statusDiv.textContent = 'Erreur de communication avec le serveur.';
            startButton.disabled = false;
        }
    });
}); 