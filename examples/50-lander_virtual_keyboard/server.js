var Server = IgeClass.extend({
	classId: 'Server',
	Server: true,

	init: function (options) {
		var self = this;

		// Define an object to hold references to our player entities
		this.players = {};
		
		// Система слотов для 4 игроков на платформе (0-3)
		// Каждый слот соответствует позиции на платформе
		this.playerSlots = {}; // clientId -> slotNumber (0-3)
		this.availableSlots = [0, 1, 2, 3]; // Свободные слоты

		// Add the server-side game methods / event handlers
		this.implement(ServerNetworkEvents);
		this.implement(ServerTerrain);

	// Add physics and setup physics world
	ige.addComponent(IgeBox2dComponent)
		.box2d.sleep(true)
		.box2d.gravity(0, 1) // ORIGINAL gravity value!
		.box2d.createWorld()
		.box2d.mode(1) // Server-side physics mode
		.box2d.start();

		// Add the networking component
		ige.addComponent(IgeNetIoComponent)
			// Start the network server on port 3000
			.network.start(3000, function () {
				// Networking has started so start the game engine
				ige.start(function (success) {
					// Check if the engine started successfully
					if (success) {
				// Create some network commands we will need
				ige.network.define('terrainData'); // Allow clients to receive terrain data
				ige.network.define('orbDeposited'); // Allow server to notify clients about orb deposits
				
				ige.network.define('playerEntity', self._onPlayerEntity);
						ige.network.define('playerControlLeftDown', self._onPlayerLeftDown);
						ige.network.define('playerControlRightDown', self._onPlayerRightDown);
						ige.network.define('playerControlThrustDown', self._onPlayerThrustDown);
						ige.network.define('playerControlDropDown', self._onPlayerDropDown);
						ige.network.define('playerControlLeftUp', self._onPlayerLeftUp);
						ige.network.define('playerControlRightUp', self._onPlayerRightUp);
						ige.network.define('playerControlThrustUp', self._onPlayerThrustUp);
						ige.network.define('playerControlDropUp', self._onPlayerDropUp);

						ige.network.on('connect', self._onPlayerConnect);
						ige.network.on('disconnect', self._onPlayerDisconnect);

		// Add the network stream component
		ige.network.addComponent(IgeStreamComponent)
			.stream.sendInterval(25) // COMBO: Send updates every 25ms (40fps) - faster for smoother sync
			.stream.start(); // Start the stream

						// Accept incoming network connections
						ige.network.acceptConnections(true);

						// Create the scene
						self.mainScene = new IgeScene2d()
							.id('mainScene');

						self.scene1 = new IgeScene2d()
							.id('scene1')
							.mount(self.mainScene);

						// Create the main viewport
						self.vp1 = new IgeViewport()
							.id('vp1')
							.autoSize(true)
							.scene(self.mainScene)
							.drawBounds(false)
							.mount(ige);

					// Generate terrain on server (shared for all clients)
					self.createTerrain();

					// CRITICAL: Setup Box2D contact listener for orb pickup, landing, crash detection
				ige.box2d.contactListener(
					// Listen for when contacts begin
					function (contact) {
						// First, handle orb deposit on landing pad (can happen without player collision)
							if (contact.igeEitherCategory('orb') && contact.igeEitherCategory('landingPad')) {
								var orb = contact.igeEntityByCategory('orb');
								var landingPad = contact.igeEntityByCategory('landingPad');
								
								// Check if ANY player is carrying this orb
								var carrierPlayer = null;
								for (var id in ige.server.players) {
									if (ige.server.players[id]._carryingOrb && ige.server.players[id]._orb === orb) {
										carrierPlayer = ige.server.players[id];
										break;
									}
								}
								
							if (carrierPlayer) {
								// A player is carrying this orb - score!
								
								// Calculate score before destroying orb
								var distScore = orb.distanceBonus(landingPad);
								var scoreValue = orb._scoreValue;
								
								// Send network message to all clients to show score text
								ige.network.send('orbDeposited', {
									orbId: orb.id(),
									landingPadPos: {
										x: landingPad._translate.x,
										y: landingPad._translate.y
									},
									beingCarried: true,
									scoreValue: scoreValue,
									distScore: distScore
								});
								
								// Drop the orb (destroys joint)
								carrierPlayer.dropOrb();
								
								// Deposit the orb (awards score and destroys orb)
								orb.deposit(true, landingPad, carrierPlayer);
							} else {
								// Orb just fell on pad (not being carried)
								
								// Calculate score before destroying orb
								var distScore = orb.distanceBonus(landingPad);
								var scoreValue = orb._scoreValue;
								
								// Send network message to all clients to show score text
								ige.network.send('orbDeposited', {
									orbId: orb.id(),
									landingPadPos: {
										x: landingPad._translate.x,
										y: landingPad._translate.y
									},
									beingCarried: false,
									scoreValue: scoreValue,
									distScore: distScore
								});
								
								orb.deposit(false, landingPad, null);
							}
								return; // Exit early after handling orb deposit
							}
							
							// Get player from contact if one exists
							var player = null;
							var playerId = null;

							// Find which player is involved in the contact
							for (var id in ige.server.players) {
								if (contact.igeEntityA() === ige.server.players[id] || contact.igeEntityB() === ige.server.players[id]) {
									player = ige.server.players[id];
									playerId = id;
									break;
								}
							}

							if (!player) return; // No player involved in this contact

							// Floor collision (crash)
							if (contact.igeEitherCategory('floor') && contact.igeEitherCategory('ship')) {
								player.crash();
							} 
						// Landing pad collision
						else if (contact.igeEitherCategory('landingPad') && contact.igeEitherCategory('ship')) {
							// Clear old orb data (игрок теперь может снова подобрать любой орб)
							player._oldOrb = null;
							// Force sync to clear red overlay on client
							player.streamSync();

								// Check landing angle
								var degrees = Math.degrees(player._rotate.z);
								var wound = Math.round(degrees / 360);

								if (wound > 0) {
									degrees -= (360 * wound);
								}
								if (wound < 0) {
									degrees -= (360 * wound);
								}

								player._rotate.z = Math.radians(degrees);

							if (degrees > 30 || degrees < -30) {
								player.crash();
					} else {
						player._landed = true;
					}
						}
							// Orb pickup (sensor collision)
                            else if (!player._carryingOrb && contact.igeEitherCategory('orb') && contact.igeEitherCategory('ship')) {
                                // Prevent pickup while landed on a platform
                                if (player._landed) { return; }
								// Check if it's a sensor collision
								if (contact.m_fixtureA.IsSensor() || contact.m_fixtureB.IsSensor()) {
									// Get the orb
									var orb = contact.igeEntityByCategory('orb');
									if (orb) {
										player.carryOrb(orb, contact);
									}
								}
							}
						},
						// Listen for when contacts end
						function (contact) {
							// Find which player is involved
							var player = null;
							for (var id in ige.server.players) {
								if (contact.igeEntityA() === ige.server.players[id] || contact.igeEntityB() === ige.server.players[id]) {
									player = ige.server.players[id];
									break;
								}
							}

							if (!player) return;

							// Player took off from landing pad
							if (contact.igeEitherCategory('landingPad') && contact.igeEitherCategory('ship')) {
								player._landed = false;
							}
						}
					);
					
					// Добавляем поведение для проверки границ карты
					ige.addBehaviour('checkBounds', function () {
						// Границы карты (те же что и на клиенте)
						var MAP_MIN_X = -500;
						var MAP_MAX_X = 3700;
						var MAP_MIN_Y = -500;
						var MAP_MAX_Y = 1000;
						
						// Проверяем всех игроков
						for (var clientId in ige.server.players) {
							var player = ige.server.players[clientId];
							if (player && player._translate && !player._crashed) {
								var x = player._translate.x;
								var y = player._translate.y;
								
						// Если игрок вышел за границы карты - взрываем
						if (x < MAP_MIN_X || x > MAP_MAX_X || y < MAP_MIN_Y || y > MAP_MAX_Y) {
							player.crash();
						}
							}
						}
						
						// Проверяем все орбы на сцене
						if (ige.server.scene1 && ige.server.scene1._children) {
							var entities = ige.server.scene1._children;
							for (var i = entities.length - 1; i >= 0; i--) {
								var entity = entities[i];
								if (entity && entity._classId === 'Orb' && entity._translate) {
									var x = entity._translate.x;
									var y = entity._translate.y;
									
								// Если орб вышел за границы карты - удаляем его
								if (x < MAP_MIN_X || x > MAP_MAX_X || y < MAP_MIN_Y || y > MAP_MAX_Y) {
									// Если орб несет игрок, сбрасываем его
										for (var clientId in ige.server.players) {
											var player = ige.server.players[clientId];
											if (player._carryingOrb && player._orb === entity) {
												player.dropOrb();
												break;
											}
										}
										
										// Удаляем орб
										entity.destroy();
									}
								}
							}
						}
					});

					// Добавляем поведение для проверки количества орбов и их генерации
					var orbCheckTimer = 0;
					var ORB_CHECK_INTERVAL = 3000; // Проверяем каждые 3 секунды
					
					ige.addBehaviour('checkOrbCount', function () {
						var currentTime = ige._currentTime;
						
						// Обрабатываем очередь спавна орбов каждый кадр
						self.processSpawnQueue();
						
						// Проверяем количество орбов только раз в N миллисекунд
						if (currentTime - orbCheckTimer >= ORB_CHECK_INTERVAL) {
							orbCheckTimer = currentTime;
							self.checkAndSpawnOrbs();
						}
					});
				}
			});
		});
	},
	
	/**
	 * Вычисляет позицию спавна для указанного слота (0-3)
	 * Слоты размещены на первой платформе с минимальным расстоянием
	 */
	getSpawnPositionForSlot: function(slotNumber) {
		var spawnX = 400; // Default center
		var spawnY = 100; // Default height
		
		if (ige.server.landingPadPositions && ige.server.landingPadPositions.length > 0) {
			var padCenterX = ige.server.landingPadPositions[0][0];
			var padY = ige.server.landingPadPositions[0][1];
			
			// Платформа: 80px (от padX-40 до padX+40)
			// Корабль: 20px ширина
			// 4 слота с минимальным зазором: -30, -10, +10, +30
			var slotOffsets = [-30, -10, 10, 30];
			
			spawnX = padCenterX + slotOffsets[slotNumber];
			spawnY = padY - 30; // 30px над платформой
		}
		
		return { x: spawnX, y: spawnY };
	},
	
	/**
	 * Выделяет слот для игрока при подключении
	 */
	assignSlot: function(clientId) {
		if (this.availableSlots.length > 0) {
			var slot = this.availableSlots.shift(); // Берем первый свободный слот
			this.playerSlots[clientId] = slot;
			return slot;
		}
		// Если все слоты заняты, возвращаем null (можно расширить до 5+ игроков если нужно)
		return null;
	},
	
	/**
	 * Освобождает слот при отключении игрока
	 */
	releaseSlot: function(clientId) {
		var slot = this.playerSlots[clientId];
		if (slot !== undefined) {
			this.availableSlots.push(slot);
			this.availableSlots.sort(); // Сортируем для последовательного заполнения
			delete this.playerSlots[clientId];
		}
	}
});

if (typeof(module) !== 'undefined' && typeof(module.exports) !== 'undefined') { module.exports = Server; }
