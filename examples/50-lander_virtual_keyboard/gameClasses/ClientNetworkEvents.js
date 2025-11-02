var ClientNetworkEvents = {
	/**
	 * Is called when a network packet with the "playerEntity" command
	 * is received by the client from the server. This is the server telling
	 * us which entity is our player entity so that we can track it with
	 * the main camera!
	 * @param data The entity ID sent from the server.
	 * @private
	 */
	_onPlayerEntity: function (data) {
		if (ige.$(data)) {
		// Entity already exists, track it immediately
		ige.client.player = ige.$(data); // Store reference to our player
		
		// Обновляем трансформацию игрока для получения актуальных мировых координат
		ige.$(data).updateTransform();
		
		// Устанавливаем камеру ТОЧНО на позицию корабля (первая точка = корабль)
		var worldMatrix = ige.$(data)._worldMatrix.matrix;
		ige.client.vp1.camera._translate.x = worldMatrix[2];
		ige.client.vp1.camera._translate.y = worldMatrix[5];
		ige.client.vp1.camera._translate.z = 0;
		ige.client.vp1.camera.updateTransform();
		
		// Затем включаем плавное слежение
		// COMBO: Плавное слежение (40) + округление для четкости
		ige.client.vp1.camera.trackTranslate(ige.$(data), 40, true); // true = rounding
		// Зафиксируем стартовый зум после включения слежения (иначе он может сброситься)
		ige.client.vp1.camera.scaleTo(0.75, 0.75, 0.75);
		
		// Создаем индикатор направления на ближайший орб
		ige.client.orbPointer = new OrbPointer()
			.translateTo(0, 0, 0) // В центре корабля
			.mount(ige.client.player); // Прикрепляем к кораблю
		
		// Добавляем behaviour для обновления направления индикатора
		ige.client.orbPointerBehaviour = ige.addBehaviour('updateOrbPointer', function() {
			if (ige.client.player && ige.client.orbPointer) {
				// Ищем ближайший орб
				var closestOrb = null;
				var closestDistance = Infinity;
				var playerPos = ige.client.player._translate;
				
				// Получаем все орбы в сцене
				var orbs = ige.$$('orb'); // Получаем все сущности категории 'orb'
				
			// Сначала сбрасываем флаг _isClosest у всех орбов
			for (var i = 0; i < orbs.length; i++) {
				var orb = orbs[i];
				if (orb) {
					orb._isClosest = false;
				}
			}
			
			// Ищем ближайший орб
			for (var i = 0; i < orbs.length; i++) {
				var orb = orbs[i];
				if (orb && orb._translate) {
					// Пропускаем "старый орб" (красный, который нельзя подобрать)
					if (ige.client.player._oldOrbId && orb.id() === ige.client.player._oldOrbId) {
						continue;
					}
					
					var dx = orb._translate.x - playerPos.x;
					var dy = orb._translate.y - playerPos.y;
					var distance = Math.sqrt(dx * dx + dy * dy);
					
					if (distance < closestDistance) {
						closestDistance = distance;
						closestOrb = orb;
					}
				}
			}
				
				// Если есть ближайший орб, устанавливаем угол для индикатора
				if (closestOrb) {
					// Помечаем ближайший орб и передаем ему время анимации
					closestOrb._isClosest = true;
					closestOrb._pointerAnimationTime = ige.client.orbPointer._animationTime;
					
					var dx = closestOrb._translate.x - playerPos.x;
					var dy = closestOrb._translate.y - playerPos.y;
					var worldAngle = Math.atan2(dx, -dy); // Угол в мировых координатах
					
					// Получаем текущий поворот корабля
					var shipRotation = ige.client.player._rotate.z;
					
					// Вычисляем локальный угол относительно корабля
					var localAngle = worldAngle - shipRotation;
					
					// Устанавливаем локальный угол для индикаторной точки
					ige.client.orbPointer._dotAngle = localAngle;
				} else {
					// Нет орбов - убираем угол
					ige.client.orbPointer._dotAngle = undefined;
				}
			}
		});
		
		} else {
			// The client has not yet received the entity via the network
			// stream so lets ask the stream to tell us when it creates a
			// new entity and then check if that entity is the one we
			// should be tracking!
			var self = this;
			self._eventListener = ige.network.stream.on('entityCreated', function (entity) {
				if (entity.id() === data) {
				// Store reference to our player
				ige.client.player = ige.$(data);
				
				// Обновляем трансформацию игрока для получения актуальных мировых координат
				ige.$(data).updateTransform();
				
				// Устанавливаем камеру ТОЧНО на позицию корабля (первая точка = корабль)
				var worldMatrix = ige.$(data)._worldMatrix.matrix;
				ige.client.vp1.camera._translate.x = worldMatrix[2];
				ige.client.vp1.camera._translate.y = worldMatrix[5];
				ige.client.vp1.camera._translate.z = 0;
				ige.client.vp1.camera.updateTransform();
				
				// Затем включаем плавное слежение
				// COMBO: Плавное слежение (40) + округление для четкости
				ige.client.vp1.camera.trackTranslate(ige.$(data), 40, true); // true = rounding
				// Зафиксируем стартовый зум после включения слежения (иначе он может сброситься)
				ige.client.vp1.camera.scaleTo(0.75, 0.75, 0.75);
				console.log('✅ Camera: instant set to player position, then smooth tracking (40)');
				
				// Создаем индикатор направления на ближайший орб
				ige.client.orbPointer = new OrbPointer()
					.translateTo(0, 0, 0) // В центре корабля
					.mount(ige.client.player); // Прикрепляем к кораблю
				
				// Добавляем behaviour для обновления направления индикатора
				ige.client.orbPointerBehaviour = ige.addBehaviour('updateOrbPointer', function() {
					if (ige.client.player && ige.client.orbPointer) {
						// Ищем ближайший орб
						var closestOrb = null;
						var closestDistance = Infinity;
						var playerPos = ige.client.player._translate;
						
						// Получаем все орбы в сцене
						var orbs = ige.$$('orb'); // Получаем все сущности категории 'orb'
						
			// Сначала сбрасываем флаг _isClosest у всех орбов
			for (var i = 0; i < orbs.length; i++) {
				var orb = orbs[i];
				if (orb) {
					orb._isClosest = false;
				}
			}
			
			// Ищем ближайший орб
			for (var i = 0; i < orbs.length; i++) {
				var orb = orbs[i];
				if (orb && orb._translate) {
					// Пропускаем "старый орб" (красный, который нельзя подобрать)
					if (ige.client.player._oldOrbId && orb.id() === ige.client.player._oldOrbId) {
						continue;
					}
					
					var dx = orb._translate.x - playerPos.x;
					var dy = orb._translate.y - playerPos.y;
					var distance = Math.sqrt(dx * dx + dy * dy);
					
					if (distance < closestDistance) {
						closestDistance = distance;
						closestOrb = orb;
					}
				}
			}
						
						// Если есть ближайший орб, устанавливаем угол для индикатора
						if (closestOrb) {
							// Помечаем ближайший орб и передаем ему время анимации
							closestOrb._isClosest = true;
							closestOrb._pointerAnimationTime = ige.client.orbPointer._animationTime;
							
							var dx = closestOrb._translate.x - playerPos.x;
							var dy = closestOrb._translate.y - playerPos.y;
							var worldAngle = Math.atan2(dx, -dy); // Угол в мировых координатах
							
							// Получаем текущий поворот корабля
							var shipRotation = ige.client.player._rotate.z;
							
							// Вычисляем локальный угол относительно корабля
							var localAngle = worldAngle - shipRotation;
							
							// Устанавливаем локальный угол для индикаторной точки
							ige.client.orbPointer._dotAngle = localAngle;
						} else {
							// Нет орбов - убираем угол
							ige.client.orbPointer._dotAngle = undefined;
						}
					}
				});

					// Turn off the listener for this event now that we
					// have found and started tracking our player entity
					ige.network.stream.off('entityCreated', self._eventListener, function (result) {
						// Listener disabled
					});
				}
			});
		}
	},

	/**
	 * Is called when terrain data is received from the server.
	 * @param data The terrain data.
	 * @private
	 */
	_onTerrainData: function (data) {
		// Store terrain data and create the terrain
		ige.client.terrainData = data;
		ige.client.createTerrain();
	},

	/**
	 * Is called when an orb is deposited (server notification).
	 * @param data Object with orbId, landingPadPos, beingCarried, scoreValue, distScore
	 * @private
	 */
	_onOrbDeposited: function (data) {
		// Get the orb entity (might already be destroyed)
		var orb = ige.$(data.orbId);
		
		if (!orb) {
			// Create text at landing pad position as fallback
			if (data.landingPadPos) {
				new ClientScore('+' + data.scoreValue + ' for orb')
					.translateTo(data.landingPadPos.x, data.landingPadPos.y, 0)
					.mount(ige.client.objectScene)
					.start();

				new ClientScore('+' + data.distScore + ' for distance')
					.translateTo(data.landingPadPos.x, data.landingPadPos.y - 30, 0)
					.mount(ige.client.objectScene)
					.start(500);

				new ClientScore('+' + (data.scoreValue + data.distScore) + ' total')
					.translateTo(data.landingPadPos.x, data.landingPadPos.y - 15, 0)
					.mount(ige.client.objectScene)
					.start(3000);
			}
			return;
		}

		// Drop orb if being carried (visually only - no physics on client)
		if (data.beingCarried && ige.client.player && ige.client.player._carryingOrb) {
			// Just clear the visual state, don't try to destroy physics joint (it doesn't exist on client)
			ige.client.player._carryingOrb = false;
			ige.client.player._orbId = null;
		}

		// Show score text animations at orb position
		new ClientScore('+' + data.scoreValue + ' for orb')
			.translateTo(orb._translate.x, orb._translate.y, 0)
			.mount(ige.client.objectScene)
			.start();

		new ClientScore('+' + data.distScore + ' for distance')
			.translateTo(orb._translate.x, orb._translate.y - 30, 0)
			.mount(ige.client.objectScene)
			.start(500);

		new ClientScore('+' + (data.scoreValue + data.distScore) + ' total')
			.translateTo(orb._translate.x, orb._translate.y - 15, 0)
			.mount(ige.client.objectScene)
			.start(3000);
	}
};

if (typeof(module) !== 'undefined' && typeof(module.exports) !== 'undefined') { module.exports = ClientNetworkEvents; }