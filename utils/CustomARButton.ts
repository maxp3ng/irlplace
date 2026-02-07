/**
 * Custom ARButton utility for WebXR with strict DOM Overlay support.
 */
class CustomARButton {
  static createButton(renderer: any, sessionInit: any = {}) {
    const button = document.createElement('button');

    function showStartAR() {
      let currentSession: any = null;

      async function onSessionStarted(session: any) {
        session.addEventListener('end', onSessionEnded);
        renderer.xr.setReferenceSpaceType('local');
        await renderer.xr.setSession(session);

        button.textContent = 'STOP AR';
        
        // Signal to our CSS that AR is live
        if (sessionInit.domOverlay?.root) {
          sessionInit.domOverlay.root.setAttribute('data-xr-active', 'true');
          sessionInit.domOverlay.root.style.display = 'block';
        }

        currentSession = session;
      }

      function onSessionEnded() {
        currentSession.removeEventListener('end', onSessionEnded);
        button.textContent = 'START AR';
        
        if (sessionInit.domOverlay?.root) {
          sessionInit.domOverlay.root.removeAttribute('data-xr-active');
          sessionInit.domOverlay.root.style.display = 'none';
        }

        currentSession = null;
      }

      // Button Styling
      button.style.display = '';
      button.style.cursor = 'pointer';
      button.textContent = 'START AR';

      button.onclick = () => {
        if (currentSession === null) {
          navigator.xr?.requestSession('immersive-ar', sessionInit)
            .then(onSessionStarted)
            .catch(err => console.error("WebXR Session Error:", err));
        } else {
          currentSession.end();
        }
      };
    }

    function stylizeElement(element: HTMLElement) {
      element.style.position = 'absolute';
      element.style.bottom = '20px';
      element.style.left = '50%';
      element.style.transform = 'translateX(-50%)';
      element.style.padding = '12px 24px';
      element.style.border = '1px solid #fff';
      element.style.borderRadius = '8px';
      element.style.background = 'rgba(0,0,0,0.5)';
      element.style.color = '#fff';
      element.style.font = 'bold 14px sans-serif';
      element.style.zIndex = '99999'; // Ensure it's above everything
    }

    if ('xr' in navigator) {
      button.style.display = 'none';
      stylizeElement(button);
      (navigator as any).xr.isSessionSupported('immersive-ar').then((supported: boolean) => {
        if (supported) showStartAR();
      });
      return button;
    } else {
      const msg = document.createElement('div');
      msg.textContent = 'AR NOT SUPPORTED';
      stylizeElement(msg);
      return msg;
    }
  }
}

export { CustomARButton };