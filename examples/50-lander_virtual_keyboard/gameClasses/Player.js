var Player = IgeEntityBox2d.extend({
	classId: 'Player',

	init: function (id) {
		IgeEntityBox2d.prototype.init.call(this);
		var self = this;

	self._thrustPower = 0.5; // ORIGINAL value!
	self._fuel = 100;
	self._score = 0;
	self._orbsCollected = 0; // Количество собранных орбов
	
	// Initialize crash state (will be synced via streamSections)
	self._crashed = false;

	// Initialize orb carrying state (will be synced via streamSections for network optimization)
	self._carryingOrb = false;
	self._orbId = null;

	// Initialize player number (server-assigned, streamed to clients) and color
	self._playerNumber = 0;
	self._shipColor = null;

	// Server-only state: is the ship currently landed on a pad
	self._landed = false;

	self.controls = {
		left: false,
		right: false,
		thrust: false,
		drop: false
	};

		// Set ID only if provided and not already set (server-side creation)
		if (id && !self._id) {
			self.id(id);
		}
		self.addComponent(IgeVelocityComponent)
			.category('ship')
			.width(20)
			.height(20);

	// Set texture only on client side
	if (ige.isClient) {
		self.texture(ige.client.textures.ship);
		// Set initial color based on default / current player number
		self.applyPlayerColor && self.applyPlayerColor();
	}

	// CRITICAL: Define custom stream sections for network sync!
	this.streamSections(['transform', 'orbCarrying', 'playerStats', 'crashState', 'controls', 'playerNumber', 'orbsCollected', 'landedState', 'droppedOrb']);

	// Store fixture definitions for later physics setup
	if (ige.isServer) {
		// Define the polygon for collision
		var triangles,
			fixDefs,
			collisionPoly = new IgePoly2d()
			.addPoint(0, -this._bounds2d.y2)
			.addPoint(this._bounds2d.x2, this._bounds2d.y2)
			.addPoint(0, this._bounds2d.y2 - 5)
			.addPoint(-this._bounds2d.x2, this._bounds2d.y2);

		// Scale the polygon by the box2d scale ratio
		collisionPoly.divide(ige.box2d._scaleRatio);

		// Now convert this polygon into an array of triangles
		triangles = collisionPoly.triangulate();
		this.triangles = triangles;

		// Create an array of box2d fixture definitions
		// based on the triangles
		fixDefs = [];

	for (var i = 0; i < this.triangles.length; i++) {
		fixDefs.push({
			density: 1.0,
			friction: 1.0,
			restitution: 0.2,
				filter: {
					categoryBits: 0x0004,
					maskBits: 0xffff & ~0x0008
				},
				shape: {
					type: 'polygon',
					data: this.triangles[i]
				}
			});
		}

		// Add a sensor to the fixtures so we can detect
		// when the ship is near an orb
		fixDefs.push({
			density: 0.0,
			friction: 0.0,
			restitution: 0.0,
			isSensor: true,
			filter: {
				categoryBits: 0x0008,
				maskBits: 0x0100
			},
			shape: {
				type: 'circle',
				data: {
					radius: 60
				}
			}
		});

		// Store fixtures for setupPhysics call
		self._fixtureDefs = fixDefs;
	}

	// Add a particle emitter for the thrust particles (client-side only)
	// Particles are created locally on each client based on synced controls.thrust state
	if (ige.isClient) {
		self.thrustEmitter = new IgeParticleEmitter()
			// Set the particle entity to generate for each particle
			.particle(ThrustParticle)
			// Set particle life to 300ms
			.lifeBase(300)
			// Set output to 60 particles a second (1000ms)
			.quantityBase(60)
			.quantityTimespan(1000)
			// Set the particle's death opacity to zero so it fades out as it's lifespan runs out
			.deathOpacityBase(0)
			// Set velocity vector to y = 0.05, with variance values
			.velocityVector(new IgePoint3d(0, 0.05, 0), new IgePoint3d(-0.04, 0.05, 0), new IgePoint3d(0.04, 0.15, 0))
			// Mount new particles to the object scene
			.particleMountTarget(ige.client.objectScene)
			// Move the particle emitter to the bottom of the ship
			.translateTo(0, 5, 0)
			// Mount the emitter to the ship
			.mount(self);
	}

		// Test particle emitter
		/*new IgeParticleEmitter()
			// Set the particle entity to generate for each particle
			.particle(ExplosionParticle)
			// Set particle life to 600ms
			.lifeBase(600)
			// Set output to 60 particles a second (1000ms)
			.quantityBase(100)
			.quantityTimespan(300)
			// Set the particle's death opacity to zero so it fades out as it's lifespan runs out
			.deathOpacityBase(0)
			// Set velocity vector to y = 0.05, with variance values
			.velocityVector(new IgePoint3d(0, -0.1, 0), new IgePoint3d(-0.1, -0.1, 0), new IgePoint3d(0.1, 0.1, 0))
			// Set a linear force vector so the particles get "dragged" down
			.linearForceVector(new IgePoint3d(0, 0.5, 0))
			// Mount new particles to the object scene
			.particleMountTarget(ige.client.objectScene)
			// Set a lifespan so the emitter removes itself
			//.lifeSpan(400)
			// Mount the emitter to the ship
			.mount(ige.client.objectScene)
			// Move the particle emitter to the bottom of the ship
			.translateTo(this._translate.x, this._translate.y, 0)
		// Start the emitter
		.start();*/
	},

	/**
	 * Override the default IgeEntity class streamSectionData() method
	 * so that we can handle custom data sections for network synchronization.
	 * @param {String} sectionId A string identifying the section to
	 * handle data get / set for.
	 * @param {*=} data If present, this is the data that has been sent
	 * from the server to the client for this entity.
	 * @return {*}
	 */
	streamSectionData: function (sectionId, data) {
		// Check if the section is one that we are handling
		if (sectionId === 'orbCarrying') {
			// Check if the server sent us data, if not we are supposed
			// to return the data instead of set it
			if (data !== undefined) {
				// CLIENT: Parse and set orb carrying state
				var parsedData = (typeof data === 'string') ? JSON.parse(data) : data;
				
				// Ensure orb carrying state is initialized (for network-streamed players)
				if (this._carryingOrb === undefined) {
					this._carryingOrb = false;
					this._orbId = null;
				}
				
				this._carryingOrb = parsedData.carrying;
				this._orbId = parsedData.orbId;
			} else {
				// SERVER: Return current orb carrying state as JSON string
				// This state is NOT sent over network constantly - only updated when changed
				// Line rendering happens locally on all clients based on this synced state
				var returnData = {
					carrying: this._carryingOrb || false,
					orbId: this._orbId || null
				};
				return JSON.stringify(returnData);
			}
		} else if (sectionId === 'playerStats') {
			// Handle fuel and score synchronization
			if (data !== undefined) {
				// CLIENT: Parse and set fuel/score
				var parsedData = (typeof data === 'string') ? JSON.parse(data) : data;
				this._fuel = parsedData.fuel;
				this._score = parsedData.score;
			} else {
				// SERVER: Return current fuel/score as JSON string
				var returnData = {
					fuel: this._fuel,
					score: this._score
				};
				return JSON.stringify(returnData);
			}
		} else if (sectionId === 'crashState') {
			// Handle crash state synchronization
			if (data !== undefined) {
				// CLIENT: Parse and set crash state
				var parsedData = (typeof data === 'string') ? JSON.parse(data) : data;
				var wasCrashed = this._crashed;
				this._crashed = parsedData.crashed;
				
				// Trigger crash effects on client if state changed to crashed
				if (!wasCrashed && this._crashed) {
					this._showCrashEffect();
				}
				
				// Trigger respawn cleanup on client if state changed from crashed to not crashed
				if (wasCrashed && !this._crashed) {
					this._onRespawn();
				}
			} else {
				// SERVER: Return current crash state as JSON string
				var returnData = {
					crashed: this._crashed
				};
				return JSON.stringify(returnData);
			}
	} else if (sectionId === 'controls') {
		// Handle controls synchronization (for particle effects on client)
		if (data !== undefined) {
			// CLIENT: Parse and set controls
			var parsedData = (typeof data === 'string') ? JSON.parse(data) : data;
			
			// Ensure controls object exists
			if (!this.controls) {
				this.controls = {
					left: false,
					right: false,
					thrust: false,
					drop: false
				};
			}
			
			// Update controls state
			this.controls.left = parsedData.left || false;
			this.controls.right = parsedData.right || false;
			this.controls.thrust = parsedData.thrust || false;
			this.controls.drop = parsedData.drop || false;
        } else {
			// SERVER: Return current controls as JSON string
			return JSON.stringify(this.controls);
		}
    } else if (sectionId === 'playerNumber') {
        // Handle player number sync (for per-player ship color)
        if (data !== undefined) {
            // CLIENT: Parse and set player number
            var parsedData = (typeof data === 'string') ? JSON.parse(data) : data;
            this._playerNumber = (parsedData && parsedData.number != null) ? parsedData.number : 0;
            // Apply color immediately when player number arrives
            if (ige.isClient && this.applyPlayerColor) { this.applyPlayerColor(); }
        } else {
            // SERVER: Return current number
            return JSON.stringify({ number: this._playerNumber || 0 });
        }
    } else if (sectionId === 'orbsCollected') {
        // Handle orbs collected sync (for player stats UI)
        if (data !== undefined) {
            // CLIENT: Parse and set orbs collected
            var parsedData = (typeof data === 'string') ? JSON.parse(data) : data;
            this._orbsCollected = (parsedData && parsedData.count != null) ? parsedData.count : 0;
        } else {
            // SERVER: Return current count
            return JSON.stringify({ count: this._orbsCollected || 0 });
        }
    } else if (sectionId === 'landedState') {
        // Handle landed state sync (для визуальной подсказки - красные орбы)
        if (data !== undefined) {
            // CLIENT: Parse and set landed state
            var parsedData = (typeof data === 'string') ? JSON.parse(data) : data;
            this._landed = parsedData.landed || false;
        } else {
            // SERVER: Return current landed state
            return JSON.stringify({ landed: this._landed || false });
        }
    } else if (sectionId === 'droppedOrb') {
        // Handle dropped orb ID sync (для визуальной подсказки - красный последний отпущенный орб)
        if (data !== undefined) {
            // CLIENT: Parse and set dropped orb ID
            var parsedData = (typeof data === 'string') ? JSON.parse(data) : data;
            this._oldOrbId = parsedData.orbId || null;
        } else {
            // SERVER: Return current dropped orb ID
            var orbId = (this._oldOrb && this._oldOrb.id) ? this._oldOrb.id() : null;
            return JSON.stringify({ orbId: orbId });
        }
    } else {
			// The section was not one that we handle here, so pass this
			// to the super-class streamSectionData() method - it handles
			// the "transform" section by itself
			return IgeEntityBox2d.prototype.streamSectionData.call(this, sectionId, data);
		}
	},

	setupPhysics: function () {
		// Setup the box2d physics body after position has been set
		if (ige.isServer && this._fixtureDefs && !this._box2dBody) {
			// Store current PIXEL position before creating body
			var pixelPos = {
				x: this._translate.x,
				y: this._translate.y,
				rotation: this._rotate.z
			};

		this.box2dBody({
			type: 'dynamic',
			linearDamping: 0.1, // Increased damping for smoother movement and less visible server corrections
			angularDamping: 0.6, // Smoother rotations, less jerky corrections
			allowSleep: true,
					bullet: true,
					gravitic: true,
					fixedRotation: false,
					fixtures: this._fixtureDefs
				});

		// Set Box2D body position using Box2D API
		if (this._box2dBody) {
			// Convert pixel coordinates to Box2D coordinates
			var box2dX = pixelPos.x / ige.box2d._scaleRatio;
			var box2dY = pixelPos.y / ige.box2d._scaleRatio;
			
			var b2Vec2 = new ige.box2d.b2Vec2(box2dX, box2dY);
			this._box2dBody.SetPosition(b2Vec2);
			this._box2dBody.SetAngle(pixelPos.rotation);
			
			// CRITICAL: Set gravity properties!
			this._box2dBody.m_gravityScale = 1.0;
			this._box2dBody.m_nonGravitic = false; // Explicitly allow gravity
			
			// Wake up and activate the body
			this._box2dBody.SetActive(true);
			this._box2dBody.SetAwake(true);
		}
		}
		return this;
	},

	crash: function () {
		var self = this;

		this.dropOrb();

		// SERVER: Reset physics and position, set crash state
		if (ige.isServer) {
			// Set crash state and sync with clients
			this._crashed = true;
			this.streamSync(); // Sync crash state to clients
			
			// Stop movement but keep body active (to avoid Box2D errors)
			if (this._box2dBody) {
				this._box2dBody.SetLinearVelocity(new ige.box2d.b2Vec2(0, 0));
				this._box2dBody.SetAngularVelocity(0);
			}

			// Schedule respawn (server-side)
			var self = this;
			setTimeout(function () {
				self.respawn();
			}, 3000); // 3 second respawn delay
		}
	},

_showCrashEffect: function () {
	// Only show effects on client
	if (!ige.isClient) return;
	
	var isOurPlayer = (this === ige.client.player);
	
	// Hide the ship immediately on crash
	this.hide();
	
	// Create explosion particle emitter for ALL players (local rendering)
	new IgeParticleEmitter()
		// Set the particle entity to generate for each particle
		.particle(ExplosionParticle)
		// Set particle life to 600ms
		.lifeBase(400)
		// Set output to 60 particles a second (1000ms)
		.quantityBase(100)
		.quantityTimespan(150)
		// Set the particle's death opacity to zero so it fades out as it's lifespan runs out
		.deathOpacityBase(0)
		// Set velocity vector to y = 0.05, with variance values
		.velocityVector(new IgePoint3d(0, -0.1, 0), new IgePoint3d(-0.1, -0.1, 0), new IgePoint3d(0.1, 0.1, 0))
		// Set a linear force vector so the particles get "dragged" down
		.linearForceVector(new IgePoint3d(0, 0.5, 0))
		// Mount new particles to the object scene
		.particleMountTarget(ige.client.objectScene)
		// Set a lifespan so the emitter removes itself
		.lifeSpan(150)
		// Mount the emitter to the ship
		.mount(ige.client.objectScene)
		// Move the particle emitter to the bottom of the ship
		.translateTo(this._translate.x, this._translate.y, 0)
		// Start the emitter
		.start();

	// Create countdown text ONLY for our player
	if (isOurPlayer) {
		this._countDownText = new ClientCountDown('Respawn in ', 3, 's', 1000)
			.translateTo(this._translate.x, this._translate.y, 0)
			.rotateTo(0, 0, -ige.client.vp1.camera._rotate.z)
			.mount(ige.client.objectScene)
			.start();
		
		// Add a tween on the countdown text for fun!
		this._countDownText._rotate.tween()
			.duration(2000)
			.properties({z: Math.radians(360)})
			.easing('outElastic')
			.start();
	}
},

	respawn: function () {
		// SERVER: Reset physics and position
		if (ige.isServer) {
			// Используем сохраненный слот игрока для респавна
			var spawnPos;
			if (this._spawnSlot !== undefined) {
				spawnPos = ige.server.getSpawnPositionForSlot(this._spawnSlot);
			} else {
				// Fallback если слот не сохранен (не должно случиться)
				spawnPos = { x: 400, y: 100 };
				console.log('Warning: Player respawned without spawn slot!');
			}

			// Reset player transform
			this.rotateTo(0, 0, 0)
				.translateTo(spawnPos.x, spawnPos.y, 0);

			// Reset Box2D body
			if (this._box2dBody) {
				// Convert to Box2D coords
				var box2dX = spawnPos.x / ige.box2d._scaleRatio;
				var box2dY = spawnPos.y / ige.box2d._scaleRatio;
				
				this._box2dBody.SetPosition(new ige.box2d.b2Vec2(box2dX, box2dY));
				this._box2dBody.SetAngle(0);
				this._box2dBody.SetAngularVelocity(0);
				this._box2dBody.SetLinearVelocity(new ige.box2d.b2Vec2(0, 0));
				this._box2dBody.SetAwake(true);
			}

			// Reset fuel, deduct score, and clear crash state
			this._fuel = 100;
			this._score -= 100;
			this._crashed = false;
			
		// Устанавливаем флаг "только что респавнился"
		// Это блокирует управление и захват орбов на 3 секунды для стабилизации позиции
		this._justRespawned = true;
		
		// Принудительная синхронизация позиции (несколько раз для надежности)
		this.streamSync(); // 1-я отправка
		
		var self = this;
		setTimeout(function() {
			self.streamSync(); // 2-я отправка через 50ms
		}, 50);
		
		setTimeout(function() {
			self.streamSync(); // 3-я отправка через 100ms
		}, 100);
		
		// Разрешить движение и захват орбов через 3 секунды
		setTimeout(function() {
			self._justRespawned = false;
		}, 3000);
		}
	},

_onRespawn: function () {
	// Only handle respawn on client
	if (!ige.isClient) return;
	
	var isOurPlayer = (this === ige.client.player);
	
	// КРИТИЧНО: Временно отключить интерполяцию для мгновенной синхронизации
	// Вариант 1: Сбросить буфер интерполяции позиции
	if (this._translateBuffered) {
		this._translateBuffered = null;
	}
	if (this._rotateBuffered) {
		this._rotateBuffered = null;
	}
	
	// Вариант 2: Временно отключить renderLatency
	var oldLatency = null;
	if (ige.network && ige.network.stream && ige.network.stream._renderLatency !== undefined) {
		oldLatency = ige.network.stream._renderLatency;
		ige.network.stream._renderLatency = 0; // Мгновенная синхронизация
	}
	
	// Восстановить renderLatency через 3 секунды (синхронно с разблокировкой управления на сервере)
	if (oldLatency !== null) {
		setTimeout(function() {
			if (ige.network && ige.network.stream) {
				ige.network.stream._renderLatency = oldLatency;
			}
		}, 3000);
	}
	
	// Show the ship again after respawn
	this.show();
	
	if (isOurPlayer && this._countDownText) {
		// Remove countdown text
		this._countDownText.destroy();
		delete this._countDownText;

		// Show crash penalty score
		new ClientScore('-' + (100) + ' for crash!')
			.colorOverlay('#ff6f6f')
			.translateTo(this._translate.x, this._translate.y + 50, 0)
			.mount(ige.client.objectScene)
			.start();
	}
},

	tick: function (ctx) {
		// Process player controls on the server (ORIGINAL PHYSICS!)
		if (ige.isServer) {
			// Игнорировать управление сразу после респавна
			// Это предотвращает "отбрасывание назад" из-за рассинхронизации клиент-сервер
			if (this._justRespawned) {
				// Пропускаем обработку управления, но продолжаем tick для физики
				return IgeEntityBox2d.prototype.tick.call(this, ctx);
			}
			
			// ORIGINAL: Use SetAngularVelocity (not ApplyTorque!)
			if (this.controls.left) {
				this._box2dBody.SetAngularVelocity(-2.5); // Direct velocity set!
			} else if (this.controls.right) {
				this._box2dBody.SetAngularVelocity(2.5); // Direct velocity set!
			} else {
				// Stop rotation when no input
				if (this._box2dBody.GetAngularVelocity() !== 0) {
					this._box2dBody.SetAngularVelocity(0);
				}
			}

			if (this.controls.thrust && this._fuel > 0) {
				// ORIGINAL: Calculate thrust vector with angle offset
				var radians = this._rotate.z + Math.radians(-90),
					thrustVector = new ige.box2d.b2Vec2(
						Math.cos(radians) * this._thrustPower,
						Math.sin(radians) * this._thrustPower
					);

				this._box2dBody.ApplyForce(thrustVector, this._box2dBody.GetWorldCenter());
				this._box2dBody.SetAwake(true);

				// Reduce fuel
				this._fuel -= 0.005 * ige._tickDelta;
				if (this._fuel < 0) {
					this._fuel = 0;
				}
			}

		if (this.controls.drop) {
			this.dropOrb();
			this.controls.drop = false; // Reset after dropping
			// Force sync to update _oldOrbId on client (для красного оверлея)
			this.streamSync();
		}
		}

		if (this._landed) {
			if (this._fuel < 100) {
				this._fuel += 0.05 * ige._tickDelta;

				if (this._fuel > 100) {
					this._fuel = 100;
				}
			}
		}

		// Scale the camera based on flight height
		var camScale = 1 + (0.1 * (this._translate.y / 100));
		//ige.$('vp1').camera.scaleTo(camScale, camScale, camScale);

		IgeEntityBox2d.prototype.tick.call(this, ctx);

		// Client-side rendering only
		if (ige.isClient) {
			// Only render UI and special effects for OUR player
			var isOurPlayer = (this === ige.client.player);

	// CRITICAL: Manage thrust particles on CLIENT for ALL players based on controls state synced from server!
	// Particles are NOT sent over network - created locally based on controls.thrust state
	
	// Create emitter if it doesn't exist (for network-streamed players)
	if (!this.thrustEmitter) {
		this.thrustEmitter = new IgeParticleEmitter()
			.particle(ThrustParticle)
			.lifeBase(300)
			.quantityBase(60)
			.quantityTimespan(1000)
			.deathOpacityBase(0)
			.velocityVector(new IgePoint3d(0, 0.05, 0), new IgePoint3d(-0.04, 0.05, 0), new IgePoint3d(0.04, 0.15, 0))
			.particleMountTarget(ige.client.objectScene)
			.translateTo(0, 5, 0)
			.mount(this);
	}
	
	// Ensure controls exists
	if (!this.controls) {
		this.controls = {
			left: false,
			right: false,
			thrust: false,
			drop: false
		};
	}
	
	// Control emitter based on thrust state
	if (this.controls.thrust && this._fuel > 0) {
		if (this.thrustEmitter && !this.thrustEmitter._started) {
			this.thrustEmitter.start();
		}
	} else {
		if (this.thrustEmitter && this.thrustEmitter._started) {
			this.thrustEmitter.stop();
		}
	}
		
		// OPTIMIZED: Draw orb carrying line locally for ALL players based on synced state
		// Line is NOT sent over network - only _carryingOrb and _orbId are synced
		// This renders the line on each client independently for better performance
		if (this._carryingOrb && this._orbId) {
			// Get orb reference by ID (synced from server)
			var orb = ige.$(this._orbId);
			
			if (orb) {
				ctx.save();
					ctx.rotate(-this._rotate.z);
					ctx.strokeStyle = '#a6fff6';
					ctx.lineWidth = 2;
					ctx.beginPath();
					ctx.moveTo(0, 0);
					ctx.lineTo(orb._translate.x - this._translate.x, orb._translate.y - this._translate.y);
					ctx.stroke();
				ctx.restore();
			}
		}

			// Update UI only for our player
			if (isOurPlayer) {
				// Update the fuel progress bar to show player fuel
				if (ige.$('player_fuelBar')) {
					ige.$('player_fuelBar').progress(this._fuel);
				}

				if (ige.$('scoreText')) {
					ige.$('scoreText').text(this._score + ' points');
				}
			}

			if (this._dropTime && this._dropTime < this._currentTime - 2000) {
				// Remove the old orb from memory so we can pick
				// it up again if required
				delete this._oldOrb;
				delete this._dropTime;
			}
		}
	},

carryOrb: function (orb, contact) {
    // Do not allow pickup while landed OR just respawned
    if (this._landed || this._justRespawned) { return; }
    if (!this._oldOrb || (this._oldOrb !== orb)) {
		var distanceJointDef = new ige.box2d.b2DistanceJointDef(),
			bodyA = contact.m_fixtureA.m_body,
			bodyB = contact.m_fixtureB.m_body;

		distanceJointDef.Initialize(
			bodyA,
			bodyB,
			bodyA.GetWorldCenter(),
			bodyB.GetWorldCenter()
		);

		this._orbRope = ige.box2d._world.CreateJoint(distanceJointDef);

		this._carryingOrb = true;
		this._orb = orb;
		this._orbId = orb.id(); // Store ID for network sync

		orb.originalStart(orb._translate);
	}
},

dropOrb: function () {
	if (this._carryingOrb) {
		ige.box2d._world.DestroyJoint(this._orbRope);

		this._oldOrb = this._orb;
		this._dropTime = ige._currentTime;

		delete this._orbRope;
		delete this._orb;

		this._carryingOrb = false;
		this._orbId = null;
	}
},

	/**
	 * Apply color tint to player's ship based on player number
	 * Called after entity is created on client or when playerNumber updates
	 */
	applyPlayerColor: function () {
		if (!ige.isClient) { return; }

		// Define color palette for different players (RGBA format)
		var colors = [
			[74, 158, 255, 0.6],   // 0 - Blue (first player)
			[255, 74, 74, 0.6],    // 1 - Red
			[255, 255, 74, 0.6],   // 2 - Yellow
			[74, 255, 74, 0.6],    // 3 - Green
			[255, 74, 255, 0.6],   // 4 - Magenta
			[255, 170, 74, 0.6],   // 5 - Orange
			[74, 255, 255, 0.6],   // 6 - Cyan
			[255, 74, 170, 0.6]    // 7 - Pink
		];

		var colorRGBA = colors[this._playerNumber % colors.length];
		this._shipColor = 'rgba(' + colorRGBA[0] + ',' + colorRGBA[1] + ',' + colorRGBA[2] + ',' + colorRGBA[3] + ')';
	},

	/**
	 * Override rendering to apply color tint per player
	 */
	_renderEntity: function (ctx, doneBefore) {
		// Draw base entity
		IgeEntityBox2d.prototype._renderEntity.call(this, ctx, doneBefore);

		// Apply color overlay on client only (tint only non-transparent ship pixels)
		if (ige.isClient && this._shipColor && this._bounds2d) {
			ctx.save();
			// Color will only be drawn where the ship was rendered
			ctx.globalCompositeOperation = 'source-atop';
			ctx.fillStyle = this._shipColor;
			ctx.fillRect(-this._bounds2d.x2, -this._bounds2d.y2, this._bounds2d.x, this._bounds2d.y);
			ctx.restore();
		}
	}
});

if (typeof(module) !== 'undefined' && typeof(module.exports) !== 'undefined') { module.exports = Player; }