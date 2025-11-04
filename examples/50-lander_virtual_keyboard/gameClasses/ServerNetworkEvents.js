var ServerNetworkEvents = {
	/**
	 * Is called when the network tells us a new client has connected
	 * to the server. This is the point we can return true to reject
	 * the client connection if we wanted to.
	 * @param socket The socket object of the client that connected.
	 * @private
	 */
	_onPlayerConnect: function (socket) {
		// Don't reject the client connection
		return false;
	},

	/**
	 * Is called when a client disconnects from the server.
	 * @param clientId The client ID that disconnected.
	 * @private
	 */
	_onPlayerDisconnect: function (clientId) {
		if (ige.server.players[clientId]) {
			// Remove the player from the game
			ige.server.players[clientId].destroy();

			// Remove the reference to the player entity
			delete ige.server.players[clientId];
			
			// Освобождаем слот игрока
			ige.server.releaseSlot(clientId);
		}
	},

	/**
	 * Is called when a client requests to create a player entity.
	 * @param data The data sent from the client.
	 * @param clientId The client ID.
	 * @private
	 */
	_onPlayerEntity: function (data, clientId) {
		if (!ige.server.players[clientId]) {
			// First, send terrain data to the new client
			if (ige.server.terrainData) {
				ige.network.send('terrainData', ige.server.terrainData, clientId);
			}

			// Выделяем слот для игрока (0-3)
			var playerSlot = ige.server.assignSlot(clientId);
			
			if (playerSlot === null) {
				// Можно добавить логику для 5+ игроков или отклонить подключение
				playerSlot = 0; // Fallback
			}
			
			// Получаем позицию спавна для этого слота
			var spawnPos = ige.server.getSpawnPositionForSlot(playerSlot);
			
			// Создаем игрока на его позиции
			ige.server.players[clientId] = new Player(clientId)
				.streamMode(1) // Enable automatic network streaming
				.translateTo(spawnPos.x, spawnPos.y, 0)
				.mount(ige.server.scene1)
				.setupPhysics(); // Setup physics after position is set

			// Зафиксировать корабль на платформе сразу после создания
			var player = ige.server.players[clientId];
			player.rotateTo(0, 0, 0);
			player._landed = true; // пометить как приземлившийся
			if (player._box2dBody) {
				// Обнулить скорости и выставить точную позицию/угол
				var box2dX = spawnPos.x / ige.box2d._scaleRatio;
				var box2dY = spawnPos.y / ige.box2d._scaleRatio;
				player._box2dBody.SetPosition(new ige.box2d.b2Vec2(box2dX, box2dY));
				player._box2dBody.SetAngle(0);
				player._box2dBody.SetLinearVelocity(new ige.box2d.b2Vec2(0, 0));
				player._box2dBody.SetAngularVelocity(0);
				player._box2dBody.SetAwake(true);
			}
			player.streamSync();

			// Сохраняем слот игрока для респавна
			ige.server.players[clientId]._spawnSlot = playerSlot;
			
			// Assign player number for color (используем номер слота)
			ige.server.players[clientId]._playerNumber = playerSlot; 
			
			// Push state so clients can colorize immediately
			ige.server.players[clientId].streamSync();

			// Tell the client to track their player entity
			ige.network.send('playerEntity', ige.server.players[clientId].id(), clientId);
		}
	},

	// Player control handlers - Left
	_onPlayerLeftDown: function (data, clientId) {
		if (ige.server.players[clientId]) {
			ige.server.players[clientId].controls.left = true;
		}
	},

	_onPlayerLeftUp: function (data, clientId) {
		if (ige.server.players[clientId]) {
			ige.server.players[clientId].controls.left = false;
		}
	},

	// Player control handlers - Right
	_onPlayerRightDown: function (data, clientId) {
		if (ige.server.players[clientId]) {
			ige.server.players[clientId].controls.right = true;
		}
	},

	_onPlayerRightUp: function (data, clientId) {
		if (ige.server.players[clientId]) {
			ige.server.players[clientId].controls.right = false;
		}
	},

	// Player control handlers - Thrust
	_onPlayerThrustDown: function (data, clientId) {
		if (ige.server.players[clientId]) {
			ige.server.players[clientId].controls.thrust = true;
		}
	},

	_onPlayerThrustUp: function (data, clientId) {
		if (ige.server.players[clientId]) {
			ige.server.players[clientId].controls.thrust = false;
		}
	},

	// Player control handlers - Drop
	_onPlayerDropDown: function (data, clientId) {
		if (ige.server.players[clientId]) {
			ige.server.players[clientId].controls.drop = true;
		}
	},

	_onPlayerDropUp: function (data, clientId) {
		if (ige.server.players[clientId]) {
			ige.server.players[clientId].controls.drop = false;
		}
	},

	// ВРЕМЕННО: Тестовая команда для генерации орбов (клавиша G)
	_onTestSpawnOrbs: function (data, clientId) {
		if (ige.server.spawnRandomOrbs) {
			ige.server.spawnRandomOrbs(10);
		}
	},

	// God mode toggle (клавиша I)
	_onToggleGodMode: function (data, clientId) {
		if (ige.server.players[clientId]) {
			ige.server.players[clientId].toggleGodMode();
		} else {
			console.warn('[GOD MODE] Player not found for client ' + clientId);
		}
	},
	
	// Player logging toggle (клавиша L) - переключает ВСЮ систему логирования
	_onTogglePlayerLogging: function (data, clientId) {
		if (ige.server.players[clientId]) {
			var player = ige.server.players[clientId];
			
			// Переключаем МАСТЕР-переключатель системы логирования
			player._loggingEnabled = !player._loggingEnabled;
			
			if (player._loggingEnabled) {
				console.log('[TRAINING] ✅ Logging system ENABLED for player ' + clientId);
				// Система включена - логирование начнется автоматически после респавна
			} else {
				console.log('[TRAINING] ⛔ Logging system DISABLED for player ' + clientId);
				// Система выключена - останавливаем текущее логирование если есть
				if (player._playerLogging) {
					player._playerLogging = false;
					// Не сохраняем данные при выключении системы
					player._logData = [];
				}
			}
			
			// Синхронизируем состояние с клиентом для индикатора
			player.streamSync();
		} else {
			console.warn('[TRAINING] Player not found for client ' + clientId);
		}
	},

	/**
	 * Подсчитывает количество реальных игроков (не ботов)
	 */
	_countRealPlayers: function () {
		var count = 0;
		for (var clientId in ige.server.players) {
			if (ige.server.players[clientId] && !ige.server.players[clientId]._isBot) {
				count++;
			}
		}
		return count;
	},

	/**
	 * Проверяет нужно ли добавить/удалить ботов
	 */
	_manageBots: function () {
		// БОТ ОТКЛЮЧЕН
		var botIds = [];
		
		// Удаляем всех ботов если они есть
		for (var clientId in ige.server.players) {
			if (ige.server.players[clientId] && ige.server.players[clientId]._isBot) {
				botIds.push(clientId);
			}
		}
		
		for (var i = 0; i < botIds.length; i++) {
			this._removeBot(botIds[i]);
		}
		
		return; // Бот отключен
	},

	/**
	 * Создает нового бота
	 */
	_createBot: function () {
		// Генерируем уникальный ID для бота
		var botId = 'bot_' + Math.random().toString(36).substr(2, 9);
		
		// Выделяем слот для бота
		var playerSlot = ige.server.assignSlot(botId);
		
		if (playerSlot === null) {
			playerSlot = 0; // Fallback
		}
		
		// Получаем позицию спавна для этого слота
		var spawnPos = ige.server.getSpawnPositionForSlot(playerSlot);
		
		// Создаем бота (используем SimpleBotPlayer - простая логика)
		ige.server.players[botId] = new SimpleBotPlayer(botId)
			.streamMode(1) // Enable automatic network streaming
			.translateTo(spawnPos.x, spawnPos.y, 0)
			.mount(ige.server.scene1)
			.setupPhysics(); // Setup physics after position is set

		// Сохраняем слот бота для респавна
		ige.server.players[botId]._spawnSlot = playerSlot;
		
		// Assign player number for color
		ige.server.players[botId]._playerNumber = playerSlot; 
		
		// Push state so clients can colorize immediately
		ige.server.players[botId].streamSync();
	},

	/**
	 * Удаляет бота
	 */
	_removeBot: function (botId) {
		if (ige.server.players[botId] && ige.server.players[botId]._isBot) {
			// Remove the bot from the game
			ige.server.players[botId].destroy();

			// Remove the reference to the bot entity
			delete ige.server.players[botId];
			
			// Освобождаем слот бота
			ige.server.releaseSlot(botId);
		}
	}
};

if (typeof(module) !== 'undefined' && typeof(module.exports) !== 'undefined') { module.exports = ServerNetworkEvents; }