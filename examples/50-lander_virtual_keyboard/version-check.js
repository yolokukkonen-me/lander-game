// Version check and cache busting for mobile Chrome
(function() {
    'use strict';
    
    var CURRENT_VERSION = '20251102001';
    var VERSION_KEY = 'game_version';
    
    // Check stored version
    var storedVersion = localStorage.getItem(VERSION_KEY);
    
    if (storedVersion && storedVersion !== CURRENT_VERSION) {
        console.log('Version changed from', storedVersion, 'to', CURRENT_VERSION);
        console.log('Clearing cache and reloading...');
        
        // Clear localStorage
        localStorage.clear();
        
        // Clear sessionStorage
        sessionStorage.clear();
        
        // Try to clear service worker cache if exists
        if ('serviceWorker' in navigator && 'caches' in window) {
            caches.keys().then(function(names) {
                for (var i = 0; i < names.length; i++) {
                    caches.delete(names[i]);
                }
            });
        }
        
        // Store new version
        localStorage.setItem(VERSION_KEY, CURRENT_VERSION);
        
        // Force hard reload with cache bypass
        window.location.reload(true);
        
    } else if (!storedVersion) {
        // First time loading - store version
        console.log('First load, storing version:', CURRENT_VERSION);
        localStorage.setItem(VERSION_KEY, CURRENT_VERSION);
    } else {
        console.log('Version OK:', CURRENT_VERSION);
    }
})();

