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
		console.log('🟢 [TEST] Client ' + clientId + ' requested orb spawn. Generating 10 orbs...');
		if (ige.server.spawnRandomOrbs) {
			ige.server.spawnRandomOrbs(10);
		} else {
			console.warn('[TEST] spawnRandomOrbs function not found on server');
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
		// ВРЕМЕННО ОТКЛЮЧЕНО: Боты не создаются
		// Удаляем всех существующих ботов
		var botIds = [];
		for (var clientId in ige.server.players) {
			if (ige.server.players[clientId] && ige.server.players[clientId]._isBot) {
				botIds.push(clientId);
			}
		}
		
		// Удаляем всех ботов
		for (var i = 0; i < botIds.length; i++) {
			this._removeBot(botIds[i]);
		}
		
		return; // Ранний выход - боты отключены
		
		/* ОРИГИНАЛЬНАЯ ЛОГИКА (закомментирована):
		var realPlayerCount = this._countRealPlayers();
		var botCount = 0;
		var botIds = [];
		
		// Подсчитываем ботов
		for (var clientId in ige.server.players) {
			if (ige.server.players[clientId] && ige.server.players[clientId]._isBot) {
				botCount++;
				botIds.push(clientId);
			}
		}
		
		// Если ровно 1 реальный игрок, добавляем ровно 1 бота
		if (realPlayerCount === 1) {
			var targetBots = 1; // Ровно 1 бот
			
			// Добавляем бота если его нет
			if (botCount < targetBots) {
				this._createBot();
			}
			// Удаляем лишних ботов если их больше 1
			else if (botCount > targetBots) {
				for (var i = 0; i < botIds.length - targetBots; i++) {
					this._removeBot(botIds[i]);
				}
			}
		} else {
			// Если реальных игроков 0, 2 или больше - удаляем всех ботов
			for (var i = 0; i < botIds.length; i++) {
				this._removeBot(botIds[i]);
			}
		}
		*/
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
		
		// Создаем бота
		ige.server.players[botId] = new BotPlayer(botId)
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