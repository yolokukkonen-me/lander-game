var Client = IgeClass.extend({
	classId: 'Client',
	init: function () {
		var self = this;
		self.obj = [];
		self.textures = {};

		// Mobile cache management
		self.setupMobileCacheBuster();

		// Load textures
		self.textures.ship = new IgeTexture('./assets/Ship.js');
		self.textures.rectangle = new IgeTexture('./assets/Rectangle.js');
		self.textures.orb = new IgeTexture('./assets/Orb.js');
		self.textures.font = new IgeFontSheet('./assets/agency_fb_20pt.png');

		// Implement our network events
		self.implement(ClientNetworkEvents);

		// Implement our externally declared methods
		self.implement(ClientWorld);
		self.implement(ClientTerrain);

		// Enable networking
		ige.addComponent(IgeNetIoComponent);

		// Add physics and setup physics world
		ige.addComponent(IgeBox2dComponent)
			.box2d.sleep(true)
			.box2d.gravity(0, 1)
			.box2d.createWorld()
			.box2d.mode(0) // Client-side rendering mode
			.box2d.start();

		// Wait for our textures to load before continuing
		ige.on('texturesLoaded', function () {
			// Create the HTML canvas
			ige.createFrontBuffer(true);

		// Start the networking (connect to server)
		// For production (51.250.30.92): use origin (Nginx proxy on port 80/443)
		// For local dev (localhost): use port 3000 directly
		var serverUrl;
		if (window.location.hostname === '51.250.30.92') {
			// Production: connect through Nginx
			serverUrl = window.location.origin;
		} else {
			// Local development: connect directly to Node.js on port 3000
			serverUrl = 'http://' + window.location.hostname + ':3000';
		}
		ige.network.start(serverUrl, function () {
			// Setup the network command listeners
			ige.network.define('playerEntity', self._onPlayerEntity);
			ige.network.define('terrainData', self._onTerrainData);
			ige.network.define('orbDeposited', self._onOrbDeposited);

	// Setup the network stream handler
	ige.network.addComponent(IgeStreamComponent)
		.stream.renderLatency(40) // Вернули 40ms для плавности
		// Create a listener that will fire whenever an entity
		// is created because of the incoming stream data
		.stream.on('entityCreated', function (entity) {
			// Entity interpolation happens automatically via IgeEntity._processInterpolate()
			// using the renderLatency buffer we set above (40ms)
		});

				// Start the engine
				ige.start(function (success) {
					// Check if the engine started successfully
					if (success) {
					// AGGRESSIVE: Prevent zoom on canvas element
					if (ige._canvas) {
						ige._canvas.style.touchAction = 'none';
						ige._canvas.style.msTouchAction = 'none';
						ige._canvas.style.msContentZooming = 'none';
						ige._canvas.style.cursor = 'none'; // Скрыть курсор
						
						// Block all zoom events on canvas
						ige._canvas.addEventListener('gesturestart', function(e) { e.preventDefault(); }, false);
						ige._canvas.addEventListener('gesturechange', function(e) { e.preventDefault(); }, false);
						ige._canvas.addEventListener('gestureend', function(e) { e.preventDefault(); }, false);
						ige._canvas.addEventListener('touchstart', function(e) {
							if (e.touches.length > 1) e.preventDefault();
						}, { passive: false });
						ige._canvas.addEventListener('touchmove', function(e) {
							if (e.touches.length > 1 || (e.scale && e.scale !== 1)) {
								e.preventDefault();
							}
						}, { passive: false });
						
						// BLOCK VIRTUAL MOUSE ZOOM на canvas
						ige._canvas.addEventListener('dblclick', function(e) {
							e.preventDefault();
							e.stopPropagation();
						}, { passive: false, capture: true });
						
						ige._canvas.addEventListener('mousewheel', function(e) {
							if (e.ctrlKey || e.metaKey) {
								e.preventDefault();
								e.stopPropagation();
							}
						}, { passive: false, capture: true });
						
						ige._canvas.addEventListener('DOMMouseScroll', function(e) {
							if (e.ctrlKey || e.metaKey) {
								e.preventDefault();
								e.stopPropagation();
							}
						}, { passive: false, capture: true });
						
						ige._canvas.addEventListener('contextmenu', function(e) {
							e.preventDefault();
							e.stopPropagation();
						}, { passive: false });
					}
						
						// Create the world (terrain will be created when we receive terrainData from server)
						self.createWorld();
						
					// Рисование статистики добавим позже через afterTick viewport

					// Define our player controls
					ige.input.mapAction('left', ige.input.key.left);
					ige.input.mapAction('right', ige.input.key.right);
					ige.input.mapAction('thrust', ige.input.key.up);
					ige.input.mapAction('drop', ige.input.key.space);
					
					// ВРЕМЕННО: Тестовая команда для генерации орбов (клавиша G)
					ige.input.mapAction('spawnOrbs', ige.input.key.g);
					
					// Focus on canvas to ensure it receives keyboard events
					if (ige._canvas) {
						ige._canvas.focus();
						ige._canvas.setAttribute('tabindex', '1'); // Make canvas focusable
					}

					// Setup client-side input polling (Isogenic doesn't emit action events, we need to poll!)
					// Track previous control states
					self._prevControls = {
						left: false,
						right: false,
						thrust: false,
						drop: false,
						spawnOrbs: false // ВРЕМЕННО: для тестирования генерации орбов
					};

				// Add a behavior that polls input state every frame
				ige.addBehaviour('clientInputPoll', function () {
					var leftState = ige.input.actionState('left');
					var rightState = ige.input.actionState('right');
					var thrustState = ige.input.actionState('thrust');
					var dropState = ige.input.actionState('drop');
					var spawnOrbsState = ige.input.actionState('spawnOrbs'); // ВРЕМЕННО

						// Check for state changes and send to server
						if (leftState !== self._prevControls.left) {
							if (leftState) {
								ige.network.send('playerControlLeftDown');
							} else {
								ige.network.send('playerControlLeftUp');
							}
							self._prevControls.left = leftState;
						}

						if (rightState !== self._prevControls.right) {
							if (rightState) {
								ige.network.send('playerControlRightDown');
							} else {
								ige.network.send('playerControlRightUp');
							}
							self._prevControls.right = rightState;
						}

						if (thrustState !== self._prevControls.thrust) {
							if (thrustState) {
								ige.network.send('playerControlThrustDown');
							} else {
								ige.network.send('playerControlThrustUp');
							}
							self._prevControls.thrust = thrustState;
						}

					if (dropState !== self._prevControls.drop) {
						if (dropState) {
							ige.network.send('playerControlDropDown');
						} else {
							ige.network.send('playerControlDropUp');
						}
						self._prevControls.drop = dropState;
					}
					
					// ВРЕМЕННО: Обработка клавиши G для генерации орбов
					if (spawnOrbsState !== self._prevControls.spawnOrbs) {
						if (spawnOrbsState) {
							console.log('🔵 [TEST] Requesting spawn of 10 orbs...');
							ige.network.send('testSpawnOrbs');
						}
						self._prevControls.spawnOrbs = spawnOrbsState;
					}
				});

		// Ask the server to create a player entity for us
		ige.network.send('playerEntity');

	// Setup virtual buttons (only on mobile devices with touch)
	self.setupVirtualButtons();

					// Camera zoom bounce animation removed; initial zoom is handled in ClientWorld and after trackTranslate
					}
				});
			});
		});
	},

	setupMobileCacheBuster: function () {
		// Detect if device is mobile
		var isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
		
		if (!isMobile) {
			return; // Skip on desktop
		}
		
		// ⚠️ ВАЖНО: При обновлении файлов измените версию здесь И в index.html!
		// Static app version - change this manually when you update the app
		var APP_VERSION = '3.3.0'; // 👈 Mobile buttons at bottom, desktop uses keyboard
		
		// Clear Service Worker caches on mobile device (one-time per session)
		var cacheCleared = sessionStorage.getItem('cacheClearedThisSession');
		if (!cacheCleared && 'caches' in window) {
			caches.keys().then(function(cacheNames) {
				if (cacheNames.length > 0) {
					console.log('Clearing', cacheNames.length, 'cache(s)...');
					return Promise.all(
						cacheNames.map(function(cacheName) {
							return caches.delete(cacheName);
						})
					);
				}
			}).then(function() {
				sessionStorage.setItem('cacheClearedThisSession', 'true');
			});
		}
	},

setupVirtualButtons: function() {
	var self = this;
	
	// Detect if device is mobile
	var isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
	
	// For testing: also check for touch support
	var hasTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
	
	// Show only on mobile OR if touch is available
	if (!isMobile && !hasTouch) {
		return; // Skip on desktop without touch
	}
	
	// Create touch control buttons at the BOTTOM of the screen
	var buttonsHTML = '<div id="mobileControls" style="position:fixed !important; bottom:20px !important; left:0 !important; right:0 !important; z-index:9999 !important; display:flex !important; justify-content:space-between !important; padding:0 20px !important; pointer-events:none !important;">' +
		'<div style="display:flex !important; gap:10px !important; pointer-events:auto !important;">' +
			'<button id="btnLeft" style="width:70px !important; height:70px !important; font-size:28px !important; background:rgba(100,100,100,0.9) !important; color:white !important; border:3px solid white !important; border-radius:12px !important; touch-action:none !important; cursor:pointer !important; -webkit-tap-highlight-color:transparent !important;">←</button>' +
			'<button id="btnRight" style="width:70px !important; height:70px !important; font-size:28px !important; background:rgba(100,100,100,0.9) !important; color:white !important; border:3px solid white !important; border-radius:12px !important; touch-action:none !important; cursor:pointer !important; -webkit-tap-highlight-color:transparent !important;">→</button>' +
		'</div>' +
		'<div style="display:flex !important; gap:10px !important; pointer-events:auto !important;">' +
			'<button id="btnThrust" style="width:70px !important; height:70px !important; font-size:28px !important; background:rgba(100,100,100,0.9) !important; color:white !important; border:3px solid white !important; border-radius:12px !important; touch-action:none !important; cursor:pointer !important; -webkit-tap-highlight-color:transparent !important;">↑</button>' +
			'<button id="btnDropAlt" style="width:70px !important; height:70px !important; font-size:16px !important; font-weight:bold !important; background:rgba(255,140,0,0.9) !important; color:white !important; border:3px solid white !important; border-radius:12px !important; touch-action:none !important; cursor:pointer !important; -webkit-tap-highlight-color:transparent !important;">DROP</button>' +
		'</div>' +
	'</div>';
	
	// Inject controls into DOM immediately
	document.body.insertAdjacentHTML('beforeend', buttonsHTML);
	
	// Setup button event listeners
	setTimeout(function() {
		// Left button - touch only for mobile
		var btnLeft = document.getElementById('btnLeft');
		if (btnLeft) {
			btnLeft.addEventListener('touchstart', function(e) { 
				e.preventDefault(); 
				ige.network.send('playerControlLeftDown');
			});
			btnLeft.addEventListener('touchend', function(e) { 
				e.preventDefault(); 
				ige.network.send('playerControlLeftUp');
			});
		}
		
		// Right button
		var btnRight = document.getElementById('btnRight');
		if (btnRight) {
			btnRight.addEventListener('touchstart', function(e) { 
				e.preventDefault(); 
				ige.network.send('playerControlRightDown');
			});
			btnRight.addEventListener('touchend', function(e) { 
				e.preventDefault(); 
				ige.network.send('playerControlRightUp');
			});
		}
		
		// Thrust button
		var btnThrust = document.getElementById('btnThrust');
		if (btnThrust) {
			btnThrust.addEventListener('touchstart', function(e) { 
				e.preventDefault(); 
				ige.network.send('playerControlThrustDown');
			});
			btnThrust.addEventListener('touchend', function(e) { 
				e.preventDefault(); 
				ige.network.send('playerControlThrustUp');
			});
		}
		
		// Drop button
		var btnDropAlt = document.getElementById('btnDropAlt');
		if (btnDropAlt) {
			btnDropAlt.addEventListener('touchstart', function(e) { 
				e.preventDefault(); 
				ige.network.send('playerControlDropDown');
			});
			btnDropAlt.addEventListener('touchend', function(e) { 
				e.preventDefault(); 
				ige.network.send('playerControlDropUp');
			});
		}
	}, 100);
}
});

if (typeof(module) !== 'undefined' && typeof(module.exports) !== 'undefined') { module.exports = Client; }
