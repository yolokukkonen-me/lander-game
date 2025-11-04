var Orb = IgeEntityBox2d.extend({
	classId: 'Orb',

	init: function () {
		IgeEntityBox2d.prototype.init.call(this);

		// Set the rectangle colour (this is read in the Rectangle.js smart texture)
		this._rectColor = '#ffc600';
		this._baseColor = '#ffc600';  // Сохраняем базовый цвет
		this._isClosest = false;       // Флаг ближайшего орба
		this._pointerAnimationTime = 0; // Время анимации от OrbPointer

		this.category('orb')
			.width(10)
			.height(10);

	// Set texture only on client side
	if (ige.isClient) {
		this.texture(ige.client.textures.orb);
	}

	// Store fixture definitions for later physics setup
		if (ige.isServer) {
			this._fixtureDefs = [{
				density: 1,
				filter: {
					categoryBits: 0x0100,
					maskBits: 0xffff
				},
				shape: {
					type: 'circle'
				}
			}];
		}

		// Define custom stream sections for network sync
		this.streamSections(['transform', 'orbData']);
	},

	/**
	 * Override streamSectionData to sync orb's original position
	 */
	streamSectionData: function (sectionId, data) {
		if (sectionId === 'orbData') {
			if (data !== undefined) {
				// CLIENT: Parse and set orb data
				var parsedData = (typeof data === 'string') ? JSON.parse(data) : data;
				if (parsedData.originalStart) {
					this._originalStart = new IgePoint3d(
						parsedData.originalStart.x,
						parsedData.originalStart.y,
						parsedData.originalStart.z || 0
					);
				}
				if (parsedData.scoreValue !== undefined) {
					this._scoreValue = parsedData.scoreValue;
				}
			} else {
				// SERVER: Return orb data as JSON string
				var returnData = {
					scoreValue: this._scoreValue
				};
				if (this._originalStart) {
					returnData.originalStart = {
						x: this._originalStart.x,
						y: this._originalStart.y,
						z: this._originalStart.z || 0
					};
				}
				return JSON.stringify(returnData);
			}
		} else {
			// Pass to super-class for other sections
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
				linearDamping: 0.05, // Small damping for smoother movement
				angularDamping: 0.05,
				allowSleep: false, // Keep orbs awake so they fall
				bullet: false,
				gravitic: true,
				fixedRotation: false,
				fixtures: this._fixtureDefs
			});

		// Set Box2D body position using Box2D API
		if (this._box2dBody) {
			// CRITICAL: Set gravity scale FIRST!
			this._box2dBody.m_gravityScale = 1.0;
			
			// Convert pixel coordinates to Box2D coordinates
			var box2dX = pixelPos.x / ige.box2d._scaleRatio;
			var box2dY = pixelPos.y / ige.box2d._scaleRatio;
			
			var b2Vec2 = new ige.box2d.b2Vec2(box2dX, box2dY);
			this._box2dBody.SetPosition(b2Vec2);
			this._box2dBody.SetAngle(pixelPos.rotation);
			
			// Wake up and activate the body AFTER setting gravity
			this._box2dBody.SetActive(true);
			this._box2dBody.SetAwake(true);
			
			// DO NOT call updateTransform here - let Box2D _behaviour handle it!
		}
		}
		return this;
	},

	originalStart: function (translate) {
		this._originalStart = translate.clone();
		// Sync original start position with clients
		if (ige.isServer) {
			this.streamSync();
		}
	},

	scoreValue: function (val) {
		if (val !== undefined) {
			this._scoreValue = val;
			return this;
		}

		return this._scoreValue;
	},

	distanceBonus: function (landingPad) {
		// Check if originalStart is defined
		if (!this._originalStart) {
			console.warn('Orb: _originalStart is not defined, returning 0 distance bonus');
			return 0;
		}

		var distX = (landingPad._translate.x - this._originalStart.x),
			distY = (landingPad._translate.y - this._originalStart.y),
			dist = Math.sqrt(distX * distX + distY * distY);

		return Math.floor(dist / 10);
	},
	
	tick: function (ctx) {
		// Вызываем родительский tick СНАЧАЛА (чтобы орб отрисовался)
		IgeEntityBox2d.prototype.tick.call(this, ctx);
		
		// ТОЛЬКО НА КЛИЕНТЕ: Рисуем красный оверлей если это "последний отпущенный орб" локального игрока
		if (ige.isClient && ige.client.player) {
			// Проверяем, является ли этот орб "старым орбом" локального игрока
			// Орб красный если он помечен как _oldOrbId (независимо от _landed!)
			// Когда игрок приземлится снова, _oldOrbId очистится на сервере
			var isOldOrb = (ige.client.player._oldOrbId && this.id() === ige.client.player._oldOrbId);
			
			// Рисуем красный оверлей для "старого орба"
			if (isOldOrb) {
				
				ctx.save();
				
				// Красный цвет с высокой непрозрачностью
				ctx.fillStyle = 'rgba(255, 0, 0, 0.8)';
				ctx.strokeStyle = 'rgba(255, 0, 0, 1.0)';
				ctx.lineWidth = 1.5;
				
				// Рисуем октагон (8-угольник) поверх орба
				ctx.beginPath();
				ctx.moveTo(-3, -1.5);
				ctx.lineTo(-1.5, -3);
				ctx.lineTo(1.5, -3);
				ctx.lineTo(3, -1.5);
				ctx.lineTo(3, 1.5);
				ctx.lineTo(1.5, 3);
				ctx.lineTo(-1.5, 3);
				ctx.lineTo(-3, 1.5);
				ctx.closePath();
				ctx.fill();
				ctx.stroke();
				
				ctx.restore();
			}
		}
		
		// ТОЛЬКО НА КЛИЕНТЕ рисуем цветной оверлей для ближайшего орба
		if (ige.isClient && this._isClosest && this._pointerAnimationTime !== undefined) {
			// Используем ту же логику что и в OrbPointer._calculateArrowAlpha
			var cycleDuration = 2.5; // Увеличено на 25% для более медленного мигания
			var cyclePhase = (this._pointerAnimationTime % cycleDuration) / cycleDuration; // 0..1
			
			// Вычисляем яркость мигания (максимальная яркость для всех уголков)
			var maxAlpha = 0;
			for (var i = 0; i < 3; i++) {
				var fadeInStart = i * 0.1;
				var fadeInEnd = fadeInStart + 0.1;
				var fadeOutStart = 0.7;
				
				var alpha = 0;
				if (cyclePhase < fadeInStart) {
					alpha = 0;
				} else if (cyclePhase < fadeInEnd) {
					var phase = (cyclePhase - fadeInStart) / 0.1;
					alpha = Math.sin(phase * Math.PI * 0.5);
				} else if (cyclePhase < fadeOutStart) {
					alpha = 1.0;
				} else {
					var phase = (cyclePhase - fadeOutStart) / (1.0 - fadeOutStart);
					alpha = 1.0 - phase;
				}
				
				maxAlpha = Math.max(maxAlpha, alpha);
			}
			
			// Рисуем белый оверлей поверх орба
			if (maxAlpha > 0.1) {
				ctx.save();
				
				// Белый цвет с прозрачностью
				ctx.fillStyle = 'rgba(255, 255, 255, ' + (maxAlpha * 0.6) + ')';
				ctx.strokeStyle = 'rgba(255, 255, 255, ' + maxAlpha + ')';
				ctx.lineWidth = 1;
				
				// Рисуем круг поверх орба
				ctx.beginPath();
				ctx.arc(0, 0, 6, 0, Math.PI * 2);
				ctx.fill();
				ctx.stroke();
				
				// Свечение
				if (maxAlpha > 0.7) {
					ctx.shadowBlur = 8;
					ctx.shadowColor = 'rgba(255, 255, 255, ' + maxAlpha + ')';
					ctx.beginPath();
					ctx.arc(0, 0, 6, 0, Math.PI * 2);
					ctx.fill();
					ctx.shadowBlur = 0;
				}
				
				ctx.restore();
			}
		}
	},

	deposit: function (beingCarried, landingPad, player) {
		// SERVER: Award points to the player
		if (ige.isServer && beingCarried && player) {
			var distScore = this.distanceBonus(landingPad);
			var totalScore = this._scoreValue + distScore;
			
			player._score += totalScore;
			player._orbsCollected = (player._orbsCollected || 0) + 1; // Увеличиваем счетчик собранных орбов
			
			// НОВОЕ: Сохраняем логи успешной доставки орба
			if (player._playerLogging && !player._isBot && player._logData.length > 0) {
				player._saveSuccessfulDeliveryLog(totalScore);
			}
			
			// Force sync of player stats to client
			player.streamSync();
		}
		
		// CLIENT: Show visual score feedback
		if (ige.isClient) {
			
			if (beingCarried) {
				ige.client.player.dropOrb();
			}

			var distScore = this.distanceBonus(landingPad);

			// Create a score text anim
			new ClientScore('+' + this._scoreValue + ' for orb')
				.translateTo(this._translate.x, this._translate.y, 0)
				.mount(ige.client.objectScene)
				.start();

			new ClientScore('+' + distScore + ' for distance')
				.translateTo(this._translate.x, this._translate.y - 30, 0)
				.mount(ige.client.objectScene)
				.start(500);

			new ClientScore('+' + (this._scoreValue + distScore) + ' total')
				.translateTo(this._translate.x, this._translate.y - 15, 0)
				.mount(ige.client.objectScene)
				.start(3000);
		}

		this.destroy();
	}
});

if (typeof(module) !== 'undefined' && typeof(module.exports) !== 'undefined') { module.exports = Orb; }