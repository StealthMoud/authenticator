document.addEventListener('DOMContentLoaded', () => {
  const button = document.getElementById('request-btn');
  const status = document.getElementById('status');

  const requestPermission = async () => {
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      status.className = 'status-msg status-error';
      status.textContent = 'Camera access is unavailable in this browser.';
      return;
    }

    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    status.className = 'status-msg';
    status.textContent = 'Waiting for browser permission…';

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach((track) => track.stop());
      status.className = 'status-msg status-success';
      status.textContent = 'Camera access granted. Closing this tab…';
      setTimeout(() => window.close(), 700);
    } catch (error) {
      status.className = 'status-msg status-error';
      status.textContent = error && error.name === 'NotAllowedError'
        ? 'Camera access was not granted. Review the camera control in the address bar and try again.'
        : 'The camera could not be started. Close other camera apps and try again.';
      button.disabled = false;
      button.removeAttribute('aria-busy');
    }
  };

  button.addEventListener('click', requestPermission);
});
