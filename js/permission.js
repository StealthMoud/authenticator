document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('request-btn');
  const status = document.getElementById('status');

  const requestPermission = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach(track => track.stop());
      if (status) {
        status.className = 'status-msg status-success';
        status.textContent = '✓ Camera permission granted! Closing tab...';
      }
      setTimeout(() => {
        window.close();
      }, 700);
    } catch (err) {
      console.warn('Camera permission error:', err);
      if (status) {
        status.className = 'status-msg status-error';
        status.textContent = 'Permission denied. Please check your browser address bar permissions.';
      }
    }
  };

  if (btn) btn.addEventListener('click', requestPermission);
  
  // Auto prompt on load
  requestPermission();
});
